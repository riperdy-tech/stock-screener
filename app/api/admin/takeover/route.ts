// app/api/admin/takeover/route.ts
// The "PC is off — run everything from cloud" one-shot. Fires the cloud
// data fetch immediately, the KIS sync (as_scheduled — every repo-var gate
// still governs) when the US session is open, and the depth backstop (its
// own preflight still decides whether to actually spend money). Everything
// it triggers is also covered by the automatic cron ladders — this button
// exists for immediacy, not necessity.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { dispatchWorkflow, usMarketOpen } from "../../../../lib/ghDispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse("Unauthorized", { status: 401 });
  const { confirmed } = await req.json().catch(() => ({}));
  if (confirmed !== true) {
    return NextResponse.json({ error: "confirmation required" }, { status: 400 });
  }

  const results: string[] = [];

  const sdf = await dispatchWorkflow(
    "riperdy-tech/stock-screener",
    "schedule-data-fetch.yml",
    { runner: "ubuntu-latest" }
  );
  results.push(sdf.ok ? "data fetch: dispatched on cloud" : `data fetch: ${sdf.error}`);

  if (usMarketOpen()) {
    const kis = await dispatchWorkflow("riperdy-tech/stock-screener", "kis-sync.yml", {
      as_scheduled: "true",
    });
    results.push(kis.ok ? "KIS sync: dispatched (repo-var gates govern)" : `KIS sync: ${kis.error}`);
  } else {
    results.push("KIS sync: market closed — the cron ladder covers the next session");
  }

  const depth = await dispatchWorkflow("riperdy-tech/rs2-local", "depth-cloud-backstop.yml");
  results.push(
    depth.ok
      ? "depth backstop: dispatched (its preflight decides whether to spend)"
      : `depth backstop: ${depth.error}`
  );

  const failed = results.some((r) => r.includes("github "));
  return NextResponse.json({ ok: !failed, results }, { status: failed ? 502 : 200 });
}
