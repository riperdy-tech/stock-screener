'use client';

// The stock page (/t/[ticker], WO_ST2): the top bar; the AI verdict with one comparison strip (price, our value, the
// analysts' target); the stored analyses as tabs; then everything else as disclosures, closed by default. The earlier
// analyst's rebuilt verdict, where a name has one, is the last disclosure. Layout and state only; the logic is
// lib/desk/stockPage.ts and lib/desk/yardstick.ts.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageContext';
import { fetchDepthReport, type DepthReportBundle } from '@/lib/data-service';
import { fmtMoney } from '@/lib/desk/format';
import { aiVerdict } from '@/lib/desk/aiVerdict';
import { macroEventsFor } from '@/lib/desk/macroEvents';
import { fill } from '@/lib/desk/text';
import { buildRows, type DeskRow } from '@/lib/desk/rankings';
import { livePrice } from '@/lib/desk/rowText';
import { gateReasonLabel } from '@/lib/desk/tone';
import { rebuiltVerdict } from '@/lib/desk/verdict';
import { useDeskData } from '@/lib/desk/useDeskData';
import {
    backKind, followupWarning, instabilityDelta, mmdd, safeBackPath, stockMode, stockSectionKey,
} from '@/lib/desk/stockPage';
import { Shell } from '../Shell';
import { StockLeft } from './StockLeft';
import { StockRight } from './StockRight';
import { DASH, Disclosure } from './stockParts';
import { DriverFlagsPanel } from './DriverFlagsPanel';
import { MacroEventsPanel } from './MacroEventsPanel';
import { SourceTabs } from './SourceTabs';
import { VerdictCard } from './VerdictCard';
import { targetOf } from '../rankings/ListRow';

