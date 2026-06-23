import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

// Serves the paper-trading ledger book at runtime from Supabase (table
// paper_ledgers, single row id=1), written by scripts/track_paper_portfolios.py.
// This lets a portfolio refresh show up without committing paper_ledgers.json /
// triggering a Vercel rebuild. The frontend (fetchPaperLedgers) falls back to the
// committed static JSON if this returns null.

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        if (!supabase) return NextResponse.json(null);
        const { data, error } = await supabase
            .from("paper_ledgers")
            .select("data")
            .eq("id", 1)
            .maybeSingle();
        if (error || !data) return NextResponse.json(null);
        return NextResponse.json(data.data);
    } catch {
        return NextResponse.json(null);
    }
}
