'use client';

// The Desk funnel (handoff 5.1b/c): five steps, one summary panel for the selected step, and a
// detail panel the summary toggles. A step only SELECTS; it never filters the table. Every number
// comes from lib/desk/funnel.ts over real data; nothing here is computed from a placeholder.

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useLanguage } from '@/components/LanguageContext';
import type { FactorScoresPayload } from '@/lib/data-service';
import type { DeskPhase } from '@/lib/desk/phase';
import type { DeskRow } from '@/lib/desk/rankings';
import { countDoors, doorOf, DOOR_COLOR, DOOR_LABEL_KEY, DOORS, type Door } from '@/lib/desk/doors';
import {
    checkTicker, gateReasonCounts, listRows, queueRows, step4DropOff, vetoGroups,
    type FunnelCounts,
} from '@/lib/desk/funnel';
import type { FunnelStep } from '@/lib/desk/filters';
import { rebuiltVerdict } from '@/lib/desk/verdict';
import { topPct } from '@/lib/desk/rowText';
import { fill } from '@/lib/desk/text';
import { vetoFallback, vetoKey } from '@/lib/desk/veto';
import { gateReasonLabel, GATE_REASON_LABEL } from '@/lib/desk/tone';
import { DoorMark } from './DeskParts';

const DASH = '—';
const num = (n: number | null | undefined) => (n == null ? DASH : n.toLocaleString('en-US'));
const NEUTRAL_BAR = '#aeb8c5';

type T = ReturnType<typeof useLanguage>['t'];

// ── The five steps ──────────────────────────────────────────────────────────

function StepButton({ n, label, drop, selected, onSelect }: {
    n: number | null; label: string; drop?: string | null; selected: boolean; onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={clsx('block px-3 pb-2 pt-2 text-left hover:bg-hover', selected && 'bg-page')}
            style={selected ? { boxShadow: 'inset 0 -2px 0 var(--ink)' } : undefined}
        >
            <span className={clsx('block font-mono text-[24px] font-semibold leading-none', n === 0 ? 'text-ink-2' : 'text-ink')} style={{ letterSpacing: '-.02em' }}>
                {num(n)}
            </span>
            <span className="mt-1 block text-[12px] text-ink-2">{label}</span>
            {drop && <span className="mt-0.5 block font-mono text-[11px] text-off">{drop}</span>}
        </button>
    );
}

export function FunnelRow({ counts, phase, held, step, onStep }: {
    counts: FunnelCounts;
    phase: DeskPhase | null;
    /** rn_depth open positions; shown under step 5 in phase C only. */
    held: number | null;
    step: FunnelStep;
    onStep: (s: FunnelStep) => void;
}) {
    const { t } = useLanguage();
    const d4 = step4DropOff(phase, counts.queued);
    const items: { s: FunnelStep; n: number | null; label: string; drop: string | null }[] = [
        { s: 1, n: counts.universe, label: t('fnUs'), drop: null },
        { s: 2, n: counts.scored, label: t('fnSafe'), drop: counts.vetoed != null ? fill(t('fnVetoed'), { n: num(counts.vetoed) }) : null },
        { s: 3, n: counts.list, label: t('fnList'), drop: counts.noDoor != null ? fill(t('fnNoDoor'), { n: num(counts.noDoor) }) : null },
        { s: 4, n: counts.verdicts, label: t('fnVerdicts'), drop: d4 === 'notLive' ? t('fsAnalystNotLive') : d4 ? fill(t('fnQueued'), { n: num(d4.queued) }) : null },
        { s: 5, n: counts.actionable, label: t('fnGate'), drop: phase === 'C' && held != null ? fill(t('fnHeld'), { n: num(held) }) : null },
    ];
    return (
        <ol className="grid grid-cols-2 items-start gap-y-1 border-b border-rule-10 pb-2 sm:grid-cols-3 min-[900px]:flex min-[900px]:flex-wrap min-[900px]:items-start">
            {items.map((it, i) => (
                <li key={it.s} className="flex items-start">
                    <StepButton n={it.n} label={it.label} drop={it.drop} selected={step === it.s} onSelect={() => onStep(it.s)} />
                    {i < items.length - 1 && (
                        <span aria-hidden className="hidden px-1 pt-1 text-[22px] leading-none text-off min-[900px]:inline">{'›'}</span>
                    )}
                </li>
            ))}
        </ol>
    );
}