const signedOne = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} %`;

export function StockDetail({ ticker, from }: { ticker: string; from?: string }) {
    const { t } = useLanguage();
    const data = useDeskData();
    const [bundle, setBundle] = useState<DepthReportBundle | null | undefined>(undefined);

    useEffect(() => {
        let alive = true;
        setBundle(undefined);
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
    const row = useMemo(() => {
        const found = rows.find((r) => r.ticker === ticker);
        if (found) return found;
        if (data.depth && data.depth[ticker]) {
            const d = data.depth[ticker];
            const sc = d.scorecard;
            return {
                ticker,
                info: data.stockInfo[ticker],
                fct: {
                    fct_composite: null, fct_percentile: null, fct_band: 'watchlist', fct_rank: null, fct_veto: null,
                    fct_z: null, fct_contributions: null, fct_haircuts: null,
                },
                depth: d,
                storedMos: d.mos_vs_median_pct ?? null,
                val: data.valuations[ticker],
                overlay: data.overlay[ticker],
                delta: null, promo: 'promoted', vetoed: false, vetoReason: null, moved: null,
                conviction: d.conviction_score ?? sc?.median_conviction_score ?? null,
                moat: d.business_quality_moat ?? sc?.median_quality_moat ?? null,
                kelly: d.kelly_fraction_pct ?? sc?.median_kelly_fraction_pct ?? null,
                skew: d.asymmetric_payoff_skew ?? sc?.asymmetric_payoff_skew ?? null,
                bearIv: d.bear_iv ?? sc?.median_bear_iv ?? null,
                bullIv: d.bull_iv ?? sc?.median_bull_iv ?? null,
            } as DeskRow;
        }
        return undefined;
    }, [rows, data.depth, data.stockInfo, data.valuations, data.overlay, ticker]);

    const backPath = safeBackPath(from);
    const kind = backKind(backPath);
    const section = row ? stockSectionKey(row) : null;
    const backLabel = kind === 'track' ? t('navTrackRecord') : kind === 'portfolio' ? t('navPortfolio')
        : section && kind === 'desk' ? `${t('navDesk')} · ${t(section)}` : t('navDesk');
    const back = (
        <Link href={backPath} className="text-[13px] text-accent hover:text-ink">{'← '}{backLabel}</Link>
    );

    const shell = (children: React.ReactNode) => <Shell tab={null} loading={data.loading}>{children}</Shell>;

    if (!row) {
        return shell(
            <div className="py-10">
                {back}
                <p className="mt-6 text-[14px] text-ink-2">
                    {data.loading ? t('pgLoading') : fill(t('pgNotInUniverse'), { ticker })}
                </p>
            </div>,
        );
    }

    const mode = stockMode(row);
    const d = rebuiltVerdict(row.depth);
    const blocked = !!d && d.actionable !== true;
    const live = livePrice(row);
    const atVerdict = d ? (row.depth?.verdict_price ?? d.price ?? null) : null;
    const reasons = d ? (d.actionable_reasons ?? []) : [];
    const delta = d ? instabilityDelta(d) : null;
    const deltaText = delta
        ? fill(t('pgInstab'), { delta: signedOne(delta.delta), prior: delta.prior.toFixed(2), current: delta.current.toFixed(2) })
        : null;
    // The gloss of each gate reason; the unstable-value reason carries its own numbers.
    const glossed = reasons.map((c) => (c === 'mode_instability' && deltaText ? deltaText : gateReasonLabel(c)));
    if (deltaText && !reasons.includes('mode_instability')) glossed.push(deltaText);
    const fu = d ? followupWarning(d) : null;
    const ind = row.info?.industry;
    const op = data.opus[row.ticker];
    const gem = data.geminiC[row.ticker];
    const news = macroEventsFor(data.macroEvents, row.ticker, row.info?.sector).length;
    const ai = aiVerdict({ geminiC: gem, opus: op });
    const target = targetOf({ ticker: row.ticker, opus: op }, { targets: data.analystTargets, overlayAsOf: data.opusMeta?.analyst_as_of, overlaySource: data.opusMeta?.analyst_source });
    // The price is the engine's (stocks.json); say which session it is for, and when this name's own last price is older.
    const sessionNote = live == null || !data.priceSession ? null
        : row.info?.priceOlderThan
            ? fill(t('pgPriceOlder'), { at: row.info.priceOlderThan, asof: data.priceSession })
            : fill(t('pgPriceSession'), { at: data.priceSession });
    const priceNote = sessionNote ?? (live != null && atVerdict != null && Math.abs(live - atVerdict) >= 0.005
        ? fill(t('pgLiveAsOf'), { at: data.pricesAsOf ? data.pricesAsOf.slice(5, 16) : DASH })
        : d?.price_asof ? fill(t('pgPriceAsOf'), { at: mmdd(d.price_asof), src: d.price_source ?? DASH }) : null);

    // The earlier analyst's banners (blocked by the gate, a follow-up warning) belong to its verdict, and sit with it.
    const banners = (
        <>
            {blocked && (
                <p className="break-words border-l-2 border-off bg-page px-4 py-3 text-[13px] leading-relaxed text-ink">
                    <b className="font-semibold">{t('pgBlockedHead')}</b> {'—'} {glossed.join('; ')}. {t('pgBlockedTail')}
                </p>
            )}
            {fu && (
                <p className="mt-3 break-words border-l-2 border-warn px-4 py-3 text-[13px] leading-relaxed text-ink" style={{ background: 'color-mix(in oklch, var(--warn) 10%, var(--surface))' }}>
                    {fu.key ? t(fu.key) : fu.raw}
                </p>
            )}
        </>
    );

    return shell(
        <div className="pb-6">
            {/* Top bar */}
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-rule-14 py-4">
                {back}
                <span className="text-[24px] font-bold leading-none text-ink">{row.ticker}</span>
                <span className="min-w-0 break-words text-[14px] text-ink-2">
                    {[row.info?.name, row.info?.sector, ind && ind !== 'Unknown' ? ind : null].filter(Boolean).join(' · ')}
                </span>
                <span className="flex-1" />
                <span className="font-mono text-[18px] font-semibold text-ink">{live != null ? fmtMoney(live) : DASH}</span>
                {priceNote && <span className="font-mono text-[11px] text-ink-2">{priceNote}</span>}
                <a
                    href={`https://www.tradingview.com/symbols/${encodeURIComponent(row.ticker)}/`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-mono text-[11px] text-accent hover:text-ink"
                >
                    TradingView ↗
                </a>
            </div>

            {/* The AI verdict and the comparison strip */}
            <VerdictCard geminiC={gem} opus={op} live={live} priceDate={row.info?.priceOlderThan ?? data.priceSession} target={target} />

            {/* A vetoed name says so in the open (the header only) */}
            {mode === 'vetoed' && (
                <div className="mt-5">
                    <StockLeft row={row} d={d} mode={mode} bundle={bundle} live={live} atVerdict={atVerdict} blocked={blocked} />
                </div>
            )}

            {/* The stored analyses, one tab open at a time */}
            <SourceTabs
                ticker={row.ticker} live={live}
                hasAi={gem != null} opus={op} analystAsOf={data.opusMeta?.analyst_as_of}
                verdictTab={ai ? (ai.source === 'claude' ? 'claude' : 'ai') : null}
            />

            {/* Everything else, each closed by default */}
            <div className="mt-6 max-w-[720px]">
                <StockRight row={row} d={d} mode={mode} blocked={blocked} ledgers={data.ledgers} live={live} />
                <DriverFlagsPanel p={data.driverFlags} ticker={row.ticker} />
                {news > 0 && (
                    <div className="mt-6">
                        <Disclosure title={t('pgEvTitle')} sub={String(news)}>
                            <MacroEventsPanel p={data.macroEvents} ticker={row.ticker} sector={row.info?.sector} />
                        </Disclosure>
                    </div>
                )}
                {mode === 'verdict' && d && (
                    <div className="mt-6">
                        <Disclosure title={t('stOldVerdict')} sub={fill(t('stOldVerdictSub'), { d: d.date ?? DASH })}>
                            {banners}
                            <div className="mt-4">
                                <StockLeft row={row} d={d} mode={mode} bundle={bundle} live={live} atVerdict={atVerdict} blocked={blocked} />
                            </div>
                        </Disclosure>
                    </div>
                )}
            </div>
        </div>,
    );
}
