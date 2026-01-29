/**
 * /api/tickets
 * GET - List tickets (user sees own, admin sees all)
 * POST - Create new ticket
 */

const { supabase } = require('../../lib/supabase');
const { handleCors, requireAuth, checkRateLimit, isSuperAdmin, hasPermission } = require('../../lib/middleware');
const { validateTicket } = require('../../lib/validators');
const { logActivity } = require('../../lib/logger');

/**
 * Check permission and terminate admin if violated
 */
async function checkPermissionOrTerminate(user, res, permission, req) {
    if (isSuperAdmin(user)) return true;
    if (hasPermission(user, permission)) return true;

    // Terminate admin access
    await supabase.from('users').update({ role: 'user', admin_permissions: null }).eq('id', user.id);
    await supabase.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id);
    await logActivity(user.id, 'ADMIN_ACCESS_TERMINATED', 'user', user.id, { reason: 'Unauthorized ticket access', attempted_permission: permission }, req);

    res.status(403).json({ error: 'Access violation', terminated: true, message: 'Admin access revoked for unauthorized action.' });
    return false;
}

module.exports = async (req, res) => {
    // Handle CORS
    if (handleCors(req, res)) return;

    if (req.method === 'GET') {
        return handleGetTickets(req, res);
    }

    if (req.method === 'POST') {
        return handleCreateTicket(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * GET /api/tickets - List tickets
 */
async function handleGetTickets(req, res) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        let query = supabase
            .from('tickets')
            .select(`
                *,
                users:user_id(name, email, banned),
                orders(order_number, service_name, status),
                ticket_messages(count)
            `)
            .order('created_at', { ascending: false });

        // Non-admin users only see their own tickets
        if (user.role !== 'admin') {
            query = query.eq('user_id', user.id);
        } else {
            // Admin trying to see all tickets - check permission
            if (!await checkPermissionOrTerminate(user, res, 'manage_tickets', req)) return;
        }

        // Filter by status if provided
        if (req.query?.status) {
            query = query.eq('status', req.query.status);
        }

        // Pagination
        const page = parseInt(req.query?.page) || 1;
        const limit = Math.min(parseInt(req.query?.limit) || 20, 100);
        const offset = (page - 1) * limit;

        query = query.range(offset, offset + limit - 1);

        const { data: tickets, error, count } = await query;

        if (error) {
            console.error('Fetch tickets error:', error);
            return res.status(500).json({ error: 'Failed to fetch tickets' });
        }

        res.status(200).json({
            success: true,
            tickets,
            pagination: {
                page,
                limit,
                total: count
            }
        });

    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ error: 'Failed to fetch tickets' });
    }
}

/**
 * POST /api/tickets - Create new ticket
 */
async function handleCreateTicket(req, res) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        // Rate limiting: 10 tickets per hour per user
        const allowed = await checkRateLimit(req, res, `create_ticket_${user.id}`, 10, 3600000);
        if (!allowed) return;

        // Validate input
        const validation = validateTicket(req.body);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        const { order_id, subject, category, message } = validation.data;

        // If order_id provided, verify ownership
        if (order_id) {
            const { data: order } = await supabase
                .from('orders')
                .select('id, user_id')
                .eq('id', order_id)
                .single();

            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            if (user.role !== 'admin' && order.user_id !== user.id) {
                return res.status(403).json({ error: 'Access denied to this order' });
            }
        }

        // Generate ticket number
        const ticketNumber = `TKT${Date.now().toString(36).toUpperCase()}`;

        // Create ticket
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .insert({
                ticket_number: ticketNumber,
                order_id: order_id || null,
                user_id: user.id,
                subject,
                category,
                status: 'open'
            })
            .select()
            .single();

        if (ticketError) {
            console.error('Ticket creation error:', ticketError);
            return res.status(500).json({ error: 'Failed to create ticket' });
        }

        // Add automated welcome message from system
        const welcomeMessage = `Hello ${user.name}! 👋\n\nThank you for contacting Arthuzist Support.\n\n📋 Ticket ID: ${ticketNumber}\n📂 Category: ${category}\n📝 Subject: ${subject}\n\nPlease keep this ticket ID for your reference. Our team will respond to your query shortly.`;

        await supabase
            .from('ticket_messages')
            .insert({
                ticket_id: ticket.id,
                author_id: user.id,
                author_name: 'Arthuzist Support',
                is_admin: true,
                message: welcomeMessage
            });

        // Add user's initial message
        await supabase
            .from('ticket_messages')
            .insert({
                ticket_id: ticket.id,
                author_id: user.id,
                author_name: user.name,
                is_admin: false,
                message
            });

        // Log ticket creation
        await logActivity(user.id, 'TICKET_CREATED', 'ticket', ticket.id, {
            ticket_number: ticketNumber,
            category,
            subject
        }, req);

        res.status(201).json({
            success: true,
            ticket: {
                ...ticket,
                messages: [
                    {
                        author_name: 'Arthuzist Support',
                        is_admin: true,
                        message: welcomeMessage,
                        created_at: new Date().toISOString()
                    },
                    {
                        author_name: user.name,
                        is_admin: false,
                        message,
                        created_at: new Date().toISOString()
                    }
                ]
            }
        });

    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
}
