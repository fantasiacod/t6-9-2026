const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { supabaseAdmin } = require('../config/database');
const { sendEmail, loadEmailSettingsFromDB } = require('../config/email');

// Every authenticated user may READ branding (the sidebar logo/theme
// needs it). Everything else requires manage_settings.
router.use(authenticate);
const canManage = authorize('manage_settings');

/** Helper to get settings from app_settings */
async function getSettings(keys) {
    const { data } = await supabaseAdmin.from('app_settings').select('key, value').in('key', keys);
    const result = {};
    if (data) data.forEach(item => result[item.key] = item.value);
    return result;
}

// ─── UI & Branding Settings (readable by any signed-in user) ────
router.get('/', async (req, res) => {
    try {
        const keys = ['logo1_url', 'logo1_name', 'logo2_url', 'logo2_name', 'login_logo_url', 'primary_color', 'sidebar_color', 'sidebar_text_color', 'text_color', 'font_family', 'weekend_days'];
        const settings = await getSettings(keys);
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false, message: 'فشل جلب الإعدادات' });
    }
});

router.put('/', canManage, async (req, res) => {
    try {
        await saveSettings(req.body);
        res.json({ success: true, message: 'تم الحفظ' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'فشل الحفظ' });
    }
});

// ─── Email (SMTP) Settings ────────────────────────────────────
router.get('/email', canManage, async (req, res) => {
    try {
        const settings = await getSettings(['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_enabled']);
        // Mask password
        if (settings.smtp_pass) settings.smtp_pass = '********';
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

router.put('/email', canManage, async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.smtp_pass === '********') delete data.smtp_pass;
        await saveSettings(data);
        await loadEmailSettingsFromDB(); // Reload in memory
        res.json({ success: true, message: 'تم الحفظ' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

router.post('/test-email', canManage, async (req, res) => {
    try {
        const email = req.user.email || 'test@example.com';
        await sendEmail(email, 'اختبار النظام', '<h1>نجاح!</h1><p>تم إعداد البريد بنجاح.</p>');
        res.json({ success: true, message: 'تم الإرسال لبريدك' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'فشل الإرسال' });
    }
});

// ─── n8n Webhook Settings ─────────────────────────────────────
router.get('/n8n', canManage, async (req, res) => {
    try {
        const settings = await getSettings(['n8n_webhook_url', 'n8n_enabled']);
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

router.put('/n8n', canManage, async (req, res) => {
    try {
        await saveSettings(req.body);
        res.json({ success: true, message: 'تم الحفظ' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

router.post('/test-n8n', canManage, async (req, res) => {
    try {
        const settings = await getSettings(['n8n_webhook_url', 'n8n_enabled']);
        if (!settings.n8n_webhook_url) throw new Error('لا يوجد رابط');
        const fetch = (await import('node-fetch')).default;
        await fetch(settings.n8n_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'This is a test webhook from ETMS', test: true })
        });
        res.json({ success: true, message: 'تم إرسال الطلب التجريبي' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'فشل الإرسال: ' + err.message });
    }
});

// ─── SMS Settings ─────────────────────────────────────
router.get('/sms', canManage, async (req, res) => {
    try {
        const settings = await getSettings(['sms_provider', 'twilio_sid', 'twilio_token', 'twilio_from', 'sms_enabled']);
        if (settings.twilio_token) settings.twilio_token = '********';
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

router.put('/sms', canManage, async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.twilio_token === '********') delete data.twilio_token;
        await saveSettings(data);
        res.json({ success: true, message: 'تم حفظ إعدادات SMS' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

router.post('/test-sms', canManage, async (req, res) => {
    try {
        const settings = await getSettings(['sms_provider', 'twilio_sid', 'twilio_token', 'twilio_from']);
        if (!settings.twilio_sid || !settings.twilio_token || !settings.twilio_from) {
            throw new Error('يرجى تعبئة جميع بيانات مزود الرسائل');
        }
        
        const phone = req.user.phone || '+966500000000';
        if (!req.user.phone) {
            return res.status(400).json({ success: false, message: 'لا يوجد رقم هاتف في ملفك الشخصي لإرسال التجربة إليه' });
        }

        const fetch = (await import('node-fetch')).default;
        const provider = settings.sms_provider || 'twilio';
        const msgBody = 'رسالة تجريبية من نظام إدارة المهام ETMS. الربط يعمل بنجاح! 🚀';

        if (provider === 'twilio') {
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${settings.twilio_sid}/Messages.json`;
            const params = new URLSearchParams();
            params.append('To', phone);
            params.append('From', settings.twilio_from);
            params.append('Body', msgBody);

            const auth = Buffer.from(`${settings.twilio_sid}:${settings.twilio_token}`).toString('base64');
            const response = await fetch(twilioUrl, {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'فشل في API تويليو');
        } else if (provider === 'unifonic') {
            const response = await fetch('https://el.cloud.unifonic.com/rest/SMS/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ AppSid: settings.twilio_sid, Recipient: phone.replace(/\+/g, ''), Body: msgBody, SenderID: settings.twilio_from })
            });
            const result = await response.json();
            if (!result.success && result.success !== 'true' && !result.data) throw new Error(result.message || 'فشل في API Unifonic');
        } else if (provider === 'taqnyat') {
            const response = await fetch('https://api.taqnyat.sa/v1/messages', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${settings.twilio_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipients: [phone.replace(/\+/g, '')], body: msgBody, sender: settings.twilio_from })
            });
            if (response.status !== 201 && response.status !== 200) {
                const result = await response.json();
                throw new Error(result.message || 'فشل في API تقنيات');
            }
        } else if (provider === 'msegat') {
            const response = await fetch('https://www.msegat.com/gw/sendsms.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userName: settings.twilio_sid, numbers: phone.replace(/\+/g, ''), userSender: settings.twilio_from, apiKey: settings.twilio_token, msg: msgBody })
            });
            const result = await response.json();
            if (result.code !== '1' && result.code !== 1) throw new Error(result.message || 'فشل في API مسجات');
        } else {
            throw new Error('المزود غير مدعوم حالياً');
        }

        res.json({ success: true, message: 'تم إرسال الرسالة التجريبية بنجاح إلى رقمك!' });
    } catch (err) {
        console.error('[Settings] SMS Test Error:', err);
        res.status(500).json({ success: false, message: 'فشل الإرسال: ' + err.message });
    }
});

module.exports = router;
