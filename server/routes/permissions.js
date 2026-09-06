/**
 * Permissions Routes (Admin only)
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);
router.use(authorize('view_roles', 'manage_roles', 'manage_permissions'));

// GET /api/permissions - List all permissions grouped by category
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('permissions')
            .select('*')
            .order('category')
            .order('name');
        if (error) throw error;

        // Group by category
        const grouped = {};
        data.forEach(p => {
            if (!grouped[p.category]) grouped[p.category] = [];
            grouped[p.category].push({ id: p.id, name: p.name, description: p.description });
        });

        res.json({ success: true, data: grouped, list: data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch permissions.' });
    }
});

module.exports = router;
