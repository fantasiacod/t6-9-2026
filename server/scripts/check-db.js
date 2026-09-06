/**
 * Diagnostic: print the app_settings rows.
 *
 * Usage:  node server/scripts/check-db.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { supabaseAdmin } = require('../config/database');

async function checkSettings() {
    const { data, error } = await supabaseAdmin.from('app_settings').select('*');
    if (error) {
        console.error('Query failed:', error.message);
        process.exit(1);
    }
    console.log(`app_settings rows: ${data.length}`);
    console.table(data);
}

checkSettings();
