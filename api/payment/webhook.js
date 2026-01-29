/**
 * POST /api/payment/webhook
 * Razorpay webhook handler for async payment events
 *
 * Configure this URL in Razorpay Dashboard > Webhooks
 * Set webhook secret in RAZORPAY_WEBHOOK_SECRET env var
 */

const crypto = require('crypto');
const { supabase } = require('../../lib/supabase');
const { logActivity } = require('../../lib/logger');

module.exports = async (req, res) => {
    // Webhooks don't use CORS
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verify webhook signature
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        if (webhookSecret) {
            const signature = req.headers['x-razorpay-signature'];

            if (!signature) {
                console.error('Webhook: Missing signature');
                return res.status(400).json({ error: 'Missing signature' });
            }

            const body = JSON.stringify(req.body);
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(body)
                .digest('hex');

            if (signature !== expectedSignature) {
                console.error('Webhook: Invalid signature');
                await logActivity(null, 'WEBHOOK_SIGNATURE_INVALID', 'webhook', null, {}, req);
                return res.status(400).json({ error: 'Invalid signature' });
            }
        }

        const event = req.body.event;
        const payload = req.body.payload;

        console.log(`Webhook received: ${event}`);

        switch (event) {
            case 'payment.captured':
                await handlePaymentCaptured(payload);
                break;

            case 'payment.failed':
                await handlePaymentFailed(payload);
                break;

            case 'order.paid':
                await handleOrderPaid(payload);
                break;

            default:
                console.log(`Unhandled webhook event: ${event}`);
        }

        // Always respond 200 to acknowledge receipt
        res.status(200).json({ received: true });

    } catch (error) {
        console.error('Webhook error:', error);
        // Still respond 200 to prevent retries for processing errors
        res.status(200).json({ received: true, error: 'Processing error' });
    }
};

/**
 * Handle payment.captured event
 */
async function handlePaymentCaptured(payload) {
    const payment = payload.payment?.entity;
    if (!payment) return;

    const razorpayOrderId = payment.order_id;
    const razorpayPaymentId = payment.id;

    // Find order
    const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('razorpay_order_id', razorpayOrderId)
        .single();

    if (!order) {
        console.error(`Webhook: Order not found for ${razorpayOrderId}`);
        return;
    }

    // Skip if already verified
    if (order.payment_verified) {
        console.log(`Webhook: Order ${order.order_number} already verified`);
        return;
    }

    // Update order as paid
    await supabase
        .from('orders')
        .update({
            razorpay_payment_id: razorpayPaymentId,
            payment_verified: true,
            status: 'advance_paid',
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

    await logActivity(order.user_id, 'PAYMENT_CAPTURED_WEBHOOK', 'order', order.id, {
        razorpay_payment_id: razorpayPaymentId,
        amount: payment.amount / 100
    });

    console.log(`Webhook: Payment captured for order ${order.order_number}`);
}

/**
 * Handle payment.failed event
 */
async function handlePaymentFailed(payload) {
    const payment = payload.payment?.entity;
    if (!payment) return;

    const razorpayOrderId = payment.order_id;

    // Find order
    const { data: order } = await supabase
        .from('orders')
        .select('id, order_number, user_id')
        .eq('razorpay_order_id', razorpayOrderId)
        .single();

    if (!order) return;

    await logActivity(order.user_id, 'PAYMENT_FAILED_WEBHOOK', 'order', order.id, {
        error_code: payment.error_code,
        error_description: payment.error_description
    });

    console.log(`Webhook: Payment failed for order ${order.order_number}`);
}

/**
 * Handle order.paid event
 */
async function handleOrderPaid(payload) {
    const orderEntity = payload.order?.entity;
    if (!orderEntity) return;

    // This is a backup verification method
    const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('razorpay_order_id', orderEntity.id)
        .single();

    if (!order || order.payment_verified) return;

    await supabase
        .from('orders')
        .update({
            payment_verified: true,
            status: 'advance_paid',
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

    await logActivity(order.user_id, 'ORDER_PAID_WEBHOOK', 'order', order.id, {
        razorpay_order_id: orderEntity.id
    });

    console.log(`Webhook: Order paid for ${order.order_number}`);
}