// ── Summary panel ───────────────────────────────────────────────────────────

function Chip({ color, children }: { color?: string; children: React.ReactNode }) {
    return (
        <span className="inline-flex items-baseline gap-1.5 font-mono text-[11px] text-ink-2">
            {color && <span aria-hidden className="inline-block shrink-0" style={{ width: 7, height: 7, background: color }} />}
            {children}
        </span>
    );
}

function summaryOf(t: T, step: FunnelStep, c: FunnelCounts, doors: Record<Door, number>, rows: DeskRow[], factor: FactorScoresPayload | null) {
    switch (step) {
        case 1:
            return { title: fill(t('sp1Title'), { n: num(c.universe) }), sub: t('sp1Sub'), chips: [] as React.ReactNode[] };
        case 2:
            return {
                title: fill(t('sp2Title'), { a: num(c.universe), b: num(c.scored) }),
                sub: fill(t('sp2Sub'), { n: num(c.vetoed) }),
                chips: vetoGroups(factor).map((g) => {
                    const k = vetoKey(g.code);
                    return <Chip key={g.code} color={NEUTRAL_BAR}>{k ? t(k) : vetoFallback(g.code)} {'·'} {num(g.count)}</Chip>;
                }),
            };
        case 3:
            return {
                title: fill(t('sp3Title'), { a: num(c.scored), b: num(c.list) }),
                sub: t('sp3Sub'),
                chips: [
                    ...DOORS.map((d) => <Chip key={d} color={DOOR_COLOR[d]}>{t(DOOR_LABEL_KEY[d])} {'·'} {num(doors[d])}</Chip>),
                    <Chip key="to">{'→'} {fill(t('d3Rn'), { n: num(c.researchNowBand) })} {'·'} {fill(t('d3Wl'), { n: num(c.watchlistBand) })}</Chip>,
                ],
            };
        case 4:
            return {
                title: fill(t('sp4Title'), { n: num(c.list) }),
                sub: t('sp4Sub'),
                chips: [
                    <Chip key="u">{fill(t('chUnder'), { n: num(c.verdicts) })}</Chip>,
                    <Chip key="q">{fill(t('fnQueued'), { n: num(c.queued) })}</Chip>,
                ],
            };
        default: {
            const blocked = rows.filter((r) => { const v = rebuiltVerdict(r.depth); return !!v && v.actionable !== true; }).length;
            return {
                title: t('sp5Title'), sub: t('sp5Sub'),
                chips: [
                    <Chip key="p" color="var(--pos)">{fill(t('chPass'), { n: num(c.actionable) })}</Chip>,
                    <Chip key="b" color="var(--off)">{fill(t('chBlocked'), { n: num(blocked) })}</Chip>,
                ],
            };
        }
    }
}

// ── Detail pieces ───────────────────────────────────────────────────────────

