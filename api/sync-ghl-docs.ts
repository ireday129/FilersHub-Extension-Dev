import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // optional but recommended

const OWNER = "ireday129";
const REPO = "highlevel-api-docs";
const BRANCH = "main";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const INCLUDE_EXT = [".md", ".markdown", ".yml", ".yaml", ".json"];

function sha256(s: string) {
    return crypto.createHash("sha256").update(s).digest("hex");
}

function chunkText(text: string, maxChars = 1800, overlap = 200) {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
        const end = Math.min(text.length, i + maxChars);
        chunks.push(text.slice(i, end));
        i = end - overlap;
        if (i < 0) i = 0;
        if (end === text.length) break;
    }
    return chunks;
}

async function ghFetch(url: string) {
    const headers: Record<string, string> = {
        "User-Agent": "antigravity-sync",
        "Accept": "application/vnd.github+json"
    };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub fetch failed ${res.status}: ${url}`);
    return res.json();
}

async function fetchRaw(path: string) {
    const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
    const headers: Record<string, string> = { "User-Agent": "antigravity-sync" };
    const res = await fetch(rawUrl, { headers });
    if (!res.ok) return "";
    return res.text();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        // Optional simple protection
        const key = req.headers["x-sync-key"];
        if (process.env.SYNC_KEY && key !== process.env.SYNC_KEY) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const treeUrl = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;
        const data = await ghFetch(treeUrl);

        const files = (data.tree as any[])
            .filter((n) => n.type === "blob")
            .map((n) => n.path as string)
            .filter((p) => INCLUDE_EXT.some((ext) => p.toLowerCase().endsWith(ext)));

        let upserts = 0;
        let skipped = 0;

        for (const path of files) {
            const content = await fetchRaw(path);
            if (!content) continue;

            const chunks = chunkText(content);
            for (let idx = 0; idx < chunks.length; idx++) {
                const chunk = chunks[idx];
                const content_hash = sha256(chunk);

                // Check if existing with same hash
                const { data: existing, error: exErr } = await supabase
                    .from("docs_chunks")
                    .select("id, content_hash")
                    .eq("repo", `${OWNER}/${REPO}`)
                    .eq("branch", BRANCH)
                    .eq("path", path)
                    .eq("chunk_index", idx)
                    .maybeSingle();

                if (exErr) throw exErr;

                if (existing?.content_hash === content_hash) {
                    skipped++;
                    continue;
                }

                const url = `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/${path}`;

                const payload = {
                    repo: `${OWNER}/${REPO}`,
                    branch: BRANCH,
                    path,
                    url,
                    chunk_index: idx,
                    title: null,
                    content: chunk,
                    content_hash
                };

                const { error: upErr } = await supabase
                    .from("docs_chunks")
                    .upsert(payload, { onConflict: "repo,branch,path,chunk_index" });

                if (upErr) throw upErr;
                upserts++;
            }
        }

        return res.status(200).json({ ok: true, files: files.length, upserts, skipped });
    } catch (e: any) {
        return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
}