/**
 * /api/admin - Consolidated admin endpoints
 * GET /api/admin?action=stats
 * GET /api/admin?action=logs
 * GET /api/admin?action=users
 * GET /api/admin?action=admins (super admin only)
 * GET /api/admin?action=advanced-users (super admin only)
 * GET /api/admin?action=advanced-customers (super admin only)
 * GET /api/admin?action=advanced-admins (super admin only)
 * GET /api/admin?action=advanced-sessions (super admin only)
 * POST /api/admin?action=ban&id=userId
 * POST /api/admin?action=manage-admin (super admin only)
 * POST /api/admin?action=remove-admin&id=userId (super admin only)
 */

const { supabase } = require('../../lib/supabase');
const { handleCors, requireAuth, requireAdmin, requireSuperAdmin, isSuperAdmin, hasPermission, checkRateLimit } = require('../../lib/middleware');
const { logActivity } = require('../../lib/logger');

/**
 * Check if admin has permission, terminate access if violated
 * @returns {boolean} true if has permission, false if terminated
 */
async function checkPermissionOrTerminate(user, res, permission, req) {
    // Super admins always pass
    if (isSuperAdmin(user)) return true;

    // Check if has permission
    if (hasPermission(user, permission)) return true;

    // VIOLATION: Admin tried to access unauthorized area
    // Terminate their admin access immediately
    await supabase
        .from('users')
        .update({ role: 'user', admin_permissions: null })
        .eq('id', user.id);

    // Revoke their tokens
    await supabase
        .from('refresh_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', user.id);

    // Log the violation
    await logActivity(user.id, 'ADMIN_ACCESS_TERMINATED', 'user', user.id, {
        reason: 'Unauthorized access attempt',
        attempted_permission: permission
    }, req);

    res.status(403).json({
        error: 'Access violation detected',
        terminated: true,
        message: 'Your admin access has been revoked for attempting unauthorized actions.'
    });

    return false;
}

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    const action = req.query.action;

    switch (action) {
        case 'stats': return handleStats(req, res);
        case 'logs': return handleLogs(req, res);
        case 'users': return handleUsers(req, res);
        case 'ban': return handleBan(req, res);
        case 'admins': return handleAdmins(req, res);
        case 'manage-admin': return handleManageAdmin(req, res);
        case 'remove-admin': return handleRemoveAdmin(req, res);
        case 'advanced-users': return handleAdvancedUsers(req, res);
        case 'advanced-customers': return handleAdvancedCustomers(req, res);
        case 'advanced-admins': return handleAdvancedAdmins(req, res);
        case 'advanced-sessions': return handleAdvancedSessions(req, res);
        default: return res.status(400).json({ error: 'Invalid action' });
    }
};

async function handleStats(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const allowed = await checkRateLimit(req, res, 'admin_stats', 30, 60000);
        if (!allowed) return;

        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireAdmin(user, res)) return;

        const [ordersResult, ticketsResult, usersResult, recentOrdersResult, recentTicketsResult] = await Promise.all([
            supabase.from('orders').select('status, total, payment_verified'),
            supabase.from('tickets').select('status'),
            supabase.from('users').select('role, banned'),
            supabase.from('orders').select('id, order_number, name, email, service_name, total, status, created_at').order('created_at', { ascending: false }).limit(5),
            supabase.from('tickets').select('id, ticket_number, subject, status, created_at').neq('status', 'closed').order('created_at', { ascending: false }).limit(5)
        ]);

        const orders = ordersResult.data || [];
        const orderStats = {
            total: orders.length,
            pending: orders.filter(o => o.status === 'pending').length,
            paid: orders.filter(o => o.payment_verified).length,
            inProgress: orders.filter(o => o.status === 'in_progress').length,
            completed: orders.filter(o => o.status === 'completed' || o.status === 'delivered').length,
            revenue: orders.filter(o => o.payment_verified).reduce((sum, o) => sum + (o.total || 0), 0)
        };

        const tickets = ticketsResult.data || [];
        const ticketStats = {
            total: tickets.length,
            open: tickets.filter(t => t.status === 'open').length,
            pending: tickets.filter(t => t.status === 'pending').length,
            resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length
        };

        const users = usersResult.data || [];
        const userStats = {
            total: users.length,
            admins: users.filter(u => u.role === 'admin').length,
            banned: users.filter(u => u.banned).length
        };

        res.status(200).json({
            success: true,
            stats: { orders: orderStats, tickets: ticketStats, users: userStats },
            recentOrders: recentOrdersResult.data || [],
            pendingTickets: recentTicketsResult.data || []
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
}

async function handleLogs(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const allowed = await checkRateLimit(req, res, 'admin_logs', 30, 60000);
        if (!allowed) return;

        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireAdmin(user, res)) return;

        // Check view_logs permission - terminate if violated
        if (!await checkPermissionOrTerminate(user, res, 'view_logs', req)) return;

        let query = supabase
            .from('activity_logs')
            .select('id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at, users(name, email)', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (req.query?.user_id) query = query.eq('user_id', req.query.user_id);
        if (req.query?.filterAction) query = query.eq('action', req.query.filterAction);

        const page = parseInt(req.query?.page) || 1;
        const limit = Math.min(parseInt(req.query?.limit) || 50, 200);
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data: logs, error, count } = await query;
        if (error) return res.status(500).json({ error: 'Failed to fetch logs' });

        const { data: actionTypes } = await supabase.from('activity_logs').select('action').limit(100);
        const uniqueActions = [...new Set(actionTypes?.map(a => a.action) || [])];

        res.status(200).json({ success: true, logs, actionTypes: uniqueActions, pagination: { page, limit, total: count } });
    } catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
}

