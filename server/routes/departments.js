/**
 * Department Management Routes
 */
const router = require('express').Router();
const { supabaseAdmin } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize, departmentScope } = require('../middleware/rbac');
const { validateDepartment } = require('../middleware/validate');
const { logAction } = require('../middleware/auditLog');

router.use(authenticate);
router.use(departmentScope);

// GET /api/departments - List all departments
// Unchanged permission list: the task form needs the department picker.
router.get('/', authorize('view_departments', 'create_departments', 'create_tasks', 'view_tasks'), async (req, res) => {
    try {
        const { data: departments, error } = await supabaseAdmin
            .from('departments')
            .select(`*, users!users_department_id_fkey(id)`)
            .order('name');

        if (error) throw error;

        const formatted = departments.map(d => ({
            id: d.id,
            name: d.name,
            description: d.description,
            isActive: d.is_active,
            employeeCount: d.users ? d.users.length : 0,
            createdAt: d.created_at
        }));

        res.json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch departments.' });
    }
});

// GET /api/departments/:id
// Returns the department's employee list, so an own/department-scoped
// account must not be able to read another department's detail.
router.get('/:id', authorize('view_departments', 'create_departments'), async (req, res) => {
    if (req.departmentScope && req.params.id !== req.departmentScope) {
        return res.status(403).json({ success: false, message: 'Access denied.', code: 'FORBIDDEN' });
    }
    try {
        const { data: dept, error } = await supabaseAdmin
            .from('departments')
            .select(`*, users!users_department_id_fkey(id, full_name, email, job_title, employee_id, status)`)
            .eq('id', req.params.id)
            .single();

        if (error || !dept) return res.status(404).json({ success: false, message: 'Department not found.' });

        res.json({
            success: true,
            data: {
                id: dept.id, name: dept.name, description: dept.description,
                isActive: dept.is_active, employees: dept.users || [], createdAt: dept.created_at
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch department.' });
    }
});

// POST /api/departments
router.post('/', authorize('create_departments'), validateDepartment, logAction('CREATE_DEPARTMENT', 'department'), async (req, res) => {
    try {
        const { name, description } = req.body;
        const { data, error } = await supabaseAdmin.from('departments').insert({
            name, description, created_by: req.user.id, is_active: true
        }).select().single();

        if (error) {
            if (error.code === '23505') return res.status(409).json({ success: false, message: 'Department name already exists.' });
            throw error;
        }
        res.status(201).json({ success: true, message: 'Department created.', data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to create department.' });
    }
});

// PUT /api/departments/:id
router.put('/:id', authorize('edit_departments'), validateDepartment, logAction('UPDATE_DEPARTMENT', 'department'), async (req, res) => {
    try {
        const { name, description, is_active } = req.body;
        const { error } = await supabaseAdmin.from('departments').update({
            name, description, is_active: is_active !== undefined ? is_active : true
        }).eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Department updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update department.' });
    }
});

// PATCH /api/departments/:id/status
router.patch('/:id/status', authorize('edit_departments'), logAction('UPDATE_DEPARTMENT', 'department'), async (req, res) => {
    try {
        const { is_active } = req.body;
        const { error } = await supabaseAdmin.from('departments').update({
            is_active
        }).eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'تم تحديث حالة القسم.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'فشل في تحديث الحالة.' });
    }
});

// DELETE /api/departments/:id
router.delete('/:id', authorize('delete_departments'), logAction('DELETE_DEPARTMENT', 'department'), async (req, res) => {
    try {
        // Check if employees are assigned (excluding deleted ones)
        const { data: users } = await supabaseAdmin.from('users').select('id').eq('department_id', req.params.id).neq('status', 'deleted');
        if (users && users.length > 0) {
            return res.status(400).json({ success: false, message: 'لا يمكن حذف هذا القسم لأنه يحتوي على موظفين حالياً. يرجى نقلهم إلى قسم آخر أولاً.' });
        }
        
        // Remove department from deleted users so it doesn't block deletion
        await supabaseAdmin.from('users').update({ department_id: null }).eq('department_id', req.params.id).eq('status', 'deleted');

        const { error } = await supabaseAdmin.from('departments').delete().eq('id', req.params.id);
        
        if (error) {
            if (error.code === '23503') {
                return res.status(409).json({ 
                    success: false, 
                    message: 'لا يمكن حذف هذا القسم لوجود مهام أو سجلات تاريخية مرتبطة به. يرجى "تعطيل" القسم بدلاً من حذفه لإخفائه.' 
                });
            }
            throw error;
        }
        res.json({ success: true, message: 'تم حذف القسم بنجاح.' });
    } catch (err) {
        console.error('[Departments] Delete error:', err);
        res.status(500).json({ success: false, message: 'فشل في حذف القسم.' });
    }
});

module.exports = router;
