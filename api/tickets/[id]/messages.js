/**
 * /api/tickets/[id]/messages
 * GET - Get messages for a ticket
 * POST - Add message to ticket
 */

const { supabase } = require('../../../lib/supabase');
const { handleCors, requireAuth, checkRateLimit } = require('../../../lib/middleware');
const { validateMessage } = require('../../../lib/validators');
const { logActivity } = require('../../../lib/logger');

module.exports = async (req, res) => {
    // Handle CORS
    if (handleCors(req, res)) return;

    // Extract ticket ID from URL
    const ticketId = req.query.id;
    if (!ticketId) {
        return res.status(400).json({ error: 'Ticket ID required' });
    }

    if (req.method === 'GET') {
        return handleGetMessages(req, res, ticketId);
    }

    if (req.method === 'POST') {
        return handleAddMessage(req, res, ticketId);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * GET /api/tickets/[id]/messages - Get messages
 */
async function handleGetMessages(req, res, ticketId) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        // Get ticket to verify access
        const { data: ticket } = await supabase
            .from('tickets')
            .select('id, user_id')
            .eq('id', ticketId)
            .single();

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check ownership (admin can see all)
        if (user.role !== 'admin' && ticket.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Fetch messages
        const { data: messages, error } = await supabase
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Fetch messages error:', error);
            return res.status(500).json({ error: 'Failed to fetch messages' });
        }

        res.status(200).json({
            success: true,
            messages
        });

    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
}

/**
 * POST /api/tickets/[id]/messages - Add message
 */
async function handleAddMessage(req, res, ticketId) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        // Rate limiting: 200 messages per hour for users (admins unlimited)
        if (user.role !== 'admin') {
            const allowed = await checkRateLimit(req, res, `add_message_${user.id}`, 200, 3600000);
            if (!allowed) return;
        }

        // Get ticket
        const { data: ticket } = await supabase
            .from('tickets')
            .select('id, user_id, status, ticket_number')
            .eq('id', ticketId)
            .single();

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check ownership (admin can reply to all)
        if (user.role !== 'admin' && ticket.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Check if ticket is closed
        if (ticket.status === 'closed') {
            return res.status(400).json({ error: 'Cannot add message to closed ticket' });
        }

        // Validate input
        const validation = validateMessage(req.body);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        const { message, attachments = [] } = validation.data;
        const isAdmin = user.role === 'admin';

        // Add message
        const { data: newMessage, error: msgError } = await supabase
            .from('ticket_messages')
            .insert({
                ticket_id: ticketId,
                author_id: user.id,
                author_name: user.name,
                is_admin: isAdmin,
                message,
                attachments: attachments
            })
            .select()
            .single();

        if (msgError) {
            console.error('Add message error:', msgError);
            return res.status(500).json({ error: 'Failed to add message' });
        }

        // Update ticket status and timestamp
        const statusUpdate = {
            updated_at: new Date().toISOString()
        };

        // If admin replies to open ticket, set to pending
        if (isAdmin && ticket.status === 'open') {
            statusUpdate.status = 'pending';
        }
        // If user replies to pending ticket, set back to open
        else if (!isAdmin && ticket.status === 'pending') {
            statusUpdate.status = 'open';
        }

        await supabase
            .from('tickets')
            .update(statusUpdate)
            .eq('id', ticketId);

        // Log message added
        await logActivity(user.id, 'TICKET_MESSAGE_ADDED', 'ticket', ticketId, {
            ticket_number: ticket.ticket_number,
            is_admin: isAdmin
        }, req);

        res.status(201).json({
            success: true,
            message: newMessage
        });

    } catch (error) {
        console.error('Add message error:', error);
        res.status(500).json({ error: 'Failed to add message' });
    }
}
