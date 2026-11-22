const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_ANON_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error(
    'Faltan SUPABASE_URL y SUPABASE_ANON_KEY (o SUPABASE_PUBLISHABLE_KEY).',
  );
}

function createUserClient(accessToken) {
  return createClient(supabaseUrl, publishableKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createPublicClient(authOptions = {}) {
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, ...authOptions },
  });
}

module.exports = { createPublicClient, createUserClient };
