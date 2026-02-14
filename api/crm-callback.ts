
import { createClient } from '@supabase/supabase-js';

// Vercel Serverless Function
export default async function handler(req: any, res: any) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'No authorization code provided.' });
    }

    try {
        // 1. Exchange Code for Token
        const tokenResponse = await fetch("https://services.leadconnectorhq.com/oauth/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                client_id: process.env.GHL_CLIENT_ID || "",
                client_secret: process.env.GHL_CLIENT_SECRET || "",
                grant_type: "authorization_code",
                code: String(code),
                redirect_uri: `https://${process.env.APP_URL || process.env.VERCEL_URL}/api/crm-callback`, // Configurable redirect URI
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error("Token Exchange Error:", tokenData);
            return res.status(400).json({
                error: 'Failed to exchange token with GHL',
                details: tokenData
            });
        }

        // 2. Initialize Supabase Admin Client
        // process.env.SUPABASE_URL and process.env.SUPABASE_SERVICE_ROLE_KEY 
        // must be set in Vercel Environment Variables
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // 3. Upsert Firm Record
        // We check existence first to preserve 'slug' if it exists (don't overwrite custom slugs)
        const { data: existingFirm } = await supabaseAdmin
            .from("firms")
            .select("firm_id")
            .eq("ghl_location_id", tokenData.locationId)
            .maybeSingle();

        let dbError;

        if (existingFirm) {
            // Update existing firm (refresh tokens)
            const { error } = await supabaseAdmin
                .from("firms")
                .update({
                    ghl_access_token: tokenData.access_token,
                    ghl_refresh_token: tokenData.refresh_token,
                    ghl_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
                    subscription_status: 'trialing' // Ensure status is active/trialing on re-connect
                })
                .eq("ghl_location_id", tokenData.locationId);
            dbError = error;
        } else {
            // Insert new firm (requires slug)
            const { error } = await supabaseAdmin
                .from("firms")
                .insert({
                    ghl_location_id: tokenData.locationId,
                    ghl_access_token: tokenData.access_token,
                    ghl_refresh_token: tokenData.refresh_token,
                    ghl_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
                    firm_name: `GHL Location ${tokenData.locationId}`,
                    subscription_status: 'trialing',
                    slug: tokenData.locationId.toLowerCase() // Generate default slug
                });
            dbError = error;
        }

        if (dbError) {
            console.error("Database Error:", dbError);
            return res.status(500).json({ error: 'Failed to save firm data', details: dbError });
        }

        // 4. Redirect to Dashboard
        // Use the stored firm ID if available, or just go to dashboard
        return res.redirect(302, `https://${process.env.APP_URL || process.env.VERCEL_URL}/staff-access`);

    } catch (error: any) {
        console.error("Handler Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
}
