/**
 * Audit Log Routes (Admin only)
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize, departmentScope } = require('../middleware/rbac');
const { getPaginationParams, buildPaginationMeta } = require('../utils/helpers');

router.use(authenticate);
router.use(departmentScope);
router.use(authorize('view_audit_logs'));

// GET /api/audit-logs
router.get('/', async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        const { user_id, action, entity_type, date_from, date_to } = req.query;

        let query = supabaseAdmin
            .from('audit_logs')
            .select('*', { count: 'exact' });

        // Without global scope a user only ever sees their own trail.
        if (req.scopeLevel !== 'all') query = query.eq('user_id', req.user.id);

        if (user_id && req.scopeLevel === 'all') query = query.eq('user_id', user_id);
        if (action) query = query.ilike('action', `%${action}%`);
        if (entity_type) query = query.eq('entity_type', entity_type);
        if (date_from) query = query.gte('created_at', date_from);
        if (date_to) query = query.lte('created_at', date_to);

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        res.json({ success: true, data, pagination: buildPaginationMeta(count, page, limit) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
    }
});

module.exports = router;
