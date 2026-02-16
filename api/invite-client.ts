import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { email, firmId, fullName } = req.body;

    if (!email || !firmId) {
        return res.status(400).json({ error: 'Missing email or firmId' });
    }

    try {
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Check if user already exists in auth (targeted lookup by email)
        const { data: userLookup } = await supabaseAdmin
            .from('auth.users')
            .select('id, email, raw_user_meta_data')
            .ilike('email', email.toLowerCase())
            .maybeSingle();

        // Fallback: if the direct query fails (RLS), use the admin API
        let existingUser: any = null;
        if (userLookup) {
            existingUser = { id: userLookup.id, email: userLookup.email, user_metadata: userLookup.raw_user_meta_data };
        } else {
            const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
            existingUser = users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase()) || null;
        }

        if (existingUser) {
            // User exists — link to client record if not already linked
            await supabaseAdmin
                .from('clients')
                .update({ auth_user_id: existingUser.id })
                .eq('firm_id', firmId)
                .eq('email', email.toLowerCase())
                .is('auth_user_id', null);

            // Update their metadata to include Client role
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
                user_metadata: {
                    ...existingUser.user_metadata,
                    role: 'Client',
                    firm_id: firmId
                }
            });

            return res.status(200).json({ success: true, message: 'Existing user linked' });
        }

        // Create new user and send invite email
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: {
                role: 'Client',
                firm_id: firmId,
                full_name: fullName || ''
            }
        });

        if (createError) throw createError;

        // Link the new auth user to the client record
        if (newUser?.user?.id) {
            await supabaseAdmin
                .from('clients')
                .update({ auth_user_id: newUser.user.id })
                .eq('firm_id', firmId)
                .eq('email', email.toLowerCase());
        }

        return res.status(200).json({ success: true, message: 'Invite sent' });
    } catch (err: any) {
        console.error('Error inviting client:', err);
        return res.status(500).json({ error: err.message || 'Failed to invite client' });
    }
}
