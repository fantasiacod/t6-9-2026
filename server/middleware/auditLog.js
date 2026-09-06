/**
 * Audit Log Middleware
 * Automatically records system actions for compliance and security
 */
const { supabaseAdmin } = require('../config/database');

/**
 * Create an audit log entry
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {string} action - Action description
 * @param {string} entityType - Entity type (user, task, department, etc.)
 * @param {string} entityId - Entity ID
 * @param {object} details - Additional details
 * @param {string} ipAddress - Client IP address
 */
async function createAuditLog(userId, username, action, entityType, entityId, details, ipAddress) {
    try {
        await supabaseAdmin.from('audit_logs').insert({
            user_id: userId,
            username: username,
            action: action,
            entity_type: entityType,
            entity_id: entityId,
            details: details || {},
            ip_address: ipAddress
        });
    } catch (error) {
        console.error('[Audit Log] Failed to create:', error.message);
    }
}

/**
 * Middleware factory for automatic audit logging
 * @param {string} action - Action name
 * @param {string} entityType - Entity type
 */
function logAction(action, entityType) {
    return async (req, res, next) => {
        // Store original json method to intercept response
        const originalJson = res.json.bind(res);
        res.json = function (data) {
            // Log after successful operations
            if (data && data.success && req.user) {
                const entityId = (data.data && data.data.id) || req.params.id || null;
                const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
                createAuditLog(
                    req.user.id,
                    req.user.username,
                    action,
                    entityType,
                    entityId,
                    { method: req.method, path: req.originalUrl },
                    ip
                );
            }
            return originalJson(data);
        };
        next();
    };
}

module.exports = { createAuditLog, logAction };
