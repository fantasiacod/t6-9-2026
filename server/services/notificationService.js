/**
 * Notification Service
 * Handles in-app notifications, email, and WhatsApp
 */
const { supabaseAdmin } = require('../config/database');
const { sendEmail } = require('../config/email');

/**
 * Create an in-app notification
 */
async function createNotification(userId, title, message, type = 'info', referenceType = null, referenceId = null) {
    try {
        const { data, error } = await supabaseAdmin.from('notifications').insert({
            user_id: userId,
            title,
            message,
            type,
            reference_type: referenceType,
            reference_id: referenceId
        }).select().single();
        if (error) console.error('[Notification]', error.message);
        return data;
    } catch (err) {
        console.error('[Notification] Failed:', err.message);
    }
}

/**
 * Send Webhook and SMS notifications
 */
async function sendExternalNotifications(phone, message, taskData = null) {
    try {
        const { data } = await supabaseAdmin.from('app_settings')
            .select('key, value')
            .in('key', ['n8n_webhook_url', 'n8n_enabled', 'twilio_sid', 'twilio_token', 'twilio_from', 'sms_enabled']);
        
        const settings = {};
        if (data) data.forEach(s => settings[s.key] = s.value);

        // 1. Send Webhook (n8n/Zapier/Make)
        if (settings.n8n_enabled === 'true' && settings.n8n_webhook_url) {
            const fetch = (await import('node-fetch')).default;
            await fetch(settings.n8n_webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, message, task: taskData })
            }).catch(e => console.error('[Webhook] Failed:', e.message));
        }

        // 2. Send Direct SMS (Twilio)
        if (settings.sms_enabled === 'true' && settings.twilio_sid && settings.twilio_token && settings.twilio_from && phone) {
            const fetch = (await import('node-fetch')).default;
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${settings.twilio_sid}/Messages.json`;
            const params = new URLSearchParams();
            params.append('To', phone);
            params.append('From', settings.twilio_from);
            params.append('Body', message);

            const auth = Buffer.from(`${settings.twilio_sid}:${settings.twilio_token}`).toString('base64');
            await fetch(twilioUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params
            }).catch(e => console.error('[Twilio SMS] Failed:', e.message));
        }

    } catch (err) {
        console.error('[ExternalNotifications] Failed:', err.message);
    }
}

/** Notify when a new task is created and assigned */
async function notifyTaskCreated(task, assignedUser, creatorName) {
    const title = 'مهمة جديدة';
    const msg = `تم تكليفك بالمهمة رقم #${task.task_number} "${task.title}" بواسطة ${creatorName}.`;
    await createNotification(assignedUser.id, title, msg, 'task', 'task', task.id);
    if (assignedUser.email) {
        await sendEmail(assignedUser.email, title, `<h3>${title}</h3><p>${msg}</p><p>الأولوية: <strong>${task.priority}</strong></p><p>تاريخ الانتهاء: ${task.end_date}</p>`);
    }
    if (assignedUser.phone) await sendExternalNotifications(assignedUser.phone, msg, task);
}

/** Notify manager when task is completed */
async function notifyTaskCompleted(task, managerId, employeeName) {
    const title = 'مهمة مكتملة';
    const msg = `قام الموظف ${employeeName} بإكمال المهمة رقم #${task.task_number} "${task.title}".`;
    await createNotification(managerId, title, msg, 'success', 'task', task.id);
}

/** Notify manager when task is suspended */
async function notifyTaskSuspended(task, managerId, employeeName, reason) {
    const title = 'طلب تعليق مهمة';
    const msg = `طلب الموظف ${employeeName} تعليق المهمة رقم #${task.task_number} "${task.title}". السبب: ${reason}`;
    await createNotification(managerId, title, msg, 'warning', 'task', task.id);
}

/** Notify manager when task is delayed */
async function notifyTaskDelayed(task, managerId, employeeName, reason) {
    const title = 'طلب تأخير مهمة';
    const msg = `طلب الموظف ${employeeName} تأخير المهمة رقم #${task.task_number} "${task.title}". السبب: ${reason}`;
    await createNotification(managerId, title, msg, 'danger', 'task', task.id);
}

/** Notify about new user creation */
async function notifyUserCreated(user, adminName) {
    const title = 'تم إنشاء الحساب';
    const msg = `أهلاً بك! تم إنشاء حسابك بواسطة ${adminName}. اسم المستخدم: ${user.username}`;
    await createNotification(user.id, title, msg, 'info', 'user', user.id);
    if (user.email) {
        await sendEmail(user.email, title, `<h3>مرحباً بك في نظام إدارة المهام</h3><p>${msg}</p><p>يرجى تسجيل الدخول وتغيير كلمة المرور الخاصة بك.</p>`);
    }
}

/** Notify about permission changes */
async function notifyPermissionChange(userId, adminName, changes) {
    const title = 'تحديث الصلاحيات';
    const msg = `تم تحديث صلاحياتك بواسطة ${adminName}. ${changes}`;
    await createNotification(userId, title, msg, 'info', 'role', null);
}

module.exports = {
    createNotification,
    sendExternalNotifications,
    notifyTaskCreated,
    notifyTaskCompleted,
    notifyTaskSuspended,
    notifyTaskDelayed,
    notifyUserCreated,
    notifyPermissionChange
};
