/**
 * Report Routes
 * Fixed: All authenticated non-admin users with view_reports permission OR manager/employee defaults can access
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize, departmentScope } = require('../middleware/rbac');

router.use(authenticate);
router.use(departmentScope);

// All report routes require view_reports OR being a manager/admin
// But since view_reports might not be in defaults, we use a soft check:

// GET /api/reports/tasks
router.get('/tasks', authorize('view_reports', 'generate_reports', 'view_tasks'), async (req, res) => {
    try {
        const { date_from, date_to, status, priority, department_id, assigned_to } = req.query;
        let query = supabaseAdmin.from('tasks')
            .select(`*, assigned_user:users!tasks_assigned_to_fkey(id, full_name, employee_id), departments(id, name)`);

        if (req.userScope) query = query.eq('assigned_to', req.userScope);
        else if (req.departmentScope) query = query.eq('department_id', req.departmentScope);

        if (date_from) query = query.gte('start_date', date_from);
        if (date_to) query = query.lte('start_date', date_to);
        if (status) query = query.eq('status', status);
        if (department_id && !req.departmentScope) query = query.eq('department_id', department_id);
        if (assigned_to) query = query.eq('assigned_to', assigned_to);

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        const formatted = data.map(t => ({
            id: t.id, taskNumber: t.task_number, title: t.title, description: t.description || '—', assignedTo: t.assigned_user?.full_name || 'N/A',
            department: t.departments?.name || 'N/A', status: t.status,
            progress: t.progress, startDate: t.start_date, endDate: t.end_date, closeDate: t.close_date
        }));

        // Summary stats
        const summary = {
            total: data.length,
            completed: data.filter(t => t.status === 'completed' || t.status === 'archived').length,
            inProgress: data.filter(t => t.status === 'in_progress').length,
            delayed: data.filter(t => t.status === 'delayed').length,
            suspended: data.filter(t => t.status === 'suspended').length,
            completionRate: data.length > 0 ? Math.round((data.filter(t => t.status === 'completed' || t.status === 'archived').length / data.length) * 100) : 0
        };

        res.json({ success: true, data: formatted, summary });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to generate report.' });
    }
});

// GET /api/reports/employees
router.get('/employees', authorize('view_reports', 'generate_reports', 'view_tasks'), async (req, res) => {
    try {
        const { date_from, date_to, status, priority, department_id, assigned_to } = req.query;
        let userQuery = supabaseAdmin.from('users').select('id, full_name, employee_id, department_id, departments(name)').eq('status', 'active');

        // Own-scope callers only ever appear in their own employee report
        if (req.userScope) userQuery = userQuery.eq('id', req.userScope);
        else if (req.departmentScope) userQuery = userQuery.eq('department_id', req.departmentScope);
        else if (department_id) userQuery = userQuery.eq('department_id', department_id);

        if (assigned_to) userQuery = userQuery.eq('id', assigned_to);

        const { data: users, error: ue } = await userQuery;
        if (ue) throw ue;

        const report = [];
        for (const user of users) {
            let tQuery = supabaseAdmin.from('tasks').select('status, progress').eq('assigned_to', user.id);
            if (date_from) tQuery = tQuery.gte('start_date', date_from);
            if (date_to) tQuery = tQuery.lte('start_date', date_to);
            if (status) tQuery = tQuery.eq('status', status);

            const { data: tasks } = await tQuery;
            
            const total = tasks?.length || 0;
            const completed = tasks?.filter(t => t.status === 'completed' || t.status === 'archived').length || 0;
            const delayed = tasks?.filter(t => t.status === 'delayed').length || 0;
            
            report.push({
                employeeId: user.employee_id, fullName: user.full_name,
                department: user.departments?.name || 'N/A',
                totalTasks: total, completed, delayed,
                completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
            });
        }

        res.json({ success: true, data: report });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to generate employee report.' });
    }
});

// GET /api/reports/departments
router.get('/departments', authorize('view_reports', 'generate_reports', 'view_tasks'), async (req, res) => {
    try {
        let deptsQuery = supabaseAdmin.from('departments').select('id, name').eq('is_active', true);
        if (req.departmentScope) {
            deptsQuery = deptsQuery.eq('id', req.departmentScope);
        }

        const { data: depts } = await deptsQuery;
        const report = [];
        for (const dept of (depts || [])) {
            const { data: tasks } = await supabaseAdmin.from('tasks').select('status').eq('department_id', dept.id);
            const { data: users } = await supabaseAdmin.from('users').select('id').eq('department_id', dept.id);
            const total = tasks?.length || 0;
            const completed = tasks?.filter(t => t.status === 'completed' || t.status === 'archived').length || 0;
            report.push({
                department: dept.name, employeeCount: users?.length || 0,
                totalTasks: total, completed,
                inProgress: tasks?.filter(t => t.status === 'in_progress').length || 0,
                delayed: tasks?.filter(t => t.status === 'delayed').length || 0,
                completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
            });
        }
        res.json({ success: true, data: report });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to generate department report.' });
    }
});

// GET /api/reports/delays
router.get('/delays', authorize('view_reports', 'generate_reports', 'view_tasks'), async (req, res) => {
    try {
        let query = supabaseAdmin.from('tasks')
            .select(`*, assigned_user:users!tasks_assigned_to_fkey(id, full_name, employee_id), departments(id, name)`)
            .eq('status', 'delayed');
        if (req.departmentScope) query = query.eq('department_id', req.departmentScope);
        if (req.userScope) query = query.eq('assigned_to', req.userScope);

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        const formatted = data.map(t => ({
            id: t.id, taskNumber: t.task_number, title: t.title, description: t.description || '—', assignedTo: t.assigned_user?.full_name || 'N/A',
            department: t.departments?.name || 'N/A',
            startDate: t.start_date, endDate: t.end_date, delayReason: t.delay_reason || 'N/A'
        }));

        res.json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to generate delay report.' });
    }
});

// GET /api/reports/technical-issues
router.get('/technical-issues', authorize('view_reports', 'generate_reports', 'view_technical_issues'), async (req, res) => {
    try {
        const { date_from, date_to, status, priority, department_id } = req.query;
        let query = supabaseAdmin.from('technical_issues')
            .select(`*, sender:users!technical_issues_sender_id_fkey(full_name), departments(name)`);

        if (req.userScope) query = query.eq('sender_id', req.userScope);
        else if (req.departmentScope) query = query.eq('department_id', req.departmentScope);

        if (date_from) query = query.gte('created_at', date_from);
        if (date_to) query = query.lte('created_at', date_to);
        if (status) query = query.eq('status', status);
        if (priority) query = query.eq('priority', priority);
        if (department_id && !req.departmentScope) query = query.eq('department_id', department_id);

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        const formatted = data.map(i => ({
            issueNumber: i.issue_number, title: i.title, description: i.description || '—', sender: i.sender?.full_name || 'N/A',
            department: i.departments?.name || 'N/A', status: i.status,
            createdAt: i.created_at
        }));

        const summary = {
            total: data.length,
            completed: data.filter(t => t.status === 'resolved' || t.status === 'closed').length,
            inProgress: data.filter(t => t.status === 'in_progress').length,
            delayed: data.filter(t => t.status === 'open').length, // Using delayed slot for 'open' issues
            completionRate: data.length > 0 ? Math.round((data.filter(t => t.status === 'resolved' || t.status === 'closed').length / data.length) * 100) : 0
        };

        res.json({ success: true, data: formatted, summary });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to generate issues report.' });
    }
});

module.exports = router;
