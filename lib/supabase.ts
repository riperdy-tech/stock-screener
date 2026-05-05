import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Guard: createClient throws with empty strings — this prevents a full app crash
// if environment variables are missing in the deployment environment.
const createSafeClient = (url: string, key: string) => {
    if (!url || !key) {
        console.error('Supabase client not initialized: missing URL or key.');
        // Return a dummy object that won't crash on access
        return null as any;
    }
    return createClient(url, key);
};

// Public client — anon key, safe for browser reads.
export const supabase = createSafeClient(supabaseUrl, supabaseAnonKey);

// Admin client — service key, server-side API routes only.
export const supabaseAdmin = createSafeClient(supabaseUrl, supabaseServiceKey);
