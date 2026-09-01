// app/api/admin/takeover/route.ts
// The "PC is off — cover today from cloud" gap-filler. It dispatches NOTHING
// that already happened: SDF only if the ledger wasn't written since the
// primary target, KIS only if no run actually traded today (and the session
// is open, and the ledger is fresh), depth always handed to its self-gated
// preflight. Pressing it on a fully-covered day reports "nothing to do".
// The cron ladders provide the same coverage automatically — this button
// exists for immediacy, not necessity.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import {
  dispatchWorkflow,
  fetchJson,
  latestPrimaryTarget,
  usMarketOpen,
} from "../../../../lib/ghDispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = "riperdy-tech/stock-screener";
const API = "https://api.github.com";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/public/data`;

type Item = { ok: boolean; msg: string };

/** Did any completed run today carry a successful "Mark traded" step?
 *  (Probes, dry-runs and gate-skipped green runs never mark — same rule as
 *  the workflow's own dedupe gate. status=completed, not success: a run that
 *  traded and then failed a later step still counts.) null = unknown. */
async function kisSyncedToday(): Promise<boolean | null> {
  const today = new Date().toISOString().slice(0, 10);
  const created = encodeURIComponent(`>=${today}T00:00:00Z`);
  const list = await fetchJson(
    `${API}/repos/${REPO}/actions/workflows/kis-sync.yml/runs?status=completed&created=${created}&per_page=10`
  );
  if (!list) return null;
  const runs: any[] = list.workflow_runs ?? [];
  const jobLists = await Promise.all(
    runs.map((run) => fetchJson(`${API}/repos/${REPO}/actions/runs/${run.id}/jobs`))
  );
  if (jobLists.some((j) => j === null)) return null;
  for (const jobs of jobLists) {
    for (const job of jobs.jobs ?? []) {
      for (const step of job.steps ?? []) {
        if (step.name === "Mark traded" && step.conclusion === "success") return true;
      }
    }
  }
  return false;
}

/** A run queued/executing now, or finished within the last 10 min (raw CDN
 *  can serve a ~5-min-stale ledger, so a just-finished fetch would otherwise
 *  read as "missing" and get re-dispatched). Only runs created in the last 3h
 *  count — a self-hosted run stranded `queued` since the PC died must not
 *  disable the button forever. Unreadable API = "not running" (the
 *  workflow-side gates still dedupe; a rare duplicate is wasteful, not
 *  dangerous). */
async function runInFlight(workflowFile: string): Promise<boolean> {
  const now = Date.now();
  const created = encodeURIComponent(`>=${new Date(now - 3 * 3600000).toISOString()}`);
  const list = await fetchJson(
    `${API}/repos/${REPO}/actions/workflows/${workflowFile}/runs?created=${created}&per_page=10`
  );
  for (const run of list?.workflow_runs ?? []) {
    if (["queued", "in_progress", "waiting", "pending"].includes(run.status)) return true;
    if (run.updated_at && now - new Date(run.updated_at).getTime() < 10 * 60000) return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse("Unauthorized", { status: 401 });
  const { confirmed } = await req.json().catch(() => ({}));
  if (confirmed !== true) {
    return NextResponse.json({ error: "confirmation required" }, { status: 400 });
  }

  const results: Item[] = [];
  const now = new Date();

  // --- SDF: fetch only when today's data never landed -----------------------
  const ledger = await fetchJson(`${RAW}/paper_ledgers.json`);
  const stamp = ledger?.last_updated ? new Date(ledger.last_updated) : null;
  const ledgerFresh = !!stamp && !isNaN(stamp.getTime()) && stamp >= latestPrimaryTarget(now);
  if (ledgerFresh) {
    results.push({ ok: true, msg: "data fetch: already fresh today — skipped" });
  } else if (await runInFlight("schedule-data-fetch.yml")) {
    results.push({ ok: true, msg: "data fetch: a run is already in flight / just finished — skipped" });
  } else {
    const sdf = await dispatchWorkflow(REPO, "schedule-data-fetch.yml", {
      runner: "ubuntu-latest",
    });
    results.push(
      sdf.ok
        ? { ok: true, msg: "data fetch: was missing today — dispatched on cloud (~1h)" }
        : { ok: false, msg: `data fetch: ${sdf.error}` }
    );
  }

  // --- KIS: sync only when the session is open and today isn't traded -------
  if (!usMarketOpen(now)) {
    results.push({ ok: true, msg: "KIS sync: market closed — the cron ladder covers the next session" });
  } else {
    const synced = await kisSyncedToday();
    if (synced === null) {
      results.push({ ok: false, msg: "KIS sync: GitHub unreadable — not dispatching blind; the ladder still runs" });
    } else if (synced) {
      results.push({ ok: true, msg: "KIS sync: already traded today — skipped" });
    } else if (!ledgerFresh) {
      // Dispatching now would only skip/fail on the sync's own freshness gate.
      const lastRungPassed = now.getUTCHours() * 60 + now.getUTCMinutes() >= 19 * 60 + 25;
      results.push({
        ok: !lastRungPassed,
        msg: lastRungPassed
          ? "KIS sync: no fresh data and the last ladder rung has passed — press again once the fetch lands (if the market is still open), else today goes unsynced"
          : "KIS sync: waiting for fresh data — a ladder rung trades once it lands",
      });
    } else if (await runInFlight("kis-sync.yml")) {
      results.push({ ok: true, msg: "KIS sync: a run is already in flight / just finished — skipped" });
    } else {
      const kis = await dispatchWorkflow(REPO, "kis-sync.yml", { as_scheduled: "true" });
      results.push(
        kis.ok
          ? { ok: true, msg: "KIS sync: not yet done today — dispatched (all gates still govern)" }
          : { ok: false, msg: `KIS sync: ${kis.error}` }
      );
    }
  }

  // --- Depth: its own preflight decides whether anything is due -------------
  const depth = await dispatchWorkflow("riperdy-tech/rs2-local", "depth-cloud-backstop.yml");
  results.push(
    depth.ok
      ? { ok: true, msg: "depth backstop: handed to its preflight (runs only if overlay stale + PC dead)" }
      : { ok: false, msg: `depth backstop: ${depth.error}` }
  );

  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 502 });
}
