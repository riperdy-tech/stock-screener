'use client';

// The Desk table (handoff 5.1e/f): one 11-column grid for every section, expandable rows, and the
// Disqualified list. Pure presentation: which section a name is in is decided by lib/desk/sections.ts.
// Responsive behaviour (dropping columns, stacked cards under 640px) lives in app/globals.css (.dk-*).

import React, { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useLanguage } from '@/components/LanguageContext';
import { fmtMcap } from '@/lib/desk/format';
import { fill } from '@/lib/desk/text';
import { doorOf } from '@/lib/desk/doors';
import { verdictWord } from '@/lib/desk/filters';
import type { DeskSections } from '@/lib/desk/sections';
import type { DeskRow } from '@/lib/desk/rankings';
import { rebuiltVerdict, type DeskVerdict } from '@/lib/desk/verdict';
import {
    bandView, cruxParts, livePrice, PILLARS, signedNum, signedPct, timingOf, topPct, verdictAgeDays,
} from '@/lib/desk/rowText';
import { vetoCodeOf, vetoFallback, vetoKey } from '@/lib/desk/veto';
import { DATA_NOTES, FORENSIC_WARNINGS, gapColor, gateReasonsText, sizeTone, TONE_COLORS } from '@/lib/desk/tone';
import { BandStrip } from './cells';
import { DoorMark, PillarBars, PillarHeader, VerdictWordText } from './DeskParts';

const DASH = '—';
const AWAITING_PREVIEW = 5;

type T = ReturnType<typeof useLanguage>['t'];

// ── Cell text ───────────────────────────────────────────────────────────────

function bandSrText(t: T, v: DeskVerdict, price: number | null): string | undefined {
    const b = bandView(v, price);
    if (!b) return undefined;
    const med = b.median != null ? Math.round(b.median) : null;
    const base = b.single
        ? fill(t('dkSrOneRun'), { range: b.range })
        : fill(t('dkSrBand'), { range: b.range, median: med ?? DASH });
    if (price == null || b.reading === 'unknown') return base;
    const reading = t(b.reading === 'below' ? 'dkSrBelow' : b.reading === 'above' ? 'dkSrAbove' : 'dkSrInside');
    return `${base}; ${fill(t('dkSrPrice'), { price: price.toFixed(2), reading })}`;
}

function timingText(t: T, v: DeskVerdict): { text: string; tone: 'warn' | 'muted' | 'plain' } {
    const x = timingOf(v);
    switch (x.kind) {
        case 'buy_now': return { text: t('dkBuyNow'), tone: 'plain' };
        case 'wait_trend': return { text: t('dkWaitTrend'), tone: 'warn' };
        case 'avoid': return { text: t('dkAvoid'), tone: 'plain' };
        case 'single_run': return { text: t('dkSingleRun'), tone: 'muted' };
        case 'paused': return { text: x.reason ? fill(t('dkPaused'), { reason: x.reason.replace(/_/g, ' ') }) : t('dkPausedBare'), tone: 'warn' };
        case 'other': return { text: (x.raw ?? DASH).replace(/_/g, ' '), tone: 'plain' };
        default: return { text: DASH, tone: 'plain' };
    }
}

const TONE_CLASS = { warn: 'text-warn', muted: 'text-off', plain: 'text-ink-2' } as const;

/** Size label and colour. Only an undervalued verdict has a size to read; a blocked one is muted. */
function sizeCell(v: DeskVerdict | undefined): { text: string; color: string } {
    if (!v || v.direction !== 'undervalued' || !v.size_hint) return { text: DASH, color: TONE_COLORS.MUTED };
    const s = sizeTone(v.size_hint, v.n_basis);
    return { text: s.label, color: v.actionable === true ? s.color : TONE_COLORS.MUTED };
}

function mosCell(r: DeskRow, v: DeskVerdict | undefined): { text: string; color: string } {
    if (!v || r.storedMos == null) return { text: DASH, color: TONE_COLORS.MUTED };
    return { text: signedPct(r.storedMos, 0), color: v.actionable === true ? gapColor(r.storedMos, v.direction) : TONE_COLORS.MUTED };
}

const queueText = (t: T, r: DeskRow) =>
    r.fct.fct_rank != null ? fill(t('dkQueue'), { rank: r.fct.fct_rank }) : t('dkQueued');

