/**
 * POST /api/payment/create-order
 * Create a Razorpay order for an existing order
 * This is called if payment modal is closed and reopened
 */

const Razorpay = require('razorpay');
const { supabase } = require('../../lib/supabase');
const { handleCors, checkRateLimit } = require('../../lib/middleware');
const { logActivity } = require('../../lib/logger');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

module.exports = async (req, res) => {
    // Handle CORS
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Rate limiting
        const allowed = await checkRateLimit(req, res, 'create_payment', 10, 60000);
        if (!allowed) return;

        const { order_id } = req.body;

        if (!order_id) {
            return res.status(400).json({ error: 'Order ID required' });
        }

        // Get order from database
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', order_id)
            .single();

        if (orderError || !order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Check if already paid
        if (order.payment_verified) {
            return res.status(400).json({
                error: 'Order already paid',
                order_number: order.order_number
            });
        }

        // If Razorpay order exists and not expired, return it
        if (order.razorpay_order_id) {
            try {
                const existingRzpOrder = await razorpay.orders.fetch(order.razorpay_order_id);
                if (existingRzpOrder.status !== 'paid') {
                    return res.status(200).json({
                        success: true,
                        order: {
                            id: order.id,
                            order_number: order.order_number,
                            razorpay_order_id: existingRzpOrder.id,
                            amount: existingRzpOrder.amount,
                            currency: existingRzpOrder.currency
                        },
                        razorpay_key: process.env.RAZORPAY_KEY_ID
                    });
                }
            } catch (e) {
                // Order might be expired, create new one
            }
        }

        // Create new Razorpay order using SERVER-STORED amount
        const razorpayOrder = await razorpay.orders.create({
            amount: order.advance * 100, // Use amount from database, not client
            currency: 'INR',
            receipt: order.order_number,
            notes: {
                order_id: order.id,
                service: order.service_name
            }
        });

        // Update order with new Razorpay order ID
        await supabase
            .from('orders')
            .update({
                razorpay_order_id: razorpayOrder.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', order.id);

        // Log payment order creation
        await logActivity(order.user_id, 'PAYMENT_ORDER_CREATED', 'order', order.id, {
            razorpay_order_id: razorpayOrder.id,
            amount: order.advance
        }, req);

        res.status(200).json({
            success: true,
            order: {
                id: order.id,
                order_number: order.order_number,
                razorpay_order_id: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency
            },
            razorpay_key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Create payment order error:', error);
        res.status(500).json({ error: 'Failed to create payment order' });
    }
};
