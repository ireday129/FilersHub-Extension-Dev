import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    // Read by the GHL contact-page button (public/ghl-contact-button.js) from GHL's own domain.
    // Returns only whether a location is a FilersHub firm, so any origin may read it.
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const locationId = req.query.locationId;
    if (!locationId) {
        return res.status(400).json({ active: false });
    }

    try {
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: firm } = await supabaseAdmin
            .from('firms')
            .select('firm_id')
            .eq('ghl_location_id', locationId)
            .maybeSingle();

        return res.status(200).json({ active: !!firm });
    } catch (err: any) {
        console.error('Check location error:', err);
        return res.status(200).json({ active: false });
    }
}
