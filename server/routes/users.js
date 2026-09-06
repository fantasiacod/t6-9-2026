/**
 * User Management Routes
 * All routes require Admin role
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize, departmentScope, canAccessRecord, denyRecord } = require('../middleware/rbac');
const { bumpPermissionsVersion } = require('../utils/permissions');
const { validateUserCreate, validateUser } = require('../middleware/validate');
const { logAction, createAuditLog } = require('../middleware/auditLog');
const { getPaginationParams, buildPaginationMeta, getClientIp } = require('../utils/helpers');
const { notifyUserCreated } = require('../services/notificationService');

// All routes require authentication and department scoping
router.use(authenticate);
router.use(departmentScope);

// GET /api/users - List all users with pagination, search, filters
router.get('/', authorize('view_users', 'create_users', 'edit_users', 'create_tasks', 'assign_tasks'), async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        const { search, department_id, status, role } = req.query;

        let query = supabaseAdmin
            .from('users')
            .select(`*, departments!users_department_id_fkey(id, name), user_roles(roles(id, name))`, { count: 'exact' });

        // Department isolation
        if (req.departmentScope) {
            query = query.eq('department_id', req.departmentScope);
        }

        if (search) {
            query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,username.ilike.%${search}%,employee_id.ilike.%${search}%`);
        }
        if (department_id && !req.departmentScope) query = query.eq('department_id', department_id);
        
        if (status) {
            query = query.eq('status', status);
        } else {
            // Exclude soft-deleted users by default
            query = query.neq('status', 'deleted');
        }

        const { data: users, error, count } = await query
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        // Format users
        const formatted = users.map(u => ({
            id: u.id,
            fullName: u.full_name,
            email: u.email,
            phone: u.phone,
            jobTitle: u.job_title,
            employeeId: u.employee_id,
            username: u.username,
            departmentId: u.department_id,
            department: u.departments,
            role: u.user_roles?.[0]?.roles || null,
            status: u.status,
            createdAt: u.created_at
        }));

        res.json({
            success: true,
            data: formatted,
            pagination: buildPaginationMeta(count, page, limit)
        });
    } catch (err) {
        console.error('[Users] List error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch users.' });
    }
});

// GET /api/users/:id - Get single user
router.get('/:id', authorize('view_users', 'edit_users'), async (req, res) => {
    try {
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select(`*, departments!users_department_id_fkey(id, name), user_roles(roles(id, name))`)
            .eq('id', req.params.id)
            .single();

        if (error || !user) return res.status(404).json({ success: false, message: 'User not found.' });

        // Do not let a department-scoped account read users outside it.
        if (!canAccessRecord(req, user, ['id'])) return denyRecord(res);

        res.json({
            success: true,
            data: {
                id: user.id, fullName: user.full_name, email: user.email,
                phone: user.phone, jobTitle: user.job_title, employeeId: user.employee_id,
                username: user.username, departmentId: user.department_id,
                department: user.departments, role: user.user_roles?.[0]?.roles || null,
                status: user.status, createdAt: user.created_at
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch user.' });
    }
});

// POST /api/users - Create user
router.post('/', authorize('create_users'), validateUserCreate, logAction('CREATE_USER', 'user'), async (req, res) => {
    try {
        const { full_name, email, phone, job_title, employee_id, username, password, department_id, role_id } = req.body;

        // Check uniqueness
        const { data: existing } = await supabaseAdmin.from('users')
            .select('id').or(`email.eq.${email},username.eq.${username},employee_id.eq.${employee_id}`);
        if (existing && existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Email, username, or employee ID already exists.' });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 12);

        // Create user
        const { data: user, error } = await supabaseAdmin.from('users').insert({
            full_name, email, phone, job_title, employee_id,
            username, password_hash, department_id, status: 'active'
        }).select().single();

        if (error) throw error;

        // Assign role
        await supabaseAdmin.from('user_roles').insert({ user_id: user.id, role_id });

        // Send notification
        await notifyUserCreated(user, req.user.fullName);

        const ip = getClientIp(req);
        await createAuditLog(req.user.id, req.user.username, 'CREATE_USER', 'user', user.id,
            { created_user: username }, ip);

        res.status(201).json({ success: true, message: 'User created successfully.', data: { id: user.id } });
    } catch (err) {
        console.error('[Users] Create error:', err);
        res.status(500).json({ success: false, message: 'Failed to create user.' });
    }
});

// PUT /api/users/:id - Update user
router.put('/:id', authorize('edit_users'), logAction('UPDATE_USER', 'user'), async (req, res) => {
    try {
        const { full_name, email, phone, job_title, employee_id, username, department_id, role_id } = req.body;

        // Check uniqueness excluding current user
        const { data: existing } = await supabaseAdmin.from('users')
            .select('id')
            .or(`email.eq.${email},username.eq.${username},employee_id.eq.${employee_id}`)
            .neq('id', req.params.id);
        if (existing && existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Email, username, or employee ID already in use.' });
        }

        const { error } = await supabaseAdmin.from('users').update({
            full_name, email, phone, job_title, employee_id, username, department_id
        }).eq('id', req.params.id);

        if (error) throw error;

        // Update role if provided (requires role-management rights)
        if (role_id) {
            const { hasAny } = require('../utils/permissions');
            if (!hasAny(req.user.permissions, ['manage_roles', 'manage_permissions'])) {
                return res.status(403).json({ success: false, message: 'Access denied. Cannot change roles.', code: 'FORBIDDEN' });
            }
            await supabaseAdmin.from('user_roles').delete().eq('user_id', req.params.id);
            await supabaseAdmin.from('user_roles').insert({ user_id: req.params.id, role_id });
            await bumpPermissionsVersion(req.params.id);
        }

        res.json({ success: true, message: 'User updated successfully.' });
    } catch (err) {
        console.error('[Users] Update error:', err);
        res.status(500).json({ success: false, message: 'Failed to update user.' });
    }
});

// PATCH /api/users/:id/department - Assign or remove user from department
router.patch('/:id/department', authorize('edit_users'), logAction('ASSIGN_DEPARTMENT', 'user'), async (req, res) => {
    try {
        const { department_id } = req.body;
        const { error } = await supabaseAdmin.from('users').update({ department_id: department_id || null }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'User department updated successfully.' });
    } catch (err) {
        console.error('[Users] Department assign error:', err);
        res.status(500).json({ success: false, message: 'Failed to update user department.' });
    }
});

// DELETE /api/users/:id - Delete user (Soft Delete & Cleanup)
router.delete('/:id', authorize('delete_users'), logAction('DELETE_USER', 'user'), async (req, res) => {
    try {
        if (req.params.id === req.user.id) {
            return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
        }
        const userId = req.params.id;

        // 1. Delete user's technical issues
        await supabaseAdmin.from('technical_issues').delete().eq('sender_id', userId);

        // 2. Delete user's active tasks (not archived and not closed)
        await supabaseAdmin.from('tasks')
            .delete()
            .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
            .not('status', 'in', '("archived","closed")');

        // 3. Soft delete the user (Hide them, prevent login, but keep name for archives)
        const { error } = await supabaseAdmin.from('users')
            .update({ status: 'deleted' })
            .eq('id', userId);
            
        if (error) throw error;
        
        res.json({ success: true, message: 'User and their active records deleted successfully.' });
    } catch (err) {
        console.error('[Users] Delete error:', err);
        res.status(500).json({ success: false, message: 'Failed to delete user.' });
    }
});

// PATCH /api/users/:id/suspend - Toggle suspend/activate
router.patch('/:id/suspend', authorize('suspend_users'), logAction('TOGGLE_SUSPEND', 'user'), async (req, res) => {
    try {
        const { data: user } = await supabaseAdmin.from('users').select('status').eq('id', req.params.id).single();
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const newStatus = user.status === 'active' ? 'suspended' : 'active';
        await supabaseAdmin.from('users').update({ status: newStatus }).eq('id', req.params.id);

        res.json({ success: true, message: `User ${newStatus === 'active' ? 'activated' : 'suspended'} successfully.`, data: { status: newStatus } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update user status.' });
    }
});

// PATCH /api/users/:id/reset-password - Admin/Manager reset password
router.patch('/:id/reset-password', authorize('reset_passwords', 'edit_users', 'create_users'), logAction('RESET_PASSWORD', 'user'), async (req, res) => {
    try {
        const { new_password } = req.body;
        if (!new_password || new_password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
        }
        const hash = await bcrypt.hash(new_password, 12);
        await supabaseAdmin.from('users').update({ password_hash: hash }).eq('id', req.params.id);
        res.json({ success: true, message: 'Password reset successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to reset password.' });
    }
});

// PATCH /api/users/standardize-usernames - Standardize all non-admin usernames
router.patch('/standardize-usernames', authorize('edit_users'), logAction('UPDATE_USER', 'user'), async (req, res) => {
    try {
        const { prefix } = req.body;
        if (!prefix) return res.status(400).json({ success: false, message: 'Prefix is required.' });

        // Fetch all users that are NOT admins
        const { data: users, error } = await supabaseAdmin
            .from('users')
            .select(`id, user_roles!inner(roles!inner(name))`)
            .not('user_roles.roles.name', 'ilike', 'admin')
            .order('created_at', { ascending: true });

        if (error) throw error;

        let updatedCount = 0;
        for (let i = 0; i < users.length; i++) {
            const newUsername = `${prefix}${String(i + 1).padStart(3, '0')}`.toLowerCase();
            const { error: updateErr } = await supabaseAdmin
                .from('users')
                .update({ username: newUsername })
                .eq('id', users[i].id);
            
            if (!updateErr) updatedCount++;
        }

        res.json({ success: true, message: `Successfully standardized ${updatedCount} usernames.`, data: { updatedCount } });
    } catch (err) {
        console.error('[Users] Standardize error:', err);
        res.status(500).json({ success: false, message: 'Failed to standardize usernames.' });
    }
});

// ─────────────────────────────────────────────────────────────
// PER-USER PERMISSIONS
// Overrides layered on top of the user's role permissions.
//   effect 'allow' -> granted even if the role does not have it
//   effect 'deny'  -> revoked even if the role does have it
// Changes apply on the user's very next request.
// ─────────────────────────────────────────────────────────────

// GET /api/users/:id/permissions
router.get('/:id/permissions', authorize('manage_permissions', 'manage_roles', 'edit_users'), async (req, res) => {
    try {
        const userId = req.params.id;

        const { data: user, error: uErr } = await supabaseAdmin
            .from('users').select('id, full_name, username, user_roles(roles(id, name))')
            .eq('id', userId).single();
        if (uErr || !user) return res.status(404).json({ success: false, message: 'User not found.' });

        const roles = (user.user_roles || []).map(ur => ur.roles).filter(Boolean);
        const roleIds = roles.map(r => r.id).filter(Boolean);

        const { data: allPerms } = await supabaseAdmin
            .from('permissions').select('id, name, category, description').order('category').order('name');

        let rolePermIds = [];
        if (roleIds.length) {
            const { data: rp } = await supabaseAdmin
                .from('role_permissions').select('permission_id').in('role_id', roleIds);
            rolePermIds = (rp || []).map(x => x.permission_id);
        }

        const { data: overrides } = await supabaseAdmin
            .from('user_permissions').select('permission_id, effect').eq('user_id', userId);
        const overrideMap = {};
        (overrides || []).forEach(o => { overrideMap[o.permission_id] = o.effect; });

        const matrix = (allPerms || []).map(p => {
            const fromRole = rolePermIds.includes(p.id);
            const override = overrideMap[p.id] || null;
            return {
                id: p.id, name: p.name, category: p.category, description: p.description,
                fromRole,
                override,
                effective: override === 'deny' ? false : (override === 'allow' ? true : fromRole)
            };
        });

        const grouped = {};
        matrix.forEach(p => {
            if (!grouped[p.category]) grouped[p.category] = [];
            grouped[p.category].push(p);
        });

        res.json({
            success: true,
            data: {
                user: { id: user.id, fullName: user.full_name, username: user.username, roles },
                permissions: matrix,
                grouped
            }
        });
    } catch (err) {
        console.error('[Users] Get permissions error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch user permissions.' });
    }
});

// PUT /api/users/:id/permissions
// Body: { permissions: [{ permission_id, effect }] }  (effect: allow | deny)
//   or: { allow: [ids], deny: [ids] }
router.put('/:id/permissions', authorize('manage_permissions', 'manage_roles'), logAction('UPDATE_USER_PERMISSIONS', 'user'), async (req, res) => {
    try {
        const userId = req.params.id;

        const { data: target } = await supabaseAdmin.from('users').select('id').eq('id', userId).single();
        if (!target) return res.status(404).json({ success: false, message: 'User not found.' });

        let rows = [];
        if (Array.isArray(req.body.permissions)) {
            rows = req.body.permissions
                .filter(p => p && p.permission_id && ['allow', 'deny'].includes(p.effect))
                .map(p => ({ user_id: userId, permission_id: p.permission_id, effect: p.effect, granted_by: req.user.id }));
        } else {
            const allow = Array.isArray(req.body.allow) ? req.body.allow : [];
            const deny = Array.isArray(req.body.deny) ? req.body.deny : [];
            rows = [
                ...allow.map(id => ({ user_id: userId, permission_id: id, effect: 'allow', granted_by: req.user.id })),
                ...deny.map(id => ({ user_id: userId, permission_id: id, effect: 'deny', granted_by: req.user.id }))
            ];
        }

        // Replace the whole override set for this user, atomically enough
        await supabaseAdmin.from('user_permissions').delete().eq('user_id', userId);
        if (rows.length > 0) {
            const { error } = await supabaseAdmin.from('user_permissions').insert(rows);
            if (error) throw error;
        }

        await bumpPermissionsVersion(userId);

        res.json({
            success: true,
            message: 'تم تحديث صلاحيات المستخدم. ستُطبَّق فوراً.',
            data: { overrides: rows.length }
        });
    } catch (err) {
        console.error('[Users] Update permissions error:', err);
        res.status(500).json({ success: false, message: 'Failed to update user permissions.' });
    }
});

module.exports = router;