async function handleUsers(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const allowed = await checkRateLimit(req, res, 'admin_users', 30, 60000);
        if (!allowed) return;

        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireAdmin(user, res)) return;

        // Check manage_users permission - terminate if violated
        if (!await checkPermissionOrTerminate(user, res, 'manage_users', req)) return;

        let query = supabase
            .from('users')
            .select('id, email, name, phone, role, banned, banned_reason, last_login, created_at', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (req.query?.role) query = query.eq('role', req.query.role);
        if (req.query?.banned === 'true') query = query.eq('banned', true);
        else if (req.query?.banned === 'false') query = query.eq('banned', false);
        if (req.query?.search) query = query.or(`email.ilike.%${req.query.search}%,name.ilike.%${req.query.search}%`);

        const page = parseInt(req.query?.page) || 1;
        const limit = Math.min(parseInt(req.query?.limit) || 20, 100);
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data: users, error, count } = await query;
        if (error) return res.status(500).json({ error: 'Failed to fetch users' });

        res.status(200).json({ success: true, users, pagination: { page, limit, total: count } });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
}

async function handleBan(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireAdmin(user, res)) return;

        // Check manage_users permission - terminate if violated
        if (!await checkPermissionOrTerminate(user, res, 'manage_users', req)) return;

        const userId = req.query.id;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const { banned, reason } = req.body;

        const { data: targetUser } = await supabase.from('users').select('id, role').eq('id', userId).single();
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (targetUser.role === 'admin') return res.status(403).json({ error: 'Cannot ban admin users' });

        const { error } = await supabase
            .from('users')
            .update({ banned: !!banned, banned_reason: banned ? (reason || 'Banned by admin') : null })
            .eq('id', userId);

        if (error) return res.status(500).json({ error: 'Failed to update user' });

        if (banned) {
            await supabase.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId);
        }

        await logActivity(user.id, banned ? 'USER_BANNED' : 'USER_UNBANNED', 'user', userId, { reason }, req);

        res.status(200).json({ success: true, message: banned ? 'User banned' : 'User unbanned' });
    } catch (error) {
        console.error('Ban user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
}

/**
 * Get all admins with their permissions (Super Admin only)
 */
async function handleAdmins(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireSuperAdmin(user, res)) return;

        const { data: admins, error } = await supabase
            .from('users')
            .select('id, email, name, role, admin_permissions, created_at, last_login')
            .eq('role', 'admin')
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: 'Failed to fetch admins' });

        // Mark super admins
        const adminsWithSuperStatus = admins.map(admin => ({
            ...admin,
            is_super_admin: isSuperAdmin(admin),
            permissions: admin.admin_permissions || getDefaultPermissions()
        }));

        res.status(200).json({ success: true, admins: adminsWithSuperStatus });
    } catch (error) {
        console.error('Get admins error:', error);
        res.status(500).json({ error: 'Failed to fetch admins' });
    }
}

