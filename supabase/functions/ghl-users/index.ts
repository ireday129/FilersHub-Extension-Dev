
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const {
            data: { user },
        } = await supabaseClient.auth.getUser()

        if (!user) {
            throw new Error('Unauthorized')
        }

        const url = new URL(req.url)
        const action = url.searchParams.get('action') // 'list' or 'invite'

        // Get Firm Settings for GHL Token
        // In a real app we'd fetch the specific firm settings based on the user's firm_id
        // For this implementation we'll look up the staff member's firm first

        // 1. Get Staff & Firm Info
        const { data: staffData, error: staffError } = await supabaseClient
            .from('staff')
            .select('firm_id, firms(ghl_access_token, ghl_location_id)') // Assuming these fields exist or we use mocks
            .eq('auth_user_id', user.id)
            .single();

        if (staffError) throw new Error('Staff record not found');

        // For Development/Demo without real GHL tokens, we'll return mock data if no token exists
        const ghlLocationId = staffData.firms?.ghl_location_id || 'demo-location-id';
        const ghlAccessToken = staffData.firms?.ghl_access_token;

        if (action === 'list') {
            if (!ghlAccessToken) {
                // Return Mock GHL Users for Demo
                return new Response(
                    JSON.stringify({
                        users: [
                            { id: 'ghl-u-1', name: 'Sarah Johnson', email: 'sarah@filershub.com', role: 'admin', type: 'account' },
                            { id: 'ghl-u-2', name: 'Marcus Aurelius', email: 'marcus@filershub.com', role: 'user', type: 'account' },
                            { id: 'ghl-u-3', name: 'David Smith', email: 'david@filershub.com', role: 'user', type: 'account' },
                            { id: 'ghl-u-4', name: 'New Hire', email: 'newhire@filershub.com', role: 'user', type: 'account' }
                        ]
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Real GHL API Call
            const response = await fetch(`https://services.leadconnectorhq.com/users/?locationId=${ghlLocationId}`, {
                headers: {
                    'Authorization': `Bearer ${ghlAccessToken}`,
                    'Version': '2021-07-28'
                }
            });

            const data = await response.json();
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        if (action === 'invite') {
            const { ghlUserId, email, name, role } = await req.json();

            // Check if staff already exists
            const { data: existingStaff } = await supabaseClient
                .from('staff')
                .select('staff_id')
                .eq('email', email)
                .eq('firm_id', staffData.firm_id)
                .single();

            if (existingStaff) {
                return new Response(
                    JSON.stringify({ error: 'Staff member already exists' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Create Staff Record
            const { data: newStaff, error: createError } = await supabaseClient
                .from('staff')
                .insert({
                    firm_id: staffData.firm_id,
                    email: email,
                    full_name: name,
                    role: role || 'Tax Pro',
                    ghl_user_id: ghlUserId,
                    ghl_location_id: ghlLocationId,
                    invite_status: 'pending',
                    invite_sent_at: new Date().toISOString()
                })
                .select()
                .single();

            if (createError) throw createError;

            return new Response(
                JSON.stringify({ message: 'Invitation created', staff: newStaff }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        throw new Error('Invalid action')

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
