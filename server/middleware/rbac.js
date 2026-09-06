/**
 * RBAC (Permission-Based Access Control) Middleware
 *
 * Authorization is driven by the user's EFFECTIVE permissions, which
 * middleware/auth.js resolves per request from roles + per-user
 * overrides. Role names are no longer used as gates, so a custom role
 * (or a single user with an override) gets exactly what it was granted.
 */

const { has, hasAny } = require('../utils/permissions');

/**
 * Require at least ONE of the listed permissions.
 * Admin passes because its permission list contains the '*' wildcard.
 */
function authorize(...requiredPermissions) {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Authentication required.' });
            }

            if (hasAny(req.user.permissions, requiredPermissions)) return next();

            // Never echo the user's permission list back to the client.
            return res.status(403).json({
                success: false,
                message: 'Access denied. Insufficient permissions.',
                code: 'FORBIDDEN'
            });
        } catch (error) {
            console.error('[RBAC authorize]', error);
            return res.status(500).json({ success: false, message: 'Authorization error.' });
        }
    };
}

/**
 * Require ALL of the listed permissions.
 */
function authorizeAll(...requiredPermissions) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }
        const ok = requiredPermissions.every(p => has(req.user.permissions, p));
        if (!ok) {
            return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.', code: 'FORBIDDEN' });
        }
        next();
    };
}

/**
 * Role gate. Kept for backwards compatibility only — prefer authorize().
 */
function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }
        const wanted = roles.map(r => r.toLowerCase());
        const userRoles = (req.user.roles || [req.user.role]).map(r => (r?.name || '').toLowerCase());
        if (!userRoles.some(r => wanted.includes(r))) {
            return res.status(403).json({ success: false, message: 'Access denied.', code: 'FORBIDDEN' });
        }
        next();
    };
}

/**
 * Data scope.
 *
 * Explicit scope permissions win. If the user has neither, we fall back
 * to the ORIGINAL role behaviour, so nobody loses access they already
 * had and the SQL migration is not strictly required:
 *
 *   view_all_data        (or role admin)   -> everything
 *   view_department_data (or role manager) -> own department
 *   otherwise                              -> own records only
 */
function departmentScope(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const perms = req.user.permissions || [];
    const roleNames = (req.user.roles && req.user.roles.length ? req.user.roles : [req.user.role])
        .map(r => (r && r.name ? r.name : '').toLowerCase());

    const globalScope = has(perms, 'view_all_data') || roleNames.includes('admin');
    const deptScope = has(perms, 'view_department_data') || roleNames.includes('manager');

    if (globalScope) {
        req.departmentScope = null;
        req.userScope = null;
        req.scopeLevel = 'all';
    } else if (deptScope) {
        req.departmentScope = req.user.departmentId;
        req.userScope = null;
        req.scopeLevel = 'department';
    } else {
        req.departmentScope = req.user.departmentId;
        req.userScope = req.user.id;
        req.scopeLevel = 'own';
    }

    next();
}

/**
 * Row-level guard used by detail endpoints (GET/PUT/PATCH /:id).
 * Stops the classic leak where anyone who can list their own records
 * can still read someone else's by guessing the id.
 *
 * @param {object} req
 * @param {object} record  { department_id, owner ids... }
 * @param {string[]} ownerFields  fields holding a user id that count as ownership
 */
function canAccessRecord(req, record, ownerFields = ['assigned_to', 'created_by', 'sender_id', 'user_id']) {
    if (!record) return false;
    if (req.scopeLevel === 'all') return true;

    if (req.scopeLevel === 'department') {
        if (!record.department_id) return true;
        return record.department_id === req.user.departmentId;
    }

    // 'own'
    return ownerFields.some(f => record[f] && record[f] === req.user.id);
}

/** Express helper: 404-style refusal that does not confirm the record exists. */
function denyRecord(res) {
    return res.status(403).json({ success: false, message: 'Access denied.', code: 'FORBIDDEN' });
}

module.exports = {
    authorize,
    authorizeAll,
    authorizeRole,
    departmentScope,
    canAccessRecord,
    denyRecord
};
