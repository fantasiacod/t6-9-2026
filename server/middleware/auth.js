/**
 * Authentication Middleware
 *
 * Resolves the user's effective permissions from the database on every
 * request (roles + per-user overrides), so a permission change applies
 * to the user's very next request without re-login.
 */
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const { supabaseAdmin } = require('../config/database');
const { resolvePermissions, permissionsVersion } = require('../utils/permissions');

async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, jwtConfig.secret);

        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select(`
                id, full_name, email, phone, job_title, employee_id,
                username, department_id, status, avatar_url,
                departments!users_department_id_fkey(id, name),
                user_roles(
                    roles(id, name)
                )
            `)
            .eq('id', decoded.userId)
            .single();

        if (error || !user) {
            return res.status(401).json({ success: false, message: 'Invalid token. User not found.' });
        }

        if (user.status === 'suspended') {
            return res.status(403).json({ success: false, message: 'Account is suspended. Contact administrator.' });
        }

        if (user.status === 'deleted') {
            return res.status(401).json({ success: false, message: 'Invalid token.' });
        }

        // ALL roles, not just the first one
        const roles = (user.user_roles || []).map(ur => ur.roles).filter(Boolean);
        const primaryRole = roles[0] || { id: null, name: 'employee' };

        // Effective permissions: roles union user-allows minus user-denies
        const { permissions, isAdmin } = await resolvePermissions(user.id, roles);

        req.user = {
            id: user.id,
            fullName: user.full_name,
            email: user.email,
            phone: user.phone,
            jobTitle: user.job_title,
            employeeId: user.employee_id,
            username: user.username,
            departmentId: user.department_id,
            department: user.departments,
            status: user.status,
            avatarUrl: user.avatar_url,
            role: primaryRole,
            roles: roles,
            isAdmin: isAdmin,
            permissions: permissions,
            permissionsVersion: permissionsVersion(permissions)
        };

        res.set('X-Permissions-Version', req.user.permissionsVersion);

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Invalid token.' });
        }
        console.error('[Auth Middleware]', error);
        return res.status(500).json({ success: false, message: 'Authentication error.' });
    }
}

module.exports = { authenticate };
