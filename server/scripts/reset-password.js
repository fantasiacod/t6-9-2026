/**
 * Emergency password reset (run from the server, not from the app).
 *
 * Usage:  node server/scripts/reset-password.js <username> <new-password>
 * Example: node server/scripts/reset-password.js admin "S0me-Strong-Pass"
 *
 * The old version of this script hardcoded the password "admin123", used the
 * `bcrypt` package (not installed — the project uses `bcryptjs`) and the anon
 * key (blocked by RLS), so it could not have worked. All three are fixed here.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../config/database');

async function run() {
    const [username, newPassword] = process.argv.slice(2);

    if (!username || !newPassword) {
        console.error('Usage: node server/scripts/reset-password.js <username> <new-password>');
        process.exit(1);
    }
    if (newPassword.length < 8) {
        console.error('Password must be at least 8 characters.');
        process.exit(1);
    }

    const { data: user } = await supabaseAdmin
        .from('users').select('id, username').eq('username', username).single();

    if (!user) {
        console.error(`No user with username "${username}".`);
        process.exit(1);
    }

    const hash = await bcrypt.hash(newPassword, 12);
    const { error } = await supabaseAdmin
        .from('users').update({ password_hash: hash }).eq('id', user.id);

    if (error) {
        console.error('Update failed:', error.message);
        process.exit(1);
    }

    console.log(`Password reset for "${user.username}".`);
}

run();