function TickerSearch({ factor }: { factor: FactorScoresPayload | null }) {
    const { t } = useLanguage();
    const [q, setQ] = useState('');
    const res = checkTicker(factor, q);
    let line: string | null = null;
    if (res?.kind === 'unknown') line = fill(t('srchUnknown'), { t: q.trim().toUpperCase() });
    else if (res?.kind === 'vetoed') {
        const k = vetoKey(res.code);
        line = fill(t('dsVetoed'), { reason: `${k ? t(k) : vetoFallback(res.code)}${res.detail ? ` (${res.detail})` : ''}` });
    } else if (res?.kind === 'scored') {
        const band = res.band === 'research_now' ? t('bandResearchNow') : res.band === 'watchlist' ? t('bandWatchlist') : t('srchNoDoor');
        line = fill(t('srchScored'), { band: res.rank != null ? `${band} #${res.rank}` : band });
    }
    return (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('srchPlaceholder')}
                aria-label={t('srchPlaceholder')}
                className="w-full max-w-[240px] border border-rule-24 bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink placeholder:text-off sm:w-60"
            />
            <span role="status" className="font-mono text-[12px] text-ink-2">{line}</span>
        </div>
    );
}

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_56px] items-center gap-x-3 sm:grid-cols-[minmax(0,230px)_minmax(0,1fr)_56px]">
            <span className="font-mono text-[12px] text-ink-2">{label}</span>
            <span className="block bg-track-12" style={{ height: 8 }}>
                <span className="block h-full" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%`, background: color }} />
            </span>
            <span className="text-right font-mono text-[12px] text-ink">{num(count)}</span>
        </div>
    );
}

function Step1({ c, factor }: { c: FunnelCounts; factor: FactorScoresPayload | null }) {
    const { t } = useLanguage();
    return (
        <>
            <p className="font-mono text-[12px] text-ink-2">{fill(t('d1Total'), { n: num(c.universe) })}</p>
            <p className="mt-2 font-mono text-[12px] text-ink-2">{t('d1Refresh')}</p>
            <TickerSearch factor={factor} />
        </>
    );
}

function Step2({ c, factor }: { c: FunnelCounts; factor: FactorScoresPayload | null }) {
    const { t } = useLanguage();
    const groups = vetoGroups(factor);
    const max = groups.reduce((m, g) => Math.max(m, g.count), 0);
    const total = groups.reduce((s, g) => s + g.count, 0);
    return (
        <>
            <p className="mb-3 font-mono text-[12px] text-off">{t('d2Caption')}</p>
            <div className="space-y-2">
                {groups.map((g) => {
                    const k = vetoKey(g.code);
                    return <BarRow key={g.code} label={k ? t(k) : vetoFallback(g.code)} count={g.count} max={max} color={NEUTRAL_BAR} />;
                })}
            </div>
            <p className="mt-3 font-mono text-[12px] text-ink-2">{fill(t('d2Total'), { n: num(groups.length ? total : c.vetoed) })}</p>
            <TickerSearch factor={factor} />
        </>
    );
}

function plainWords(t: T, r: DeskRow): string {
    const door = doorOf(r.fct.fct_nominated_doors);
    const top = topPct(r.fct.fct_percentile);
    switch (door) {
        case 'compounder': {
            const used = r.fct.door1_pillars_used ?? [];
            const words: Record<string, string> = { quality: t('pwQuality'), momentum: t('pwMomentum'), revisions: t('pwRevisions'), value: t('pwValue'), exp_gap: t('pwExpGap') };
            const base = used.length ? used.map((p) => words[p] ?? p).join(' + ') : t('pwCompounder');
            return top ? `${base}, ${top}` : base;
        }
        case 'value_gap': {
            const gap = r.val?.expectations_gap_pts;
            return gap != null ? `${t('pwValueGap')} · ${fill(t('xGapPts'), { x: gap.toFixed(1) })}` : t('pwValueGap');
        }
        case 'double': return t('pwDouble');
        case 'trend': return t('pwTrend');
        case 'held_over': return t('pwHeldOver');
        default: return DASH;
    }
}

function Step3({ c, rows }: { c: FunnelCounts; rows: DeskRow[] }) {
    const { t } = useLanguage();
    const [door, setDoor] = useState<Door | 'all'>('all');
    const list = useMemo(() => listRows(rows), [rows]);
    const doors = useMemo(() => countDoors(list), [list]);
    const shown = useMemo(() => listRows(rows, door), [rows, door]);
    const max = Math.max(...DOORS.map((d) => doors[d]), 0);
    const barLabel: Record<Door, string> = {
        compounder: t('doorBarCompounder'), value_gap: t('doorBarValue'), double: t('doorBarDouble'), trend: t('doorBarTrend'),
    };
    const chips: [Door | 'all', string][] = [
        ['all', fill(t('d3All'), { n: list.length })], ['compounder', t('d3Door1')], ['value_gap', t('d3Door2')], ['double', t('d3Double')], ['trend', t('d3Door3')],
    ];
    return (
        <>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="shrink-0 border border-rule-24 px-3.5 py-2.5 text-center font-mono text-[12px] text-ink">
                    {fill(t('d3Scored'), { n: num(c.scored) })}
                </div>
                <span aria-hidden className="hidden text-off md:inline">{'→'}</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                    {DOORS.map((d) => (
                        <BarRow key={d} label={`${barLabel[d]} · ${doors[d]}`} count={doors[d]} max={max} color={DOOR_COLOR[d]} />
                    ))}
                </div>
                <span aria-hidden className="hidden text-off md:inline">{'→'}</span>
                <div className="flex shrink-0 gap-2 md:flex-col">
                    <span className="border border-rule-24 px-3 py-1.5 font-mono text-[12px] text-ink">{fill(t('d3Rn'), { n: num(c.researchNowBand) })}</span>
                    <span className="border border-rule-24 px-3 py-1.5 font-mono text-[12px] text-ink">{fill(t('d3Wl'), { n: num(c.watchlistBand) })}</span>
                </div>
            </div>
            <p className="mt-3 font-mono text-[12px] text-ink-2">{fill(t('d3NoDoor'), { n: num(c.noDoor) })}</p>

            <div className="mt-5 border-t border-rule-10 pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-[13px] font-semibold text-ink">{t('d3Who')}</h3>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('d3Who')}>
                        {chips.map(([k, label]) => (
                            <button
                                key={k}
                                type="button"
                                aria-pressed={door === k}
                                onClick={() => setDoor(k)}
                                className={clsx('border px-2.5 py-1 font-mono text-[11px]', door === k ? 'border-ink bg-ink text-surface' : 'border-rule-24 text-ink-2 hover:text-ink')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="mt-3 max-h-[320px] overflow-y-auto">
                    <div className="hidden grid-cols-[70px_150px_minmax(0,1fr)_130px] gap-x-3 pb-1 font-mono text-[11px] text-off sm:grid">
                        <span>{t('d3Ticker')}</span><span>{t('d3Route')}</span><span>{t('d3Words')}</span><span>{t('d3Band')}</span>
                    </div>
                    {shown.map((r) => {
                        const band = r.fct.fct_band === 'research_now' ? t('bandResearchNow') : t('bandWatchlist');
                        return (
                            <div key={r.ticker} className="grid grid-cols-[70px_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-t border-rule-10 py-1.5 sm:grid-cols-[70px_150px_minmax(0,1fr)_130px]">
                                <Link href={`/t/${encodeURIComponent(r.ticker)}?from=ai`} className="text-[13px] font-semibold text-ink hover:text-accent">{r.ticker}</Link>
                                <DoorMark door={doorOf(r.fct.fct_nominated_doors)} />
                                <span className="col-span-2 text-[12px] text-ink-2 sm:col-span-1">{plainWords(t, r)}</span>
                                <span className="col-span-2 font-mono text-[11px] text-ink-2 sm:col-span-1">{band}{r.fct.fct_rank != null ? ` #${r.fct.fct_rank}` : ''}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}

