// lib/controlTower.ts
// Single source of truth for what the control tower watches and may trigger.

export type RhythmState = "ok" | "stale" | "dead" | "unknown";

export interface Rhythm {
  key: string;
  label: string;
  kind: "file" | "heartbeat" | "workflow";
  /** for kind=file: path under public/data on raw.githubusercontent */
  file?: string;
  /** dot-free top-level field holding the timestamp */
  field?: string;
  /** timezone suffix to append when the stamp is naive (depth_overlay quirk) */
  naiveTz?: string;
  /** for kind=workflow: workflow file name in stock-screener */
  workflowFile?: string;
  staleAfterMin: number;
  deadAfterMin: number;
  manualRecovery: string;
}

export const RHYTHMS: Rhythm[] = [
  {
    key: "pc",
    label: "RS2 PC (control agent)",
    kind: "heartbeat",
    staleAfterMin: 15,
    deadAfterMin: 60,
    manualRecovery:
      "PC is offline or the RS2-Control-Agent task stopped. If you can power the PC on, do that — the agent self-heals on boot+logon. If you cannot: depth sweeps fall to the Depth cloud backstop (auto, daily) and SDF falls to the GitHub cron backstop (auto). Nothing else needs you.",
  },
  {
    key: "sdf",
    label: "Scheduled Data Fetch (ledgers)",
    kind: "file",
    file: "paper_ledgers.json",
    field: "last_updated",
    staleAfterMin: 26 * 60,
    deadAfterMin: 50 * 60,
    manualRecovery:
      "Dispatch 'Data fetch (cloud)' below, or from any terminal: gh workflow run schedule-data-fetch.yml -R riperdy-tech/stock-screener -f runner=ubuntu-latest",
  },
  {
    key: "depth",
    label: "Depth overlay (RS2 sweep)",
    kind: "file",
    file: "depth_overlay.json",
    field: "generated_at",
    naiveTz: "+08:00",
    staleAfterMin: 8 * 60,
    deadAfterMin: 36 * 60,
    manualRecovery:
      "If the PC is on: send PC command 'depth_run_now' below. If the PC is off: dispatch 'Depth cloud backstop' below (runs the DeepSeek arm from rs2-state), or from a terminal: gh workflow run depth-cloud-backstop.yml -R riperdy-tech/rs2-local",
  },
  {
    key: "chain",
    label: "Score chain (chain_manifest)",
    kind: "file",
    file: "chain_manifest.json",
    field: "finished_at",
    staleAfterMin: 26 * 60,
    deadAfterMin: 50 * 60,
    manualRecovery:
      "run_chain is executed by SDF and price-refresh. Dispatch 'Post-close price refresh' below to force a re-score.",
  },
  {
    key: "kis",
    label: "KIS Portfolio Sync",
    kind: "workflow",
    workflowFile: "kis-sync.yml",
    staleAfterMin: 30 * 60,
    deadAfterMin: 55 * 60,
    manualRecovery:
      "KIS sync is cloud-native (ubuntu-latest) — a missed run is a GitHub cron delay or a red run. Check the run log first. NEVER dispatch with env=real from here; if trading must stop, flip KIS_HALT below.",
  },
  {
    key: "price",
    label: "Post-Close Price Refresh",
    kind: "workflow",
    workflowFile: "price-refresh.yml",
    staleAfterMin: 30 * 60,
    deadAfterMin: 55 * 60,
    manualRecovery: "Dispatch 'Post-close price refresh' below.",
  },
  {
    key: "weekly",
    label: "Paradigm Weekly Analyst",
    kind: "workflow",
    workflowFile: "paradigm-weekly-analyst.yml",
    staleAfterMin: 8 * 24 * 60,
    deadAfterMin: 15 * 24 * 60,
    manualRecovery: "Dispatch 'Weekly analyst refresh' below.",
  },
];

export function parseStamp(s: string | undefined, naiveTz?: string): Date | null {
  if (!s) return null;
  const hasTz = /Z$|[+-]\d\d:?\d\d$/.test(s);
  const d = new Date(hasTz ? s : s + (naiveTz || "Z"));
  return isNaN(d.getTime()) ? null : d;
}

export function classify(ageMin: number | null, r: Rhythm): RhythmState {
  if (ageMin === null) return "unknown";
  if (ageMin >= r.deadAfterMin) return "dead";
  if (ageMin >= r.staleAfterMin) return "stale";
  return "ok";
}

export interface Dispatchable {
  repo: string;
  file: string;
  inputs?: Record<string, string>;
  label: string;
  danger?: boolean;
}

export const DISPATCHABLE: Record<string, Dispatchable> = {
  "sdf-cloud": {
    repo: "riperdy-tech/stock-screener",
    file: "schedule-data-fetch.yml",
    inputs: { runner: "ubuntu-latest" },
    label: "Data fetch (cloud)",
  },
  "sdf-self": {
    repo: "riperdy-tech/stock-screener",
    file: "schedule-data-fetch.yml",
    inputs: { runner: "self-hosted" },
    label: "Data fetch (PC runner)",
  },
  "price-refresh": {
    repo: "riperdy-tech/stock-screener",
    file: "price-refresh.yml",
    label: "Post-close price refresh",
  },
  "kis-dry-run": {
    repo: "riperdy-tech/stock-screener",
    file: "kis-sync.yml",
    inputs: { env: "paper", execute: "false" },
    label: "KIS sync dry-run (paper)",
  },
  "overlay-watchdog": {
    repo: "riperdy-tech/stock-screener",
    file: "overlay-freshness-watchdog.yml",
    label: "Overlay freshness check",
  },
  "weekly-analyst": {
    repo: "riperdy-tech/stock-screener",
    file: "paradigm-weekly-analyst.yml",
    label: "Weekly analyst refresh",
  },
  "depth-cloud-backstop": {
    repo: "riperdy-tech/rs2-local",
    file: "depth-cloud-backstop.yml",
    label: "Depth cloud backstop",
    danger: true,
  },
};

// Must exactly match COMMANDS in RS2 Local\control_agent.py.
// (No "ondemand" — the site's /api/ondemand -> ondemand_queue -> bot bridge
// already carries remote on-demand analysis requests.)
export const PC_COMMANDS = new Set([
  "depth_pause",
  "depth_resume",
  "depth_run_now",
  "sdf_dispatch",
  "bot_restart",
  "state_sync",
]);
