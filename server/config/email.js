/**
 * Email (Nodemailer) Configuration
 * Loads SMTP settings from database or environment variables
 */
const nodemailer = require('nodemailer');

/**
 * Get current transporter (fresh settings each time)
 */
function getTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        tls: { rejectUnauthorized: false }
    });
}

/**
 * Load SMTP settings from database into process.env
 */
async function loadEmailSettingsFromDB() {
    try {
        const { supabaseAdmin } = require('./database');
        const { data } = await supabaseAdmin
            .from('app_settings').select('key, value')
            .in('key', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_enabled']);
        if (data) {
            data.forEach(s => {
                if (s.key === 'smtp_host' && s.value) process.env.SMTP_HOST = s.value;
                if (s.key === 'smtp_port' && s.value) process.env.SMTP_PORT = s.value;
                if (s.key === 'smtp_user' && s.value) process.env.SMTP_USER = s.value;
                if (s.key === 'smtp_pass' && s.value) process.env.SMTP_PASS = s.value;
                if (s.key === 'smtp_from' && s.value) process.env.SMTP_FROM = s.value;
            });
            console.log('[Email] SMTP settings loaded from database.');
        }
    } catch (err) {
        console.log('[Email] Could not load SMTP settings from database:', err.message);
    }
}

/**
 * Send an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML body
 */
async function sendEmail(to, subject, html) {
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.log('[Email] SMTP not configured, skipping email to:', to);
            return null;
        }
        const transporter = getTransporter();
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || `"Enterprise System" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html
        });
        console.log('[Email] Sent to', to, '- ID:', info.messageId);
        return info;
    } catch (error) {
        console.error('[Email] Failed to send:', error.message);
        throw error;
    }
}

module.exports = { sendEmail, loadEmailSettingsFromDB };
