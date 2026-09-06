/**
 * Dashboard Routes
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { departmentScope } = require('../middleware/rbac');

router.use(authenticate);
router.use(departmentScope);

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
    try {
        // Driven by the caller's data scope, not by their role name
        const scope = req.scopeLevel;
        const stats = {};

        if (scope === 'all') {
            const { count: totalUsers } = await supabaseAdmin.from('users').select('id', { count: 'exact', head: true });
            const { count: totalDepts } = await supabaseAdmin.from('departments').select('id', { count: 'exact', head: true });
            const { count: totalIssues } = await supabaseAdmin.from('technical_issues').select('id', { count: 'exact', head: true }).neq('status', 'closed');
            const { data: allTasks } = await supabaseAdmin.from('tasks').select('status').neq('status', 'archived');

            const tasksByStatus = { new: 0, in_progress: 0, completed: 0, suspended: 0, delayed: 0, pending_delay: 0, pending_suspension: 0 };
            (allTasks || []).forEach(t => { if (tasksByStatus[t.status] !== undefined) tasksByStatus[t.status]++; });

            const total = allTasks?.length || 0;
            stats.totalUsers = totalUsers || 0;
            stats.totalDepartments = totalDepts || 0;
            stats.totalTasks = total;
            stats.totalIssues = totalIssues || 0;
            stats.tasksByStatus = tasksByStatus;
            stats.completionRate = total > 0 ? Math.round((tasksByStatus.completed / total) * 100) : 0;
        } else if (scope === 'department') {
            const deptId = req.user.departmentId;
            const { count: deptEmployees } = await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('department_id', deptId);
            const { data: deptTasks } = await supabaseAdmin.from('tasks').select('status').eq('department_id', deptId).neq('status', 'archived');

            const tasksByStatus = { new: 0, in_progress: 0, completed: 0, suspended: 0, delayed: 0, pending_delay: 0, pending_suspension: 0 };
            (deptTasks || []).forEach(t => { if (tasksByStatus[t.status] !== undefined) tasksByStatus[t.status]++; });

            const total = deptTasks?.length || 0;
            stats.departmentEmployees = deptEmployees || 0;
            stats.totalTasks = total;
            stats.tasksByStatus = tasksByStatus;
            stats.completionRate = total > 0 ? Math.round((tasksByStatus.completed / total) * 100) : 0;
        } else {
            const { data: myTasks } = await supabaseAdmin.from('tasks').select('status').eq('assigned_to', req.user.id).neq('status', 'archived');
            const tasksByStatus = { new: 0, in_progress: 0, completed: 0, suspended: 0, delayed: 0, pending_delay: 0, pending_suspension: 0 };
            (myTasks || []).forEach(t => { if (tasksByStatus[t.status] !== undefined) tasksByStatus[t.status]++; });

            const total = myTasks?.length || 0;
            stats.totalTasks = total;
            stats.tasksByStatus = tasksByStatus;
            stats.completionRate = total > 0 ? Math.round((tasksByStatus.completed / total) * 100) : 0;
        }

        res.json({ success: true, data: stats });
    } catch (err) {
        console.error('[Dashboard] Stats error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats.' });
    }
});

// GET /api/dashboard/charts
router.get('/charts', async (req, res) => {
    try {
        const scope = req.scopeLevel;

        // Priority distribution
        let taskQuery = supabaseAdmin.from('tasks').select('priority, status, created_at, department_id').neq('status', 'archived');
        if (scope === 'department') taskQuery = taskQuery.eq('department_id', req.user.departmentId);
        else if (scope === 'own') taskQuery = taskQuery.eq('assigned_to', req.user.id);

        const { data: tasks } = await taskQuery;

        // Priority distribution
        const priorityDist = { low: 0, medium: 0, high: 0, urgent: 0 };
        (tasks || []).forEach(t => { if (priorityDist[t.priority] !== undefined) priorityDist[t.priority]++; });

        // Status distribution
        const statusDist = { new: 0, in_progress: 0, completed: 0, suspended: 0, delayed: 0 };
        (tasks || []).forEach(t => { if (statusDist[t.status] !== undefined) statusDist[t.status]++; });

        // Tasks over last 7 days
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const count = (tasks || []).filter(t => t.created_at && t.created_at.startsWith(dateStr)).length;
            last7Days.push({ date: dateStr, count });
        }

        // Department comparison (global scope only)
        let departmentComparison = [];
        if (scope === 'all') {
            const { data: depts } = await supabaseAdmin.from('departments').select('id, name').eq('is_active', true);
            for (const dept of (depts || [])) {
                const count = (tasks || []).filter(t => t.department_id === dept.id).length;
                departmentComparison.push({ name: dept.name, count });
            }
        }

        res.json({
            success: true,
            data: { priorityDistribution: priorityDist, statusDistribution: statusDist, tasksOverTime: last7Days, departmentComparison }
        });
    } catch (err) {
        console.error('[Dashboard] Charts error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch chart data.' });
    }
});

// GET /api/dashboard/recent-activity
router.get('/recent-activity', async (req, res) => {
    try {
        let query = supabaseAdmin.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(10);
        const canSeeAll = req.scopeLevel === 'all' && req.user.permissions.some(p => p === '*' || p === 'view_audit_logs');
        if (!canSeeAll) query = query.eq('user_id', req.user.id);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch recent activity.' });
    }
});

module.exports = router;
