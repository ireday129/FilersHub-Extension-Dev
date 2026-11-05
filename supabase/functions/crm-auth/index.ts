// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Trigger deployment check

const ALLOWED_ORIGINS = [
    Deno.env.get('APP_URL') || 'https://app.filershub.com',
    'https://app.filershub.com',
    'https://dev.filershub.com',
    'chrome-extension://',
];

function getCorsOrigin(req: Request): string {
    const origin = req.headers.get('origin') || '';
    if (ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) return origin;
    if (origin.includes('gohighlevel.com') || origin.includes('leadconnectorhq.com')) return origin;
    return ALLOWED_ORIGINS[0];
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Overridden per-request below
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Link pending Stripe subscriptions to a newly-created firm
async function linkPendingSubscription(supabase: any, firmId: string, ownerEmail: string) {
    if (!ownerEmail) return;

    // Fetch ALL unlinked pending subscriptions for this email (base plan + add-ons)
    const { data: pendingList } = await supabase
        .from('pending_subscriptions')
        .select('*')
        .eq('customer_email', ownerEmail.toLowerCase())
        .is('linked_firm_id', null)
        .order('created_at', { ascending: false });

    if (!pendingList || pendingList.length === 0) return;

    for (const pending of pendingList) {
        const isActive = pending.status === 'active' || pending.status === 'trialing';
        console.log(`Found pending subscription for ${ownerEmail}: ${pending.stripe_subscription_id} (addon: ${pending.is_addon})`);

        if (pending.is_addon) {
            // Add-on: only set irs_alerts_enabled and irs_addon_subscription_id
            await supabase.from('firms').update({
                stripe_customer_id: pending.stripe_customer_id,
                irs_alerts_enabled: isActive,
                irs_addon_subscription_id: pending.stripe_subscription_id,
            }).eq('firm_id', firmId);
        } else {
            // Base plan: set tier, limits, status + auto-enable IRS alerts for Pro
            const firmUpdate: Record<string, any> = {
                stripe_customer_id: pending.stripe_customer_id,
                stripe_subscription_id: pending.stripe_subscription_id,
                subscription_status: pending.status,
                subscription_tier: pending.plan_tier,
            };

            if (pending.plan_tier === 'Pro' && isActive) {
                firmUpdate.irs_alerts_enabled = true;
            }

            await supabase.from('firms').update(firmUpdate).eq('firm_id', firmId);
        }

        // Record in subscriptions table
        await supabase.from('subscriptions').upsert({
            firm_id: firmId,
            stripe_subscription_id: pending.stripe_subscription_id,
            stripe_customer_id: pending.stripe_customer_id,
            plan_tier: pending.plan_tier,
            status: pending.status,
            current_period_start: pending.current_period_start,
            current_period_end: pending.current_period_end,
            cancel_at: pending.cancel_at,
        }, { onConflict: 'stripe_subscription_id' });

        // Mark as linked
        await supabase.from('pending_subscriptions').update({
            linked_firm_id: firmId,
            linked_at: new Date().toISOString()
        }).eq('id', pending.id);

        console.log(`Linked pending subscription ${pending.stripe_subscription_id} to firm ${firmId}`);
    }
}

serve(async (req) => {
    const requestCorsHeaders = { ...corsHeaders, 'Access-Control-Allow-Origin': getCorsOrigin(req) };

    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: requestCorsHeaders })
    }

    try {
        const url = new URL(req.url)

        // Parse body if POST
        let body: any = {}
        if (req.method === 'POST') {
            try {
                body = await req.json()
            } catch (e) {
                // ignore
            }
        }

        const pathname = url.pathname

        // Initialize Supabase Admin Client Early
        const supabaseAdmin = createClient(
            Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 0. EMAIL LOOKUP: Verify staff email against GHL and create session
        if (req.method === 'POST' && body.action === 'email-lookup') {
            // SECURITY (Nov 2026): disabled. This handed out a full login session to anyone who
            // sent an active staff email, with no password. Staff sign in with password or email link.
            return new Response(JSON.stringify({
                error: 'Email lookup sign-in is turned off. Please sign in with your email and password or an email link.',
                code: 'EMAIL_LOOKUP_DISABLED'
            }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 0b. CLAIM SUBSCRIPTION: Link a pending Stripe subscription by purchase email
        if (req.method === 'POST' && body.action === 'claim-subscription') {
            const email = (body.email || '').trim().toLowerCase();
            const firmId = (body.firmId || '').trim();

            if (!email || !email.includes('@') || !firmId) {
                return new Response(JSON.stringify({ error: 'Email and firmId are required' }), {
                    status: 400, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // SECURITY (Nov 2026): only the platform admin, or a signed-in Firm Owner of this firm
            // claiming a purchase made with their own login email, may link a subscription.
            const claimJwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
            const { data: claimAuth } = claimJwt ? await supabaseAdmin.auth.getUser(claimJwt) : { data: null };
            const claimCaller = claimAuth?.user;
            if (!claimCaller) {
                return new Response(JSON.stringify({ error: 'Please sign in to link a subscription.' }), {
                    status: 401, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' }
                });
            }
            const callerEmail = (claimCaller.email || '').toLowerCase();
            const isPlatformAdmin = claimCaller.app_metadata?.is_super_admin === true && callerEmail === 'irene@hannahfinancial.com';
            if (!isPlatformAdmin) {
                const { data: ownerRow } = await supabaseAdmin
                    .from('staff')
                    .select('staff_id')
                    .eq('auth_user_id', claimCaller.id)
                    .eq('firm_id', firmId)
                    .eq('role', 'Firm Owner')
                    .eq('is_active', true)
                    .maybeSingle();
                if (!ownerRow) {
                    return new Response(JSON.stringify({ error: 'Only the Firm Owner can link a subscription.' }), {
                        status: 403, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' }
                    });
                }
                if (email !== callerEmail) {
                    return new Response(JSON.stringify({
                        linked: false,
                        message: 'Purchases can only be linked to the account that uses the same email. Please contact FilersHub support to link a purchase made with a different email.'
                    }), { status: 200, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' } });
                }
            }

            // Check for unlinked pending subscriptions for this email
            const { data: pendingList } = await supabaseAdmin
                .from('pending_subscriptions')
                .select('id')
                .eq('customer_email', email)
                .is('linked_firm_id', null);

            if (!pendingList || pendingList.length === 0) {
                return new Response(JSON.stringify({ linked: false, message: 'No pending subscription found for this email' }), {
                    status: 200, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Link pending subscriptions to the firm
            await linkPendingSubscription(supabaseAdmin, firmId, email);

            // Fetch updated firm status
            const { data: updatedFirm } = await supabaseAdmin
                .from('firms')
                .select('subscription_status, subscription_tier')
                .eq('firm_id', firmId)
                .maybeSingle();

            return new Response(JSON.stringify({
                linked: true,
                subscription_status: updatedFirm?.subscription_status,
                subscription_tier: updatedFirm?.subscription_tier,
            }), {
                status: 200, headers: { ...requestCorsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response("Not Found", { status: 404 })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
