/**
 * Request Validation Middleware
 * Uses express-validator for input validation
 */
const { body, param, query, validationResult } = require('express-validator');

/** Handle validation errors */
function handleValidation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
        });
    }
    next();
}

/** Login validation */
const validateLogin = [
    body('username').trim().notEmpty().withMessage('اسم المستخدم مطلوب'),
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة'),
    handleValidation
];

/** User creation/update validation */
const validateUser = [
    body('full_name').trim().notEmpty().withMessage('الاسم الكامل مطلوب')
        .isLength({ min: 2, max: 150 }).withMessage('الاسم يجب أن يكون بين 2 و 150 حرفاً'),
    body('email').trim().isEmail().withMessage('البريد الإلكتروني غير صحيح').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).matches(/^[\+]?[0-9\s\-\(\)]{7,20}$/).withMessage('رقم الهاتف غير صحيح'),
    body('job_title').optional({ checkFalsy: true }).trim(),
    body('employee_id').trim().notEmpty().withMessage('الرقم الوظيفي مطلوب'),
    body('username').trim().notEmpty().withMessage('اسم المستخدم مطلوب')
        .isLength({ min: 3, max: 50 }).withMessage('اسم المستخدم يجب أن يكون بين 3 و 50 حرفاً')
        .matches(/^[a-zA-Z0-9._-]+$/).withMessage('اسم المستخدم يمكن أن يحتوي فقط على حروف إنجليزية، أرقام، ونقاط'),
    body('department_id').notEmpty().withMessage('القسم مطلوب').isUUID().withMessage('معرف القسم غير صحيح'),
    body('role_id').notEmpty().withMessage('الصلاحية مطلوبة').isUUID().withMessage('معرف الصلاحية غير صحيح'),
    handleValidation
];

/** User creation - includes password validation */
const validateUserCreate = [
    ...validateUser.slice(0, -1), // Remove handleValidation from validateUser
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
        .isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
    handleValidation
];

/** Task validation */
const validateTask = [
    body('title').trim().notEmpty().withMessage('عنوان المهمة مطلوب')
        .isLength({ max: 255 }).withMessage('العنوان يجب ألا يتجاوز 255 حرفاً'),
    body('description').optional({ nullable: true }).trim(),
    body('assigned_to').notEmpty().withMessage('الموظف المسؤول مطلوب').custom(value => {
        if (value !== 'ALL' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
            throw new Error('معرف المستخدم غير صحيح');
        }
        return true;
    }),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
    body('work_days').notEmpty().withMessage('Work days is required')
        .isInt({ min: 1, max: 30 }).withMessage('Work days must be 1-30'),
    handleValidation
];

/** Department validation */
const validateDepartment = [
    body('name').trim().notEmpty().withMessage('Department name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('description').optional({ nullable: true }).trim(),
    handleValidation
];

/** Technical issue validation */
const validateTechnicalIssue = [
    body('title').trim().notEmpty().withMessage('Issue title is required')
        .isLength({ max: 255 }).withMessage('Title max 255 characters'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('الأولوية غير صحيحة'),
    handleValidation
];

/** UUID param validation */
const validateId = [
    param('id').isUUID().withMessage('صيغة المعرف غير صحيحة'),
    handleValidation
];

module.exports = {
    handleValidation,
    validateLogin,
    validateUser,
    validateUserCreate,
    validateTask,
    validateDepartment,
    validateTechnicalIssue,
    validateId
};