function Step4({ c, rows }: { c: FunnelCounts; rows: DeskRow[] }) {
    const { t } = useLanguage();
    const top = useMemo(() => queueRows(rows).slice(0, 3), [rows]);
    const pct = c.list ? (c.verdicts / c.list) * 100 : 0;
    return (
        <>
            <p className="font-mono text-[12px] text-ink">{fill(t('d4Progress'), { n: num(c.verdicts), m: num(c.list) })}</p>
            <span className="mt-2 block bg-track-12" style={{ height: 8 }}>
                <span className="block h-full" style={{ width: `${Math.min(100, pct)}%`, background: 'var(--accent)' }} />
            </span>
            <p className="mt-3 font-mono text-[12px] text-ink-2">{t('d4Note')}</p>
            {top.length > 0 && (
                <div className="mt-4">
                    <p className="font-mono text-[11px] text-off">{t('d4Next')}</p>
                    {top.map((r) => (
                        <div key={r.ticker} className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-[12px]">
                            <Link href={`/t/${encodeURIComponent(r.ticker)}?from=ai`} className="w-[70px] text-[13px] font-semibold text-ink hover:text-accent">{r.ticker}</Link>
                            <span className="text-ink-2">{r.info?.name ?? DASH}</span>
                            <span className="font-mono text-[11px] text-off">{r.fct.fct_rank != null ? fill(t('dkQueue'), { rank: r.fct.fct_rank }) : t('dkQueued')}</span>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

/** Codes the gate can emit that mean "old analyst": never a gate reason on the Desk. */
const OLD_CODES = ['pre_v3.1_gates', 'pre_valid_analyst'];

function Step5({ rows }: { rows: DeskRow[] }) {
    const { t } = useLanguage();
    const reasons = useMemo(() => gateReasonCounts(rows), [rows]);
    const shown = reasons.slice(0, 8);
    const known = Object.keys(GATE_REASON_LABEL).filter((c) => !OLD_CODES.includes(c));
    const more = known.filter((c) => !shown.some((s) => s.code === c)).length;
    return (
        <>
            <p className="text-[13px] text-ink-2">{t('d5Intro')}</p>
            {shown.length === 0 ? (
                <p className="mt-3 font-mono text-[12px] text-ink-2">{t('d5Empty')}</p>
            ) : (
                <div className="mt-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_56px] gap-x-3 pb-1 font-mono text-[11px] text-off">
                        <span>{t('d5Plain')}</span><span>{t('d5Code')}</span><span className="text-right">{t('d5Count')}</span>
                    </div>
                    {shown.map((s) => (
                        <div key={s.code} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_56px] gap-x-3 border-t border-rule-10 py-1.5">
                            <span className="text-[12px] text-ink">{gateReasonLabel(s.code)}</span>
                            <span className="break-all font-mono text-[11px] text-ink-2">{s.code}</span>
                            <span className="text-right font-mono text-[12px] text-ink">{s.count}</span>
                        </div>
                    ))}
                </div>
            )}
            {more > 0 && (
                <p className="mt-3 text-[12px]">
                    <Link href="/help" className="text-accent hover:text-ink">{fill(t('d5More'), { k: more })}</Link>
                </p>
            )}
        </>
    );
}

// ── The selected step's panel ───────────────────────────────────────────────

export function FunnelPanel({ rows, factor, counts, step, how, onToggle }: {
    rows: DeskRow[];
    factor: FactorScoresPayload | null;
    counts: FunnelCounts;
    step: FunnelStep;
    how: boolean;
    onToggle: () => void;
}) {
    const { t } = useLanguage();
    const doors = useMemo(() => countDoors(listRows(rows)), [rows]);
    const sum = summaryOf(t, step, counts, doors, rows, factor);
    return (
        <div className="mt-4">
            <div
                role="button"
                tabIndex={0}
                aria-expanded={how}
                aria-controls="funnel-detail"
                onClick={onToggle}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
                className="cursor-pointer bg-page px-3.5 py-3"
            >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[14px] font-bold text-ink">{sum.title}</span>
                    <span className="font-mono text-[11px] text-ink-2">{sum.sub}</span>
                    <span className="ml-auto font-mono text-[11px] text-accent">{how ? t('spCollapse') : t('spShow')}</span>
                </div>
                {sum.chips.length > 0 && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{sum.chips}</div>}
            </div>
            {how && (
                <div id="funnel-detail" className="border border-t-0 border-rule-10 px-4 py-3.5">
                    {step === 1 && <Step1 c={counts} factor={factor} />}
                    {step === 2 && <Step2 c={counts} factor={factor} />}
                    {step === 3 && <Step3 c={counts} rows={rows} />}
                    {step === 4 && <Step4 c={counts} rows={rows} />}
                    {step === 5 && <Step5 rows={rows} />}
                </div>
            )}
        </div>
    );
}
