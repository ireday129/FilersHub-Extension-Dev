// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Stripe signature verification (Web Crypto API, no npm dependency) ──

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
    const elements = sigHeader.split(',');
    const timestamp = elements.find(e => e.startsWith('t='))?.split('=')[1];
    const signature = elements.find(e => e.startsWith('v1='))?.split('=')[1];

    if (!timestamp || !signature) return false;

    // Reject if timestamp is older than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const expectedSig = Array.from(new Uint8Array(mac))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    return expectedSig === signature;
}

// ── Helpers ──

async function getStripeCustomerEmail(stripeCustomerId: string): Promise<string | null> {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return null;

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
    // 1. Direct lookup by stripe_customer_id
    const { data: firmByCustomer } = await supabase
        .from('firms')
        .select('firm_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .maybeSingle();

    if (firmByCustomer) return firmByCustomer.firm_id;

    // 2. Lookup by email → staff (Firm Owner)
    if (customerEmail) {
        const { data: staffRecord } = await supabase
            .from('staff')
            .select('firm_id')
            .eq('email', customerEmail.toLowerCase())
            .eq('role', 'Firm Owner')
            .eq('is_active', true)
            .maybeSingle();

        if (staffRecord) {
            // Store stripe_customer_id on the firm for future lookups
            await supabase.from('firms')
                .update({ stripe_customer_id: stripeCustomerId })
                .eq('firm_id', staffRecord.firm_id);

            return staffRecord.firm_id;
        }
    }

    return null;
}

async function resolveTier(supabase: any, priceId: string): Promise<{ plan_tier: string; max_clients: number; max_staff: number }> {
    const { data: mapping } = await supabase
        .from('stripe_tier_map')
        .select('plan_tier, max_clients, max_staff')
        .eq('stripe_price_id', priceId)
        .maybeSingle();

    if (mapping) return mapping;

    console.warn(`No tier mapping found for price ${priceId}, defaulting to starter`);
    return { plan_tier: 'starter', max_clients: 500, max_staff: 10 };
}

async function updateFirmSubscription(supabase: any, firmId: string, sub: any, tier: { plan_tier: string; max_clients: number; max_staff: number }) {
    await supabase.from('firms').update({
        stripe_subscription_id: sub.id,
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
        subscription_status: sub.status,
        subscription_tier: tier.plan_tier,
        max_clients: tier.max_clients,
        max_staff: tier.max_staff,
        updated_at: new Date().toISOString()
    }).eq('firm_id', firmId);

    await supabase.from('subscriptions').upsert({
        firm_id: firmId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
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

async function upsertPending(supabase: any, sub: any, customerEmail: string, tier: { plan_tier: string }) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

    await supabase.from('pending_subscriptions').upsert({
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        customer_email: customerEmail.toLowerCase(),
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

// ── Event handlers ──

async function handleCheckoutCompleted(supabase: any, session: any) {
    const customerEmail = session.customer_email || session.customer_details?.email;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subscriptionId = session.subscription;

    if (!customerEmail || !subscriptionId) {
        console.log('Checkout session missing email or subscription, skipping');
        return;
    }

    // Fetch the full subscription to get tier info
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
        console.error('STRIPE_SECRET_KEY not set');
        return;
    }

    const subResp = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` }
    });

    if (!subResp.ok) {
        console.error('Failed to fetch subscription from Stripe:', subResp.status);
        return;
    }

    const sub = await subResp.json();
    const priceId = sub.items?.data?.[0]?.price?.id;
    const tier = priceId ? await resolveTier(supabase, priceId) : { plan_tier: 'starter', max_clients: 500, max_staff: 10 };

    const firmId = await resolveFirmId(supabase, customerId, customerEmail);

    if (firmId) {
        console.log(`Checkout: linking subscription ${sub.id} to firm ${firmId}`);
        await updateFirmSubscription(supabase, firmId, sub, tier);
    } else {
        console.log(`Checkout: no firm found for ${customerEmail}, storing as pending`);
        await upsertPending(supabase, sub, customerEmail, tier);
    }
}

async function handleSubscriptionChange(supabase: any, sub: any) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    const priceId = sub.items?.data?.[0]?.price?.id;
    const tier = priceId ? await resolveTier(supabase, priceId) : { plan_tier: 'starter', max_clients: 500, max_staff: 10 };

    // Try to resolve firm
    const customerEmail = await getStripeCustomerEmail(customerId);
    const firmId = await resolveFirmId(supabase, customerId, customerEmail);

    if (firmId) {
        console.log(`Subscription ${sub.id} (${sub.status}): updating firm ${firmId}`);
        await updateFirmSubscription(supabase, firmId, sub, tier);
    } else if (customerEmail) {
        console.log(`Subscription ${sub.id} (${sub.status}): no firm, updating pending for ${customerEmail}`);
        await upsertPending(supabase, sub, customerEmail, tier);
    } else {
        console.warn(`Subscription ${sub.id}: cannot resolve customer email for ${customerId}`);
    }
}

async function handleInvoicePaymentFailed(supabase: any, invoice: any) {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    // Update firm status to past_due
    const { data: firm } = await supabase
        .from('firms')
        .select('firm_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

    if (firm) {
        await supabase.from('firms')
            .update({ subscription_status: 'past_due', updated_at: new Date().toISOString() })
            .eq('firm_id', firm.firm_id);

        await supabase.from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', subscriptionId);
    }

    // Also update pending if exists
    await supabase.from('pending_subscriptions')
        .update({ status: 'past_due', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subscriptionId);
}

async function handleInvoicePaymentSucceeded(supabase: any, invoice: any) {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    // Reset to active if was past_due
    const { data: firm } = await supabase
        .from('firms')
        .select('firm_id, subscription_status')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

    if (firm && firm.subscription_status === 'past_due') {
        await supabase.from('firms')
            .update({ subscription_status: 'active', updated_at: new Date().toISOString() })
            .eq('firm_id', firm.firm_id);

        await supabase.from('subscriptions')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', subscriptionId);
    }
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

    try {
        const rawBody = await req.text();
        const sigHeader = req.headers.get('stripe-signature');
        const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

        if (!sigHeader || !webhookSecret) {
            console.error('Missing stripe-signature header or STRIPE_WEBHOOK_SECRET');
            return new Response(JSON.stringify({ error: 'Missing signature' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const isValid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
        if (!isValid) {
            console.error('Invalid Stripe webhook signature');
            return new Response(JSON.stringify({ error: 'Invalid signature' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const event = JSON.parse(rawBody);
        const eventId = event.id;
        const eventType = event.type;

        console.log(`Stripe webhook received: ${eventType} (${eventId})`);

        // Idempotency check
        const { data: existingEvent } = await supabase
            .from('stripe_webhook_events')
            .select('id')
            .eq('stripe_event_id', eventId)
            .maybeSingle();

        if (existingEvent) {
            console.log(`Duplicate event ${eventId}, skipping`);
            return new Response(JSON.stringify({ received: true, duplicate: true }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Log the event
        await supabase.from('stripe_webhook_events').insert({
            stripe_event_id: eventId,
            event_type: eventType,
            payload: event
        });

        // Route by event type
        switch (eventType) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(supabase, event.data.object);
                break;
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                await handleSubscriptionChange(supabase, event.data.object);
                break;
            case 'invoice.payment_failed':
                await handleInvoicePaymentFailed(supabase, event.data.object);
                break;
            case 'invoice.payment_succeeded':
                await handleInvoicePaymentSucceeded(supabase, event.data.object);
                break;
            default:
                console.log(`Unhandled event type: ${eventType}`);
        }

        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Stripe webhook error:', error?.message || error);
        // Return 200 to prevent Stripe retry storms for unrecoverable errors
        return new Response(JSON.stringify({ error: error?.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
