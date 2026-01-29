/**
 * /api/orders/[id]
 * GET - Get single order
 * PATCH - Update order status (admin only)
 */

const { supabase } = require('../../lib/supabase');
const { handleCors, requireAuth, requireAdmin } = require('../../lib/middleware');
const { logActivity } = require('../../lib/logger');

module.exports = async (req, res) => {
    // Handle CORS
    if (handleCors(req, res)) return;

    // Extract order ID from URL
    const orderId = req.query.id;
    if (!orderId) {
        return res.status(400).json({ error: 'Order ID required' });
    }

    if (req.method === 'GET') {
        return handleGetOrder(req, res, orderId);
    }

    if (req.method === 'PATCH') {
        return handleUpdateOrder(req, res, orderId);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * GET /api/orders/[id] - Get single order
 */
async function handleGetOrder(req, res, orderId) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        // Fetch order
        const { data: order, error } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (error || !order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Check ownership (admin can see all)
        if (user.role !== 'admin' && order.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.status(200).json({
            success: true,
            order
        });

    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
}

/**
 * PATCH /api/orders/[id] - Update order status (admin only)
 */
async function handleUpdateOrder(req, res, orderId) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        // Require admin
        if (!requireAdmin(user, res)) return;

        const { status } = req.body;

        // Validate status
        const validStatuses = [
            'pending', 'advance_paid', 'in_progress',
            'revision_requested', 'completed', 'final_paid',
            'delivered', 'cancelled', 'refunded'
        ];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                error: 'Invalid status',
                validStatuses
            });
        }

        // Get current order
        const { data: currentOrder } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (!currentOrder) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Build update object
        const update = {
            status,
            updated_at: new Date().toISOString()
        };

        // Add timestamps for specific statuses
        if (status === 'completed') {
            update.completed_at = new Date().toISOString();
        } else if (status === 'delivered') {
            update.delivered_at = new Date().toISOString();
        }

        // Update order
        const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update(update)
            .eq('id', orderId)
            .select()
            .single();

        if (updateError) {
            console.error('Order update error:', updateError);
            return res.status(500).json({ error: 'Failed to update order' });
        }

        // Log status change
        await logActivity(user.id, 'ORDER_STATUS_UPDATED', 'order', orderId, {
            old_status: currentOrder.status,
            new_status: status,
            order_number: currentOrder.order_number
        }, req);

        res.status(200).json({
            success: true,
            order: updatedOrder
        });

    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
}
