import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const key = req.headers["x-sync-key"];
        if (process.env.SYNC_KEY && key !== process.env.SYNC_KEY) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { data: rows, error } = await supabase
            .from("docs_chunks")
            .select("id, content")
            .is("embedding", null)
            .limit(100);

        if (error) throw error;

        let updated = 0;

        for (const r of rows || []) {
            const emb = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: r.content
            });

            const vector = emb.data[0].embedding;

            const { error: upErr } = await supabase
                .from("docs_chunks")
                .update({ embedding: vector })
                .eq("id", r.id);

            if (upErr) throw upErr;
            updated++;
        }

        res.status(200).json({ ok: true, updated, remainingChecked: rows?.length || 0 });
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
}