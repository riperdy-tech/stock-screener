// components/AdminDashboard.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { DISPATCHABLE } from "../lib/controlTower";

const STATE_STYLE: Record<string, string> = {
  ok: "bg-emerald-900/40 border-emerald-600 text-emerald-300",
  stale: "bg-amber-900/40 border-amber-600 text-amber-300",
  dead: "bg-red-900/40 border-red-600 text-red-300",
  unknown: "bg-gray-800 border-gray-600 text-gray-400",
};

function ageLabel(ageMin: number | null): string {
  if (ageMin === null) return "no data";
  if (ageMin < 60) return `${ageMin}m ago`;
  if (ageMin < 48 * 60) return `${Math.round(ageMin / 60)}h ago`;
  return `${Math.round(ageMin / (24 * 60))}d ago`;
}

export default function AdminDashboard({ login }: { login: string }) {
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/status", { cache: "no-store" });
      if (r.ok) setStatus(await r.json());
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [refresh]);

  async function post(url: string, body: unknown, label: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(label);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      setToast(r.ok ? `✓ ${label}` : `✗ ${label}: ${data.error || r.status}`);
    } catch (e: any) {
      setToast(`✗ ${label}: ${e?.message || "network error"}`);
    } finally {
      setBusy(null);
      setTimeout(refresh, 1500);
      setTimeout(() => setToast(null), 6000);
    }
  }

  // KIS_HALT may not exist yet as a repo variable (created on first halt):
  // undefined renders as "not set" and the button offers to halt.
  const halted = status?.kisVars?.KIS_HALT === "true";
  const haltDisplay = status?.kisVars?.KIS_HALT ?? "not set";

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">RS2 Control Tower</h1>
        <div className="text-sm text-gray-400">
          {login} · {status ? new Date(status.generatedAt).toLocaleTimeString() : "loading…"}
        </div>
      </header>

      {toast && (
        <div className="rounded border border-gray-600 bg-gray-800 px-4 py-2">{toast}</div>
      )}

      {status?.sources && Object.values(status.sources).some((v) => !v) && (
        <div className="rounded border border-amber-600 bg-amber-900/30 px-4 py-2 text-sm text-amber-200">
          Status sources degraded ({Object.entries(status.sources)
            .filter(([, v]) => !v)
            .map(([k]) => k)
            .join(", ")} unreachable) — rhythm cards may read unknown/stale for the wrong
          reason. Check connectivity before acting on a red card.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Rhythms</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(status?.rhythms ?? []).map((r: any) => (
            <div key={r.key} className={`rounded-lg border p-4 ${STATE_STYLE[r.state]}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.label}</span>
                <span className="text-xs uppercase">{r.state}</span>
              </div>
              <div className="mt-1 text-sm">{ageLabel(r.ageMin)}</div>
              {r.runConclusion && r.runConclusion !== "success" && (
                <div className="mt-1 text-xs font-semibold uppercase">
                  last run: {r.runConclusion}
                </div>
              )}
              {r.key === "pc" && status?.pc?.payload?.snapshot_error && (
                <p className="mt-1 text-xs break-words">
                  snapshot_error: {String(status.pc.payload.snapshot_error)}
                </p>
              )}
              {(r.state === "stale" || r.state === "dead") && (
                <p className="mt-2 text-xs leading-relaxed opacity-90">{r.manualRecovery}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Cloud dispatch</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(DISPATCHABLE).map(([key, d]) => (
            <button
              key={key}
              disabled={busy !== null}
              onClick={() =>
                post("/api/admin/dispatch",
                  { action: key, ...(d.confirm ? { confirmed: true } : {}) },
                  d.label, d.confirm)
              }
              className="rounded border border-gray-600 px-3 py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          PC commands{" "}
          <span className="text-sm font-normal text-gray-400">
            (executed by the agent within ~5 min while the PC is on)
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {["depth_pause", "depth_resume", "depth_run_now", "bot_restart", "state_sync"].map(
            (c) => (
              <button
                key={c}
                disabled={busy !== null}
                onClick={() => post("/api/admin/command", { command: c }, c)}
                className="rounded border border-gray-600 px-3 py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                {c}
              </button>
            )
          )}
          <button
            disabled={busy !== null}
            onClick={() =>
              post("/api/admin/command",
                { command: "sdf_dispatch", args: { runner: "self-hosted" } },
                "sdf_dispatch (self-hosted)",
                "Ask the PC to self-dispatch SDF on its own runner? Only useful while the PC is on.")
            }
            className="rounded border border-gray-600 px-3 py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            sdf_dispatch
          </button>
          <a href="/ondemand" className="ml-2 text-sm text-gray-400 underline">
            on-demand /analyze lives on /ondemand
          </a>
        </div>
        <div className="mt-3 max-h-48 overflow-y-auto rounded border border-gray-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="px-2 py-1">id</th>
                <th className="px-2 py-1">command</th>
                <th className="px-2 py-1">status</th>
                <th className="px-2 py-1">result</th>
              </tr>
            </thead>
            <tbody>
              {(status?.commands ?? []).map((c: any) => (
                <tr key={c.id} className="border-t border-gray-800">
                  <td className="px-2 py-1">{c.id}</td>
                  <td className="px-2 py-1">{c.command}</td>
                  <td className="px-2 py-1">{c.status}</td>
                  <td className="max-w-md truncate px-2 py-1">{c.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">KIS (real money)</h2>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-700 p-4">
          <div className="text-sm">
            {Object.entries(status?.kisVars ?? {}).map(([k, v]) => (
              <div key={k}>
                <span className="text-gray-400">{k}:</span> {String(v)}
              </div>
            ))}
            {!status?.kisVars?.KIS_HALT && (
              <div>
                <span className="text-gray-400">KIS_HALT:</span> {haltDisplay}
              </div>
            )}
          </div>
          <button
            disabled={busy !== null}
            onClick={() =>
              post("/api/admin/kis", { halt: !halted }, halted ? "resume KIS" : "HALT KIS",
                halted
                  ? "Clear KIS_HALT and let the next scheduled sync trade again?"
                  : "Set KIS_HALT=true — the next KIS syncs will refuse to trade. Confirm?")
            }
            className={`rounded px-4 py-2 font-semibold ${
              halted
                ? "border border-emerald-600 text-emerald-300 hover:bg-emerald-900/30"
                : "border border-red-600 text-red-300 hover:bg-red-900/30"
            } disabled:opacity-50`}
          >
            {halted ? "Resume KIS trading" : "HALT KIS trading"}
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent workflow runs</h2>
        <div className="max-h-64 overflow-y-auto rounded border border-gray-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="px-2 py-1">workflow</th>
                <th className="px-2 py-1">event</th>
                <th className="px-2 py-1">result</th>
                <th className="px-2 py-1">when</th>
              </tr>
            </thead>
            <tbody>
              {(status?.workflows ?? []).map((w: any, i: number) => (
                <tr key={i} className="border-t border-gray-800">
                  <td className="px-2 py-1">
                    <a href={w.html_url} target="_blank" rel="noreferrer" className="underline">
                      {w.name}
                    </a>
                  </td>
                  <td className="px-2 py-1">{w.event}</td>
                  <td className="px-2 py-1">{w.conclusion ?? w.status}</td>
                  <td className="px-2 py-1">{new Date(w.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
