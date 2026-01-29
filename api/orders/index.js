/**
 * /api/orders
 * GET - List orders (user sees own, admin sees all)
 * POST - Create new order
 */

const Razorpay = require('razorpay');
const { supabase } = require('../../lib/supabase');
const { handleCors, requireAuth, optionalAuth, checkRateLimit, verifyHCaptcha, isSuperAdmin, hasPermission } = require('../../lib/middleware');
const { validateOrder } = require('../../lib/validators');
const { calculateOrderPrice } = require('../../lib/pricing');
const { logActivity } = require('../../lib/logger');

/**
 * Check permission and terminate admin if violated
 */
async function checkPermissionOrTerminate(user, res, permission, req) {
    if (isSuperAdmin(user)) return true;
    if (hasPermission(user, permission)) return true;

    await supabase.from('users').update({ role: 'user', admin_permissions: null }).eq('id', user.id);
    await supabase.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id);
    await logActivity(user.id, 'ADMIN_ACCESS_TERMINATED', 'user', user.id, { reason: 'Unauthorized order access', attempted_permission: permission }, req);

    res.status(403).json({ error: 'Access violation', terminated: true, message: 'Admin access revoked.' });
    return false;
}

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

module.exports = async (req, res) => {
    // Handle CORS
    if (handleCors(req, res)) return;

    if (req.method === 'GET') {
        return handleGetOrders(req, res);
    }

    if (req.method === 'POST') {
        return handleCreateOrder(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * GET /api/orders - List orders
 */
async function handleGetOrders(req, res) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        let query = supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        // Non-admin users only see their own orders
        if (user.role !== 'admin') {
            query = query.eq('user_id', user.id);
        } else {
            // Admin trying to see all orders - check permission
            if (!await checkPermissionOrTerminate(user, res, 'manage_orders', req)) return;
        }

        // Pagination
        const page = parseInt(req.query?.page) || 1;
        const limit = Math.min(parseInt(req.query?.limit) || 20, 100);
        const offset = (page - 1) * limit;

        query = query.range(offset, offset + limit - 1);

        const { data: orders, error, count } = await query;

        if (error) {
            console.error('Fetch orders error:', error);
            return res.status(500).json({ error: 'Failed to fetch orders' });
        }

        res.status(200).json({
            success: true,
            orders,
            pagination: {
                page,
                limit,
                total: count
            }
        });

    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
}

/**
 * POST /api/orders - Create new order
 */
async function handleCreateOrder(req, res) {
    try {
        // Rate limiting: 5 orders per hour per IP
        const allowed = await checkRateLimit(req, res, 'create_order', 5, 3600000);
        if (!allowed) return;

        // Verify hCaptcha
        const captchaValid = await verifyHCaptcha(req.body.captchaToken, res);
        if (!captchaValid) return;

        // Validate input
        const validation = validateOrder(req.body);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        const { name, email, phone, service, size, addons, message } = validation.data;

        // ============================================
        // CRITICAL: Calculate price SERVER-SIDE
        // Never trust client-provided amounts
        // ============================================
        let pricing;
        try {
            pricing = await calculateOrderPrice(service, size, addons || 'none');
        } catch (priceError) {
            return res.status(400).json({ error: priceError.message });
        }

        // Generate order number
        const orderNumber = `ORD${Date.now().toString(36).toUpperCase()}`;

        // Check if user is authenticated (optional for guest orders)
        const user = await optionalAuth(req);

        // Create order in database
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                order_number: orderNumber,
                user_id: user?.id || null,
                guest_name: user ? null : name,
                guest_email: user ? null : email,
                guest_phone: user ? null : phone,
                service: pricing.service.key,
                service_name: pricing.service.name,
                size: pricing.size.key,
                size_name: pricing.size.name,
                addons: pricing.addons.key,
                addons_name: pricing.addons.name,
                message: message.substring(0, 1000),
                base_price: pricing.basePrice,
                size_price: pricing.sizePrice,
                addons_price: pricing.addonsPrice,
                total: pricing.total,
                advance: pricing.advance,
                remaining: pricing.remaining,
                status: 'pending'
            })
            .select()
            .single();

        if (orderError) {
            console.error('Order creation error:', orderError);
            return res.status(500).json({ error: 'Failed to create order' });
        }

        // Create Razorpay order with SERVER-CALCULATED amount
        let razorpayOrder;
        try {
            razorpayOrder = await razorpay.orders.create({
                amount: pricing.advance * 100, // Amount in paise
                currency: 'INR',
                receipt: orderNumber,
                notes: {
                    order_id: order.id,
                    service: pricing.service.name
                }
            });
        } catch (rzpError) {
            console.error('Razorpay order creation failed:', rzpError);
            // Delete the database order
            await supabase.from('orders').delete().eq('id', order.id);
            return res.status(500).json({ error: 'Failed to create payment order' });
        }

        // Update order with Razorpay order ID
        await supabase
            .from('orders')
            .update({ razorpay_order_id: razorpayOrder.id })
            .eq('id', order.id);

        // Log order creation
        await logActivity(user?.id, 'ORDER_CREATED', 'order', order.id, {
            order_number: orderNumber,
            total: pricing.total,
            advance: pricing.advance,
            service: pricing.service.name
        }, req);

        res.status(201).json({
            success: true,
            order: {
                id: order.id,
                order_number: orderNumber,
                razorpay_order_id: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                pricing: {
                    service: pricing.service.name,
                    size: pricing.size.name,
                    addons: pricing.addons.name,
                    total: pricing.total,
                    advance: pricing.advance,
                    remaining: pricing.remaining
                }
            },
            // Return public Razorpay key (NOT the secret)
            razorpay_key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
}
