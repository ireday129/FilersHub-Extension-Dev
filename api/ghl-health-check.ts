export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const baseUrl = process.env.SUPABASE_URL;
    if (!baseUrl) {
        return res.status(500).json({ error: 'Health check could not run.' });
    }

    try {
        const resp = await fetch(`${baseUrl}/functions/v1/ghl-health-check`, {
            method: 'POST',
            headers: {
                'x-cron-secret': secret,
                'Content-Type': 'application/json',
            },
        });
        const data = await resp.json().catch(() => ({}));
        return res.status(resp.status).json(data);
    } catch {
        return res.status(500).json({ error: 'Health check could not run.' });
    }
}
