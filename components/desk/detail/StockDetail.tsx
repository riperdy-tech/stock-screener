'use client';

// Ticker page. Left column is the AI's case (verdict, band, stats, thesis,
// evidence); right column is the supporting quant context (reverse DCF, factor
// filter). Transcripts run full-width underneath.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Bar, Micro, Tag } from '../primitives';
import { BandChartHero } from './BandChartHero';
import { TranscriptViewer } from './TranscriptViewer';
import { Rs2AnalysisPanel } from '@/components/Rs2AnalysisPanel';
import { fetchDepthReport, type DepthReportBundle } from '@/lib/data-service';
import { headlineFromSamples } from '@/lib/desk/thesis';
import { gapColor, sizeTone, verdictTone } from '@/lib/desk/tone';
import { fmtMcap, fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import { buildRows, type DeskRow } from '@/lib/desk/rankings';
import { useDeskData } from '@/lib/desk/useDeskData';
import { Shell } from '../Shell';
import { useLanguage } from '@/components/LanguageContext';

const FACTORS: [string, string, string][] = [
    ['value', 'Value', '#5a9b6d'],
    ['quality', 'Quality', '#6b93c4'],
    ['momentum', 'Momentum', '#cfa14e'],
    ['lowvol', 'Low vol', '#9a83c2'],
    ['revisions', 'Revisions', '#c2798f'],
];

function DepthStatRow({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const d = row.depth!;
    const tone = verdictTone(d.direction);
    const size = sizeTone(d.size_hint, d.n_basis);
    const sizable = d.direction === 'undervalued' && !!d.size_hint;

    return (
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
            <div>
                <Micro>{t('statMedianIv')}</Micro>
                <div className="mt-1 font-mono text-[19px] font-semibold text-ink">
                    {d.median_iv != null ? fmtMoney(d.median_iv, 0) : '—'}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: gapColor(d.mos_vs_median_pct, d.direction) }}>
                    {fmtSignedPct(d.mos_vs_median_pct)} vs price
                </div>
            </div>

            <div>
                <Micro>{t('statRunSpread')}</Micro>
                <div className="mt-1 font-mono text-[19px] font-semibold text-ink">
                    {d.spread_pct != null ? `${d.spread_pct.toFixed(1)}%` : 'n/a'}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-3">
                    {d.spread_pct == null ? 'only one run to compare'
                        : d.spread_pct < 10 ? 'runs agree tightly'
                            : d.spread_pct < 30 ? 'runs disagree on pace'
                                : 'runs disagree widely'}
                </div>
            </div>

            <div>
                <Micro>{t('statSizeHint')}</Micro>
                <div className="mt-1 text-[16px] font-extrabold" style={{ color: sizable ? size.color : '#c3bfb5' }}>
                    {sizable ? size.label : '—'}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-3">
                    {sizable ? size.note : 'no allocation — the price is not below the band'}
                </div>
            </div>

            <div>
                <Micro>{t('statPlausible')}</Micro>
                <div className="mt-1 font-mono text-[19px] font-semibold text-ink">
                    {d.n_basis}<span className="text-[12px] text-ink-3">/{d.samples_run ?? 3}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-3">
                    {(d.samples_run ?? 3) - d.n_basis === 0 ? 'none discarded'
                        : `${(d.samples_run ?? 3) - d.n_basis} rejected by the guards`}
                </div>
            </div>

        </div>
    );
}

