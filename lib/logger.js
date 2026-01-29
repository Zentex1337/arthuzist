/**
 * Activity Logging
 * Logs all important actions for audit trail
 */

const { supabase } = require('./supabase');
const { getClientIP, getUserAgent } = require('./middleware');

/**
 * Log an activity to the database
 */
async function logActivity(userId, action, resourceType, resourceId, details, req) {
    try {
        const ipAddress = req ? getClientIP(req) : null;
        const userAgent = req ? getUserAgent(req) : null;

        await supabase
            .from('activity_logs')
            .insert({
                user_id: userId,
                action,
                resource_type: resourceType,
                resource_id: resourceId,
                details: details || {},
                ip_address: ipAddress,
                user_agent: userAgent
            });

        // Also log to console for debugging
        console.log(`[LOG] ${action}:`, {
            user: userId,
            resource: `${resourceType}/${resourceId}`,
            ...details
        });

    } catch (error) {
        // Don't fail the main operation if logging fails
        console.error('Activity logging failed:', error);
    }
}

/**
 * Get activity logs with pagination
 */
async function getLogs(options = {}) {
    const {
        userId,
        action,
        resourceType,
        limit = 50,
        offset = 0
    } = options;

    let query = supabase
        .from('activity_logs')
        .select('*, users(name, email)')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (userId) {
        query = query.eq('user_id', userId);
    }

    if (action) {
        query = query.eq('action', action);
    }

    if (resourceType) {
        query = query.eq('resource_type', resourceType);
    }

    const { data, error, count } = await query;

    if (error) {
        throw error;
    }

    return { logs: data, total: count };
}

module.exports = {
    logActivity,
    getLogs
};