/**
 * Make user admin or update admin permissions (Super Admin only)
 */
async function handleManageAdmin(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireSuperAdmin(user, res)) return;

        const { userId, permissions } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        // Get target user
        const { data: targetUser } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('id', userId)
            .single();

        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        // Don't allow modifying super admins
        if (isSuperAdmin(targetUser)) {
            return res.status(403).json({ error: 'Cannot modify super admin permissions' });
        }

        // Validate permissions
        const validPermissions = {
            manage_orders: !!permissions?.manage_orders,
            manage_tickets: !!permissions?.manage_tickets,
            manage_gallery: !!permissions?.manage_gallery,
            manage_users: !!permissions?.manage_users,
            view_logs: !!permissions?.view_logs
        };

        // Update user to admin with permissions
        const { error } = await supabase
            .from('users')
            .update({
                role: 'admin',
                admin_permissions: validPermissions
            })
            .eq('id', userId);

        if (error) return res.status(500).json({ error: 'Failed to update admin' });

        await logActivity(user.id, 'ADMIN_PERMISSIONS_UPDATED', 'user', userId, { permissions: validPermissions }, req);

        res.status(200).json({
            success: true,
            message: targetUser.role === 'admin' ? 'Admin permissions updated' : 'User promoted to admin'
        });
    } catch (error) {
        console.error('Manage admin error:', error);
        res.status(500).json({ error: 'Failed to manage admin' });
    }
}

/**
 * Remove admin privileges (Super Admin only)
 */
async function handleRemoveAdmin(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireSuperAdmin(user, res)) return;

        const userId = req.query.id;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        // Get target user
        const { data: targetUser } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('id', userId)
            .single();

        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        // Don't allow removing super admins
        if (isSuperAdmin(targetUser)) {
            return res.status(403).json({ error: 'Cannot remove super admin privileges' });
        }

        if (targetUser.role !== 'admin') {
            return res.status(400).json({ error: 'User is not an admin' });
        }

        // Demote to user
        const { error } = await supabase
            .from('users')
            .update({
                role: 'user',
                admin_permissions: null
            })
            .eq('id', userId);

        if (error) return res.status(500).json({ error: 'Failed to remove admin' });

        await logActivity(user.id, 'ADMIN_REMOVED', 'user', userId, {}, req);

        res.status(200).json({ success: true, message: 'Admin privileges removed' });
    } catch (error) {
        console.error('Remove admin error:', error);
        res.status(500).json({ error: 'Failed to remove admin' });
    }
}

/**
 * Get default permissions for new admins
 */
function getDefaultPermissions() {
    return {
        manage_orders: false,
        manage_tickets: false,
        manage_gallery: false,
        manage_users: false,
        view_logs: false
    };
}

// ============================================
// ADVANCED LOGGING (Super Admin Only)
// ============================================

/**
 * Get all users with detailed tracking info
 */
