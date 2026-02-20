const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL or SUPABASE_KEY missing in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log('🔗 Testing Supabase connection...');
    try {
        const { data, error } = await supabase.from('users').select('*').limit(5);
        if (error) {
            console.error('❌ Connection failed:', error.message);
        } else {
            console.log('✅ Connection successful!');
            console.log('Users found:', data.length);
            if (data.length > 0) {
                console.log('Sample user schema:', Object.keys(data[0]));
            }
        }
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

testConnection();
