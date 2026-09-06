/**
 * Technical Issues Routes
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize, departmentScope, canAccessRecord, denyRecord } = require('../middleware/rbac');
const { validateTechnicalIssue } = require('../middleware/validate');
const { logAction } = require('../middleware/auditLog');
const { getPaginationParams, buildPaginationMeta } = require('../utils/helpers');
const { createNotification } = require('../services/notificationService');

router.use(authenticate);
router.use(departmentScope);

// GET /api/technical-issues
router.get('/', authorize('view_technical_issues'), async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        const { status, priority, department_id } = req.query;

        let query = supabaseAdmin
            .from('technical_issues')
            .select(`*, sender:users!technical_issues_sender_id_fkey(id, full_name, employee_id),
                      departments(id, name),
                      resolver:users!technical_issues_resolved_by_fkey(id, full_name)`, { count: 'exact' });

        // Scope
        if (req.userScope) query = query.eq('sender_id', req.userScope);
        else if (req.departmentScope) query = query.eq('department_id', req.departmentScope);

        if (status) {
            if (status.includes(',')) {
                query = query.in('status', status.split(','));
            } else {
                query = query.eq('status', status);
            }
        }
        if (priority) query = query.eq('priority', priority);
        if (department_id && !req.departmentScope) query = query.eq('department_id', department_id);

        const { data, error, count } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (error) throw error;

        const formatted = data.map(i => ({
            id: i.id, issueNumber: i.issue_number, title: i.title, description: i.description,
            sender: i.sender, department: i.departments, priority: i.priority, status: i.status,
            resolvedBy: i.resolver, resolutionNotes: i.resolution_notes, createdAt: i.created_at
        }));

        res.json({ success: true, data: formatted, pagination: buildPaginationMeta(count, page, limit) });
    } catch (err) {
        console.error('[Issues] GET Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch issues.' });
    }
});

// GET /api/technical-issues/:id
router.get('/:id', authorize('view_technical_issues'), async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('technical_issues')
            .select(`*, sender:users!technical_issues_sender_id_fkey(id, full_name, email, employee_id),
                      departments(id, name), resolver:users!technical_issues_resolved_by_fkey(id, full_name)`)
            .eq('id', req.params.id).single();
        if (error || !data) return res.status(404).json({ success: false, message: 'Issue not found.' });

        // Row-level check: guessing an id must not leak another department's ticket
        if (!canAccessRecord(req, data)) return denyRecord(res);

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch issue.' });
    }
});

// POST /api/technical-issues
router.post('/', authorize('create_technical_issues'), validateTechnicalIssue, logAction('CREATE_ISSUE', 'technical_issue'), async (req, res) => {
    try {
        const { title, description, priority } = req.body;
        const { data, error } = await supabaseAdmin.from('technical_issues').insert({
            title, description, sender_id: req.user.id,
            department_id: req.user.departmentId, priority: priority || 'medium',
            status: 'open'
        }).select().single();
        if (error) throw error;

        // Notify admins
        const { data: admins } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('status', 'active')
            .in('id', (await supabaseAdmin.from('user_roles').select('user_id, roles(name)').eq('roles.name', 'admin')).data?.map(ur => ur.user_id) || []);
        if (admins) {
            for (const admin of admins) {
                await createNotification(admin.id, 'مشكلة تقنية جديدة', `رقم المشكلة ${data.issue_number}: ${title}`, 'warning', 'technical_issue', data.id);
            }
        }

        res.status(201).json({ success: true, message: 'Issue reported.', data });
    } catch (err) {
        console.error('[Issues] Create error:', err);
        res.status(500).json({ success: false, message: 'Failed to create issue.' });
    }
});

// PATCH /api/technical-issues/:id/status
router.patch('/:id/status', authorize('resolve_technical_issues', 'edit_tasks'), logAction('UPDATE_ISSUE_STATUS', 'technical_issue'), async (req, res) => {
    try {
        const { status, resolution_notes } = req.body;
        const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status.' });
        }

        const { data: issue } = await supabaseAdmin.from('technical_issues')
            .select('id, department_id, sender_id').eq('id', req.params.id).single();
        if (!issue) return res.status(404).json({ success: false, message: 'Issue not found.' });
        if (!canAccessRecord(req, issue)) return denyRecord(res);

        const updates = { status };
        if (status === 'resolved' || status === 'closed') {
            updates.resolved_by = req.user.id;
            updates.resolution_notes = resolution_notes || '';
        }

        const { error } = await supabaseAdmin.from('technical_issues').update(updates).eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true, message: `Issue status updated to ${status}.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update issue.' });
    }
});

// DELETE /api/technical-issues/:id
router.delete('/:id', authorize('delete_technical_issues', 'delete_tasks'), logAction('DELETE_ISSUE', 'technical_issue'), async (req, res) => {
    try {
        const { data: issue } = await supabaseAdmin.from('technical_issues')
            .select('id, department_id, sender_id').eq('id', req.params.id).single();
        if (!issue) return res.status(404).json({ success: false, message: 'Issue not found.' });
        if (!canAccessRecord(req, issue)) return denyRecord(res);

        const { error } = await supabaseAdmin.from('technical_issues').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Issue deleted successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete issue.' });
    }
});

module.exports = router;
