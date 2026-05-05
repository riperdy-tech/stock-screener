import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// Public client — uses the anon key. Safe for browser reads (dashboard, reports page).
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client — uses the service key. Only call this from server-side API routes.
// Never expose this in client components.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