// ── Row ─────────────────────────────────────────────────────────────────────

function Company({ r }: { r: DeskRow }) {
    const ind = r.info?.industry;
    const sub = [r.info?.name, ind && ind !== 'Unknown' && ind !== DASH ? ind : null].filter(Boolean).join(' · ');
    return (
        <span className="block min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-ink">{r.ticker}</span>
            <span className="block truncate text-[11px] text-ink-2" title={sub || undefined}>{sub || DASH}</span>
        </span>
    );
}

function DeskRowView({ r, open, onToggle }: { r: DeskRow; open: boolean; onToggle: () => void }) {
    const { t } = useLanguage();
    const v = rebuiltVerdict(r.depth);
    const price = livePrice(r);
    const word = verdictWord(r);
    const blocked = !!v && v.actionable !== true;
    const mos = mosCell(r, v);
    const size = sizeCell(v);
    const timing = v ? timingText(t, v) : { text: DASH, tone: 'plain' as const };
    const door = doorOf(r.fct.fct_nominated_doors);
    const pct = topPct(r.fct.fct_percentile);
    const sr = v ? bandSrText(t, v, price) : undefined;
    const bv = v ? bandView(v, price) : null;
    const bandLabel = v ? (bv?.label ?? DASH) : queueText(t, r);

    return (
        <div className={clsx('border-b border-rule-10', open && 'bg-page')}>
            <div
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={onToggle}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
                className={clsx('cursor-pointer py-2', !open && 'hover:bg-hover')}
            >
                {/* Wide: the grid */}
                <div className="dk-grid hidden sm:grid">
                    <Company r={r} />
                    <span className="font-mono text-[12px] text-ink">{price != null ? `$${price.toFixed(2)}` : DASH}</span>
                    <VerdictWordText word={word} />
                    <span className="block min-w-0">
                        <BandStrip d={v} price={price} muted={blocked} srText={sr} />
                        <span className="block font-mono text-[11px] leading-tight text-ink-2">{bandLabel}</span>
                    </span>
                    <span className="font-mono text-[12px]" style={{ color: mos.color }}>{mos.text}</span>
                    <span className="font-mono text-[11px] font-semibold" style={{ color: size.color }}>{size.text}</span>
                    <span className={clsx('dk-timing font-mono text-[11px] leading-tight', TONE_CLASS[timing.tone])}>{timing.text}</span>
                    <DoorMark door={door} />
                    <span className="dk-pct font-mono text-[11px] text-ink-2">{pct ?? DASH}</span>
                    <span className="dk-pillars"><PillarBars z={r.fct.fct_z} /></span>
                    <span aria-hidden className="font-mono text-[11px] text-ink-2">{open ? '▴' : '▾'}</span>
                </div>

                {/* Narrow: a stacked card */}
                <div className="block sm:hidden">
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-baseline gap-2">
                            <span className="text-[14px] font-semibold text-ink">{r.ticker}</span>
                            <VerdictWordText word={word} />
                        </span>
                        <span className="flex items-baseline gap-2 font-mono text-[12px] text-ink">
                            {price != null ? `$${price.toFixed(2)}` : DASH}
                            <span aria-hidden className="text-[11px] text-ink-2">{open ? '▴' : '▾'}</span>
                        </span>
                    </div>
                    <div className="mt-1.5">
                        <BandStrip d={v} price={price} muted={blocked} srText={sr} />
                        <span className="block font-mono text-[11px] text-ink-2">{bandLabel}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11px]">
                        <span style={{ color: mos.color }}>{mos.text}</span>
                        <span className="font-semibold" style={{ color: size.color }}>{size.text}</span>
                        <DoorMark door={door} />
                    </div>
                </div>
            </div>
            {open && <RowExpand r={r} v={v} />}
        </div>
    );
}

// ── Expand panel ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <>
            <dt className="text-[12px] text-ink-2">{label}</dt>
            <dd className="min-w-0 break-words font-mono text-[12px] text-ink">{children}</dd>
        </>
    );
}

const pct1 = (frac: number | null | undefined) => (frac == null || !Number.isFinite(frac) ? DASH : signedNum(frac * 100, 1).replace(/^\+/, ''));

