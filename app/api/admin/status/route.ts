// app/api/admin/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { KIS_VAR_ALLOWLIST, RHYTHMS, classify, parseStamp } from "../../../../lib/controlTower";
import { supabaseAdmin } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// requireAdmin -> verifySession uses crypto.createHmac: Node runtime only.
export const runtime = "nodejs";

const RAW = "https://raw.githubusercontent.com/riperdy-tech/stock-screener/main/public/data";
const API = "https://api.github.com";
const REPO = "riperdy-tech/stock-screener";

function ghHeaders() {
  const token = process.env.GH_PAT || process.env.GITHUB_TOKEN || "";
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "rs2-control-tower",
  };
}

async function fetchJson(url: string, headers?: Record<string, string>) {
  try {
    const r = await fetch(url, { headers, cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse("Unauthorized", { status: 401 });

  const fileKeys = RHYTHMS.filter((r) => r.kind === "file");
  const workflowKeys = RHYTHMS.filter((r) => r.kind === "workflow");
  const [files, wfRuns, runsRaw, varsRaw, hb, cmds] = await Promise.all([
    // Repos are PRIVATE: raw.githubusercontent 404s without the PAT header.
    Promise.all(fileKeys.map((r) => fetchJson(`${RAW}/${r.file}`, ghHeaders()))),
    // Per-workflow latest run: a repo-wide window starves slow rhythms (the
    // weekly's 8-day threshold outlives 30 repo-wide runs -> permanent "unknown").
    Promise.all(workflowKeys.map((r) =>
      fetchJson(`${API}/repos/${REPO}/actions/workflows/${r.workflowFile}/runs?per_page=1`, ghHeaders()))),
    fetchJson(`${API}/repos/${REPO}/actions/runs?per_page=15`, ghHeaders()),
    fetchJson(`${API}/repos/${REPO}/actions/variables?per_page=100`, ghHeaders()),
    supabaseAdmin
      ? supabaseAdmin.from("control_heartbeat").select("*").eq("id", "rs2-pc").maybeSingle()
      : Promise.resolve(null),
    supabaseAdmin
      ? supabaseAdmin.from("control_commands").select("*").order("id", { ascending: false }).limit(15)
      : Promise.resolve(null),
  ]);

  const nowDate = new Date();
  const now = nowDate.getTime();
  const fileStamp = new Map<string, string | null>();
  fileKeys.forEach((r, i) => {
    const doc = files[i] as Record<string, unknown> | null;
    fileStamp.set(r.key, doc ? ((doc[r.field as string] as string) ?? null) : null);
  });

  const latestByFile = new Map<string, any>();
  workflowKeys.forEach((r, i) => {
    const run = wfRuns[i]?.workflow_runs?.[0];
    if (run) latestByFile.set(r.workflowFile as string, run);
  });

  const hbRow = hb?.data ?? null;

  const rhythms = RHYTHMS.map((r) => {
    let lastStamp: string | null = null;
    let runConclusion: string | null = null;
    if (r.kind === "file") lastStamp = fileStamp.get(r.key) ?? null;
    if (r.kind === "heartbeat") lastStamp = hbRow?.updated_at ?? null;
    if (r.kind === "workflow") {
      const run = latestByFile.get(r.workflowFile || "");
      lastStamp = run?.created_at ?? null;
      runConclusion = run?.conclusion ?? null;
    }
    const parsed = parseStamp(lastStamp ?? undefined, r.naiveTz);
    const ageMin = parsed ? Math.round((now - parsed.getTime()) / 60000) : null;
    let state = classify(ageMin, r, nowDate);
    // Recency alone can hide a red workflow: a fresh-but-failed run must
    // never render as "ok" on a dashboard fronting real money.
    if (state === "ok" && runConclusion && runConclusion !== "success") state = "stale";
    return { ...r, lastStamp, ageMin, state, runConclusion };
  });

  // Distinguish "source unreachable" from "genuinely no data": a Supabase
  // outage must not read as "PC offline" (whose manualRecovery would send the
  // operator to power-cycle a healthy machine).
  const sources = {
    files: files.every((f: unknown) => f !== null),
    workflowRuns: wfRuns.every((w: unknown) => w !== null),
    runs: runsRaw !== null,
    vars: varsRaw !== null,
    supabase: !!supabaseAdmin && !(hb as any)?.error,
  };

  const runs: any[] = runsRaw?.workflow_runs ?? [];

  const workflows = runs.slice(0, 15).map((run) => ({
    name: run.name,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
    html_url: run.html_url,
  }));

  const kisVars: Record<string, string> = {};
  for (const v of varsRaw?.variables ?? []) {
    if (KIS_VAR_ALLOWLIST.includes(String(v.name))) kisVars[v.name] = v.value;
  }

  return NextResponse.json({
    generatedAt: nowDate.toISOString(),
    rhythms,
    // NOTE: pc.payload.tasks timestamps are naive LOCAL (UTC+8) — render as-is, never parse as UTC. Payload may be a degraded {ts,host,snapshot_error} shape.
    pc: hbRow,
    workflows,
    kisVars,
    sources,
    commands: cmds?.data ?? [],
  });
}
