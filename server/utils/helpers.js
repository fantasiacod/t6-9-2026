/**
 * Utility Helper Functions
 */

const { supabaseAdmin } = require('../config/database');

/**
 * Calculate end date from start date + work days
 * @param {string|Date} startDate - Start date
 * @param {number} workDays - Number of working days
 * @returns {Promise<Date>} Calculated end date
 */
async function calculateEndDate(startDate, workDays) {
    const start = new Date(startDate);
    let daysAdded = 0;
    const result = new Date(start);
    
    let weekendDays = [5, 6];
    try {
        const { data } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'weekend_days').single();
        if (data && data.value) {
            weekendDays = data.value.split(',').map(Number);
        }
    } catch(e) {}

    while (daysAdded < workDays) {
        result.setDate(result.getDate() + 1);
        const dayOfWeek = result.getDay();
        if (!weekendDays.includes(dayOfWeek)) {
            daysAdded++;
        }
    }
    return result;
}

/**
 * Format date to YYYY-MM-DD
 * @param {Date|string} date
 * @returns {string}
 */
function formatDate(date) {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

/**
 * Get pagination parameters from query string
 * @param {object} query - Request query params
 * @returns {{ page: number, limit: number, offset: number }}
 */
function getPaginationParams(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

/**
 * Build pagination response metadata
 * @param {number} total - Total count
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {object}
 */
function buildPaginationMeta(total, page, limit) {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
    };
}

/**
 * Get client IP address from request
 * @param {object} req - Express request
 * @returns {string}
 */
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
}

module.exports = {
    calculateEndDate,
    formatDate,
    getPaginationParams,
    buildPaginationMeta,
    getClientIp
};
