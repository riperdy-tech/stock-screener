import { NextResponse } from "next/server";

// Fires the "Update Mine Ledger" workflow (update-mine-ledger.yml) so a portfolio
// save can rebuild the user's mine ledger without opening the Actions tab. Uses
// the same GH_PAT the AI-analysis route uses to dispatch workflows. The token
// stays server-side; the browser only POSTs here after a successful save.

const REPO = "riperdy-tech/stock-screener";
const WORKFLOW = "update-mine-ledger.yml";

export async function POST() {
    const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
    if (!token) {
        return NextResponse.json(
            { ok: false, error: "GH_PAT not configured in Vercel env." }, { status: 500 });
    }
    try {
        const res = await fetch(
            `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ ref: "main" }),
            });
        if (res.status === 204) return NextResponse.json({ ok: true });
        const text = await res.text();
        return NextResponse.json(
            { ok: false, error: `GitHub ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
    }
}
