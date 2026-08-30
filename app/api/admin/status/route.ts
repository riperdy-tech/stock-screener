// app/api/admin/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { RHYTHMS, classify, parseStamp } from "../../../../lib/controlTower";
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
  const [files, runsRaw, varsRaw, hb, cmds] = await Promise.all([
    Promise.all(fileKeys.map((r) => fetchJson(`${RAW}/${r.file}`))),
    fetchJson(`${API}/repos/${REPO}/actions/runs?per_page=30`, ghHeaders()),
    fetchJson(`${API}/repos/${REPO}/actions/variables?per_page=30`, ghHeaders()),
    supabaseAdmin.from("control_heartbeat").select("*").eq("id", "rs2-pc").maybeSingle(),
    supabaseAdmin.from("control_commands").select("*").order("id", { ascending: false }).limit(15),
  ]);

  const now = Date.now();
  const fileStamp = new Map<string, string | null>();
  fileKeys.forEach((r, i) => {
    const doc = files[i] as Record<string, unknown> | null;
    fileStamp.set(r.key, doc ? ((doc[r.field as string] as string) ?? null) : null);
  });

  const runs: any[] = runsRaw?.workflow_runs ?? [];
  const latestByFile = new Map<string, any>();
  for (const run of runs) {
    const file = String(run.path || "").split("/").pop() || "";
    if (!latestByFile.has(file)) latestByFile.set(file, run);
  }

  const hbRow = hb?.data ?? null;

  const rhythms = RHYTHMS.map((r) => {
    let lastStamp: string | null = null;
    if (r.kind === "file") lastStamp = fileStamp.get(r.key) ?? null;
    if (r.kind === "heartbeat") lastStamp = hbRow?.updated_at ?? null;
    if (r.kind === "workflow") {
      const run = latestByFile.get(r.workflowFile || "");
      lastStamp = run?.created_at ?? null;
    }
    const parsed = parseStamp(lastStamp ?? undefined, r.naiveTz);
    const ageMin = parsed ? Math.round((now - parsed.getTime()) / 60000) : null;
    return { ...r, lastStamp, ageMin, state: classify(ageMin, r) };
  });

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
    if (String(v.name).startsWith("KIS_")) kisVars[v.name] = v.value;
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    rhythms,
    // NOTE: pc.payload.tasks timestamps are naive LOCAL (UTC+8) — render as-is, never parse as UTC. Payload may be a degraded {ts,host,snapshot_error} shape.
    pc: hbRow,
    workflows,
    kisVars,
    commands: cmds?.data ?? [],
  });
}
