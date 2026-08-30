// app/api/admin/kis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { KIS_VAR_ALLOWLIST } from "../../../../lib/controlTower";

export const dynamic = "force-dynamic";
// requireAdmin -> verifySession uses crypto.createHmac: Node runtime only.
export const runtime = "nodejs";

const REPO = "riperdy-tech/stock-screener";

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GH_PAT || process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "rs2-control-tower",
    "Content-Type": "application/json",
  };
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse("Unauthorized", { status: 401 });
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/variables?per_page=100`, {
    headers: ghHeaders(),
    cache: "no-store",
  });
  // On the kill-switch panel, "GitHub unreachable" must never read as
  // "KIS_HALT not set" — fail loudly instead of returning an empty map.
  if (!r.ok) {
    return NextResponse.json({ error: `github ${r.status}` }, { status: 502 });
  }
  const data = await r.json();
  const vars: Record<string, string> = {};
  for (const v of data?.variables ?? []) {
    if (KIS_VAR_ALLOWLIST.includes(String(v.name))) vars[v.name] = v.value;
  }
  return NextResponse.json({ vars });
}

// The ONLY mutable var from the control tower is KIS_HALT (kill switch).
// KIS_LEDGER / KIS_ENV / KIS_AUTO_EXECUTE are money-critical and read-only here.
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse("Unauthorized", { status: 401 });
  const { halt } = await req.json();
  if (typeof halt !== "boolean") {
    return NextResponse.json({ error: "halt must be boolean" }, { status: 400 });
  }
  const value = halt ? "true" : "false";
  const patch = await fetch(
    `https://api.github.com/repos/${REPO}/actions/variables/KIS_HALT`,
    { method: "PATCH", headers: ghHeaders(), body: JSON.stringify({ name: "KIS_HALT", value }) }
  );
  if (patch.status === 404) {
    const create = await fetch(`https://api.github.com/repos/${REPO}/actions/variables`, {
      method: "POST",
      headers: ghHeaders(),
      body: JSON.stringify({ name: "KIS_HALT", value }),
    });
    if (create.status !== 201) {
      return NextResponse.json({ error: `github ${create.status}` }, { status: 502 });
    }
  } else if (patch.status !== 204) {
    return NextResponse.json({ error: `github ${patch.status}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, value });
}
