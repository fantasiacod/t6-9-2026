/**
 * Task Notes Routes — with image support
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize, departmentScope, canAccessRecord, denyRecord } = require('../middleware/rbac');

router.use(authenticate);
router.use(departmentScope);

/**
 * Notes inherit the access rules of their parent task. Without this the
 * notes endpoint was an open side door into any task in the system.
 */
async function guardTask(req, res) {
    const { data: task } = await supabaseAdmin
        .from('tasks')
        .select('id, department_id, assigned_to, created_by')
        .eq('id', req.params.taskId)
        .single();
    if (!task) {
        res.status(404).json({ success: false, message: 'Task not found.' });
        return null;
    }
    if (!canAccessRecord(req, task)) {
        denyRecord(res);
        return null;
    }
    return task;
}

// GET /api/task-notes/task/:taskId
router.get('/task/:taskId', authorize('view_tasks', 'create_tasks'), async (req, res) => {
    try {
        if (!(await guardTask(req, res))) return;

        const { data, error } = await supabaseAdmin
            .from('task_notes')
            .select(`*, users(id, full_name, user_roles(roles(name)))`)
            .eq('task_id', req.params.taskId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const notes = data.map(n => ({
            id: n.id,
            content: n.content,
            imageUrl: n.image_url || null,
            createdAt: n.created_at,
            user: {
                id: n.users?.id,
                fullName: n.users?.full_name,
                role: n.users?.user_roles?.[0]?.roles?.name || 'employee'
            }
        }));

        res.json({ success: true, data: notes });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch notes.' });
    }
});

// POST /api/task-notes/task/:taskId
router.post('/task/:taskId', authorize('view_tasks', 'create_tasks'), async (req, res) => {
    try {
        if (!(await guardTask(req, res))) return;

        const { content, image_url } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'محتوى الملاحظة مطلوب.' });
        }

        const insertData = {
            task_id: req.params.taskId,
            user_id: req.user.id,
            content: content.trim()
        };

        // Attach image if provided (Base64 data URL or external URL)
        if (image_url && image_url.trim()) {
            insertData.image_url = image_url.trim();
        }

        const { data, error } = await supabaseAdmin
            .from('task_notes')
            .insert(insertData)
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, message: 'تم إضافة الملاحظة.', data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to add note.' });
    }
});

// DELETE /api/task-notes/:noteId
router.delete('/:noteId', async (req, res) => {
    try {
        const { data: note } = await supabaseAdmin
            .from('task_notes').select('user_id').eq('id', req.params.noteId).single();

        if (!note) return res.status(404).json({ success: false, message: 'الملاحظة غير موجودة.' });

        // Unchanged rule: the note author, or a full-access account, can delete
        const canModerate = req.user.permissions.includes('*');
        if (!canModerate && note.user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'لا تملك صلاحية حذف هذه الملاحظة.' });
        }

        await supabaseAdmin.from('task_notes').delete().eq('id', req.params.noteId);
        res.json({ success: true, message: 'تم حذف الملاحظة.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete note.' });
    }
});

module.exports = router;
