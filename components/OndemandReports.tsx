'use client';

// On-demand analyses — operator-requested one-shot runs (Telegram /analyze or CLI).
// These verdicts live in DEDICATED data files (ondemand_index.json / ondemand_reports/)
// and are deliberately excluded from the rankings, the overlay and the paper
// portfolios: they exist so any ticker — including quant-screen fails — can be
// inspected without joining the tracked book.

import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Shell } from '@/components/desk/Shell';
import { Micro } from '@/components/desk/primitives';
import { BandChartHero } from '@/components/desk/detail/BandChartHero';
import { TranscriptViewer } from '@/components/desk/detail/TranscriptViewer';
import { verdictTone, sizeTone } from '@/lib/desk/tone';
import {
    fetchOndemandIndex, fetchOndemandReport, fetchDepthOverlay,
    OndemandIndexPayload, OndemandRequestRow, OndemandQueueRow, DepthReportBundle,
} from '@/lib/data-service';

const money = (v: number | null | undefined) =>
    v == null ? '—' : Math.abs(v) >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`;

// Desk form tokens (MyPortfolio precedent) — rules and whitespace, no cards.
const field = 'border border-rule-24 bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent';
const actionBtn = 'border border-accent/60 px-3 py-1.5 text-[12px] font-bold text-accent hover:bg-accent/[0.12] disabled:opacity-40';

function RequestForm({ onSubmitted }: { onSubmitted: () => void }) {
    const [ticker, setTicker] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

    const submit = async () => {
        if (!ticker.trim() || !password) {
            setNote({ ok: false, text: 'Ticker and password required.' });
            return;
        }
        setBusy(true); setNote(null);
        try {
            const res = await fetch('/api/ondemand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, ticker: ticker.trim() }),
            });
            const data = await res.json();
            const ok = res.ok;
            setNote({ ok, text: data.message ?? data.error ?? 'Unknown response' });
            if (ok) { setTicker(''); setPassword(''); onSubmitted(); }
        } catch (e: any) {
            setNote({ ok: false, text: `Request failed: ${e.message ?? e}` });
        } finally {
            setBusy(false);
        }
    };

    const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit(); };

    return (
        <div className="mt-6 border-t border-rule-22 pt-5">
            <Micro className="font-semibold text-ink">Request an analysis</Micro>
            <Micro className="mt-0.5 block text-ink-3">
                Runs on the operator&apos;s PC (GPU time, not a cloud call) — picked up within
                about a minute, verdict in ~1–3 hours.
            </Micro>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                    value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    onKeyDown={onKey} placeholder="TICKER" maxLength={10}
                    className={clsx(field, 'w-28 uppercase')}
                />
                <input
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={onKey} placeholder="Password" type="password"
                    className={clsx(field, 'w-36')}
                />
                <button onClick={submit} disabled={busy} className={actionBtn}>
                    {busy ? 'Queuing…' : 'Analyze'}
                </button>
            </div>
            {note && (
                <Micro className={clsx('mt-2 block', note.ok ? 'text-pos' : 'text-neg')}>
                    {note.text}
                </Micro>
            )}
        </div>
    );
}

function QueueStrip({ queue }: { queue: OndemandQueueRow[] }) {
    if (queue.length === 0) return null;
    return (
        <div className="mt-4">
            {queue.map((q) => (
                <div key={q.id} className="flex flex-wrap items-baseline gap-x-4 border-b border-rule-14 py-1.5">
                    <span className="w-16 font-mono text-[11px] font-bold text-ink">{q.ticker}</span>
                    <span className={clsx('font-mono text-[11px]',
                        q.status === 'handled' ? 'text-pos'
                            : q.status === 'failed' ? 'text-neg' : 'text-warn')}>
                        {q.status}
                    </span>
                    <Micro className="font-mono">{q.requested_at?.slice(0, 16).replace('T', ' ')}</Micro>
                    {q.message && <Micro className="text-ink-3">{q.message}</Micro>}
                </div>
            ))}
        </div>
    );
}

function RequestCard({ row, latest, onOpen }: {
    row: OndemandRequestRow; latest: boolean; onOpen: (t: string) => void;
}) {
    const tone = verdictTone(row.direction);
    const size = sizeTone(row.size_hint);
    return (
        <button
            onClick={() => latest && onOpen(row.ticker)}
            disabled={!latest}
            className={clsx(
                'flex w-full flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-rule-14 px-1 py-3 text-left',
                latest ? 'hover:bg-track-12' : 'opacity-45 cursor-default',
            )}
        >
            <span className="w-16 font-mono text-[13px] font-bold text-ink">{row.ticker}</span>
            <Micro className="w-24 font-mono">{row.date ?? '—'}</Micro>
            <span className="w-28 font-mono text-[11px] font-semibold" style={{ color: tone.color }}>
                {tone.label}
            </span>
            <span className="font-mono text-[11.5px] text-ink-q">
                band {money(row.iv_band_low)}–{money(row.iv_band_high)} vs {money(row.price)}
            </span>
            {row.spread_pct != null && (
                <Micro className="font-mono">spread {row.spread_pct}%</Micro>
            )}
            <span className="ml-auto font-mono text-[11px]" style={{ color: size.color }}>{size.label}</span>
            {!latest && <Micro className="w-full text-ink-3">superseded by a newer run</Micro>}
        </button>
    );
}

export function OndemandReports() {
    const [index, setIndex] = useState<OndemandIndexPayload | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [sel, setSel] = useState<string | null>(null);
    const [bundle, setBundle] = useState<DepthReportBundle | null>(null);
    const [bundleMissing, setBundleMissing] = useState(false);
    const [depthMeta, setDepthMeta] = useState<{ generated_at: string | null; count: number }>();
    const [queue, setQueue] = useState<OndemandQueueRow[]>([]);

    const loadQueue = () => {
        fetch('/api/ondemand', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : []))
            .then((rows) => setQueue(Array.isArray(rows) ? rows : []))
            .catch(() => { });
    };

    useEffect(() => {
        fetchOndemandIndex().then((x) => { setIndex(x); setLoaded(true); });
        fetchDepthOverlay().then((d) =>
            setDepthMeta({ generated_at: d?.generated_at ?? null, count: d?.count ?? 0 }));
        loadQueue();
        const iv = setInterval(loadQueue, 20000);
        return () => clearInterval(iv);
    }, []);

    const open = (t: string) => {
        setSel(t); setBundle(null); setBundleMissing(false);
        fetchOndemandReport(t).then((b) => { setBundle(b); setBundleMissing(!b); });
    };

    const requests = index?.requests ?? [];
    // The list is newest-first; only a ticker's first (newest) row opens the report —
    // the per-ticker bundle always holds the newest run.
    const seen = new Set<string>();
    const rows = requests.map((r) => {
        const latest = !seen.has(r.ticker);
        seen.add(r.ticker);
        return { row: r, latest };
    });

    const verdict = bundle?.verdict;
    const runIvs = (bundle?.samples ?? [])
        .filter((s) => s.iv != null && s.plausible && !s.truncated)
        .map((s) => s.iv as number);

    return (
        <Shell tab={null} depthMeta={depthMeta}>
            <div className="pt-8">
                <h1 className="text-[16px] font-extrabold uppercase tracking-section">On-Demand Analyses</h1>
                <Micro className="mt-1 block max-w-2xl text-ink-3">
                    Operator-requested one-shot runs (any ticker, including quant-screen fails).
                    Excluded from the rankings, the AI lens and the paper portfolios by design.
                </Micro>

                <RequestForm onSubmitted={loadQueue} />
                <QueueStrip queue={queue} />

                {!loaded && <p className="mt-8 text-[12px] text-ink-3">Loading…</p>}

                {loaded && rows.length === 0 && (
                    <p className="mt-8 text-[12.5px] text-ink-q">
                        No on-demand analyses yet — request one with the form above, or{' '}
                        <span className="font-mono">/analyze TICKER</span> on Telegram.
                    </p>
                )}

                {rows.length > 0 && (
                    <div className="mt-6 border-t border-rule-22">
                        {rows.map(({ row, latest }, i) => (
                            <RequestCard key={`${row.ticker}-${row.consensus_dir ?? i}`} row={row} latest={latest} onOpen={open} />
                        ))}
                    </div>
                )}

                {sel && (
                    <section className="mt-10 border-t border-rule-22 pt-6">
                        <div className="flex items-baseline justify-between gap-4">
                            <h2 className="font-mono text-[15px] font-bold text-ink">{sel}</h2>
                            <button onClick={() => setSel(null)} className="font-mono text-[11px] text-ink-2 hover:text-ink">
                                CLOSE ✕
                            </button>
                        </div>
                        {bundleMissing && (
                            <p className="mt-4 text-[12px] text-warn">
                                Report not yet published for this run — it lands with the next publish cycle.
                            </p>
                        )}
                        {verdict && (
                            <>
                                <Micro className="mt-2 block font-mono">
                                    {verdict.date ?? ''} · {verdict.model ?? ''} · {bundle?.run ?? ''}
                                </Micro>
                                {verdict.iv_band_low != null && (
                                    <BandChartHero verdict={verdict} runIvs={runIvs} />
                                )}
                                <TranscriptViewer bundle={bundle} />
                            </>
                        )}
                    </section>
                )}
            </div>
        </Shell>
    );
}