function ReverseDcf({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const v = row.val;
    if (!v) {
        return (
            <div>
                <Micro className="block">{t('dcfTitle')}</Micro>
                <p className="mt-3 text-[11.5px] text-ink-3">No reverse-DCF model for this name.</p>
            </div>
        );
    }
    const implied = v.implied_growth != null ? v.implied_growth * 100 : null;
    const delivered = v.hist_revenue_cagr_5y != null ? v.hist_revenue_cagr_5y * 100 : null;
    const gap = v.expectations_gap_pts;
    const good = gap != null && gap < 0;

    return (
        <div>
            <Micro className="block">{t('dcfTitle')}</Micro>

            <div className="mt-3.5 space-y-2.5">
                <div>
                    <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-[11.5px] text-ink-2">{t('dcfRequires')}</span>
                        <span className="font-mono text-[12px] font-semibold text-ink">
                            {implied != null ? `${implied.toFixed(1)}%` : '—'}
                        </span>
                    </div>
                    <Bar pct={implied != null ? Math.min(100, (implied / 35) * 100 + 4) : 0} color="#d3cfc5" height={8} />
                </div>
                <div>
                    <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-[11.5px] text-ink-2">{t('dcfDelivered')}</span>
                        <span className="font-mono text-[12px] font-semibold" style={{ color: 'oklch(0.75 0.11 155)' }}>
                            {delivered != null ? `${delivered.toFixed(1)}%` : '—'}
                        </span>
                    </div>
                    <Bar pct={delivered != null ? Math.min(100, (delivered / 15) * 100) : 0} color="oklch(0.75 0.11 155)" height={8} />
                </div>
            </div>

            {gap != null && (
                <p className="mt-3 text-[12px] text-ink-2">
                    <span className="font-mono font-bold" style={{ color: good ? 'oklch(0.75 0.11 155)' : '#cfa14e' }}>
                        Gap: {gap > 0 ? '+' : '−'}{Math.abs(gap).toFixed(1)} pts
                    </span>{' '}
                    — {good
                        ? 'you are being paid not to believe the growth story.'
                        : 'the price needs an acceleration nobody has demonstrated yet.'}
                </p>
            )}
            {v.verdict && <p className="mt-2 text-[11.5px] italic text-ink-3">{v.verdict}</p>}
            {v.assumptions && (
                <Micro className="mt-2 block normal-case tracking-normal text-ink-3">
                    {v.assumptions.base_cf_kind} FY{v.assumptions.fiscal_year} · WACC {v.assumptions.wacc.toFixed(1)}%
                    {' · '}terminal {(v.assumptions.terminal_growth * 100).toFixed(1)}%
                    {' · '}{v.assumptions.stage1_years}y stage 1 + {v.assumptions.fade_years}y fade
                </Micro>
            )}
        </div>
    );
}

function QuantFilterPanel({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const f = row.fct;
    const z = f.fct_z ?? {};
    const haircuts = f.fct_haircuts ?? {};
    return (
        <div className="border-t border-rule-14 pt-5">
            <div className="flex items-baseline justify-between gap-4">
                <Micro>{t('quantPanelTitle')}</Micro>
                <span className="font-mono text-[12px] text-ink">
                    <b>{f.fct_composite != null ? f.fct_composite.toFixed(1) : '—'}</b> · rank #{f.fct_rank ?? '—'}
                </span>
            </div>

            <div className="mt-3.5 space-y-2">
                {FACTORS.map(([key, label, color]) => {
                    const raw = z[key];
                    // z-scores run roughly −3..+3; map onto the bar's 0–100 track.
                    const pct = raw == null ? 0 : Math.max(0, Math.min(100, (raw + 3) / 6 * 100));
                    return (
                        <div key={key} className="flex items-center gap-3 text-[11px]">
                            <span className="w-[74px] shrink-0 text-ink-2">{label}</span>
                            <span className="min-w-0 flex-1"><Bar pct={pct} color={color} /></span>
                            <span className="w-[38px] shrink-0 text-right font-mono text-ink-2">
                                {raw == null ? '—' : raw.toFixed(2)}
                            </span>
                        </div>
                    );
                })}
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
                Sector-neutral, equal-weighted z-scores. Haircuts: survivability ×{(haircuts.survivability ?? 1).toFixed(2)},
                data quality ×{(haircuts.data_quality ?? 1).toFixed(2)}, forensic ×{(haircuts.forensic ?? 1).toFixed(2)}.
                The quant filter decides what the AI reads — it no longer scores the verdict.
            </p>
        </div>
    );
}

function EvidenceChips({ row, entryDate }: { row: DeskRow; entryDate: string | null }) {
    const gpr = row.overlay?.gpr;
    const forensic = (row.fct.fct_haircuts ?? {}).forensic;
    const demand = row.overlay?.informed_demand;
    const chips: React.ReactNode[] = [];

    if (gpr?.gpr_level !== undefined) {
        const label = gpr.gpr_level === 0 ? 'GPR 0 — NONE' : `GPR ${gpr.gpr_level} — ${(gpr.channels ?? []).join(', ') || 'FLAGGED'}`;
        chips.push(<Tag key="gpr">{label}</Tag>);
    }
    chips.push(
        <Tag key="forensic" className={forensic != null && forensic < 1 ? 'border-warn/50 text-warn' : undefined}>
            {forensic != null && forensic < 1 ? `FORENSIC HAIRCUT ×${forensic.toFixed(2)}` : 'NO FORENSIC FLAGS'}
        </Tag>,
    );
    if (demand === 1) chips.push(<Tag key="dem" className="border-pos/40 text-pos">▲ INSIDERS NET-BUYING</Tag>);
    if (demand === -1) chips.push(<Tag key="dem" className="border-neg/40 text-neg">▼ INSIDERS SELLING</Tag>);
    if (row.depth?.date) chips.push(<Tag key="run">DEPTH RUN {row.depth.date}</Tag>);
    if (entryDate) chips.push(<Tag key="entry">HELD SINCE {entryDate}</Tag>);

    return <div className="mt-4 flex flex-wrap gap-2">{chips}</div>;
}

export function StockDetail({ ticker, from }: { ticker: string; from?: string }) {
    const { t } = useLanguage();
    const router = useRouter();
    const data = useDeskData();
    const [bundle, setBundle] = useState<DepthReportBundle | null>(null);

    useEffect(() => {
        let alive = true;
        fetchDepthReport(ticker).then((b) => { if (alive) setBundle(b); });
        return () => { alive = false; };
    }, [ticker]);

    const rows = useMemo(
        () => buildRows({
            factor: data.factor, depth: data.depth, valuations: data.valuations,
            overlay: data.overlay, stockInfo: data.stockInfo,
        }),
        [data.factor, data.depth, data.valuations, data.overlay, data.stockInfo],
    );
    const row = rows.find((r) => r.ticker === ticker);

    const headline = useMemo(() => headlineFromSamples(bundle?.samples), [bundle]);
    const runIvs = useMemo(
        () => (bundle?.samples ?? []).filter((s) => s.plausible && s.iv != null).map((s) => s.iv as number),
        [bundle],
    );

    // Entry date, if this name is held in any paper book.
    const entryDate = useMemo(() => {
        const books = data.ledgers?.ledgers ?? {};
        for (const key of ['equal_llm', 'equal', 'plan', 'plan2', 'plan3']) {
            const h = books[key]?.state?.holdings?.[ticker];
            if (h?.entry_date) return h.entry_date as string;
        }
        return null;
    }, [data.ledgers, ticker]);

    // Returning to Rankings restores the lens the reader clicked from.
    const backHref = from === 'track' ? '/?tab=track'
        : from === 'port' ? '/?tab=portfolio'
            : `/?tab=rankings&lens=${from === 'quant' || from === 'compare' ? from : 'ai'}`;
    const backLabel = from === 'track' ? '← Track Record' : from === 'port' ? '← Portfolio' : `← ${t('detailBack')}`;

    const shell = (children: React.ReactNode) => (
        <Shell tab={null} factor={data.factor} depthMeta={data.depthMeta} ledgers={data.ledgers} loading={data.loading}>
            {children}
        </Shell>
    );

    if (!row) {
        return shell(
            <div className="py-16">
                <Link href={backHref} className="font-mono text-[12px] text-ink-2 hover:text-ink">{backLabel}</Link>
                <p className="mt-6 text-[14px] text-ink-2">
                    {data.loading ? 'Loading…' : `${ticker} is not in the current scored universe.`}
                </p>
            </div>,
        );
    }

    const d = row.depth;
    const tone = verdictTone(d?.direction);
    const price = d?.price ?? row.info?.price;

    return shell(
        <div>
            {/* Title bar */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule-14 py-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <button onClick={() => router.push(backHref)} className="text-[12px] text-ink-2 hover:text-ink">
                        {backLabel}
                    </button>
                    <span className="text-[20px] font-extrabold text-ink">{row.ticker}</span>
                    <span className="text-[13px] font-semibold text-ink-2">{row.info?.name ?? ''}</span>
                    <Micro className="font-mono">
                        {(row.info?.sector ?? '').toUpperCase()} · {fmtMcap(row.info?.marketCap)}
                    </Micro>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    <span className="font-mono text-[16px] font-semibold text-ink">{fmtMoney(price)}</span>
                    <a
                        href={`https://www.tradingview.com/symbols/${row.ticker}/`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-ink-2 hover:text-ink"
                    >
                        TradingView ↗
                    </a>
                    <Link
                        href={`/lenses?ticker=${row.ticker}`}
                        className="border border-accent/60 px-4 py-1.5 text-[12.5px] font-bold text-accent hover:bg-accent/[0.12]"
                    >
                        {t('detailAskAi')}
                    </Link>
                </div>
            </div>

            {/* Two-column body */}
            <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[1.35fr_1fr]">
                <div className="min-w-0 border-rule-14 py-6 lg:border-r lg:pr-8">
                    <Micro className="block">
                        RS2 local-LLM analysis
                        {d?.date ? ` · depth run ${d.date}` : ''}
                        {d ? ` · ${d.samples_run ?? 3} seeded runs` : ''}
                    </Micro>

                    <h1 className="mt-3 flex flex-wrap items-baseline gap-x-3">
                        <span className="text-[26px] font-extrabold tracking-[.02em]" style={{ color: tone.color }}>
                            {tone.keys.label ? t(tone.keys.label) : tone.label}
                        </span>
                        <span className="text-[13.5px] text-ink-q">
                            — {tone.keys.subline ? t(tone.keys.subline) : tone.subline}
                        </span>
                    </h1>

                    {d ? <BandChartHero verdict={d} runIvs={runIvs} /> : (
                        <p className="mt-5 text-[12.5px] text-ink-2">
                            This name has not been through a depth run yet. The quant filter ranked it
                            #{row.fct.fct_rank ?? '—'}; the AI has not read its filings.
                        </p>
                    )}

                    {d && <DepthStatRow row={row} />}

                    {d && (
                        <p className="mt-5 text-[11px] leading-relaxed text-ink-3">
                            Band-direction scheme: the model analyzes the full fact pack in {d.samples_run ?? 3} independent
                            seeded runs; the verdict is where today&apos;s price sits relative to the whole band of its
                            valuations. Spread sets position size, not pass/fail.
                        </p>
                    )}

                    {headline && (
                        <blockquote className="mt-5 border-l-2 border-accent bg-white/[0.03] px-5 py-4">
                            <Micro className="mb-2 block">
                                {t('detailHeadlineLabel')}{headline.sample ? ` · sample ${headline.sample}` : ''}
                            </Micro>
                            <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-ink-q">
                                {headline.bullets.map((b, i) => <li key={i}>{b}</li>)}
                            </ul>
                            {headline.action && (
                                <p className="mt-2.5 text-[12.5px] font-semibold text-ink">{t('detailAction')}: {headline.action}</p>
                            )}
                        </blockquote>
                    )}

                    <EvidenceChips row={row} entryDate={entryDate} />

                    {row.vetoed && (
                        <p className="mt-4 text-[12px] text-neg">
                            ■ VETOED — {row.vetoReason ?? 'hard avoid'}. Disqualified before the depth run.
                        </p>
                    )}
                </div>

                <div className="flex min-w-0 flex-col gap-6 border-t border-rule-14 py-6 lg:border-t-0 lg:pl-0">
                    <ReverseDcf row={row} />
                    <QuantFilterPanel row={row} />
                </div>
            </div>

            <TranscriptViewer bundle={bundle} />

            {/* Earlier RS2 runs: full analysis, research brief and raw stages. */}
            <section className="mt-8 min-w-0 border-t border-rule-22 pt-5">
                <Micro className="mb-3 block font-semibold text-ink">Analysis history</Micro>
                <Rs2AnalysisPanel symbol={row.ticker} displayTicker={row.ticker} hideDepth />
            </section>
        </div>,
    );
}
