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
  /** rhythm's cron only runs Mon-Fri: Sat/Sun/Mon get +48h grace so the
   *  72h Fri->Mon gap doesn't read as a false "dead" every weekend */
  weekdaysOnly?: boolean;
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
      "PC is offline or the RS2-Control-Agent task stopped. If you can power the PC on, do that — the agent self-heals on boot+logon. If you cannot: depth sweeps fall to the Depth cloud backstop (auto, daily) and SDF falls to the GitHub cron backstop (auto). Nothing else needs you. If Supabase is also down the backstop's heartbeat gate reads 'unreadable' and refuses to run — only then use 'Depth cloud backstop (FORCE)'.",
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
      "If the PC is on: send PC command 'depth_run_now' below. If the PC is off: dispatch 'Depth cloud backstop' below (runs the DeepSeek arm from rs2-state), or from a terminal: gh workflow run depth-cloud-backstop.yml -R riperdy-tech/rs2-local. If that keeps skipping because the heartbeat is unreadable (Supabase down) and you know the PC is dead, use 'Depth cloud backstop (FORCE)'.",
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
    weekdaysOnly: true,
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
    weekdaysOnly: true,
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

export function classify(ageMin: number | null, r: Rhythm, now: Date = new Date()): RhythmState {
  if (ageMin === null) return "unknown";
  let stale = r.staleAfterMin;
  let dead = r.deadAfterMin;
  if (r.weekdaysOnly) {
    const day = now.getUTCDay(); // 0 Sun .. 6 Sat
    if (day === 6 || day === 0 || day === 1) {
      stale += 48 * 60;
      dead += 48 * 60;
    }
  }
  if (ageMin >= dead) return "dead";
  if (ageMin >= stale) return "stale";
  return "ok";
}

export interface Dispatchable {
  repo: string;
  file: string;
  inputs?: Record<string, string>;
  label: string;
  /** one-line plain-language answer to "what happens if I press this?" */
  desc: string;
  /** when set, the UI must show this confirm dialog before dispatching */
  confirm?: string;
}

export const DISPATCHABLE: Record<string, Dispatchable> = {
  "sdf-cloud": {
    repo: "riperdy-tech/stock-screener",
    file: "schedule-data-fetch.yml",
    inputs: { runner: "ubuntu-latest" },
    label: "Data fetch (cloud)",
    desc: "Re-fetch market data + re-score on GitHub's servers. Safe anytime; ~1h.",
  },
  "sdf-self": {
    repo: "riperdy-tech/stock-screener",
    file: "schedule-data-fetch.yml",
    inputs: { runner: "self-hosted" },
    label: "Data fetch (PC runner)",
    desc: "Same fetch, but on the PC. Only while the PC is on.",
    confirm:
      "Only dispatch while the PC is ON. A self-hosted job queued against an " +
      "offline runner blocks the data-writers queue (price refresh, weekly analyst).",
  },
  "price-refresh": {
    repo: "riperdy-tech/stock-screener",
    file: "price-refresh.yml",
    label: "Post-close price refresh",
    desc: "Pull latest closing prices and re-run scoring. Safe anytime.",
  },
  "kis-dry-run": {
    repo: "riperdy-tech/stock-screener",
    file: "kis-sync.yml",
    inputs: { env: "paper", execute: "false" },
    label: "KIS sync dry-run (paper)",
    desc: "Test the KIS pipeline on the paper account. Never places orders.",
    confirm:
      "Fires a real kis-sync workflow run (paper account, execute=false — no " +
      "orders). Note: currently guaranteed-red while the paper account is empty " +
      "(dd_engine zero-peak bug).",
  },
  "overlay-watchdog": {
    repo: "riperdy-tech/stock-screener",
    file: "overlay-freshness-watchdog.yml",
    label: "Overlay freshness check",
    desc: "Check depth-overlay freshness and alert if stale. Changes nothing.",
  },
  "weekly-analyst": {
    repo: "riperdy-tech/stock-screener",
    file: "paradigm-weekly-analyst.yml",
    label: "Weekly analyst refresh",
    desc: "Regenerate the weekly analyst coverage. Safe anytime.",
  },
  "depth-cloud-backstop": {
    repo: "riperdy-tech/rs2-local",
    file: "depth-cloud-backstop.yml",
    label: "Depth cloud backstop",
    desc: "PAID DeepSeek run (~$0.70 / 6 names). Auto-skips unless overlay stale and PC dead.",
    confirm:
      "Runs a billable DeepSeek cloud job (~$0.70 for 6 names). Its preflight " +
      "still skips unless the overlay is stale and the PC is dead.",
  },
  "depth-cloud-backstop-force": {
    repo: "riperdy-tech/rs2-local",
    file: "depth-cloud-backstop.yml",
    inputs: { force: "true" },
    label: "Depth cloud backstop (FORCE)",
    desc: "Same paid run with ALL safety gates bypassed. Last resort (e.g. Supabase down).",
    confirm:
      "FORCE bypasses BOTH gates (overlay freshness + PC-alive interlock). " +
      "Only when you are certain the PC is dead and normal dispatch keeps " +
      "skipping (e.g. Supabase outage). Billable.",
  },
};

// Single source of truth for which KIS_* repo variables the admin surfaces may
// return — keeps any future sensitive KIS_* variable out of dashboard JSON by
// construction. Imported by /api/admin/status and /api/admin/kis.
export const KIS_VAR_ALLOWLIST = [
  "KIS_ENV",
  "KIS_LEDGER",
  "KIS_AUTO_EXECUTE",
  "KIS_CONFIRM_REAL",
  "KIS_HALT",
  "KIS_DD_DISABLE",
];

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

// UI-only friendly names + one-liners for the PC commands above. Keys must be
// a subset of PC_COMMANDS; the raw command string stays the API contract.
export const PC_COMMAND_INFO: Record<string, { label: string; desc: string }> = {
  depth_pause: { label: "Pause depth sweep", desc: "Stop analyzing new names until resumed." },
  depth_resume: { label: "Resume depth sweep", desc: "Clear the pause and continue the sweep." },
  depth_run_now: { label: "Run depth sweep now", desc: "Start a sweep pass immediately." },
  sdf_dispatch: { label: "Data fetch (from PC)", desc: "PC re-runs today's data fetch on its own runner." },
  bot_restart: { label: "Restart Telegram bot", desc: "Restart the /analyze bot bridge if it died." },
  state_sync: { label: "Sync depth backup", desc: "Push/pull the rs2-state backup right now." },
};
