'use client';

// Institutional Consensus Underwriting Memoranda (Charter v3.1)
// Displays verbatim multi-seed deliberations, research telemetry, and Section 12 machine contracts.

import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Micro } from '../primitives';
import { useLanguage } from '@/components/LanguageContext';
import { fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import type { DepthReportBundle } from '@/lib/data-service';

const OPEN_KEY = 'desk.transcriptsOpen';

export function TranscriptViewer({
    bundle,
    activeTab,
    onTabChange,
}: {
    bundle: DepthReportBundle | null;
    activeTab?: number;
    onTabChange?: (tab: number) => void;
}) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(true);
    const [localTab, setLocalTab] = useState(0);

    const tab = activeTab !== undefined ? activeTab : localTab;
    const setTab = onTabChange || setLocalTab;

    useEffect(() => {
        const saved = localStorage.getItem(OPEN_KEY);
        if (saved !== null) setOpen(saved === '1');
    }, []);

    const toggle = () => setOpen((v) => {
        localStorage.setItem(OPEN_KEY, v ? '0' : '1');
        return !v;
    });

    const samples = bundle?.samples ?? [];
    if (samples.length === 0) return null;
    const cur = samples[Math.min(tab, samples.length - 1)];

    const spread = bundle?.verdict?.spread_pct;
    const isEarlyStop = bundle?.verdict?.early_stop ?? (spread != null && spread <= 15);

    return (
        <section id="transcripts-section" className="mt-8 border-t border-rule-22 pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-accent" />
                    <Micro className="font-bold uppercase tracking-wider text-ink">
                        Consensus Underwriting Memoranda (Charter v3.1 Institutional Deliberation)
                    </Micro>
                    <span className="font-mono text-[11px] text-ink-3">
                        · {samples.length} Independent Seed{samples.length === 1 ? '' : 's'} Executed
                    </span>
                </div>
                <button
                    onClick={toggle}
                    className="font-mono text-[11px] text-ink-3 hover:text-ink flex items-center gap-1.5 transition-colors"
                >
                    <span>{open ? '▾ HIDE MEMORANDA' : '▸ EXPAND MEMORANDA'}</span>
                </button>
            </div>

            {open && (
                <div className="mt-4">
                    {/* Sample Selector Tabs */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-rule-14 pb-3">
                        <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mr-1">
                            Sample Runs:
                        </span>
                        {samples.map((s, i) => {
                            const sc = s.scorecard;
                            const isFailed = !s.plausible || !s.report || s.report.length === 0;
                            return (
                                <button
                                    key={s.sample}
                                    onClick={() => setTab(i)}
                                    className={clsx(
                                        'border px-3 py-1.5 font-mono text-[11px] transition-colors rounded-xs',
                                        i === tab
                                            ? 'border-accent bg-accent/15 font-bold text-accent'
                                            : isFailed
                                                ? 'border-warn/40 bg-warn/[0.03] text-warn/80 hover:border-warn hover:text-warn'
                                                : 'border-rule-24 bg-white/[0.02] text-ink-2 hover:border-rule-36 hover:text-ink',
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold">Run #{s.sample}</span>
                                        {s.iv != null && <span className="font-semibold">{fmtMoney(s.iv)}</span>}
                                        {isFailed && <span className="text-[10px] text-warn">(Token Limit)</span>}
                                        {sc?.conviction_score != null && (
                                            <span className="text-[10px] text-ink-3">
                                                · {sc.conviction_score}/15
                                            </span>
                                        )}
                                        {s.secs != null && (
                                            <span className="text-[10px] text-ink-3">
                                                · {Math.round(s.secs / 60)}m
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                        <span className="ml-auto font-mono text-[10.5px] text-ink-3">
                            {isEarlyStop ? 'Stopped early (≤15% spread tolerance satisfied)' : spread != null ? `Escalated run (Spread ${spread.toFixed(1)}%)` : ''}
                        </span>
                    </div>

                    {/* Active Run Content */}
                    {cur && (
                        <div className="mt-4">
                            {(!cur.report || cur.report.length === 0) ? (
                                <div className="p-6 border border-warn/40 bg-warn/[0.04] rounded-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-warn animate-pulse" />
                                        <span className="font-mono text-[13px] font-bold text-warn uppercase tracking-wider">
                                            Run #{cur.sample} Execution Guard Intercept
                                        </span>
                                    </div>
                                    <p className="mt-3 text-[12.5px] text-ink-2 leading-relaxed">
                                        This independent sample run was executed by the inference engine with deterministic seed perturbation, but reached the model&apos;s maximum generation context limit during deep chain-of-thought analysis before emitting the final markdown memorandum and Section 12 machine contract.
                                    </p>
                                    <div className="mt-4 flex flex-wrap items-center gap-6 font-mono text-[11px] text-ink-3 border-t border-rule-14 pt-3">
                                        <span>Plausibility Guard: <b className="text-warn">REJECTED (Plausible = False)</b></span>
                                        <span>Consensus Valuation: <b className="text-ink">Excluded from Median IV</b></span>
                                        <span>Compute Time: <b className="text-ink-2">{cur.secs ? `${Math.round(cur.secs / 60)}m` : 'Timed Out'}</b></span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Consensus Override Warning if this isolated seed conflicts with synthesized verdict */}
                                    {(() => {
                                        const v = bundle?.verdict;
                                        const price = v?.price ?? cur.iv;
                                        const individualMos = (cur.iv != null && price != null && price > 0)
                                            ? ((cur.iv - price) / price) * 100
                                            : null;
                                        const consensusMos = (v?.median_iv != null && price != null && price > 0)
                                            ? ((v.median_iv - price) / price) * 100
                                            : v?.mos_vs_median_pct ?? null;

                                        const seedWantsBuy = (individualMos != null && individualMos >= 15) || (cur.scorecard?.kelly_fraction_pct != null && cur.scorecard.kelly_fraction_pct > 0);
                                        const consensusRejectsBuy = v?.direction === 'hold' || v?.direction === 'overvalued' || !v?.size_hint;
                                        const isSevereIvVariance = cur.iv != null && v?.median_iv != null && Math.abs(cur.iv - v.median_iv) / v.median_iv > 0.20;
                                        const hasOverride = (seedWantsBuy && consensusRejectsBuy) || isSevereIvVariance;

                                        if (!hasOverride) return null;

                                        return (
                                            <div className="mb-3.5 border border-warn/40 bg-warn/[0.05] p-3.5 rounded-xs font-mono text-[11px]">
                                                <div className="flex items-center gap-2 text-warn font-bold uppercase tracking-wider">
                                                    <span className="inline-block w-2 h-2 rounded-full bg-warn animate-pulse" />
                                                    <span>Multi-Seed Deliberation Audit · Fiduciary Override</span>
                                                </div>
                                                <p className="mt-1.5 leading-relaxed text-ink-2">
                                                    This individual seed evaluated Intrinsic Value at <b className="text-ink">{fmtMoney(cur.iv)}</b> ({individualMos != null ? fmtSignedPct(individualMos) : '—'} MoS){cur.scorecard?.kelly_fraction_pct != null && cur.scorecard.kelly_fraction_pct > 0 ? <> proposing a <b className="text-pos">{cur.scorecard.kelly_fraction_pct.toFixed(1)}% Kelly allocation</b></> : null}.
                                                    In multi-seed deliberation, this thesis was <b className="text-warn">superseded by Consensus</b>: Median IV is <b className="text-ink">{fmtMoney(v?.median_iv)}</b> ({consensusMos != null ? fmtSignedPct(consensusMos) : '—'} MoS), assigning stance <b className="text-accent uppercase">{v?.direction}</b> with <b className="text-ink">{v?.size_hint?.toUpperCase() ?? 'NONE'}</b> allocation.
                                                </p>
                                            </div>
                                        );
                                    })()}

                                    {!cur.plausible && cur.reasons && cur.reasons.length > 0 && (
                                        <p className="mb-3 text-[11px] text-warn">
                                            Rejected by plausibility guards: {cur.reasons.join('; ')} — excluded from consensus median.
                                        </p>
                                    )}

                                    <pre className="scroll-dark wrap-anywhere mt-2 max-h-[460px] min-w-0 overflow-y-auto border border-rule-18 bg-[#0d0f12] px-4 py-3.5 font-mono text-[11px] leading-[1.7] text-ink-q lg:max-h-[520px] lg:px-6 lg:py-5 lg:text-[12px]">
                                        {cur.report}
                                    </pre>
                                </>
                            )}
                        </div>
                    )}

                    <Micro className="mt-2.5 block text-ink-3">
                        Charter v3.1 Institutional Underwriting Memorandum · Verbatim primary-source evidence, SEC filings citations, and Section 12 execution contract.
                    </Micro>
                </div>
            )}
        </section>
    );
}