function cruxText(t: T, v: DeskVerdict): string {
    const c = cruxParts(v);
    if (!c) return DASH;
    const vars = { implied: pct1(c.implied), own: pct1(c.own) };
    switch (c.input) {
        case 'growth_years_3_5': return fill(t('cruxGrowth'), vars);
        case 'coe': return fill(t('cruxCoe'), vars);
        case 'terminal_ronic': return fill(t('cruxRonic'), vars);
        case 'fade_years': return fill(t('cruxFade'), { implied: c.implied == null ? DASH : c.implied.toFixed(1), own: c.own == null ? DASH : c.own.toFixed(0) });
        default: return fill(t('cruxOther'), { ...vars, input: c.input.replace(/_/g, ' ') });
    }
}

function sizeHintText(t: T, v: DeskVerdict): string {
    if (!v.size_hint) return DASH;
    const head = v.size_hint.toUpperCase();
    const sc = v.size_components;
    const parts: [string, string | null | undefined][] = [
        [t('xDispersion'), sc?.dispersion?.bucket], [t('xMosWord'), sc?.mos?.bucket],
        [t('xConviction'), sc?.conviction?.bucket], [t('xRisk'), sc?.risk?.bucket],
    ];
    const known = parts.filter(([, b]) => b != null) as [string, string][];
    const all = known.length === 4 && known.every(([, b]) => b === known[0][1]);
    const buckets = known.length === 0 ? null
        : all ? fill(t('xAllFour'), { b: known[0][1] })
            : known.map(([w, b]) => `${w} ${b}`).join(' · ');
    const capped = (v.actionable_reasons ?? []).includes('single_sample') ? t('xCapped') : null;
    return [head, buckets, capped].filter(Boolean).join(' · ');
}

function flagText(code: string): string {
    return FORENSIC_WARNINGS[code] ?? DATA_NOTES[code] ?? code.replace(/_/g, ' ');
}

function RowExpand({ r, v }: { r: DeskRow; v: DeskVerdict | undefined }) {
    const { t } = useLanguage();
    const door = doorOf(r.fct.fct_nominated_doors);
    const pct = topPct(r.fct.fct_percentile);
    const bandName = r.fct.fct_band === 'research_now' ? t('bandResearchNow') : r.fct.fct_band === 'watchlist' ? t('bandWatchlist') : (r.fct.fct_band ?? DASH);
    const z = r.fct.fct_z;
    const flags = r.fct.fct_flags ?? [];
    const val = r.val;
    const delivered = val?.hist_revenue_cagr_5y ?? val?.hist_fcf_cagr_5y ?? null;
    const deliveredKey = val?.hist_revenue_cagr_5y != null ? 'xDeliveredRev' : 'xDeliveredFcf';
    const expectations = [
        val?.implied_growth != null ? fill(t('xMarketNeeds'), { x: pct1(val.implied_growth) }) : null,
        delivered != null ? fill(t(deliveredKey), { y: pct1(delivered) }) : null,
        val?.expectations_gap_pts != null ? fill(t('xGapPts'), { x: signedNum(val.expectations_gap_pts, 1) }) : null,
    ].filter(Boolean).join(' · ') || DASH;
    const age = v ? verdictAgeDays(v, Date.now()) : null;
    const bv = v ? bandView(v, livePrice(r)) : null;
    const timing = v ? timingText(t, v) : null;
    const reasons = v ? gateReasonsText(v.actionable_reasons) : '';

    return (
        <div className="grid gap-x-6 gap-y-4 px-3.5 pb-4 pt-1 md:grid-cols-2">
            <section>
                <h3 className="mb-2 font-mono text-[11px] text-off">{t('xAnalyst')}</h3>
                {!v ? (
                    <p className="font-mono text-[12px] text-ink-2">{fill(t('xNoVerdict'), { rank: r.fct.fct_rank ?? DASH })}</p>
                ) : (
                    <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                        <Field label={t('xValueBand')}>{bv?.label ?? DASH}</Field>
                        <Field label={t('xMos')}>{r.storedMos != null ? fill(t('xMosVs'), { x: signedPct(r.storedMos, 0) }) : DASH}</Field>
                        <Field label={t('xSizeHint')}>{sizeHintText(t, v)}</Field>
                        <Field label={t('xRuns')}>
                            {fill(t('xRunsVal'), { n: v.n_basis ?? DASH, m: v.samples_run ?? DASH, s: v.spread_pct != null ? `${v.spread_pct.toFixed(0)} %` : DASH })}
                        </Field>
                        <Field label={t('xTimingThesis')}>{timing?.text ?? DASH} {'·'} {v.thesis_status ?? t('xUnknown')}</Field>
                        <Field label={t('xAge')}>{age == null ? DASH : age === 1 ? t('xDay') : fill(t('xDays'), { n: age })}</Field>
                        <Field label={t('xCrux')}>{cruxText(t, v)}</Field>
                        {reasons && <Field label={t('xGate')}>{reasons}</Field>}
                    </dl>
                )}
            </section>
            <section>
                <h3 className="mb-2 font-mono text-[11px] text-off">{t('xScreener')}</h3>
                <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                    <Field label={t('xRoute')}>
                        <span className="inline-flex flex-wrap items-baseline gap-x-2"><DoorMark door={door} />{pct && <span>{pct}</span>}</span>
                    </Field>
                    <Field label={t('xBandRank')}>{bandName} #{r.fct.fct_rank ?? DASH}</Field>
                    <Field label={t('xPillars')}>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <PillarBars z={z} />
                            <span>{PILLARS.map((p) => `${p.letter} ${signedNum(z?.[p.key], 1)}`).join(' · ')}</span>
                        </span>
                    </Field>
                    <Field label={t('xExpGap')}>{expectations}</Field>
                    <Field label={t('xMcap')}>{fmtMcap(r.info?.marketCap)}</Field>
                    <Field label={t('xFlags')}>{flags.length ? flags.map(flagText).join(' · ') : t('xNone')}</Field>
                </dl>
                <Link
                    href={`/t/${encodeURIComponent(r.ticker)}?from=ai`}
                    className="mt-3 inline-block text-[13px] text-accent hover:text-ink"
                >
                    {t('xOpen')}
                </Link>
            </section>
        </div>
    );
}

