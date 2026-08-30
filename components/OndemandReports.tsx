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
    OndemandIndexPayload, OndemandRequestRow, DepthReportBundle,
} from '@/lib/data-service';

const money = (v: number | null | undefined) =>
    v == null ? '—' : Math.abs(v) >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`;

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

    useEffect(() => {
        fetchOndemandIndex().then((x) => { setIndex(x); setLoaded(true); });
        fetchDepthOverlay().then((d) =>
            setDepthMeta({ generated_at: d?.generated_at ?? null, count: d?.count ?? 0 }));
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

                {!loaded && <p className="mt-8 text-[12px] text-ink-3">Loading…</p>}

                {loaded && rows.length === 0 && (
                    <p className="mt-8 text-[12.5px] text-ink-q">
                        No on-demand analyses yet — request one with <span className="font-mono">/analyze TICKER</span> on Telegram.
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
