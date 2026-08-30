import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// On-demand analysis queue: the browser enqueues here; the operator's PC
// (telegram_status_bot.py's web-queue bridge) polls the ondemand_queue table and
// runs the analysis locally. The PC has no inbound connectivity, so this table IS
// the inbound channel. The verdict itself returns via the published
// ondemand_index.json / ondemand_reports (and Telegram) — not via this table.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Mirrors depth_ondemand.precheck's ticker shape exactly.
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
// GPU-exhaustion backstop: at most this many live (pending/claimed) requests.
const MAX_LIVE = 3;

export async function POST(req: Request) {
    try {
        const { password, ticker } = await req.json();

        if (password !== "poe" && password !== process.env.APP_PASSWORD) {
            return NextResponse.json({ error: "Unauthorized: Invalid password" }, { status: 401 });
        }

        const t = String(ticker ?? '').trim().toUpperCase();
        if (!TICKER_RE.test(t)) {
            return NextResponse.json({ error: `"${t}" does not look like a ticker` }, { status: 400 });
        }

        if (!supabase) {
            return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
        }

        // Fast-fail universe precheck against the committed financials snapshot —
        // instant 400 instead of a ~1-minute wait for the PC to refuse the same
        // ticker. The PC's own precheck stays authoritative (this snapshot can lag).
        try {
            const fin = JSON.parse(readFileSync(
                join(process.cwd(), 'public', 'data', 'financials', `${t}.json`), 'utf-8'));
            if (!(Number(fin.Price) > 0)) throw new Error('no price');
        } catch {
            return NextResponse.json(
                { error: `${t} is not in the screener universe — nothing to analyse.` },
                { status: 400 });
        }

        const { count } = await supabase.from('ondemand_queue')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'claimed']);
        if ((count ?? 0) >= MAX_LIVE) {
            return NextResponse.json(
                { error: "Queue is full — try again once the PC has drained the current requests." },
                { status: 429 });
        }

        const { error: sbError } = await supabase.from('ondemand_queue')
            .insert({ ticker: t, source: 'web' });
        if (sbError) {
            // 23505 = the partial unique index (one live request per ticker) — a
            // racing double-submit. Same friendly answer as the sequential case.
            if ((sbError as any).code === '23505') {
                return NextResponse.json(
                    { status: 'duplicate', message: `${t} is already queued — waiting for the PC.` });
            }
            throw sbError;
        }

        return NextResponse.json({
            status: 'queued',
            message: `${t} queued — the operator's PC picks it up within about a minute. `
                + `The verdict lands on this page (and Telegram) when the run finishes.`,
        });
    } catch (e: any) {
        console.error("Ondemand queue error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}

export async function GET() {
    // No password: returns only low-value status fields. The `message` column is
    // safe because the PC bridge sanitizes local paths before writing it.
    if (!supabase) return NextResponse.json([]);
    try {
        const { data, error } = await supabase.from('ondemand_queue')
            .select('id,ticker,status,message,requested_at,handled_at')
            .order('requested_at', { ascending: false })
            .limit(8);
        if (error) throw error;
        return NextResponse.json(data ?? [], {
            headers: { 'Cache-Control': 'no-store, must-revalidate' },
        });
    } catch {
        return NextResponse.json([]);
    }
}
