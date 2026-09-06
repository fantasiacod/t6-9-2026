/**
 * Authentication Routes
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET  /api/auth/me
 * POST /api/auth/forgot-password
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const { supabaseAdmin } = require('../config/database');
const { loginLimiter } = require('../middleware/rateLimiter');
const { validateLogin } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { createAuditLog, logAction } = require('../middleware/auditLog');
const { getClientIp } = require('../utils/helpers');
const { authorize, departmentScope } = require('../middleware/rbac');
const { resolvePermissions, permissionsVersion } = require('../utils/permissions');

// POST /api/auth/login
router.post('/login', loginLimiter, validateLogin, async (req, res) => {
    try {
        const { username, password, remember_me } = req.body;
        const ip = getClientIp(req);

        // Find user by username
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select(`*, user_roles(roles(id, name)), departments!users_department_id_fkey(id, name)`)
            .eq('username', username)
            .single();

        if (error || !user) {
            // Log failed attempt
            await supabaseAdmin.from('login_attempts').insert({ username, ip_address: ip, success: false });
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            await supabaseAdmin.from('login_attempts').insert({ username, ip_address: ip, success: false });
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }

        // Check account status
        if (user.status === 'suspended') {
            await supabaseAdmin.from('login_attempts').insert({ username, ip_address: ip, success: false });
            return res.status(403).json({ success: false, message: 'Your account is suspended. Please contact the administrator.' });
        }
        
        if (user.status === 'deleted') {
            await supabaseAdmin.from('login_attempts').insert({ username, ip_address: ip, success: false });
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }

        // Generate JWT
        const roles = (user.user_roles || []).map(ur => ur.roles).filter(Boolean);
        const role = roles[0] || { id: null, name: 'employee' };

        // Effective permissions: all roles union per-user allows minus denies
        const { permissions } = await resolvePermissions(user.id, roles);

        const expiresIn = remember_me ? jwtConfig.rememberMeExpiresIn : jwtConfig.expiresIn;
        const token = jwt.sign({ userId: user.id, role: role.name }, jwtConfig.secret, { expiresIn });

        // Log successful attempt
        await supabaseAdmin.from('login_attempts').insert({ username, ip_address: ip, success: true });
        await createAuditLog(user.id, username, 'LOGIN', 'user', user.id, { ip_address: ip }, ip);

        res.json({
            success: true,
            message: 'Login successful.',
            data: {
                token,
                user: {
                    id: user.id,
                    fullName: user.full_name,
                    email: user.email,
                    username: user.username,
                    employeeId: user.employee_id,
                    jobTitle: user.job_title,
                    phone: user.phone,
                    departmentId: user.department_id,
                    department: user.departments,
                    role: role,
                    roles: roles,
                    permissions: permissions,
                    permissionsVersion: permissionsVersion(permissions),
                    status: user.status,
                    avatarUrl: user.avatar_url
                }
            }
        });
    } catch (err) {
        console.error('[Auth] Login error:', err);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
    res.json({ success: true, data: req.user });
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
    const ip = getClientIp(req);
    await createAuditLog(req.user.id, req.user.username, 'LOGOUT', 'user', req.user.id, {}, ip);
    res.json({ success: true, message: 'Logged out successfully.' });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

        const { data: user } = await supabaseAdmin
            .from('users')
            .select('id, username, email')
            .eq('email', email)
            .single();

        // Always return success to prevent email enumeration
        if (!user) {
            return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
        }

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
        const hash = await bcrypt.hash(tempPassword, 12);
        await supabaseAdmin.from('users').update({ password_hash: hash }).eq('id', user.id);

        // Send email with temp password
        const { sendEmail } = require('../config/email');
        await sendEmail(user.email, 'Password Reset - Enterprise System',
            `<h3>Password Reset</h3><p>Your temporary password is: <strong>${tempPassword}</strong></p><p>Please login and change your password immediately.</p>`
        );

        res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    } catch (err) {
        console.error('[Auth] Forgot password error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, logAction('UPDATE_PROFILE', 'user'), async (req, res) => {
    try {
        const { full_name, email, phone, avatar_url } = req.body;
        console.log('[Auth] PUT /profile received body keys:', Object.keys(req.body));
        console.log('[Auth] avatar_url length:', avatar_url ? avatar_url.length : 0);
        
        // Check uniqueness of email excluding current user
        const { data: existing } = await supabaseAdmin.from('users')
            .select('id')
            .eq('email', email)
            .neq('id', req.user.id);
            
        if (existing && existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Email already in use.' });
        }

        const { error } = await supabaseAdmin.from('users').update({
            full_name, email, phone, avatar_url
        }).eq('id', req.user.id);

        if (error) throw error;
        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (err) {
        console.error('[Auth] Profile update error:', err);
        res.status(500).json({ success: false, message: 'Failed to update profile.' });
    }
});

// PUT /api/auth/password
router.put('/password', authenticate, logAction('UPDATE_PASSWORD', 'user'), async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        
        // Verify current password
        const { data: user } = await supabaseAdmin.from('users').select('password_hash').eq('id', req.user.id).single();
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        
        const validPassword = await bcrypt.compare(current_password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Incorrect current password.' });
        }
        
        if (!new_password || new_password.length < 8) {
            return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
        }
        
        const hash = await bcrypt.hash(new_password, 12);
        const { error } = await supabaseAdmin.from('users').update({ password_hash: hash }).eq('id', req.user.id);
        
        if (error) throw error;
        res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
        console.error('[Auth] Password change error:', err);
        res.status(500).json({ success: false, message: 'Failed to change password.' });
    }
});

module.exports = router;
