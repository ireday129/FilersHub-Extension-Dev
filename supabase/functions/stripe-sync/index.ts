// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Helpers (shared logic with stripe-webhook) ──

async function getStripeCustomerEmail(stripeCustomerId: string, stripeKey: string): Promise<string | null> {
    const resp = await fetch(`https://api.stripe.com/v1/customers/${stripeCustomerId}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` }
    });

    if (resp.ok) {
        const customer = await resp.json();
        return customer.email?.toLowerCase() || null;
    }
    return null;
}

async function resolveFirmId(supabase: any, stripeCustomerId: string, customerEmail?: string | null): Promise<string | null> {
    const { data: firmByCustomer } = await supabase
        .from('firms')
        .select('firm_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .maybeSingle();

    if (firmByCustomer) return firmByCustomer.firm_id;

    if (customerEmail) {
        const { data: staffRecord } = await supabase
            .from('staff')
            .select('firm_id')
            .eq('email', customerEmail.toLowerCase())
            .eq('role', 'Firm Owner')
            .eq('is_active', true)
            .maybeSingle();

        if (staffRecord) {
            await supabase.from('firms')
                .update({ stripe_customer_id: stripeCustomerId })
                .eq('firm_id', staffRecord.firm_id);

            return staffRecord.firm_id;
        }
    }

    return null;
}

async function resolveTier(supabase: any, priceId: string): Promise<{ plan_tier: string; max_clients: number; max_staff: number; is_addon: boolean }> {
    const { data: mapping } = await supabase
        .from('stripe_tier_map')
        .select('plan_tier, max_clients, max_staff, is_addon')
        .eq('stripe_price_id', priceId)
        .maybeSingle();

    if (mapping) return { ...mapping, is_addon: mapping.is_addon ?? false };

    console.warn(`No tier mapping found for price ${priceId}, defaulting to Core`);
    return { plan_tier: 'Core', max_clients: 500, max_staff: 10, is_addon: false };
}

async function updateFirmSubscription(supabase: any, firmId: string, sub: any, tier: { plan_tier: string; max_clients: number; max_staff: number; is_addon: boolean }) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    const isActive = sub.status === 'active' || sub.status === 'trialing';

    if (tier.is_addon) {
        const firmUpdate: Record<string, any> = {
            stripe_customer_id: customerId,
            irs_alerts_enabled: isActive,
            irs_addon_subscription_id: sub.id,
            updated_at: new Date().toISOString()
        };

        if (!isActive) {
            const { data: firm } = await supabase
                .from('firms')
                .select('subscription_tier')
                .eq('firm_id', firmId)
                .maybeSingle();

            if (firm?.subscription_tier === 'Pro') {
                firmUpdate.irs_alerts_enabled = true;
            }
        }

        await supabase.from('firms').update(firmUpdate).eq('firm_id', firmId);
    } else {
        const firmUpdate: Record<string, any> = {
            stripe_subscription_id: sub.id,
            stripe_customer_id: customerId,
            subscription_status: sub.status,
            subscription_tier: tier.plan_tier,
            max_clients: tier.max_clients,
            max_staff: tier.max_staff,
            updated_at: new Date().toISOString()
        };

        if (tier.plan_tier === 'Pro' && isActive) {
            firmUpdate.irs_alerts_enabled = true;
        }

        if (tier.plan_tier === 'Pro' && !isActive) {
            const { data: addonSub } = await supabase
                .from('subscriptions')
                .select('status')
                .eq('firm_id', firmId)
                .eq('plan_tier', 'IRS Alerts')
                .in('status', ['active', 'trialing'])
                .maybeSingle();

            firmUpdate.irs_alerts_enabled = !!addonSub;
        }

        await supabase.from('firms').update(firmUpdate).eq('firm_id', firmId);
    }

    await supabase.from('subscriptions').upsert({
        firm_id: firmId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId,
        plan_tier: tier.plan_tier,
        status: sub.status,
        current_period_start: sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : null,
        current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        cancel_at: sub.cancel_at
            ? new Date(sub.cancel_at * 1000).toISOString()
            : null,
        updated_at: new Date().toISOString()
    }, { onConflict: 'stripe_subscription_id' });
}

