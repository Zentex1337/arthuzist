/**
 * Make a user an admin
 * Run: node make-admin.js email@example.com
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function makeAdmin(email) {
    if (!email) {
        console.log('Usage: node make-admin.js email@example.com');
        process.exit(1);
    }

    const { data, error } = await supabase
        .from('users')
        .update({ role: 'admin' })
        .eq('email', email.toLowerCase())
        .select()
        .single();

    if (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }

    if (data) {
        console.log('✅ User is now admin:');
        console.log(`   Email: ${data.email}`);
        console.log(`   Name: ${data.name}`);
        console.log(`   Role: ${data.role}`);
    } else {
        console.log('❌ User not found');
    }
}

makeAdmin(process.argv[2]);
