// app/api/admin/dispatch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { DISPATCHABLE } from "../../../../lib/controlTower";

export const dynamic = "force-dynamic";
// requireAdmin -> verifySession uses crypto.createHmac: Node runtime only.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse("Unauthorized", { status: 401 });
  const { action, confirmed } = await req.json();
  const entry = DISPATCHABLE[action as string];
  if (!entry) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  // Server-side gate: entries carrying a confirm text (queue-blocking or
  // billable dispatches) require the caller to assert confirmation explicitly.
  if (entry.confirm && confirmed !== true) {
    return NextResponse.json({ error: "confirmation required" }, { status: 400 });
  }

  const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
  const r = await fetch(
    `https://api.github.com/repos/${entry.repo}/actions/workflows/${entry.file}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "rs2-control-tower",
      },
      body: JSON.stringify({ ref: "main", ...(entry.inputs ? { inputs: entry.inputs } : {}) }),
    }
  );
  if (r.status !== 204) {
    const text = await r.text();
    return NextResponse.json({ error: `github ${r.status}: ${text}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, label: entry.label });
}
