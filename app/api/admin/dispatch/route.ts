// app/api/admin/dispatch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { DISPATCHABLE } from "../../../../lib/controlTower";
import { dispatchWorkflow } from "../../../../lib/ghDispatch";

export const dynamic = "force-dynamic";
// requireAdmin -> verifySession uses crypto.createHmac: Node runtime only.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse("Unauthorized", { status: 401 });
  const { action, confirmed } = await req.json();
  // hasOwnProperty guard: bare bracket access on an object literal lets
  // prototype keys ("constructor", "__proto__") slip past the whitelist.
  if (typeof action !== "string" ||
      !Object.prototype.hasOwnProperty.call(DISPATCHABLE, action)) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const entry = DISPATCHABLE[action];
  // Server-side gate: entries carrying a confirm text (queue-blocking or
  // billable dispatches) require the caller to assert confirmation explicitly.
  if (entry.confirm && confirmed !== true) {
    return NextResponse.json({ error: "confirmation required" }, { status: 400 });
  }

  const res = await dispatchWorkflow(entry.repo, entry.file, entry.inputs);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, label: entry.label });
}
