// lib/ghDispatch.ts
// Server-only: fires a workflow_dispatch on GitHub. Shared by
// /api/admin/dispatch (single whitelisted action) and /api/admin/takeover
// (the PC-off composite). Never import from client components.

export function ghHeaders(): Record<string, string> {
  const token = process.env.GH_PAT || process.env.GITHUB_TOKEN || "";
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "rs2-control-tower",
  };
}

export async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: ghHeaders(), cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Most recent SDF primary target (14:35 UTC weekday / 10:35 weekend), minus
 *  15 min slack — the same anchor the SDF backstop preflight uses. */
export function latestPrimaryTarget(now: Date = new Date()): Date {
  const target = (d: Date) => {
    const t = new Date(d);
    const wd = t.getUTCDay();
    t.setUTCHours(wd >= 1 && wd <= 5 ? 14 : 10, 35, 0, 0);
    return t;
  };
  let cand = target(now);
  if (cand > now) cand = target(new Date(now.getTime() - 86400000));
  return new Date(cand.getTime() - 15 * 60000);
}

export async function dispatchWorkflow(
  repo: string,
  file: string,
  inputs?: Record<string, string>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
  const r = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${file}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "rs2-control-tower",
      },
      body: JSON.stringify({ ref: "main", ...(inputs ? { inputs } : {}) }),
    }
  );
  if (r.status !== 204) {
    return { ok: false, error: `github ${r.status}: ${await r.text()}` };
  }
  return { ok: true };
}

/** Same session test the kis-sync workflow's market-hours gate runs. */
export function usMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  const min = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
  return !["Sat", "Sun"].includes(wd) && min >= 9 * 60 + 30 && min < 16 * 60;
}
