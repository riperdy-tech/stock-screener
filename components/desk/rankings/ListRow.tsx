'use client';

// One list row of the Desk (research-now and watchlist): company, price, the AI verdict with its source letter, our
// value and its upside, the analysts' target and its upside, the door. Our value is the value of the source that gave
// the verdict (lib/desk/yardstick.ts); a no-call row says "no call" only, its reason is on the stock page. The row
// opens the stock page. Below 640px it is a card that wraps instead of scrolling sideways.

import React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/LanguageContext';
import type { AnalystTargetsPayload } from '@/lib/data-service';
import { aiVerdict } from '@/lib/desk/aiVerdict';
import { doorOf } from '@/lib/desk/doors';
import { opusMoney } from '@/lib/desk/opusText';
import type { DeskRow } from '@/lib/desk/rankings';
import { livePrice, signedPct } from '@/lib/desk/rowText';
import { TONE_COLORS } from '@/lib/desk/tone';
import { useStockHref } from '@/lib/desk/useStockHref';
import { analystTarget, ourValue, upside } from '@/lib/desk/yardstick';
import { AiChip, DoorMark } from './DeskParts';

const DASH = '—';
const GRID = 'grid items-center gap-x-3 grid-cols-[minmax(0,1.5fr)_64px_96px_minmax(0,1fr)_minmax(0,1fr)_14px] lg:grid-cols-[minmax(0,1.6fr)_76px_104px_minmax(0,1fr)_minmax(0,1fr)_130px_14px]';

/** Whole units from 100 up, cents below; a dollar sign only for US dollars. */
const money = (v: number, cur: string | null) => opusMoney(v, cur, v >= 100 ? 0 : 2);
const upColor = (u: number | null, far = false) => (u == null ? TONE_COLORS.MUTED : far ? 'var(--warn)' : u >= 0 ? 'var(--pos)' : 'var(--neg)');

/** The analysts' targets file and the overlay's date and source, as the Desk hands them to every row. */
export interface TargetSources { targets: AnalystTargetsPayload; overlayAsOf?: string; overlaySource?: string }

export const targetOf = (r: Pick<DeskRow, 'ticker' | 'opus'>, s: TargetSources) => analystTarget(
    { row: s.targets.tickers[r.ticker], generatedAt: s.targets.generated_at, source: s.targets.source },
    { opus: r.opus, asOf: s.overlayAsOf, source: s.overlaySource },
);

function cells(r: DeskRow, s: TargetSources) {
    const price = livePrice(r);
    const ours = ourValue(r);
    const target = targetOf(r, s);
    const oursUp = ours ? upside(ours.base, price) : null;
    const anUp = target && target.comparable ? upside(target.mean, price) : null;
    const dated = (src: string | null | undefined, d: string | null | undefined) => [src, d].filter(Boolean).join(', ') || undefined;
    return {
        price,
        oursTitle: ours ? dated(null, ours.date) : undefined,
        anTitle: target ? dated(target.source, target.asOf) : undefined,
        ours: ours ? money(ours.base, ours.currency) : DASH,
        oursUp: oursUp == null ? null : signedPct(oursUp * 100, 0),
        oursColor: upColor(oursUp, ours?.far),
        an: target ? money(target.mean, target.currency ?? 'USD') : DASH,
        anUp: anUp == null ? null : signedPct(anUp * 100, 0),
        anColor: upColor(anUp),
    };
}

/** A value and its upside; the two wrap onto two lines when the column is narrow. */
function ValueCell({ value, up, color, title }: { value: string; up: string | null; color: string; title?: string }) {
    return (
        <span title={title} className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-[12px]">
            <span className={value === DASH ? 'text-off' : 'text-ink'}>{value}</span>
            {up && <span className="font-semibold" style={{ color }}>{up}</span>}
        </span>
    );
}

export function ListHeaders() {
    const { t } = useLanguage();
    return (
        <div className={`hidden border-b border-rule-18 pb-1.5 pt-2 font-mono text-[11px] text-off sm:grid ${GRID}`} role="presentation">
            <span>{t('colCompany')}</span>
            <span>{t('dkColPrice')}</span>
            <span>{t('stColVerdict')}</span>
            <span>{t('stColOurs')}</span>
            <span>{t('stColAnalysts')}</span>
            <span className="hidden lg:block">{t('colDoor')}</span>
            <span />
        </div>
    );
}

export function ListRow({ r, sources }: { r: DeskRow; sources: TargetSources }) {
    const { t } = useLanguage();
    const stockLink = useStockHref();
    const c = cells(r, sources);
    const ai = aiVerdict(r);
    const door = doorOf(r.fct.fct_nominated_doors);
    const name = r.info?.name;
    const price = c.price != null ? `$${c.price.toFixed(2)}` : DASH;
    const chip = ai ? <span className="whitespace-nowrap"><AiChip a={ai} /></span> : <span className="font-mono text-[11px] text-off">{DASH}</span>;
    return (
        <Link href={stockLink(r.ticker)} className="block border-b border-rule-10 py-2 hover:bg-hover">
            <div className={`hidden sm:grid ${GRID}`}>
                <span className="block min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{r.ticker}</span>
                    <span className="block truncate text-[11px] text-ink-2" title={name || undefined}>{name || DASH}</span>
                </span>
                <span className="font-mono text-[12px] text-ink">{price}</span>
                {chip}
                <ValueCell value={c.ours} up={c.oursUp} color={c.oursColor} title={c.oursTitle} />
                <ValueCell value={c.an} up={c.anUp} color={c.anColor} title={c.anTitle} />
                <span className="hidden min-w-0 lg:block"><DoorMark door={door} /></span>
                <span aria-hidden className="font-mono text-[11px] text-ink-2">{'›'}</span>
            </div>
            <div className="block sm:hidden">
                <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-baseline gap-2">
                        <span className="text-[14px] font-semibold text-ink">{r.ticker}</span>
                        {chip}
                    </span>
                    <span className="font-mono text-[12px] text-ink">{price}</span>
                </div>
                <span className="mt-0.5 block truncate text-[11px] text-ink-2" title={name || undefined}>{name || DASH}</span>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px]">
                    <span className="flex items-baseline gap-x-1.5"><span className="text-off">{t('stOursShort')}</span><ValueCell value={c.ours} up={c.oursUp} color={c.oursColor} /></span>
                    <span className="flex items-baseline gap-x-1.5"><span className="text-off">{t('opColAnalysts')}</span><ValueCell value={c.an} up={c.anUp} color={c.anColor} /></span>
                </div>
            </div>
        </Link>
    );
}