async function handleAdvancedUsers(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireSuperAdmin(user, res)) return;

        const limit = Math.min(parseInt(req.query?.limit) || 100, 500);

        const { data: users, error } = await supabase
            .from('users')
            .select('id, email, name, phone, role, banned, banned_reason, last_login, last_ip, created_at')
            .order('last_login', { ascending: false, nullsFirst: false })
            .limit(limit);

        if (error) return res.status(500).json({ error: 'Failed to fetch users' });

        // Get order counts
        const { data: orderCounts } = await supabase
            .from('orders')
            .select('user_id');

        const orderMap = {};
        (orderCounts || []).forEach(o => {
            if (o.user_id) orderMap[o.user_id] = (orderMap[o.user_id] || 0) + 1;
        });

        // Get last activity for each user
        const userIds = users.map(u => u.id);
        const { data: lastActivities } = await supabase
            .from('activity_logs')
            .select('user_id, action, ip_address, user_agent, created_at')
            .in('user_id', userIds)
            .order('created_at', { ascending: false })
            .limit(500);

        const activityMap = {};
        (lastActivities || []).forEach(a => {
            if (!activityMap[a.user_id]) activityMap[a.user_id] = a;
        });

        const enrichedUsers = users.map(u => ({
            ...u,
            order_count: orderMap[u.id] || 0,
            last_activity: activityMap[u.id] || null
        }));

        res.status(200).json({ success: true, users: enrichedUsers });
    } catch (error) {
        console.error('Advanced users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
}

/**
 * Get customers with order history
 */
async function handleAdvancedCustomers(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireSuperAdmin(user, res)) return;

        const { data: orders, error } = await supabase
            .from('orders')
            .select('id, order_number, user_id, guest_name, guest_email, guest_phone, service_name, total, advance, status, payment_verified, created_at')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) return res.status(500).json({ error: 'Failed to fetch orders' });

        // Get user details
        const userIds = [...new Set(orders.filter(o => o.user_id).map(o => o.user_id))];
        const { data: usersData } = await supabase
            .from('users')
            .select('id, email, name, phone, last_ip, last_login')
            .in('id', userIds);

        const userMap = {};
        (usersData || []).forEach(u => userMap[u.id] = u);

        // Group by customer
        const customerMap = {};
        orders.forEach(o => {
            const key = o.user_id || o.guest_email || o.guest_phone;
            if (!key) return;

            if (!customerMap[key]) {
                const userData = o.user_id ? userMap[o.user_id] : null;
                customerMap[key] = {
                    id: o.user_id || null,
                    email: userData?.email || o.guest_email,
                    name: userData?.name || o.guest_name,
                    phone: userData?.phone || o.guest_phone,
                    last_ip: userData?.last_ip || null,
                    last_login: userData?.last_login || null,
                    is_guest: !o.user_id,
                    orders: [],
                    total_spent: 0,
                    total_orders: 0
                };
            }
            customerMap[key].orders.push({
                order_number: o.order_number,
                service: o.service_name,
                total: o.total,
                status: o.status,
                paid: o.payment_verified,
                date: o.created_at
            });
            if (o.payment_verified) customerMap[key].total_spent += o.total || 0;
            customerMap[key].total_orders++;
        });

        const customers = Object.values(customerMap).sort((a, b) => b.total_spent - a.total_spent);

        res.status(200).json({ success: true, customers });
    } catch (error) {
        console.error('Advanced customers error:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
}

/**
 * Get admin activity logs with full details
 */
async function handleAdvancedAdmins(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireSuperAdmin(user, res)) return;

        // Get admin users
        const { data: admins } = await supabase
            .from('users')
            .select('id, email, name')
            .eq('role', 'admin');

        const adminIds = admins.map(a => a.id);
        const adminMap = {};
        admins.forEach(a => adminMap[a.id] = a);

        // Get their logs
        const { data: logs, error } = await supabase
            .from('activity_logs')
            .select('*')
            .in('user_id', adminIds)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) return res.status(500).json({ error: 'Failed to fetch logs' });

        const enrichedLogs = logs.map(l => ({
            ...l,
            admin: adminMap[l.user_id] || { email: 'Unknown', name: 'Unknown' }
        }));

        res.status(200).json({ success: true, logs: enrichedLogs, admins });
    } catch (error) {
        console.error('Advanced admins error:', error);
        res.status(500).json({ error: 'Failed to fetch admin logs' });
    }
}

/**
 * Get active sessions
 */
async function handleAdvancedSessions(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        if (!requireSuperAdmin(user, res)) return;

        const { data: sessions, error } = await supabase
            .from('refresh_tokens')
            .select('id, user_id, ip_address, user_agent, created_at, expires_at')
            .is('revoked_at', null)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) return res.status(500).json({ error: 'Failed to fetch sessions' });

        // Get user details
        const userIds = [...new Set(sessions.map(s => s.user_id))];
        const { data: usersData } = await supabase
            .from('users')
            .select('id, email, name, role')
            .in('id', userIds);

        const userMap = {};
        (usersData || []).forEach(u => userMap[u.id] = u);

        const enrichedSessions = sessions.map(s => ({
            ...s,
            users: userMap[s.user_id] || null
        }));

        res.status(200).json({ success: true, sessions: enrichedSessions });
    } catch (error) {
        console.error('Advanced sessions error:', error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
}
