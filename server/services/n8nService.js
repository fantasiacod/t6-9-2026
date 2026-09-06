/**
 * n8n Webhook Service
 * Handles sending task notifications to an external n8n webhook.
 */
const { supabaseAdmin } = require('../config/database');

/**
 * Get the n8n webhook settings from the database.
 */
async function getN8nSettings() {
    try {
        const { data, error } = await supabaseAdmin
            .from('app_settings')
            .select('key, value')
            .in('key', ['n8n_enabled', 'n8n_webhook_url']);
            
        if (error) throw error;
        
        const settings = {};
        if (data) {
            data.forEach(s => { settings[s.key] = s.value; });
        }
        return settings;
    } catch (err) {
        console.error('[n8nService] Error fetching settings:', err.message);
        return { n8n_enabled: 'false', n8n_webhook_url: '' };
    }
}

/**
 * Sends a task payload to the configured n8n webhook.
 * @param {Object} taskData - The task details including user info.
 * @param {string} eventType - The type of event (e.g., 'task_created', 'task_updated')
 */
async function sendTaskToN8n(taskData, eventType = 'task_created') {
    try {
        const settings = await getN8nSettings();
        
        if (settings.n8n_enabled !== 'true' || !settings.n8n_webhook_url) {
            return; // n8n integration is disabled or URL is missing
        }

        // Prepare a rich payload that n8n can use for WhatsApp, Email, Excel, and Telegram
        const sendMethod = taskData.sendMethod || [];
        const payload = {
            event: eventType,
            timestamp: new Date().toISOString(),
            // Delivery methods: controls whether n8n sends via email, whatsapp, or both
            sendViaEmail: sendMethod.length === 0 || sendMethod.includes('email'),
            sendViaWhatsapp: sendMethod.includes('whatsapp'),
            task: {
                id: taskData.id,
                task_number: taskData.taskNumber || taskData.task_number,
                title: taskData.title,
                description: taskData.description,
                priority: taskData.priority,
                status: taskData.status,
                start_date: taskData.startDate || taskData.start_date,
                end_date: taskData.endDate || taskData.end_date,
                work_days: taskData.workDays || taskData.work_days,
                task_url: `http://localhost:3000/task/${taskData.id}`
            },
            assignee: {
                name: taskData.assignedTo?.full_name || taskData.assigned_user?.full_name || 'Unknown',
                email: taskData.assignedTo?.email || taskData.assigned_user?.email || '',
                phone: taskData.assignedTo?.phone || taskData.assigned_user?.phone || '',
                employee_id: taskData.assignedTo?.employee_id || taskData.assigned_user?.employee_id || ''
            },
            creator: {
                name: taskData.createdBy?.full_name || taskData.creator?.full_name || 'Unknown',
                email: taskData.createdBy?.email || taskData.creator?.email || ''
            },
            department: {
                name: taskData.department?.name || taskData.departments?.name || 'Unknown'
            }
        };

        // Send asynchronously using native http/https
        return new Promise((resolve, reject) => {
            const url = new URL(settings.n8n_webhook_url);
            const protocol = url.protocol === 'https:' ? require('https') : require('http');
            
            const payloadString = JSON.stringify(payload);
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payloadString),
                    'User-Agent': 'EnterpriseTaskSystem/1.0'
                }
            };

            const req = protocol.request(url, options, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`Webhook failed with status ${res.statusCode}: ${responseData}`));
                    } else {
                        resolve(responseData);
                    }
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.write(payloadString);
            req.end();
        }).catch(err => {
            console.error('[n8nService] Webhook error:', err.message);
        });

    } catch (error) {
        console.error('[n8nService] Unexpected error:', error.message);
        throw error;
    }
}

module.exports = {
    sendTaskToN8n,
    getN8nSettings
};
