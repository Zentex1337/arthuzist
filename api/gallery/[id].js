/**
 * /api/gallery/[id]
 * GET - Get single gallery item
 * PATCH - Update gallery item (admin only)
 * DELETE - Delete gallery item (admin only)
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
    await logActivity(user.id, 'ADMIN_ACCESS_TERMINATED', 'user', user.id, { reason: 'Unauthorized gallery action', attempted_permission: permission }, req);

    res.status(403).json({ error: 'Access violation', terminated: true, message: 'Admin access revoked.' });
    return false;
}

module.exports = async (req, res) => {
    // Handle CORS
    if (handleCors(req, res)) return;

    const itemId = req.query.id;
    if (!itemId) {
        return res.status(400).json({ error: 'Item ID required' });
    }

    if (req.method === 'GET') {
        return handleGetItem(req, res, itemId);
    }

    if (req.method === 'PATCH') {
        return handleUpdateItem(req, res, itemId);
    }

    if (req.method === 'DELETE') {
        return handleDeleteItem(req, res, itemId);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * GET /api/gallery/[id] - Get single item
 */
async function handleGetItem(req, res, itemId) {
    try {
        const { data: item, error } = await supabase
            .from('gallery')
            .select('*')
            .eq('id', itemId)
            .single();

        if (error || !item) {
            return res.status(404).json({ error: 'Gallery item not found' });
        }

        res.status(200).json({
            success: true,
            item
        });

    } catch (error) {
        console.error('Get gallery item error:', error);
        res.status(500).json({ error: 'Failed to fetch gallery item' });
    }
}

/**
 * PATCH /api/gallery/[id] - Update item (admin only)
 */
async function handleUpdateItem(req, res, itemId) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        // Require admin
        if (!requireAdmin(user, res)) return;

        // Check manage_gallery permission
        if (!await checkPermissionOrTerminate(user, res, 'manage_gallery', req)) return;

        // Get current item
        const { data: currentItem } = await supabase
            .from('gallery')
            .select('*')
            .eq('id', itemId)
            .single();

        if (!currentItem) {
            return res.status(404).json({ error: 'Gallery item not found' });
        }

        // Build update
        const allowedFields = ['title', 'description', 'category', 'image_url', 'is_featured', 'display_order'];
        const update = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                update[field] = req.body[field];
            }
        }

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        // Validate category if provided
        if (update.category) {
            const validCategories = ['charcoal', 'anime', 'portrait', 'couple', 'custom'];
            if (!validCategories.includes(update.category)) {
                return res.status(400).json({
                    error: 'Invalid category',
                    validCategories
                });
            }
        }

        // Update item
        const { data: updatedItem, error: updateError } = await supabase
            .from('gallery')
            .update(update)
            .eq('id', itemId)
            .select()
            .single();

        if (updateError) {
            console.error('Update gallery item error:', updateError);
            return res.status(500).json({ error: 'Failed to update gallery item' });
        }

        // Log action
        await logActivity(user.id, 'GALLERY_ITEM_UPDATED', 'gallery', itemId, {
            changes: Object.keys(update)
        }, req);

        res.status(200).json({
            success: true,
            item: updatedItem
        });

    } catch (error) {
        console.error('Update gallery item error:', error);
        res.status(500).json({ error: 'Failed to update gallery item' });
    }
}

/**
 * DELETE /api/gallery/[id] - Delete item (admin only)
 */
async function handleDeleteItem(req, res, itemId) {
    try {
        // Require authentication
        const user = await requireAuth(req, res);
        if (!user) return;

        // Require admin
        if (!requireAdmin(user, res)) return;

        // Check manage_gallery permission
        if (!await checkPermissionOrTerminate(user, res, 'manage_gallery', req)) return;

        // Get item first for logging
        const { data: item } = await supabase
            .from('gallery')
            .select('title')
            .eq('id', itemId)
            .single();

        if (!item) {
            return res.status(404).json({ error: 'Gallery item not found' });
        }

        // Delete item
        const { error: deleteError } = await supabase
            .from('gallery')
            .delete()
            .eq('id', itemId);

        if (deleteError) {
            console.error('Delete gallery item error:', deleteError);
            return res.status(500).json({ error: 'Failed to delete gallery item' });
        }

        // Log action
        await logActivity(user.id, 'GALLERY_ITEM_DELETED', 'gallery', itemId, {
            title: item.title
        }, req);

        res.status(200).json({
            success: true,
            message: 'Gallery item deleted'
        });

    } catch (error) {
        console.error('Delete gallery item error:', error);
        res.status(500).json({ error: 'Failed to delete gallery item' });
    }
}
