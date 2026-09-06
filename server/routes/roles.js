/**
 * Roles & Permissions Routes (Admin only)
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { logAction } = require('../middleware/auditLog');
const { bumpPermissionsVersion } = require('../utils/permissions');

router.use(authenticate);

// Reading the matrix needs view_roles; changing it needs manage_roles.
const canView = authorize('view_roles', 'manage_roles', 'manage_permissions');
const canManage = authorize('manage_roles');

// GET /api/roles
router.get('/', canView, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('roles')
            .select(`*, role_permissions(permissions(id, name, category, description))`)
            .order('name');
        if (error) throw error;

        const roles = data.map(r => ({
            id: r.id, name: r.name, description: r.description, isSystem: r.is_system,
            permissions: r.role_permissions ? r.role_permissions.map(rp => rp?.permissions).filter(Boolean) : [],
            permissionCount: r.role_permissions?.length || 0
        }));

        res.json({ success: true, data: roles });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch roles.' });
    }
});

// GET /api/roles/:id
router.get('/:id', canView, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('roles')
            .select(`*, role_permissions(permissions(id, name, category, description))`)
            .eq('id', req.params.id).single();
        if (error) throw error;
        res.json({
            success: true,
            data: { id: data.id, name: data.name, description: data.description, isSystem: data.is_system,
                permissions: data.role_permissions ? data.role_permissions.map(rp => rp?.permissions).filter(Boolean) : [] }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch role.' });
    }
});

// POST /api/roles
router.post('/', canManage, logAction('CREATE_ROLE', 'role'), async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Role name is required.' });

        const { data, error } = await supabaseAdmin.from('roles').insert({ name, description }).select().single();
        if (error) { if (error.code === '23505') return res.status(409).json({ success: false, message: 'Role name already exists.' }); throw error; }
        res.status(201).json({ success: true, message: 'Role created.', data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to create role.' });
    }
});

// PUT /api/roles/:id
router.put('/:id', canManage, logAction('UPDATE_ROLE', 'role'), async (req, res) => {
    try {
        const { name, description } = req.body;
        const { data: role } = await supabaseAdmin.from('roles').select('is_system').eq('id', req.params.id).single();
        if (role?.is_system) return res.status(400).json({ success: false, message: 'Cannot edit system roles.' });

        const { error } = await supabaseAdmin.from('roles').update({ name, description }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Role updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update role.' });
    }
});

// DELETE /api/roles/:id
router.delete('/:id', canManage, logAction('DELETE_ROLE', 'role'), async (req, res) => {
    try {
        const { data: role } = await supabaseAdmin.from('roles').select('is_system').eq('id', req.params.id).single();
        if (role?.is_system) return res.status(400).json({ success: false, message: 'Cannot delete system roles.' });

        const { error } = await supabaseAdmin.from('roles').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Role deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete role.' });
    }
});

// POST /api/roles/:id/permissions - Assign permissions to role
router.post('/:id/permissions', authorize('manage_permissions', 'manage_roles'), logAction('ASSIGN_PERMISSIONS', 'role'), async (req, res) => {
    try {
        const { permission_ids } = req.body;
        if (!permission_ids || !Array.isArray(permission_ids)) {
            return res.status(400).json({ success: false, message: 'permission_ids array is required.' });
        }

        // Remove existing permissions
        await supabaseAdmin.from('role_permissions').delete().eq('role_id', req.params.id);

        // Insert new permissions
        if (permission_ids.length > 0) {
            const inserts = permission_ids.map(pid => ({ role_id: req.params.id, permission_id: pid }));
            const { error } = await supabaseAdmin.from('role_permissions').insert(inserts);
            if (error) throw error;
        }

        // Stamp every holder of this role so their browser re-applies
        // the new permissions on the next poll (a few seconds).
        const { data: holders } = await supabaseAdmin
            .from('user_roles').select('user_id').eq('role_id', req.params.id);
        for (const h of (holders || [])) await bumpPermissionsVersion(h.user_id);

        res.json({ success: true, message: 'Permissions updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update permissions.' });
    }
});

module.exports = router;
