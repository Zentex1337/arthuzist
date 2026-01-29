/**
 * /api/tickets/[id]
 * GET - Get single ticket with messages
 * PATCH - Update ticket status
 */

const { supabase } = require('../../lib/supabase');
const { handleCors, requireAuth, requireAdmin, isSuperAdmin, hasPermission } = require('../../lib/middleware');
const { logActivity } = require('../../lib/logger');

/**
 * Check permission and terminate admin if violated
 */
async function checkPermissionOrTerminate(user, res, permission, req) {
    if (isSuperAdmin(user)) return true;
    if (hasPermission(user, permission)) return true;

    await supabase.from('users').update({ role: 'user', admin_permissions: null }).eq('id', user.id);
    await supabase.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id);
    await logActivity(user.id, 'ADMIN_ACCESS_TERMINATED', 'user', user.id, { reason: 'Unauthorized ticket action', attempted_permission: permission }, req);

    res.status(403).json({ error: 'Access violation', terminated: true, message: 'Admin access revoked.' });
    return false;
}

module.exports = async (req, res) => {
    // Handle CORS
    if (handleCors(req, res)) return;

    // Extract ticket ID from URL
    const ticketId = req.query.id;
    if (!ticketId) {
        return res.status(400).json({ error: 'Ticket ID required' });
    }

    if (req.method === 'GET') {
        return handleGetTicket(req, res, ticketId);
    }

    if (req.method === 'PATCH') {
        return handleUpdateTicket(req, res, ticketId);
    }

    if (req.method === 'DELETE') {
        return handleDeleteTicket(req, res, ticketId);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * DELETE /api/tickets/[id] - Delete ticket (admin only)
 */
async function handleDeleteTicket(req, res, ticketId) {
    try {
        const user = await requireAuth(req, res);
        if (!user) return;

        // Admin only
        if (!requireAdmin(user, res)) return;

        // Check manage_tickets permission
        if (!await checkPermissionOrTerminate(user, res, 'manage_tickets', req)) return;

        // Delete messages first
        await supabase
            .from('ticket_messages')
            .delete()
            .eq('ticket_id', ticketId);

        // Delete ticket
        const { error } = await supabase
            .from('tickets')
            .delete()
            .eq('id', ticketId);

        if (error) {
            console.error('Delete ticket error:', error);
            return res.status(500).json({ error: 'Failed to delete ticket' });
        }

        await logActivity(user.id, 'TICKET_DELETED', 'ticket', ticketId, {}, req);

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Delete ticket error:', error);
        res.status(500).json({ error: 'Failed to delete ticket' });
    }
}

/**
 * GET /api/tickets/[id] - Get single ticket
 */
async function handleGetTicket(req, res, ticketId) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        // Fetch ticket with messages
        const { data: ticket, error } = await supabase
            .from('tickets')
            .select(`
                *,
                orders(order_number, service_name, status, total, advance),
                ticket_messages(
                    id, author_id, author_name, is_admin, is_system,
                    message, attachments, created_at
                )
            `)
            .eq('id', ticketId)
            .order('created_at', { foreignTable: 'ticket_messages', ascending: true })
            .single();

        if (error || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check ownership (admin can see all if has permission)
        if (ticket.user_id !== user.id) {
            if (user.role !== 'admin') {
                return res.status(403).json({ error: 'Access denied' });
            }
            // Admin accessing other's ticket - check permission
            if (!await checkPermissionOrTerminate(user, res, 'manage_tickets', req)) return;
        }

        res.status(200).json({
            success: true,
            ticket
        });

    } catch (error) {
        console.error('Get ticket error:', error);
        res.status(500).json({ error: 'Failed to fetch ticket' });
    }
}

/**
 * PATCH /api/tickets/[id] - Update ticket status
 */
async function handleUpdateTicket(req, res, ticketId) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        // Get current ticket
        const { data: currentTicket } = await supabase
            .from('tickets')
            .select('*')
            .eq('id', ticketId)
            .single();

        if (!currentTicket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check ownership or admin with permission
        if (currentTicket.user_id !== user.id) {
            if (user.role !== 'admin') {
                return res.status(403).json({ error: 'Access denied' });
            }
            // Admin modifying other's ticket - check permission
            if (!await checkPermissionOrTerminate(user, res, 'manage_tickets', req)) return;
        }

        const { status, priority } = req.body;
        const update = { updated_at: new Date().toISOString() };

        // Status update (admin can set any, user can only close their own)
        if (status) {
            const validStatuses = ['open', 'pending', 'in_progress', 'resolved', 'closed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    error: 'Invalid status',
                    validStatuses
                });
            }

            // Users can only close their tickets, not reopen or change other statuses
            if (user.role !== 'admin') {
                if (status !== 'closed') {
                    return res.status(403).json({ error: 'Only admin can change to this status' });
                }
            }

            update.status = status;
            if (status === 'resolved' || status === 'closed') {
                update.resolved_at = new Date().toISOString();
            }
        }

        // Priority update (admin only with manage_tickets permission)
        if (priority) {
            if (!requireAdmin(user, res)) return;
            if (!await checkPermissionOrTerminate(user, res, 'manage_tickets', req)) return;

            const validPriorities = ['low', 'normal', 'high', 'urgent'];
            if (!validPriorities.includes(priority)) {
                return res.status(400).json({
                    error: 'Invalid priority',
                    validPriorities
                });
            }
            update.priority = priority;
        }

        // Update ticket
        const { data: updatedTicket, error: updateError } = await supabase
            .from('tickets')
            .update(update)
            .eq('id', ticketId)
            .select()
            .single();

        if (updateError) {
            console.error('Ticket update error:', updateError);
            return res.status(500).json({ error: 'Failed to update ticket' });
        }

        // Log status change
        if (status) {
            await logActivity(user.id, 'TICKET_STATUS_UPDATED', 'ticket', ticketId, {
                old_status: currentTicket.status,
                new_status: status,
                ticket_number: currentTicket.ticket_number
            }, req);
        }

        res.status(200).json({
            success: true,
            ticket: updatedTicket
        });

    } catch (error) {
        console.error('Update ticket error:', error);
        res.status(500).json({ error: 'Failed to update ticket' });
    }
}
