const { supabaseAdmin } = require('../config/database');
const { sendTaskToN8n } = require('../services/n8nService');

/**
 * Checks for tasks that have passed their end date and are not closed/completed/delayed.
 * Updates their status to 'delayed', creates a system notification, and fires an n8n webhook.
 */
async function checkOverdueTasks() {
    try {
        console.log('[Scheduler] Running overdue tasks check...');
        
        // Find tasks that should be overdue
        // end_date < CURRENT_DATE AND status IN ('new', 'in_progress', 'pending_suspension', 'pending_delay')
        // We can't easily use CURRENT_DATE in supabase-js, so we generate a date string.
        const today = new Date().toISOString().split('T')[0];

        const { data: overdueTasks, error: fetchError } = await supabaseAdmin
            .from('tasks')
            .select('*, departments(name), assigned_user:assigned_to(*)')
            .lt('end_date', today)
            .in('status', ['new', 'in_progress', 'pending_suspension', 'pending_delay']);

        if (fetchError) throw fetchError;

        if (!overdueTasks || overdueTasks.length === 0) {
            console.log('[Scheduler] No new overdue tasks found.');
            return;
        }

        console.log(`[Scheduler] Found ${overdueTasks.length} overdue tasks to update.`);

        for (const task of overdueTasks) {
            // 1. Update status to 'delayed'
            const { error: updateError } = await supabaseAdmin
                .from('tasks')
                .update({ status: 'delayed' })
                .eq('id', task.id);

            if (updateError) {
                console.error(`[Scheduler] Failed to update task ${task.id}:`, updateError);
                continue;
            }

            // 2. Create System Notification for assigned user (if assigned)
            if (task.assigned_to) {
                await supabaseAdmin.from('notifications').insert({
                    user_id: task.assigned_to,
                    title: 'مهمة متأخرة!',
                    message: `المهمة رقم ${task.task_number} ("${task.title}") تجاوزت الموعد المحدد للتسليم. يرجى تقديم تبرير للتأخير.`,
                    type: 'danger',
                    reference_type: 'task',
                    reference_id: task.id
                });
            }

            // 3. Send n8n Webhook
            // We pass the populated task to n8n so it has assignee info
            task.status = 'delayed'; // Update status in object
            await sendTaskToN8n(task, 'task_overdue');
            
            console.log(`[Scheduler] Marked task ${task.id} (${task.task_number}) as delayed.`);
        }

    } catch (error) {
        console.error('[Scheduler] Error in checkOverdueTasks:', error.message);
    }
}

// Start the scheduler loop
function startScheduler() {
    console.log('[Scheduler] Service started. Overdue check will run periodically.');
    
    // Run immediately on startup
    checkOverdueTasks();

    // Run every 12 hours
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    setInterval(checkOverdueTasks, TWELVE_HOURS);
}

module.exports = { startScheduler, checkOverdueTasks };
