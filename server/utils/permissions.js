/**
 * Effective Permission Resolver
 *
 * A user's effective permissions =
 *      (union of permissions of ALL their roles)
 *    + (per-user 'allow' overrides)
 *    - (per-user 'deny' overrides)      <- deny always wins
 *
 * Resolved on EVERY authenticated request, so any change an admin
 * makes takes effect on the user's very next request. No re-login,
 * no cache to invalidate.
 */
const { supabaseAdmin } = require('../config/database');

const ADMIN_ROLE = 'admin';

/**
 * @param {string} userId
 * @param {Array<{id:string,name:string}>} roles  all roles assigned to the user
 * @returns {Promise<{permissions:string[], isAdmin:boolean}>}
 */
async function resolvePermissions(userId, roles) {
    const roleList = Array.isArray(roles) ? roles.filter(Boolean) : [];
    const isAdmin = roleList.some(r => (r.name || '').toLowerCase() === ADMIN_ROLE);

    // ── 1. Role permissions (all roles, not just the first one) ──
    const roleIds = roleList.map(r => r.id).filter(Boolean);
    const granted = new Set();

    if (roleIds.length > 0) {
        const { data: rolePerms, error } = await supabaseAdmin
            .from('role_permissions')
            .select('permissions(name)')
            .in('role_id', roleIds);
        if (error) throw error;
        (rolePerms || []).forEach(rp => {
            const name = rp?.permissions?.name;
            if (name) granted.add(name);
        });
    }

    // ── 2. Per-user overrides ──
    const { data: userPerms, error: upError } = await supabaseAdmin
        .from('user_permissions')
        .select('effect, permissions(name)')
        .eq('user_id', userId);

    // If the migration has not been run yet, degrade to role-only
    // permissions instead of locking everybody out.
    if (upError) {
        if (!isMissingTableError(upError)) throw upError;
        console.warn('[Permissions] user_permissions table not found — run database/permissions_upgrade.sql');
        return { permissions: finalize(granted, isAdmin), isAdmin };
    }

    const denied = new Set();
    (userPerms || []).forEach(up => {
        const name = up?.permissions?.name;
        if (!name) return;
        if (up.effect === 'deny') denied.add(name);
        else granted.add(name);
    });

    denied.forEach(name => granted.delete(name));

    return { permissions: finalize(granted, isAdmin), isAdmin };
}

/**
 * Admin keeps the '*' wildcard so it can never be locked out of the
 * system, but its concrete permission list is returned too so the UI
 * can render the real matrix.
 */
function finalize(granted, isAdmin) {
    const list = Array.from(granted).sort();
    return isAdmin ? ['*', ...list] : list;
}

function isMissingTableError(err) {
    const code = err?.code || '';
    const msg = (err?.message || '').toLowerCase();
    return code === '42P01' || code === 'PGRST205' || msg.includes('does not exist') || msg.includes('could not find the table');
}

/**
 * Short stable fingerprint of a permission list. The browser compares
 * it against its own copy and re-applies the UI the moment it changes.
 */
function permissionsVersion(permissions) {
    const joined = (permissions || []).slice().sort().join('|');
    let hash = 5381;
    for (let i = 0; i < joined.length; i++) {
        hash = ((hash << 5) + hash + joined.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}

/** Does this permission set include `perm`? */
function has(permissions, perm) {
    if (!Array.isArray(permissions)) return false;
    return permissions.includes('*') || permissions.includes(perm);
}

/** Does it include at least one of `perms`? */
function hasAny(permissions, perms) {
    if (!Array.isArray(permissions)) return false;
    if (permissions.includes('*')) return true;
    return perms.some(p => permissions.includes(p));
}

/** Touch the user's permission stamp (best effort, never throws). */
async function bumpPermissionsVersion(userId) {
    try {
        await supabaseAdmin
            .from('users')
            .update({ permissions_updated_at: new Date().toISOString() })
            .eq('id', userId);
    } catch (e) { /* column may not exist yet */ }
}

module.exports = { resolvePermissions, permissionsVersion, has, hasAny, bumpPermissionsVersion };
