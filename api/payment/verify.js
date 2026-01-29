/**
 * POST /api/payment/verify
 * CRITICAL: Verify Razorpay payment signature
 *
 * This endpoint MUST verify the signature BEFORE marking any order as paid.
 * The old implementation ignored the verification result - that was a critical bug.
 */

const crypto = require('crypto');
const { supabase } = require('../../lib/supabase');
const { handleCors, checkRateLimit } = require('../../lib/middleware');
const { logActivity } = require('../../lib/logger');

module.exports = async (req, res) => {
    // Handle CORS
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Rate limiting: 10 verification attempts per minute per IP
        const allowed = await checkRateLimit(req, res, 'payment_verify', 10, 60000);
        if (!allowed) return;
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            order_id
        } = req.body;

        // Validate required fields
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id) {
            await logActivity(null, 'PAYMENT_VERIFY_MISSING_PARAMS', 'payment', null, {
                has_order_id: !!razorpay_order_id,
                has_payment_id: !!razorpay_payment_id,
                has_signature: !!razorpay_signature,
                has_internal_order: !!order_id
            }, req);

            return res.status(400).json({ error: 'Missing required payment parameters' });
        }

        // ============================================
        // CRITICAL: Verify signature FIRST
        // ============================================
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        // Use timing-safe comparison to prevent timing attacks
        let isValidSignature = false;
        try {
            isValidSignature = crypto.timingSafeEqual(
                Buffer.from(expectedSignature, 'hex'),
                Buffer.from(razorpay_signature, 'hex')
            );
        } catch (e) {
            // Buffers might have different lengths if signature is malformed
            isValidSignature = false;
        }

        if (!isValidSignature) {
            await logActivity(null, 'PAYMENT_SIGNATURE_INVALID', 'order', order_id, {
                razorpay_order_id,
                razorpay_payment_id
            }, req);

            return res.status(400).json({
                success: false,
                error: 'Payment verification failed - invalid signature'
            });
        }

        // ============================================
        // Verify order exists and matches
        // ============================================
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', order_id)
            .eq('razorpay_order_id', razorpay_order_id)
            .single();

        if (orderError || !order) {
            await logActivity(null, 'PAYMENT_ORDER_MISMATCH', 'order', order_id, {
                razorpay_order_id,
                error: orderError?.message
            }, req);

            return res.status(404).json({
                success: false,
                error: 'Order not found or Razorpay order ID mismatch'
            });
        }

        // Check if already verified (prevent double processing)
        if (order.payment_verified) {
            return res.status(200).json({
                success: true,
                message: 'Payment already verified',
                order_number: order.order_number
            });
        }

        // ============================================
        // ONLY NOW update order as paid
        // ============================================
        const { error: updateError } = await supabase
            .from('orders')
            .update({
                razorpay_payment_id,
                razorpay_signature,
                payment_verified: true,
                status: 'advance_paid',
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', order_id);

        if (updateError) {
            console.error('Order update failed:', updateError);
            return res.status(500).json({
                success: false,
                error: 'Failed to update order'
            });
        }

        // Create automatic support ticket for the order
        const ticketNumber = `TKT${Date.now().toString(36).toUpperCase()}`;
        const { data: ticket } = await supabase
            .from('tickets')
            .insert({
                ticket_number: ticketNumber,
                order_id: order.id,
                user_id: order.user_id,
                subject: `Order ${order.order_number} - ${order.service_name}`,
                category: 'order',
                status: 'open'
            })
            .select()
            .single();

        // Add system message to ticket
        if (ticket) {
            await supabase
                .from('ticket_messages')
                .insert({
                    ticket_id: ticket.id,
                    author_name: 'System',
                    is_system: true,
                    message: `Thank you for your order!\n\n` +
                        `Order ID: ${order.order_number}\n` +
                        `Service: ${order.service_name}\n` +
                        `Size: ${order.size_name}\n` +
                        `Add-ons: ${order.addons_name}\n` +
                        `Total: ₹${order.total.toLocaleString('en-IN')}\n` +
                        `Advance Paid: ₹${order.advance.toLocaleString('en-IN')}\n` +
                        `Remaining: ₹${order.remaining.toLocaleString('en-IN')}\n\n` +
                        `We'll start working on your commission soon!`
                });
        }

        // Log successful payment
        await logActivity(order.user_id, 'PAYMENT_VERIFIED', 'order', order.id, {
            razorpay_order_id,
            razorpay_payment_id,
            amount: order.advance,
            ticket_number: ticketNumber
        }, req);

        res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            order_number: order.order_number,
            ticket_number: ticketNumber
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Payment verification failed'
        });
    }
};
