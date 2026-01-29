/**
 * /api/gallery
 * GET - List gallery items (public)
 * POST - Add gallery item (admin only)
 */

const { supabase } = require('../../lib/supabase');
const { handleCors, requireAuth, requireAdmin, checkRateLimit, isSuperAdmin, hasPermission } = require('../../lib/middleware');
const { validateGallery } = require('../../lib/validators');
const { logActivity } = require('../../lib/logger');

/**
 * Check permission and terminate admin if violated
 */
async function checkPermissionOrTerminate(user, res, permission, req) {
    if (isSuperAdmin(user)) return true;
    if (hasPermission(user, permission)) return true;

    await supabase.from('users').update({ role: 'user', admin_permissions: null }).eq('id', user.id);
    await supabase.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id);
    await logActivity(user.id, 'ADMIN_ACCESS_TERMINATED', 'user', user.id, { reason: 'Unauthorized gallery action', attempted_permission: permission }, req);

    res.status(403).json({ error: 'Access violation', terminated: true, message: 'Admin access revoked.' });
    return false;
}

module.exports = async (req, res) => {
    // Handle CORS
    if (handleCors(req, res)) return;

    if (req.method === 'GET') {
        return handleGetGallery(req, res);
    }

    if (req.method === 'POST') {
        return handleAddGalleryItem(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * GET /api/gallery - List gallery items (public)
 */
async function handleGetGallery(req, res) {
    try {
        // Rate limiting for public endpoint
        const allowed = await checkRateLimit(req, res, 'get_gallery', 100, 60000);
        if (!allowed) return;

        let query = supabase
            .from('gallery')
            .select('id, image_url, thumbnail_url, title, description, category, is_featured, created_at')
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: false });

        // Filter by category
        if (req.query?.category) {
            query = query.eq('category', req.query.category);
        }

        // Filter featured only
        if (req.query?.featured === 'true') {
            query = query.eq('is_featured', true);
        }

        // Pagination
        const page = parseInt(req.query?.page) || 1;
        const limit = Math.min(parseInt(req.query?.limit) || 20, 50);
        const offset = (page - 1) * limit;

        query = query.range(offset, offset + limit - 1);

        const { data: items, error, count } = await query;

        if (error) {
            console.error('Fetch gallery error:', error);
            return res.status(500).json({ error: 'Failed to fetch gallery' });
        }

        // Get category counts
        const { data: categoryCounts } = await supabase
            .from('gallery')
            .select('category');

        const categories = {};
        (categoryCounts || []).forEach(item => {
            categories[item.category] = (categories[item.category] || 0) + 1;
        });

        res.status(200).json({
            success: true,
            items,
            gallery: items,  // Also return as 'gallery' for admin compatibility
            categories,
            pagination: {
                page,
                limit,
                total: count
            }
        });

    } catch (error) {
        console.error('Get gallery error:', error);
        res.status(500).json({ error: 'Failed to fetch gallery' });
    }
}

/**
 * POST /api/gallery - Add gallery item (admin only)
 */
async function handleAddGalleryItem(req, res) {
    try {
        // Rate limiting: 20 uploads per hour (admin)
        const allowed = await checkRateLimit(req, res, 'gallery_upload', 20, 3600000);
        if (!allowed) return;

        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        // Require admin
        if (!requireAdmin(user, res)) return;

        // Check manage_gallery permission
        if (!await checkPermissionOrTerminate(user, res, 'manage_gallery', req)) return;

        // Validate input
        const validation = validateGallery(req.body);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        const { image, title, description, category } = validation.data;

        // Create gallery item - store base64 image directly in image_url field
        const { data: item, error: createError } = await supabase
            .from('gallery')
            .insert({
                image_url: image,  // Store base64 data in image_url column
                title,
                description: description || null,
                category,
                uploaded_by: user.id
            })
            .select()
            .single();

        if (createError) {
            console.error('Create gallery item error:', createError);
            return res.status(500).json({ error: 'Failed to add gallery item' });
        }

        // Log action
        await logActivity(user.id, 'GALLERY_ITEM_ADDED', 'gallery', item.id, {
            title,
            category
        }, req);

        res.status(201).json({
            success: true,
            item
        });

    } catch (error) {
        console.error('Add gallery item error:', error);
        res.status(500).json({ error: 'Failed to add gallery item' });
    }
}
