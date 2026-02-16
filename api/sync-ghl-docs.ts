// /api/sync-ghl-docs.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // strongly recommended to avoid rate limits
const SYNC_KEY = process.env.SYNC_KEY;

const OWNER = process.env.GHL_DOCS_OWNER || "ireday129";
const REPO = process.env.GHL_DOCS_REPO || "highlevel-api-docs";
const BRANCH = process.env.GHL_DOCS_BRANCH || "main";

const INCLUDE_EXT = [".md", ".markdown", ".yml", ".yaml", ".json"];
const FILES_PER_RUN = 25; // batch size to avoid Vercel timeouts
const CHUNK_MAX_CHARS = 1800;
const CHUNK_OVERLAP = 200;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function sha256(s: string) {
    return crypto.createHash("sha256").update(s).digest("hex");
}

function chunkText(text: string, maxChars = CHUNK_MAX_CHARS, overlap = CHUNK_OVERLAP) {
    const chunks: string[] = [];
    let i = 0;

    while (i < text.length) {
        const end = Math.min(text.length, i + maxChars);
        chunks.push(text.slice(i, end));

        if (end === text.length) break;

        i = end - overlap;
        if (i < 0) i = 0;
    }

    return chunks;
}

function getHeader(req: VercelRequest, name: string) {
    const v = req.headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
}

async function ghFetchJson(url: string) {
    const headers: Record<string, string> = {
        "User-Agent": "antigravity-sync",
        "Accept": "application/vnd.github+json"
    };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

    let res: Response;
    try {
        res = await fetch(url, { headers });
    } catch (e: any) {
        throw new Error(`GitHub network error: ${e?.message || String(e)}`);
    }

    const bodyText = await res.text();
    if (!res.ok) {
        throw new Error(`GitHub API error ${res.status}: ${bodyText.slice(0, 500)}`);
    }

    try {
        return JSON.parse(bodyText);
    } catch {
        throw new Error(`GitHub API returned non-JSON: ${bodyText.slice(0, 200)}`);
    }
}

async function fetchRawText(path: string) {
    const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
    let res: Response;

    try {
        res = await fetch(rawUrl, { headers: { "User-Agent": "antigravity-sync" } });
    } catch (e: any) {
        throw new Error(`Raw fetch network error: ${e?.message || String(e)} (${rawUrl})`);
    }

    if (!res.ok) return "";
    return res.text();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const key = getHeader(req, "x-sync-key");
        if (SYNC_KEY && key !== SYNC_KEY) {
            return res.status(401).json({ ok: false, error: "Unauthorized" });
        }

        const rawCursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
        let cursor = Number(rawCursor ?? 0);
        if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

        // 1) Pull file tree once per run
        const treeUrl = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;
        const data = await ghFetchJson(treeUrl);

        const files: string[] = (data.tree as any[])
            .filter((n) => n.type === "blob")
            .map((n) => n.path as string)
            .filter((p) => INCLUDE_EXT.some((ext) => p.toLowerCase().endsWith(ext)));

        const slice = files.slice(cursor, cursor + FILES_PER_RUN);

        let upserts = 0;
        let skipped = 0;
        let rawFetchEmpty = 0;

        // 2) Process one batch of files
        for (const path of slice) {
            const content = await fetchRawText(path);
            if (!content) {
                rawFetchEmpty++;
                continue;
            }

            const chunks = chunkText(content);

            for (let idx = 0; idx < chunks.length; idx++) {
                const chunk = chunks[idx];
                const content_hash = sha256(chunk);

                const { data: existing, error: exErr } = await supabase
                    .from("docs_chunks")
                    .select("content_hash")
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
                    content_hash,
                    embedding: null, // changed chunks must be re-embedded
                    updated_at: new Date().toISOString()
                };

                const { error: upErr } = await supabase
                    .from("docs_chunks")
                    .upsert(payload, { onConflict: "repo,branch,path,chunk_index" });

                if (upErr) throw upErr;
                upserts++;
            }
        }

        const nextCursor = cursor + FILES_PER_RUN < files.length ? cursor + FILES_PER_RUN : null;

        return res.status(200).json({
            ok: true,
            repo: `${OWNER}/${REPO}`,
            branch: BRANCH,
            totalFiles: files.length,
            processedThisRun: slice.length,
            cursor,
            nextCursor,
            filesPerRun: FILES_PER_RUN,
            upserts,
            skipped,
            rawFetchEmpty,
            note: !GITHUB_TOKEN
                ? "GITHUB_TOKEN not set. You may hit GitHub rate limits. Add it in Vercel env vars."
                : undefined
        });
    } catch (e: any) {
        return res.status(500).json({
            ok: false,
            error: e?.message || String(e)
        });
    }
}