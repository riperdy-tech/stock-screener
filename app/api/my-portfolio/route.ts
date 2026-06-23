import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

// Persists the My Portfolio snapshot in Supabase (table `my_portfolio`, single
// row id=1) so the daily paper-ledger tracker (scripts/track_paper_portfolios.py,
// ledger "mine") can measure the user's actual holdings. Replaces the old
// filesystem write, which fails on Vercel (read-only /var/task -> EROFS).

export async function GET() {
    try {
        if (!supabase) return NextResponse.json(null);
        const { data, error } = await supabase
            .from("my_portfolio")
            .select("holdings, cash, saved_at")
            .eq("id", 1)
            .maybeSingle();
        if (error || !data) return NextResponse.json(null);
        return NextResponse.json(data);
    } catch {
        return NextResponse.json(null);
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!supabase) {
            return NextResponse.json(
                { ok: false, error: "Supabase not configured (missing SUPABASE_SERVICE_KEY)." },
                { status: 500 });
        }
        const body = await req.json();
        const holdings = Array.isArray(body.holdings) ? body.holdings : [];
        const clean = holdings
            .filter((h: any) => typeof h?.ticker === "string" && Number.isFinite(h?.value) && h.value > 0)
            .map((h: any) => ({ ticker: h.ticker.toUpperCase(), value: h.value }));
        const cash = Number.isFinite(body.cash) && body.cash >= 0 ? body.cash : 0;
        const saved_at = new Date().toISOString();

        const { error } = await supabase
            .from("my_portfolio")
            .upsert({ id: 1, holdings: clean, cash, saved_at });
        if (error) throw error;

        return NextResponse.json({ ok: true, saved_at, count: clean.length });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    }
}
