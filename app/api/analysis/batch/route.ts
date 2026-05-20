import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

const MAX_BATCH_SIZE = 30;

export async function POST(req: Request) {
    try {
        const { tickers, password } = await req.json();

        // ── Auth — identical to existing single-stock route ──
        if (password !== "RSYS" && password !== process.env.APP_PASSWORD) {
            return NextResponse.json({ error: "Unauthorized: Invalid password" }, { status: 401 });
        }

        // ── Validate input ──
        if (!Array.isArray(tickers) || tickers.length === 0) {
            return NextResponse.json({ error: "tickers must be a non-empty array" }, { status: 400 });
        }
        if (tickers.length > MAX_BATCH_SIZE) {
            return NextResponse.json({
                error: `Batch size capped at ${MAX_BATCH_SIZE}. Received ${tickers.length} tickers.`
            }, { status: 400 });
        }

        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        // ── GitHub Actions token check ──
        const ghToken = process.env.GH_PAT || process.env.GITHUB_TOKEN;
        if (!ghToken) {
            return NextResponse.json({
                status: 'error',
                error: "System Configuration Error: GitHub Token (GH_PAT) not found in Vercel environment."
            }, { status: 500 });
        }

        const now = new Date().toISOString();

        // ── Step 1: Insert ALL tickers as pending with shared batch_id ──
        const inserted: string[] = [];
        for (const ticker of tickers) {
            const sym = String(ticker).trim().toUpperCase();
            if (!sym) continue;

            // Mirror existing route: delete old row, insert fresh
            await supabase.from('ai_reports').delete().eq('ticker', sym);

            const { error: sbError } = await supabase
                .from('ai_reports')
                .insert({
                    ticker: sym,
                    content: "Analysis in progress... please wait.",
                    status: 'pending',
                    prompt: `Batch analysis for ${sym} (batch: ${batchId})`,
                    batch_id: batchId,
                    created_at: now,
                });

            if (sbError) {
                console.error(`Failed to insert ${sym}:`, sbError);
                continue;
            }
            inserted.push(sym);
        }

        if (inserted.length === 0) {
            return NextResponse.json({ error: "No valid tickers could be inserted" }, { status: 500 });
        }

        // ── Step 2: Dispatch ALL tickers — GitHub Actions queues overflow naturally ──
        let dispatched = 0;
        const dispatchErrors: string[] = [];

        for (const ticker of inserted) {
            try {
                const ghRes = await fetch(
                    `https://api.github.com/repos/riperdy-tech/stock-screener/dispatches`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${ghToken}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'StockScreener-App'
                        },
                        body: JSON.stringify({ event_type: 'trigger-ai-analysis' })
                    }
                );

                if (ghRes.ok) {
                    dispatched++;
                } else {
                    const errText = await ghRes.text();
                    dispatchErrors.push(`${ticker}: GH ${ghRes.status} — ${errText.substring(0, 100)}`);
                }
            } catch (ghErr: any) {
                dispatchErrors.push(`${ticker}: network error — ${ghErr.message}`);
            }
        }

        return NextResponse.json({
            batch_id: batchId,
            queued: inserted.length,
            dispatched,
            ...(dispatchErrors.length > 0 ? { dispatch_warnings: dispatchErrors } : {}),
        });

    } catch (e: any) {
        console.error("Batch Analysis Trigger Error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
