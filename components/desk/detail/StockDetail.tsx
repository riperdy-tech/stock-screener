'use client';

// The stock page (/t/[ticker], handoff 5.2): top bar, banners, then the verdict column on the left
// and the screen column on the right (single column below 1024 px, right blocks following the left
// in the same order). Layout and state only; the logic is lib/desk/stockPage.ts.
// Old-analyst verdicts appear only in "Verdict history"; a name with only one is "awaiting".

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageContext';
import { fetchDepthReport, type DepthReportBundle } from '@/lib/data-service';
import { fmtMoney } from '@/lib/desk/format';
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
import { DASH } from './stockParts';

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
    const priceNote = live != null && atVerdict != null && Math.abs(live - atVerdict) >= 0.005
        ? fill(t('pgLiveAsOf'), { at: data.pricesAsOf ? data.pricesAsOf.slice(5, 16) : DASH })
        : d?.price_asof ? fill(t('pgPriceAsOf'), { at: mmdd(d.price_asof), src: d.price_source ?? DASH }) : null;

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

            {/* Banners */}
            {blocked && (
                <p className="mt-4 break-words border-l-2 border-off bg-page px-4 py-3 text-[13px] leading-relaxed text-ink">
                    <b className="font-semibold">{t('pgBlockedHead')}</b> {'—'} {glossed.join('; ')}. {t('pgBlockedTail')}
                </p>
            )}
            {fu && (
                <p className="mt-3 break-words border-l-2 border-warn px-4 py-3 text-[13px] leading-relaxed text-ink" style={{ background: 'color-mix(in oklch, var(--warn) 10%, var(--surface))' }}>
                    {fu.key ? t(fu.key) : fu.raw}
                </p>
            )}

            <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
                <StockLeft row={row} d={d} mode={mode} bundle={bundle} live={live} atVerdict={atVerdict} blocked={blocked} />
                <StockRight row={row} d={d} mode={mode} blocked={blocked} ledgers={data.ledgers} live={live} />
            </div>
        </div>,
    );
}
