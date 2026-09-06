/**
 * Task Management Routes
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize, departmentScope, canAccessRecord, denyRecord } = require('../middleware/rbac');
const { validateTask } = require('../middleware/validate');
const { logAction, createAuditLog } = require('../middleware/auditLog');
const { getPaginationParams, buildPaginationMeta, calculateEndDate, getClientIp } = require('../utils/helpers');
const { notifyTaskCreated, notifyTaskCompleted, notifyTaskSuspended, notifyTaskDelayed } = require('../services/notificationService');

router.use(authenticate);
router.use(departmentScope);

// GET /api/tasks - List tasks (scoped by role)
router.get('/', authorize('view_tasks', 'create_tasks'), async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        const { search, status, priority, assigned_to, department_id, date_from, date_to } = req.query;

        let query = supabaseAdmin
            .from('tasks')
            .select(`*, assigned_user:users!tasks_assigned_to_fkey(id, full_name, employee_id),
                      creator:users!tasks_created_by_fkey(id, full_name),
                      departments(id, name)`, { count: 'exact' })
            .neq('status', 'archived');

        // Role-based scoping
        if (req.userScope) {
            query = query.eq('assigned_to', req.userScope);
        } else if (req.departmentScope) {
            query = query.eq('department_id', req.departmentScope);
        }

        // Filters
        if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
        if (status) query = query.eq('status', status);
        if (priority) query = query.eq('priority', priority);
        if (assigned_to) query = query.eq('assigned_to', assigned_to);
        if (department_id && !req.departmentScope) query = query.eq('department_id', department_id);
        if (date_from) query = query.gte('start_date', date_from);
        if (date_to) query = query.lte('end_date', date_to);

        const today = new Date().toISOString().split('T')[0];
        
        // Auto-update overdue tasks
        await supabaseAdmin.from('tasks')
            .update({ status: 'delayed' })
            .eq('status', 'in_progress')
            .lt('end_date', today);

        const { data: tasks, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        const formatted = tasks.map(t => {
            // Auto delay on the fly if DB update hasn't propagated yet
            let currentStatus = t.status;
            if (currentStatus === 'in_progress' && t.end_date && t.end_date < today) {
                currentStatus = 'delayed';
            }
            return {
                id: t.id, taskNumber: t.task_number, title: t.title, description: t.description,
                assignedTo: t.assigned_user, createdBy: t.creator, department: t.departments,
                priority: t.priority, status: currentStatus, progress: t.progress,
                workDays: t.work_days, startDate: t.start_date, endDate: t.end_date,
                closeDate: t.close_date, suspendReason: t.suspend_reason,
                delayReason: t.delay_reason, createdAt: t.created_at
            };
        });

        res.json({ success: true, data: formatted, pagination: buildPaginationMeta(count, page, limit) });
    } catch (err) {
        console.error('[Tasks] List error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch tasks.' });
    }
});

// GET /api/tasks/:id - Get task detail
router.get('/:id', authorize('view_tasks', 'create_tasks'), async (req, res) => {
    try {
        const { data: task, error } = await supabaseAdmin
            .from('tasks')
            .select(`*, assigned_user:users!tasks_assigned_to_fkey(id, full_name, email, employee_id, phone),
                      creator:users!tasks_created_by_fkey(id, full_name),
                      departments(id, name),
                      task_notes(id, content, image_url, created_at, users(id, full_name, user_roles(roles(name))))`)

            .eq('id', req.params.id)
            .single();

        if (error || !task) return res.status(404).json({ success: false, message: 'Task not found.' });

        // Row-level check: an id in the URL must not bypass the scope filter
        if (!canAccessRecord(req, task)) return denyRecord(res);

        const today = new Date().toISOString().split('T')[0];
        let currentStatus = task.status;
        if (currentStatus === 'in_progress' && task.end_date && task.end_date < today) {
            currentStatus = 'delayed';
            // Auto-update DB asynchronously
            supabaseAdmin.from('tasks').update({ status: 'delayed' }).eq('id', task.id).then();
        }

        const { data: auditLogs } = await supabaseAdmin.from('audit_logs')
            .select('id, action, details, created_at, username')
            .eq('entity_type', 'task')
            .eq('entity_id', req.params.id)
            .order('created_at', { ascending: true });

        res.json({
            success: true,
            data: {
                id: task.id, taskNumber: task.task_number, title: task.title,
                description: task.description, assignedTo: task.assigned_user,
                createdBy: task.creator, department: task.departments,
                priority: task.priority, status: currentStatus, progress: task.progress,
                workDays: task.work_days, startDate: task.start_date, endDate: task.end_date,
                closeDate: task.close_date, suspendReason: task.suspend_reason,
                delayReason: task.delay_reason, createdAt: task.created_at,
                notes: (task.task_notes || []).map(n => ({
                    id: n.id, content: n.content,
                    imageUrl: n.image_url || null,
                    createdAt: n.created_at,
                    user: { id: n.users?.id, fullName: n.users?.full_name, role: n.users?.user_roles?.[0]?.roles?.name }
                })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
                activity: auditLogs || []
            }
        });
    } catch (err) {
        console.error('[Tasks] Detail error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch task.' });
    }
});

// POST /api/tasks - Create task
router.post('/', authorize('create_tasks'), validateTask, async (req, res) => {
    try {
        const { title, description, assigned_to, priority, work_days, department_id, send_method } = req.body;
        const deptId = department_id || req.user.departmentId;

        // Only a globally scoped account may create tasks outside its own department
        if (req.scopeLevel !== 'all' && deptId !== req.user.departmentId) {
            return res.status(403).json({ success: false, message: 'You can only create tasks in your department.' });
        }

        const startDate = new Date().toISOString().split('T')[0];
        const endDate = (await calculateEndDate(startDate, parseInt(work_days))).toISOString().split('T')[0];
        const ip = getClientIp(req);

        let createdTasks = [];

        if (assigned_to === 'ALL') {
            // Fetch all active users in this department
            const { data: users } = await supabaseAdmin.from('users').select('id, full_name, email, phone').eq('department_id', deptId).eq('status', 'active');
            if (!users || users.length === 0) {
                return res.status(400).json({ success: false, message: 'No active employees found in this department.' });
            }

            const tasksToInsert = users.map(u => ({
                title, description, assigned_to: u.id, created_by: req.user.id,
                department_id: deptId, priority: priority || 'medium',
                work_days: parseInt(work_days), start_date: startDate, end_date: endDate,
                status: 'new', progress: 0
            }));

            const { data: tasks, error } = await supabaseAdmin.from('tasks').insert(tasksToInsert).select();
            if (error) throw error;
            createdTasks = tasks;

            // Notify all users
            const { sendTaskToN8n } = require('../services/n8nService');
            for (let i = 0; i < users.length; i++) {
                await notifyTaskCreated(tasks[i], users[i], req.user.fullName);
                sendTaskToN8n({ 
                    ...tasks[i], 
                    assignedTo: users[i], 
                    createdBy: req.user, 
                    department: { name: 'Unknown' },
                    sendMethod: send_method || [] // Email/WhatsApp preference
                });
            }
            await createAuditLog(req.user.id, req.user.username, 'CREATE_TASK_BULK', 'task', null, { title, department_id: deptId, count: tasks.length }, ip);
            
        } else {
            // Validate that assigned user belongs to the correct department
            const { data: assignedUser } = await supabaseAdmin.from('users').select('id, full_name, email, phone, department_id').eq('id', assigned_to).single();
            if (!assignedUser || assignedUser.department_id !== deptId) {
                return res.status(400).json({ success: false, message: 'Assigned user must belong to the task department.' });
            }

            const { data: task, error } = await supabaseAdmin.from('tasks').insert({
                title, description, assigned_to, created_by: req.user.id,
                department_id: deptId, priority: priority || 'medium',
                work_days: parseInt(work_days), start_date: startDate, end_date: endDate,
                status: 'new', progress: 0
            }).select().single();

            if (error) throw error;
            createdTasks = [task];

            await notifyTaskCreated(task, assignedUser, req.user.fullName);
            
            // Trigger n8n Webhook with send method preference
            const { sendTaskToN8n } = require('../services/n8nService');
            sendTaskToN8n({ 
                ...task, 
                assignedTo: assignedUser, 
                createdBy: req.user, 
                department: { name: 'Unknown' },
                sendMethod: send_method || [] // Email/WhatsApp preference
            });

            await createAuditLog(req.user.id, req.user.username, 'CREATE_TASK', 'task', task.id, { title, assigned_to }, ip);
        }

        res.status(201).json({ success: true, message: 'Task created successfully.', data: createdTasks[0] });
    } catch (err) {
        console.error('[Tasks] Create error:', err);
        res.status(500).json({ success: false, message: 'Failed to create task.' });
    }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', authorize('edit_tasks', 'create_tasks'), async (req, res) => {
    try {
        const { data: existing } = await supabaseAdmin.from('tasks')
            .select('id, department_id, assigned_to, created_by').eq('id', req.params.id).single();
        if (!existing) return res.status(404).json({ success: false, message: 'Task not found.' });
        if (!canAccessRecord(req, existing)) return denyRecord(res);

        const { title, description, assigned_to, priority, work_days } = req.body;
        const updates = {};
        if (title) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (assigned_to) updates.assigned_to = assigned_to;
        if (priority) updates.priority = priority;
        if (work_days) {
            updates.work_days = parseInt(work_days);
            const { data: task } = await supabaseAdmin.from('tasks').select('start_date').eq('id', req.params.id).single();
            if (task) updates.end_date = (await calculateEndDate(task.start_date, parseInt(work_days))).toISOString().split('T')[0];
        }

        const { error } = await supabaseAdmin.from('tasks').update(updates).eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true, message: 'Task updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update task.' });
    }
});

// PATCH /api/tasks/:id/status - Change task status
router.patch('/:id/status', authorize('change_task_status', 'edit_tasks'), async (req, res) => {
    try {
        const { status, suspend_reason, delay_reason } = req.body;
        if (!status) return res.status(400).json({ success: false, message: 'Status is required.' });

        const validStatuses = ['new', 'in_progress', 'completed', 'suspended', 'delayed', 'pending_suspension', 'pending_delay'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status.' });
        }

        const { data: task, error: fetchError } = await supabaseAdmin
            .from('tasks')
            .select('*, creator:users!tasks_created_by_fkey(id, full_name)')
            .eq('id', req.params.id).single();
        if (fetchError || !task) return res.status(404).json({ success: false, message: 'Task not found.' });
        if (!canAccessRecord(req, task)) return denyRecord(res);

        // Check if task is overdue
        const today = new Date().toISOString().split('T')[0];
        let currentStatus = task.status;
        if (currentStatus === 'in_progress' && task.end_date && task.end_date < today) {
            currentStatus = 'delayed';
        }

        if (status === 'completed') {
            if (currentStatus === 'delayed' || task.status === 'pending_delay') {
                // Unchanged rule: only a full-access account may close a delayed task
                if (!req.user.permissions.includes('*')) {
                    return res.status(403).json({ success: false, message: 'لا يمكن إغلاق مهمة متأخرة. يجب تقديم تبرير واعتماده وتمديد الوقت أولاً.' });
                }
            }
        }

        // Validate required reasons
        if ((status === 'suspended' || status === 'pending_suspension') && !suspend_reason) {
            return res.status(400).json({ success: false, message: 'Suspend reason is required.' });
        }
        if ((status === 'delayed' || status === 'pending_delay') && !delay_reason) {
            return res.status(400).json({ success: false, message: 'Delay reason is required.' });
        }

        // Build update
        const updates = { status };
        switch (status) {
            case 'new': updates.progress = 0; break;
            case 'in_progress': updates.progress = 50; break;
            case 'completed':
                updates.progress = 100;
                updates.close_date = new Date().toISOString();
                break;
            case 'pending_suspension':
            case 'suspended': 
                updates.suspend_reason = suspend_reason; break;
            case 'pending_delay':
            case 'delayed': 
                updates.delay_reason = delay_reason; break;
        }

        const { error } = await supabaseAdmin.from('tasks').update(updates).eq('id', req.params.id);
        if (error) throw error;

        // Send notifications to task creator (manager)
        const managerId = task.created_by;
        if (status === 'completed') await notifyTaskCompleted(task, managerId, req.user.fullName);
        if (status === 'suspended' || status === 'pending_suspension') await notifyTaskSuspended(task, managerId, req.user.fullName, suspend_reason);
        if (status === 'delayed' || status === 'pending_delay') await notifyTaskDelayed(task, managerId, req.user.fullName, delay_reason);

        const ip = getClientIp(req);
        const auditDetails = { new_status: status, previous_status: task.status };
        if (status === 'completed') {
            auditDetails.close_date = updates.close_date;
            auditDetails.end_date = task.end_date;
            auditDetails.closed_late = !!(task.end_date && updates.close_date &&
                updates.close_date.split('T')[0] > task.end_date);
        }
        if (suspend_reason) auditDetails.suspend_reason = suspend_reason;
        if (delay_reason) auditDetails.delay_reason = delay_reason;

        await createAuditLog(req.user.id, req.user.username, 'UPDATE_TASK_STATUS', 'task', task.id, auditDetails, ip);

        res.json({ success: true, message: 'Task status updated successfully.', data: { ...task, ...updates } });
    } catch (err) {
        console.error('[Tasks] Change status error:', err);
        res.status(500).json({ success: false, message: 'Failed to change task status.' });
    }
});

// PATCH /api/tasks/:id/approve-status - Manager approves or rejects a pending request
router.patch('/:id/approve-status', authorize('edit_tasks', 'create_tasks'), async (req, res) => {
    try {
        const { action, extraDays } = req.body; // 'approve' or 'reject'
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Action must be approve or reject.' });
        }

        const { data: task } = await supabaseAdmin.from('tasks').select('*').eq('id', req.params.id).single();
        if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });
        if (!canAccessRecord(req, task)) return denyRecord(res);

        if (!['pending_suspension', 'pending_delay', 'delayed'].includes(task.status)) {
            return res.status(400).json({ success: false, message: 'Task is not pending any approval.' });
        }

        const today = new Date().toISOString().split('T')[0];
        let updates = {};
        const addDays = Math.max(0, parseInt(extraDays) || 0);
        const oldEndDate = task.end_date;

        if (action === 'approve') {
            if (task.status === 'pending_suspension') {
                updates.status = 'suspended';
            } else {
                // pending_delay or delayed -> back to work
                updates.status = 'in_progress';

                if (addDays > 0) {
                    updates.work_days = (task.work_days || 0) + addDays;
                    const d = await calculateEndDate(task.start_date, updates.work_days);
                    updates.end_date = d.toISOString().split('T')[0];
                }

                // CRITICAL: an approved task must not land back in the past,
                // otherwise the auto-overdue check flags it as delayed again
                // on the very next read and the approval looks like it failed.
                const effectiveEnd = updates.end_date || task.end_date;
                if (!effectiveEnd || effectiveEnd < today) {
                    const grace = addDays > 0 ? addDays : 1;
                    const d = await calculateEndDate(today, grace);
                    updates.end_date = d.toISOString().split('T')[0];
                    updates.work_days = (task.work_days || 0) + grace;
                }
            }
        } else if (action === 'reject') {
            // Revert back to in_progress and clear reasons
            updates.status = 'in_progress';
            if (task.status === 'pending_suspension') updates.suspend_reason = null;
            if (task.status === 'pending_delay' || task.status === 'delayed') updates.delay_reason = null;
        }

        const { error } = await supabaseAdmin.from('tasks').update(updates).eq('id', req.params.id);
        if (error) throw error;

        // Log the approval action with everything the timeline needs
        const ip = getClientIp(req);
        await createAuditLog(
            req.user.id,
            req.user.username,
            action === 'approve' ? 'APPROVE_STATUS' : 'REJECT_STATUS',
            'task',
            req.params.id,
            {
                previous_status: task.status,
                new_status: updates.status,
                extra_days: addDays,
                old_end_date: oldEndDate,
                new_end_date: updates.end_date || oldEndDate,
                delay_reason: task.delay_reason || null,
                suspend_reason: task.suspend_reason || null
            },
            ip
        );

        // Notify the assigned employee about the decision
        // (Implementation of notify can be added to notificationService if needed, skipping for now)

        res.json({ success: true, message: `Task status ${action}d successfully.`, data: { ...task, ...updates } });
    } catch (err) {
        console.error('[Tasks] Approve status error:', err);
        res.status(500).json({ success: false, message: 'Failed to approve task status.' });
    }
});

// POST /api/tasks/:id/archive
router.post('/:id/archive', authorize('archive_tasks'), logAction('ARCHIVE_TASK', 'task'), async (req, res) => {
    try {
        const taskId = req.params.id;

        const { data: task, error: fetchErr } = await supabaseAdmin
            .from('tasks')
            .select('id, department_id, status, assigned_to, created_by')
            .eq('id', taskId)
            .single();

        if (fetchErr || !task) {
            return res.status(404).json({ success: false, message: 'Task not found.' });
        }
        if (!canAccessRecord(req, task)) return denyRecord(res);

        // Check if already archived
        const { data: existing } = await supabaseAdmin
            .from('archives')
            .select('id')
            .eq('task_id', taskId)
            .single();

        if (!existing) {
            // Insert into archives
            const { error: archiveError } = await supabaseAdmin
                .from('archives')
                .insert({
                    task_id: task.id,
                    department_id: task.department_id
                });
            if (archiveError) throw archiveError;
        }

        // Update task status
        const { error: updateError } = await supabaseAdmin
            .from('tasks')
            .update({ status: 'archived' })
            .eq('id', taskId);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Task archived successfully.' });
    } catch (err) {
        console.error('[Tasks] Archive error:', err);
        res.status(500).json({ success: false, message: 'Failed to archive task.' });
    }
});

// DELETE /api/tasks/:id
router.delete('/:id', authorize('delete_tasks'), logAction('DELETE_TASK', 'task'), async (req, res) => {
    try {
        const taskId = req.params.id;

        const { data: victim } = await supabaseAdmin.from('tasks')
            .select('id, department_id, assigned_to, created_by').eq('id', taskId).single();
        if (!victim) return res.status(404).json({ success: false, message: 'Task not found.' });
        if (!canAccessRecord(req, victim)) return denyRecord(res);

        // Delete related records first to avoid foreign key constraint errors
        await supabaseAdmin.from('archives').delete().eq('task_id', taskId);
        await supabaseAdmin.from('task_notes').delete().eq('task_id', taskId);
        
        // Now delete the task itself
        const { error } = await supabaseAdmin.from('tasks').delete().eq('id', taskId);
        if (error) throw error;
        
        res.json({ success: true, message: 'Task deleted.' });
    } catch (err) {
        console.error('[Tasks] Delete error:', err);
        res.status(500).json({ success: false, message: 'Failed to delete task.' });
    }
});

// POST /api/tasks/:id/justification
router.post('/:id/justification', authorize('view_tasks', 'change_task_status'), async (req, res) => {
    try {
        const taskId = req.params.id;
        const { delay_reason } = req.body;
        
        if (!delay_reason || typeof delay_reason !== 'string' || delay_reason.trim() === '') {
            return res.status(400).json({ success: false, message: 'Justification text is required.' });
        }

        const { data: task, error: fetchErr } = await supabaseAdmin
            .from('tasks')
            .select('id, assigned_to, created_by, department_id, status, end_date')
            .eq('id', taskId)
            .single();

        if (fetchErr || !task) {
            return res.status(404).json({ success: false, message: 'Task not found.' });
        }
        if (!canAccessRecord(req, task)) return denyRecord(res);

        // Only the assigned user (or a wider scope) can submit justification
        if (req.userScope && req.userScope !== task.assigned_to) {
            return res.status(403).json({ success: false, message: 'Only the assigned employee can submit justification.' });
        }

        const { error: updateErr } = await supabaseAdmin
            .from('tasks')
            .update({ delay_reason: delay_reason.trim(), status: 'pending_delay' })
            .eq('id', taskId);

        if (updateErr) throw updateErr;

        // Record the justification itself, plus how late the task already is,
        // so the activity log can show the full story.
        const today = new Date().toISOString().split('T')[0];
        let daysLate = 0;
        if (task.end_date && task.end_date < today) {
            daysLate = Math.round((new Date(today) - new Date(task.end_date)) / 86400000);
        }

        await createAuditLog(
            req.user.id,
            req.user.username,
            'SUBMIT_JUSTIFICATION',
            'task',
            taskId,
            {
                delay_reason: delay_reason.trim(),
                end_date: task.end_date,
                days_late: daysLate,
                previous_status: task.status
            },
            getClientIp(req)
        );

        res.json({ success: true, message: 'Justification submitted successfully.' });
    } catch (err) {
        console.error('[Tasks] Submit justification error:', err);
        res.status(500).json({ success: false, message: 'Failed to submit justification.' });
    }
});

module.exports = router;
