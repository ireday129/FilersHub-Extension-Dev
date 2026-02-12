import { createClient } from '@supabase/supabase-js';

// These environment variables should be configured in your deployment environment.
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project-url.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Supabase provides equivalent functionality to Firestore and Firebase Storage:
 * - db: use supabase.from('table_name')
 * - storage: use supabase.storage.from('bucket_name')
 */
export default supabase;