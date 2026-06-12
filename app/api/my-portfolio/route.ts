import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

// Persists the My Portfolio snapshot so the daily paper-ledger tracker
// (scripts/track_paper_portfolios.py, ledger "mine") can measure the user's
// actual holdings. Works under `npm run dev` / node server; static export
// has no API runtime — the UI surfaces that as a graceful error.

const FILE = path.join(process.cwd(), "public", "data", "my_portfolio.json");

export async function GET() {
    try {
        const raw = await readFile(FILE, "utf-8");
        return NextResponse.json(JSON.parse(raw));
    } catch {
        return NextResponse.json(null);
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const holdings = Array.isArray(body.holdings) ? body.holdings : [];
        const clean = holdings
            .filter((h: any) => typeof h?.ticker === "string" && Number.isFinite(h?.value) && h.value > 0)
            .map((h: any) => ({ ticker: h.ticker.toUpperCase(), value: h.value }));
        const cash = Number.isFinite(body.cash) && body.cash >= 0 ? body.cash : 0;
        const payload = {
            holdings: clean,
            cash,
            saved_at: new Date().toISOString(),
        };
        await writeFile(FILE, JSON.stringify(payload, null, 1) + "\n", "utf-8");
        return NextResponse.json({ ok: true, saved_at: payload.saved_at, count: clean.length });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    }
}
