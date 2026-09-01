// lib/ghDispatch.ts
// Server-only: fires a workflow_dispatch on GitHub. Shared by
// /api/admin/dispatch (single whitelisted action) and /api/admin/takeover
// (the PC-off composite). Never import from client components.

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
