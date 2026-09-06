/**
 * Archive Routes
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize, departmentScope } = require('../middleware/rbac');
const { getPaginationParams, buildPaginationMeta } = require('../utils/helpers');

router.use(authenticate);
router.use(departmentScope);
router.use(authorize('view_archives', 'view_tasks'));

// GET /api/archives
router.get('/', async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        const { search, department_id, assigned_to } = req.query;

        let query = supabaseAdmin
            .from('archives')
            .select(`*, tasks(*, assigned_user:users!tasks_assigned_to_fkey(id, full_name, employee_id), departments(id, name))`, { count: 'exact' });

        if (req.userScope) {
            query = query.eq('tasks.assigned_to', req.userScope);
        } else if (req.departmentScope) {
            query = query.eq('department_id', req.departmentScope);
        }

        if (department_id && !req.departmentScope) query = query.eq('department_id', department_id);
        if (assigned_to && !req.userScope) query = query.eq('tasks.assigned_to', assigned_to);
        if (search) query = query.ilike('tasks.title', `%${search}%`);
        if (req.query.from_date) query = query.gte('archived_at', req.query.from_date + 'T00:00:00Z');
        if (req.query.to_date) query = query.lte('archived_at', req.query.to_date + 'T23:59:59Z');

        const { data, error, count } = await query
            .order('archived_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        const formatted = (data || []).filter(a => a.tasks).map(a => ({
            id: a.id, archivedAt: a.archived_at,
            task: {
                id: a.tasks.id, taskNumber: a.tasks.task_number, title: a.tasks.title,
                description: a.tasks.description || '—',
                assignedTo: a.tasks.assigned_user, department: a.tasks.departments,
                progress: a.tasks.progress,
                startDate: a.tasks.start_date, endDate: a.tasks.end_date, closeDate: a.tasks.close_date
            }
        }));

        res.json({ success: true, data: formatted, pagination: buildPaginationMeta(count, page, limit) });
    } catch (err) {
        console.error('[Archives] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch archives.' });
    }
});

// GET /api/archives/:id
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('archives')
            .select(`*, tasks(*, assigned_user:users!tasks_assigned_to_fkey(id, full_name, employee_id, email), creator:users!tasks_created_by_fkey(id, full_name), departments(id, name), task_notes(id, content, created_at, users(id, full_name)))`)
            .eq('id', req.params.id).single();
        if (error || !data) return res.status(404).json({ success: false, message: 'Archive not found.' });

        // Row-level check: never serve an archive outside the caller's scope
        const { canAccessRecord, denyRecord } = require('../middleware/rbac');
        const scopeRecord = { department_id: data.department_id, assigned_to: data.tasks?.assigned_to, created_by: data.tasks?.created_by };
        if (!canAccessRecord(req, scopeRecord)) return denyRecord(res);

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch archive.' });
    }
});

module.exports = router;
