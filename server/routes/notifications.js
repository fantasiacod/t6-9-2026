/**
 * Notification Routes
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { getPaginationParams, buildPaginationMeta } = require('../utils/helpers');

router.use(authenticate);

// GET /api/notifications
router.get('/', async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query);
        const { data, error, count } = await supabaseAdmin
            .from('notifications')
            .select('*', { count: 'exact' })
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) throw error;
        res.json({ success: true, data, pagination: buildPaginationMeta(count, page, limit) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
    }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
    try {
        const { count, error } = await supabaseAdmin
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', req.user.id)
            .eq('is_read', false);
        if (error) throw error;
        res.json({ success: true, data: { count: count || 0 } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to count notifications.' });
    }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
    try {
        await supabaseAdmin.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
        res.json({ success: true, message: 'Notification marked as read.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update notification.' });
    }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res) => {
    try {
        await supabaseAdmin.from('notifications').update({ is_read: true }).eq('user_id', req.user.id).eq('is_read', false);
        res.json({ success: true, message: 'All notifications marked as read.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update notifications.' });
    }
});

// DELETE /api/notifications/all — Delete all notifications for user
router.delete('/all', async (req, res) => {
    try {
        await supabaseAdmin.from('notifications').delete().eq('user_id', req.user.id);
        res.json({ success: true, message: 'All notifications deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete notifications.' });
    }
});

module.exports = router;