// ── Sections ────────────────────────────────────────────────────────────────

function SectionHeader({ title, sub, count }: { title: string; sub: string; count: number }) {
    return (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-t border-ink pt-3">
            <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
            <span className="text-[12px] text-ink-2">{sub}</span>
            <span className="ml-auto font-mono text-[12px] text-ink">{count}</span>
        </div>
    );
}

function DisqualifiedRow({ r }: { r: DeskRow }) {
    const { t } = useLanguage();
    const code = vetoCodeOf({ fct_veto: r.fct.fct_veto, fct_llm_veto: (r.fct as { fct_llm_veto?: string | null }).fct_llm_veto });
    const key = code ? vetoKey(code) : null;
    const reason = code ? (key ? t(key) : vetoFallback(code)) : DASH;
    return (
        <div className="border-b border-rule-10 py-2 opacity-70">
            <Link href={`/t/${encodeURIComponent(r.ticker)}?from=ai`} className="grid grid-cols-[minmax(100px,200px)_minmax(0,1fr)] items-baseline gap-x-3 hover:bg-hover">
                <Company r={r} />
                <span className="text-[12px] text-ink-2">{fill(t('dsVetoed'), { reason })}</span>
            </Link>
        </div>
    );
}

export function DeskTable({ sections, phase, actionableCount, queued, filtering }: {
    sections: DeskSections;
    phase: 'A' | 'B' | 'C' | null;
    actionableCount: number;
    /** List size minus rebuilt verdicts on list names, for the empty Research now copy. */
    queued: number | null;
    /** A filter is active: Awaiting then lists every match instead of the first five. */
    filtering: boolean;
}) {
    const { t } = useLanguage();
    const [open, setOpen] = useState<Set<string>>(new Set());
    const [allAwaiting, setAllAwaiting] = useState(false);
    const toggle = (ticker: string) => setOpen((s) => {
        const n = new Set(s);
        if (n.has(ticker)) n.delete(ticker); else n.add(ticker);
        return n;
    });

    const { researchNow, waiting, noEdge, blocked, awaiting, disqualified } = sections;
    const everything = researchNow.length + waiting.length + noEdge.length + blocked.length + awaiting.length + disqualified.length;
    const awaitingRows = allAwaiting || filtering ? awaiting : awaiting.slice(0, AWAITING_PREVIEW);

    const emptyRn = filtering && everything === 0
        ? t('dsRnEmptyFiltered')
        : phase === 'A'
            ? fill(t('dsRnEmptyA'), { n: queued ?? DASH })
            : actionableCount === 0
                ? fill(t('dsRnEmptyB'), { n: queued ?? DASH })
                : t('dsRnEmptyOpen');

    const block = (title: string, sub: string, rows: DeskRow[], list: DeskRow[] = rows) => (
        <section key={title}>
            <SectionHeader title={title} sub={sub} count={rows.length} />
            {list.map((r) => <DeskRowView key={r.ticker} r={r} open={open.has(r.ticker)} onToggle={() => toggle(r.ticker)} />)}
        </section>
    );

    return (
        <div>
            {/* Group headers and column headers: wide screens only (cards carry their own labels). */}
            <div className="hidden sm:block" role="presentation">
                <div className="dk-grid pt-2 font-mono text-[11px] text-off">
                    <span />
                    <span className="border-b border-ink pb-0.5 whitespace-nowrap">{t('grpMarket')}</span>
                    <span className="dk-span-ai border-b border-ink pb-0.5 whitespace-nowrap">{t('grpAi')}</span>
                    <span className="dk-span-sc border-b border-ink pb-0.5 whitespace-nowrap">{t('grpScreener')}</span>
                </div>
                <div className="dk-grid pb-2 pt-1.5 font-mono text-[11px] text-off">
                    <span className="whitespace-nowrap">{t('colCompany')}</span>
                    <span className="whitespace-nowrap">{t('dkColPrice')}</span>
                    <span className="whitespace-nowrap">{t('dkColVerdict')}</span>
                    <span className="whitespace-nowrap">{t('colIvBand')}</span>
                    <span className="whitespace-nowrap">{t('colMos')}</span>
                    <span className="whitespace-nowrap">{t('colSize')}</span>
                    <span className="dk-timing whitespace-nowrap">{t('colTiming')}</span>
                    <span className="whitespace-nowrap">{t('colDoor')}</span>
                    <span className="dk-pct whitespace-nowrap">{t('colPct')}</span>
                    <span className="dk-pillars"><PillarHeader /></span>
                    <span />
                </div>
            </div>

            <section>
                <SectionHeader title={t('dsRn')} sub={t('dsRnSub')} count={researchNow.length} />
                {researchNow.length === 0
                    ? <p className="my-3 border border-dashed border-rule-24 px-3.5 py-3 text-[13px] text-ink-2">{emptyRn}</p>
                    : researchNow.map((r) => <DeskRowView key={r.ticker} r={r} open={open.has(r.ticker)} onToggle={() => toggle(r.ticker)} />)}
            </section>

            {waiting.length > 0 && block(t('dsWait'), t('dsWaitSub'), waiting)}
            {noEdge.length > 0 && block(t('dsNoEdge'), t('dsNoEdgeSub'), noEdge)}
            {blocked.length > 0 && block(t('dsBlocked'), t('dsBlockedSub'), blocked)}

            {awaiting.length > 0 && (
                <section>
                    <SectionHeader title={t('dsAwaiting')} sub={t('dsAwaitingSub')} count={awaiting.length} />
                    {awaitingRows.map((r) => <DeskRowView key={r.ticker} r={r} open={open.has(r.ticker)} onToggle={() => toggle(r.ticker)} />)}
                    {awaitingRows.length < awaiting.length && (
                        <button type="button" onClick={() => setAllAwaiting(true)} className="py-3 font-mono text-[12px] text-accent hover:text-ink">
                            {fill(t('dsShowAll'), { n: awaiting.length })}
                        </button>
                    )}
                </section>
            )}

            {disqualified.length > 0 && (
                <section>
                    <SectionHeader title={t('dsDisq')} sub={t('dsDisqSub')} count={disqualified.length} />
                    {disqualified.map((r) => <DisqualifiedRow key={r.ticker} r={r} />)}
                </section>
            )}
        </div>
    );
}