async function upsertPending(supabase: any, sub: any, customerEmail: string, tier: { plan_tier: string; is_addon: boolean }) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

    await supabase.from('pending_subscriptions').upsert({
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        customer_email: customerEmail.toLowerCase(),
        plan_tier: tier.plan_tier,
        is_addon: tier.is_addon ?? false,
        status: sub.status,
        current_period_start: sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : null,
        current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        cancel_at: sub.cancel_at
            ? new Date(sub.cancel_at * 1000).toISOString()
            : null,
        updated_at: new Date().toISOString()
    }, { onConflict: 'stripe_subscription_id' });
}

// ── Stripe API pagination ──

async function fetchAllSubscriptions(stripeKey: string, status: string): Promise<any[]> {
    const all: any[] = [];
    let startingAfter: string | null = null;

    while (true) {
        const params = new URLSearchParams({ status, limit: '100' });
        if (startingAfter) params.set('starting_after', startingAfter);

        const resp = await fetch(`https://api.stripe.com/v1/subscriptions?${params}`, {
            headers: { 'Authorization': `Bearer ${stripeKey}` }
        });

        if (!resp.ok) {
            console.error(`Failed to fetch ${status} subscriptions:`, resp.status);
            break;
        }

        const data = await resp.json();
        all.push(...(data.data || []));

        if (!data.has_more) break;
        startingAfter = data.data[data.data.length - 1]?.id;
    }

    return all;
}

// ── Main handler ──

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabase = createClient(
        Deno.env.get('URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
        return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    try {
        console.log('Starting Stripe subscription sync...');

        // Fetch all subscriptions across statuses
        const [activeSubs, trialingSubs, pastDueSubs] = await Promise.all([
            fetchAllSubscriptions(stripeKey, 'active'),
            fetchAllSubscriptions(stripeKey, 'trialing'),
            fetchAllSubscriptions(stripeKey, 'past_due'),
        ]);

        const allSubs = [...activeSubs, ...trialingSubs, ...pastDueSubs];
        console.log(`Found ${allSubs.length} subscriptions (${activeSubs.length} active, ${trialingSubs.length} trialing, ${pastDueSubs.length} past_due)`);

        let synced = 0;
        let pending = 0;
        let skipped = 0;
        const details: { id: string; email: string | null; tier: string; result: string }[] = [];

        for (const sub of allSubs) {
            const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
            const priceId = sub.items?.data?.[0]?.price?.id;

            if (!priceId) {
                skipped++;
                details.push({ id: sub.id, email: null, tier: '—', result: 'skipped (no price)' });
                continue;
            }

            const tier = await resolveTier(supabase, priceId);
            const customerEmail = await getStripeCustomerEmail(customerId, stripeKey);
            const firmId = await resolveFirmId(supabase, customerId, customerEmail);

            if (firmId) {
                await updateFirmSubscription(supabase, firmId, sub, tier);
                synced++;
                details.push({ id: sub.id, email: customerEmail, tier: tier.plan_tier, result: `linked to firm` });
            } else if (customerEmail) {
                await upsertPending(supabase, sub, customerEmail, tier);
                pending++;
                details.push({ id: sub.id, email: customerEmail, tier: tier.plan_tier, result: 'stored as pending' });
            } else {
                skipped++;
                details.push({ id: sub.id, email: null, tier: tier.plan_tier, result: 'skipped (no email)' });
            }
        }

        const summary = {
            total: allSubs.length,
            synced,
            pending,
            skipped,
            details
        };

        console.log(`Sync complete: ${synced} synced, ${pending} pending, ${skipped} skipped`);

        return new Response(JSON.stringify(summary), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Stripe sync error:', error?.message || error);
        return new Response(JSON.stringify({ error: error?.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
