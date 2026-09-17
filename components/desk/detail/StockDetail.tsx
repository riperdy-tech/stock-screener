'use client';

// Ticker page. Left column is the AI's case (verdict, band, stats, thesis,
// evidence); right column is the supporting context (key financials, factor
// filter). Transcripts run full-width underneath.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Bar, Micro, Tag } from '../primitives';
import { BandChartHero } from './BandChartHero';
import { TranscriptViewer } from './TranscriptViewer';
import { Rs2AnalysisPanel } from '@/components/Rs2AnalysisPanel';
import { fetchDepthReport, type DepthReportBundle, type DepthVerdict } from '@/lib/data-service';
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

function InstitutionalContractCard({ d, bundle }: { d: DepthVerdict; bundle: DepthReportBundle | null }) {
    const sc = d.scorecard ?? bundle?.scorecard;
    const conviction = d.conviction_score ?? sc?.median_conviction_score;
    const quality = d.business_quality_moat ?? sc?.median_quality_moat;
    const kelly = d.kelly_fraction_pct ?? sc?.median_kelly_fraction_pct;
    const skew = d.asymmetric_payoff_skew ?? sc?.asymmetric_payoff_skew;
    const bullIv = d.bull_iv ?? sc?.median_bull_iv;
    const bearIv = d.bear_iv ?? sc?.median_bear_iv;
    const tranches = d.reentry_tranches ?? sc?.reentry_tranches;
    const triggers = d.thesis_invalidation_triggers ?? sc?.thesis_invalidation_triggers ?? [];

    if (conviction == null && quality == null && !triggers.length) {
        return null;
    }

    return (
        <div className="mt-6 border border-rule-18 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-14 pb-2.5">
                <Micro className="font-bold text-accent">Institutional Underwriting Contract (Section 12)</Micro>
                <Micro className="text-ink-3">Charter v3.1 · Anti-Anchored Multi-Scenario</Micro>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                    <Micro className="block text-ink-3">Conviction</Micro>
                    <div className="mt-1 font-mono text-[17px] font-bold text-ink">
                        {conviction != null ? `${conviction} / 15` : '—'}
                    </div>
                    <div className="text-[11px] text-ink-3">
                        {conviction != null && conviction >= 12 ? 'High conviction' : conviction != null && conviction >= 9 ? 'Core underwriting' : 'Speculative / Watch'}
                    </div>
                </div>

                <div>
                    <Micro className="block text-ink-3">Moat / Quality</Micro>
                    <div className="mt-1 font-mono text-[17px] font-bold text-ink">
                        {quality != null ? `${quality} / 5.0` : '—'}
                    </div>
                    <div className="text-[11px] text-ink-3">
                        {quality != null && quality >= 4 ? 'Wide moat rail' : quality != null && quality >= 3 ? 'Narrow moat' : 'Commodity / Low barrier'}
                    </div>
                </div>

                <div>
                    <Micro className="block text-ink-3">Half-Kelly Size</Micro>
                    <div className="mt-1 font-mono text-[17px] font-bold text-ink">
                        {kelly != null ? `${kelly.toFixed(1)}%` : '—'}
                    </div>
                    <div className="text-[11px] text-ink-3">Portfolio limit cap</div>
                </div>

                <div>
                    <Micro className="block text-ink-3">Payoff Skew</Micro>
                    <div className="mt-1 font-mono text-[17px] font-bold text-ink">
                        {skew != null ? `${skew.toFixed(2)}x` : '—'}
                    </div>
                    <div className="text-[11px] text-ink-3">Bull upside vs Bear risk</div>
                </div>
            </div>

            {(bullIv != null || bearIv != null || tranches) && (
                <div className="mt-4 border-t border-rule-10 pt-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {(bullIv != null || bearIv != null) && (
                            <div>
                                <Micro className="block text-ink-3">Scenario Valuation Distribution</Micro>
                                <div className="mt-1 flex items-baseline gap-3 font-mono text-[12.5px]">
                                    {bearIv != null && <span>Bear: <b className="text-neg">{fmtMoney(bearIv)}</b></span>}
                                    {d.median_iv != null && <span>Base: <b className="text-ink">{fmtMoney(d.median_iv)}</b></span>}
                                    {bullIv != null && <span>Bull: <b className="text-pos">{fmtMoney(bullIv)}</b></span>}
                                </div>
                            </div>
                        )}
                        {tranches && (tranches.tranche_1_starter != null || tranches.tranche_2_core != null) && (
                            <div>
                                <Micro className="block text-ink-3">Re-Entry Tranche Limits</Micro>
                                <div className="mt-1 flex items-baseline gap-3 font-mono text-[12.5px] text-ink">
                                    {tranches.tranche_1_starter != null && <span>Starter: <b>{fmtMoney(tranches.tranche_1_starter)}</b></span>}
                                    {tranches.tranche_2_core != null && <span>Core: <b>{fmtMoney(tranches.tranche_2_core)}</b></span>}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {triggers.length > 0 && (
                <div className="mt-4 border-t border-rule-10 pt-3">
                    <Micro className="block text-warn">Thesis Invalidation Triggers (Immediate Stop / Re-underwrite)</Micro>
                    <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-ink-q">
                        {triggers.map((trig, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                                <span className="shrink-0 text-warn">⚠</span>
                                <span>{trig}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/**
 * Key financials — the top of the right column. Price and market cap moved here
 * out of the title bar, so the supporting-context column opens with the numbers
 * a reader checks first rather than with a model output.
 *
 * Every metric comes from the screener payload and is sparsely populated
 * (roughly 65–99% depending on the field), so each cell null-guards and the
 * whole row disappears when nothing in it resolved.
 */
function KeyFinancials({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const m = row.info?.metrics;
    const price = row.depth?.price ?? row.info?.price;
    const pe = m?.epsTtm != null && m.epsTtm > 0 && price ? price / m.epsTtm : null;
    const fwdPe = m?.forwardEpsEstimate != null && m.forwardEpsEstimate > 0 && price
        ? price / m.forwardEpsEstimate : null;
    // OCF minus capex — the screener stores capex as a negative number.
    const fcf = m?.ocf != null && m?.capex != null ? m.ocf + m.capex : null;

    // The four ratio fields arrive already scaled to percentage points.
    const pts = (v: number | null | undefined, digits = 1) =>
        v == null ? null : `${v.toFixed(digits)}%`;
    const mult = (v: number | null | undefined) => (v == null ? null : `${v.toFixed(2)}x`);

    const cells: [string, string | null, string?][] = [
        [t('kfPe'), pe != null ? pe.toFixed(1) : null],
        [t('kfFwdPe'), fwdPe != null ? fwdPe.toFixed(1) : null],
        [t('kfPs'), mult(m?.priceToSales)],
        [t('kfPb'), mult(m?.priceToBook)],
        [t('kfPeg'), mult(m?.pegRatio)],
        [t('kfRevGrowth'), pts(m?.revenueGrowth), m?.revenueGrowth != null && m.revenueGrowth > 0 ? 'growth' : undefined],
        [t('kfGrossMargin'), pts(m?.grossMargin)],
        [t('kfRoic'), pts(m?.roic), m?.roic != null && m.roic >= 15 ? 'growth' : undefined],
        [t('kfFcf'), fcf != null ? fmtMcap(fcf) : null, fcf != null && fcf < 0 ? 'bad' : undefined],
        [t('kfAltman'), m?.zScore != null ? m.zScore.toFixed(2) : null,
            m?.zScore == null ? undefined : m.zScore >= 3 ? 'growth' : m.zScore < 1.81 ? 'bad' : 'warn'],
        [t('kfInsider'), pts(m?.insiderOwnership, 0)],
    ];
    const shown = cells.filter(([, v]) => v !== null);

    const toneClass = (tone?: string) =>
        tone === 'growth' ? 'text-pos' : tone === 'bad' ? 'text-neg' : tone === 'warn' ? 'text-warn' : 'text-ink';

    return (
        <div>
            <Micro className="block">{t('kfTitle')}</Micro>

            <div className="mt-3.5 flex flex-wrap items-baseline gap-x-8 gap-y-3">
                <div>
                    <Micro className="block text-ink-3">{t('kfPrice')}</Micro>
                    <div className="mt-1 font-mono text-[22px] font-semibold leading-none text-ink">
                        {fmtMoney(price)}
                    </div>
                </div>
                <div>
                    <Micro className="block text-ink-3">{t('kfMcap')}</Micro>
                    <div className="mt-1 font-mono text-[22px] font-semibold leading-none text-ink">
                        {fmtMcap(row.info?.marketCap)}
                    </div>
                </div>
            </div>

            {shown.length === 0 ? (
                <p className="mt-3.5 text-[11.5px] text-ink-3">{t('kfNone')}</p>
            ) : (
                <div className="mt-4 grid grid-cols-2 gap-x-6">
                    {shown.map(([label, value, tone]) => (
                        <div key={label} className="flex items-baseline justify-between border-b border-rule-10 py-1.5">
                            <span className="text-[11.5px] text-ink-2">{label}</span>
                            <span className={clsx('font-mono text-[12px] font-semibold', toneClass(tone))}>{value}</span>
                        </div>
                    ))}
                </div>
            )}

            <Micro className="mt-2.5 block normal-case tracking-normal text-ink-3">{t('kfFoot')}</Micro>
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
        for (const key of ['rn_depth', 'equal_llm', 'equal']) {
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
                    <Micro className="font-mono">{(row.info?.sector ?? '').toUpperCase()}</Micro>
                </div>
                <a
                    href={`https://www.tradingview.com/symbols/${row.ticker}/`}
                    target="_blank" rel="noopener noreferrer"
                    className="border border-rule-24 px-4 py-1.5 font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-ink-2 hover:border-ink hover:text-ink"
                >
                    TradingView ↗
                </a>
            </div>

            {/* Two-column body */}
            <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[1.35fr_1fr]">
                <div className="min-w-0 border-rule-14 py-6 lg:border-r lg:pr-8">
                    <Micro className="block">
                        RS2 local-LLM analysis
                        {d?.date ? ` · depth run ${d.date}` : ''}
                        {d ? ` · ${d.samples_run ?? 3} runs` : ''}
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

                    {d && <InstitutionalContractCard d={d} bundle={bundle} />}

                    {d && (
                        <p className="mt-5 text-[11px] leading-relaxed text-ink-3">
                            Band-direction scheme: the model analyzes the full fact pack in {d.samples_run ?? 3} independent
                            runs; the verdict is where today&apos;s price sits relative to the whole band of its
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
                    <KeyFinancials row={row} />
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
