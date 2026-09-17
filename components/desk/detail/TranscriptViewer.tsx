'use client';

// Institutional Consensus Underwriting Memoranda (Charter v3.1)
// Displays verbatim multi-seed deliberations, research telemetry, and Section 12 machine contracts.

import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Micro } from '../primitives';
import { useLanguage } from '@/components/LanguageContext';
import { fmtMoney } from '@/lib/desk/format';
import type { DepthReportBundle } from '@/lib/data-service';

const OPEN_KEY = 'desk.transcriptsOpen';

export function TranscriptViewer({ bundle }: { bundle: DepthReportBundle | null }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(true);
    const [tab, setTab] = useState(0);

    useEffect(() => {
        const saved = localStorage.getItem(OPEN_KEY);
        if (saved !== null) setOpen(saved === '1');
    }, []);

    const toggle = () => setOpen((v) => {
        localStorage.setItem(OPEN_KEY, v ? '0' : '1');
        return !v;
    });

    const samples = (bundle?.samples ?? []).filter((s) => s.report && s.report.length > 0);
    if (samples.length === 0) return null;
    const cur = samples[Math.min(tab, samples.length - 1)];

    const spread = bundle?.verdict?.spread_pct;
    const isEarlyStop = bundle?.verdict?.early_stop ?? (spread != null && spread <= 15);

    return (
        <section className="mt-8 border-t border-rule-22 pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-accent" />
                    <Micro className="font-bold uppercase tracking-wider text-ink">
                        Consensus Underwriting Memoranda (Charter v3.1 Institutional Deliberation)
                    </Micro>
                    <span className="font-mono text-[11px] text-ink-3">
                        · {samples.length} Independent Seed{samples.length === 1 ? '' : 's'}
                    </span>
                </div>
                <button
                    onClick={toggle}
                    className="font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-ink-2 hover:text-ink"
                >
                    {open ? `▾ ${t('transcriptsHide')}` : `▸ ${t('transcriptsShow')}`}
                </button>
            </div>

            {open && (
                <>
                    {/* Consensus Telemetry Bar */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-rule-14 bg-white/[0.02] px-4 py-2 text-[11.5px] font-mono">
                        <div className="flex items-center gap-4 text-ink-2">
                            <span>Run ID: <b className="text-ink">{bundle?.run ?? '—'}</b></span>
                            <span>Model: <b className="text-ink">{bundle?.verdict?.model ?? 'rs2-analyst-deep-mtp5'}</b></span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-ink-3">Consensus Spread:</span>
                            <span className={clsx('font-bold', spread != null && spread <= 15 ? 'text-pos' : 'text-accent')}>
                                {spread != null ? `${spread.toFixed(1)}%` : 'Single Seed'}
                            </span>
                            <span className="text-ink-3">
                                {isEarlyStop ? '(Level 0 Early-Stop ≤15%)' : samples.length >= 3 ? '(Escalated Deliberation n=3)' : ''}
                            </span>
                        </div>
                    </div>

                    {/* Sample Selector Tabs */}
                    <div className="mt-3.5 flex flex-wrap gap-2">
                        {samples.map((s, i) => {
                            const sc = s.scorecard;
                            return (
                                <button
                                    key={s.sample}
                                    onClick={() => setTab(i)}
                                    className={clsx(
                                        'border px-3.5 py-2 font-mono text-[11.5px] transition-colors',
                                        i === tab
                                            ? 'border-accent bg-accent/[0.1] font-semibold text-accent'
                                            : 'border-rule-24 text-ink-2 hover:border-rule-18 hover:text-ink',
                                        !s.plausible && 'line-through decoration-neg/60',
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>Sample {s.sample}</span>
                                        {s.iv != null && <span className="font-bold">{fmtMoney(s.iv)}</span>}
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
                    </div>

                    {!cur.plausible && cur.reasons?.length > 0 && (
                        <p className="mt-3 text-[11px] text-warn">
                            Rejected by plausibility guards: {cur.reasons.join('; ')} — excluded from consensus median.
                        </p>
                    )}

                    {/* Verbatim Memorandum */}
                    <pre className="scroll-dark wrap-anywhere mt-3.5 max-h-[380px] min-w-0 overflow-y-auto border border-rule-18 bg-[#0d0f12] px-4 py-3.5 font-mono text-[11px] leading-[1.7] text-ink-q lg:max-h-[460px] lg:px-6 lg:py-5 lg:text-[12px]">
                        {cur.report}
                    </pre>

                    <Micro className="mt-2.5 block text-ink-3">
                        Charter v3.1 Institutional Underwriting Memorandum · Verbatim primary-source evidence, SEC filings citations, and Section 12 execution contract.
                    </Micro>
                </>
            )}
        </section>
    );
}
