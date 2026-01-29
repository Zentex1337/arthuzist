/**
 * Supabase Client Configuration
 * Uses service_role key for server-side operations (bypasses RLS)
 */

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL) {
    console.warn('Warning: SUPABASE_URL not set');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY not set');
}

// Service role client for server-side operations (bypasses RLS)
const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

module.exports = { supabase };
