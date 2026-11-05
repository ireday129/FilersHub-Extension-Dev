import { supabase } from './supabase';

// SECURITY (Nov 2026): calls to the widget API routes must carry the signed-in user's session.
// The server checks that the session belongs to an active staff member of the firm.
export async function widgetAuthHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}
