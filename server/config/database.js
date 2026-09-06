/**
 * Supabase Database Client Configuration
 * Provides both anon and admin (service_role) clients
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

// Client with anon key (respects RLS)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client with service_role key (bypasses RLS)
// Falls back to anon key if service_role not configured (works when RLS policies allow full access)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

module.exports = { supabase, supabaseAdmin };
