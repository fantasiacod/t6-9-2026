/**
 * Archive Service
 * Auto-archives completed tasks after 1 day using node-cron
 */
const cron = require('node-cron');
const { supabaseAdmin } = require('../config/database');

/**
 * Archive completed tasks that were closed more than 1 day ago
 */
async function archiveCompletedTasks() {
    try {
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        // Find completed tasks ready for archival
        const { data: tasks, error } = await supabaseAdmin
            .from('tasks')
            .select('id, department_id, task_number, title')
            .eq('status', 'completed')
            .lte('close_date', oneDayAgo.toISOString());

        if (error) {
            console.error('[Archive] Query error:', error.message);
            return;
        }

        if (!tasks || tasks.length === 0) return;

        for (const task of tasks) {
            // Check if already archived
            const { data: existing } = await supabaseAdmin
                .from('archives')
                .select('id')
                .eq('task_id', task.id)
                .single();

            if (existing) continue;

            // Insert into archives
            const { error: archiveError } = await supabaseAdmin
                .from('archives')
                .insert({
                    task_id: task.id,
                    department_id: task.department_id
                });

            if (!archiveError) {
                // Update task status
                await supabaseAdmin
                    .from('tasks')
                    .update({ status: 'archived' })
                    .eq('id', task.id);

                console.log(`[Archive] Task #${task.task_number} archived.`);
            }
        }
    } catch (err) {
        console.error('[Archive] Error:', err.message);
    }
}

/**
 * Start the archive cron job - runs every hour
 */
function startArchiveCron() {
    cron.schedule('0 * * * *', async () => {
        console.log('[Archive] Running auto-archive check...');
        await archiveCompletedTasks();
    });
    console.log('[Archive] Cron job scheduled (hourly).');
}

module.exports = { archiveCompletedTasks, startArchiveCron };
