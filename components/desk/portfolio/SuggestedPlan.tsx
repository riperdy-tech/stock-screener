'use client';

// Suggested plan — machine-built from the Research Now list. Not the reader's
// portfolio, and nothing here executes.

import React, { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Bar, Chip, Micro, SectionHead, Stat } from '../primitives';
import { OverlayChips } from '../rankings/cells';
import type { MacroStatePayload } from '@/lib/data-service';
import { useLanguage } from '@/components/LanguageContext';

const GRID = 'grid grid-cols-[80px_70px_1fr_110px_120px_110px] items-center gap-x-3';

function AllocationBars({ title, alloc }: { title: string; alloc: Record<string, number> | undefined }) {
    const entries = Object.entries(alloc ?? {}).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return null;
    const max = Math.max(...entries.map(([, v]) => v));
    return (
        <div className="min-w-0">
            <Micro className="block">{title}</Micro>
            <div className="mt-3 space-y-2">
                {entries.map(([name, pct]) => (
                    <div key={name} className="flex items-center gap-3 text-[11px]">
                        <span className="w-[130px] shrink-0 truncate text-ink-2" title={name}>{name}</span>
                        <span className="min-w-0 flex-1"><Bar pct={(pct / max) * 100} color="oklch(0.78 0.08 250)" /></span>
                        <span className="w-[42px] shrink-0 text-right font-mono text-ink-2">{pct.toFixed(1)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function SuggestedPlan({ plan, planLlm, macro, overlay, onOpenTicker }: {
    plan: any;
    planLlm: any;
    macro: MacroStatePayload | null;
    overlay: Record<string, any>;
    onOpenTicker: (t: string) => void;
}) {
    const { t } = useLanguage();
    const [planSource, setPlanSource] = useState<'baseline' | 'llm'>('baseline');
    const [planView, setPlanView] = useState<'plan' | 'plan2'>('plan');

    if (!plan) {
        return (
            <section className="mt-9">
                <SectionHead title="Suggested plan" note="machine-built from the Research Now list" />
                <p className="py-6 text-[12px] text-ink-3">No portfolio plan found — run the plan builder once.</p>
            </section>
        );
    }

    const base = planSource === 'llm' && planLlm ? planLlm : plan;
    const active = planView === 'plan2' && base?.plan2 ? base.plan2 : base;
    const flags: string[] = plan.macro_flags ?? [];
    const triggered = macro?.triggered_flags ?? [];

    return (
        <section className="mt-9">
            <SectionHead
                title={t('portPlan')}
                note={t('portPlanNote')}
                right={
                    <span className="flex flex-wrap items-center gap-2">
                        <Chip active={planView === 'plan'} onClick={() => setPlanView('plan')} className="px-2.5 py-1 text-[11px]">{t('portValueCore')}</Chip>
                        <Chip active={planView === 'plan2'} onClick={() => setPlanView('plan2')} className="px-2.5 py-1 text-[11px]">{t('portHybrid')}</Chip>
                        <span className="ml-2 flex items-center gap-2">
                            <Micro>Source</Micro>
                            <Chip active={planSource === 'baseline'} onClick={() => setPlanSource('baseline')} className="px-2.5 py-1 text-[11px]">Quant</Chip>
                            <Chip
                                active={planSource === 'llm'}
                                onClick={() => planLlm && setPlanSource('llm')}
                                disabled={!planLlm}
                                className={clsx('px-2.5 py-1 text-[11px]', !planLlm && 'cursor-not-allowed opacity-40')}
                            >
                                RS2 AI
                            </Chip>
                        </span>
                    </span>
                }
            />

            <p className="mt-4 max-w-[820px] text-[12.5px] leading-relaxed text-ink-2">
                {planView === 'plan' ? (
                    <>
                        <b className="text-ink">Value core.</b> Quarter-Kelly sizes only research_now names priced BELOW their
                        demonstrated growth, so no edge means no position — it runs cash-heavy and will not hold expensive leaders.{' '}
                    </>
                ) : (
                    <>
                        <b className="text-ink">Hybrid = value core + quality sleeve.</b> Keeps the Kelly core, then adds top-ranked
                        names regardless of valuation gap (capped ~35% of book), deploying the idle cash for more leader exposure
                        and less value discipline.{' '}
                    </>
                )}
                <Link href="/help#portfolio" className="border-b border-dotted border-accent/50 text-accent">Full explanation</Link>
            </p>

            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4 border-t border-rule-14 pt-4">
                <Stat size="md" label="Invested" value={`${active.invested_pct ?? '—'}%`} />
                <Stat size="md" label="Cash" value={`${active.cash_pct ?? '—'}%`} />
                <Stat size="md" label="Positions" value={active.position_count ?? (active.positions ?? []).length} />
                {planView === 'plan2' && active.sleeve_pct !== undefined && (
                    <Stat size="md" label="Quality sleeve" value={`${active.sleeve_pct}%`} />
                )}
                <Stat
                    size="md"
                    label="Macro flags"
                    value={flags.length || triggered.length || 0}
                    valueClass={flags.length || triggered.length ? 'text-warn' : 'text-ink'}
                    sub={flags.length ? flags.join(', ') : triggered.length ? triggered.join(', ') : 'none firing'}
                />
            </div>

            {(plan.macro_derisk_active || flags.length > 0) && (
                <div className="mt-4 flex items-baseline gap-3 border border-rule-14 px-4 py-3">
                    <span className="mt-1 h-[7px] w-[7px] shrink-0 rounded-full bg-warn" />
                    <p className="text-[12px] text-ink-2">
                        {plan.macro_derisk_active
                            ? <><b className="text-warn">Macro de-risk active</b> — position sizes halved by rule.</>
                            : <>Macro: {flags.length} of 4 flags on ({flags.join(', ')}). De-risk triggers at 2 — all sizes would halve automatically.</>}
                    </p>
                </div>
            )}

            <div className={clsx(GRID, 'mt-5 border-b border-rule-18 pb-2')}>
                <Micro>Name</Micro>
                <Micro className="text-right">Size</Micro>
                <Micro />
                <Micro>Sizing logic</Micro>
                <Micro>Theme</Micro>
                <Micro>Flags</Micro>
            </div>

            {(active.positions ?? []).map((p: any) => {
                const sleeve = p.sizing_method === 'quality_sleeve';
                return (
                    <div
                        key={p.symbol}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenTicker(p.symbol)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onOpenTicker(p.symbol); }}
                        className={clsx(GRID, 'cursor-pointer border-b border-rule-10 py-2.5 hover:bg-hover')}
                        style={sleeve ? { background: 'rgba(194,121,143,.05)' } : undefined}
                    >
                        <span className="text-[13px] font-extrabold text-ink">
                            {p.symbol}
                            {p.rev_nominated && (
                                <span className="ml-1 font-mono text-[11px] text-accent" title="Also nominated by the reverse engine">✓REV</span>
                            )}
                        </span>
                        <span className="text-right font-mono text-[12px] font-semibold text-ink">{p.weight_pct}%</span>
                        <Bar pct={Math.min(100, (p.weight_pct / 6) * 100)} color={sleeve ? '#c2798f' : 'oklch(0.78 0.08 250)'} />
                        <span className="font-mono font-semibold text-[11px] uppercase tracking-[.06em] text-ink-3">
                            {(p.sizing_method || '').replace(/_/g, ' ')}
                        </span>
                        <span className="truncate text-[11px] text-ink-3">{p.theme_primary || '—'}</span>
                        <span className="min-w-0">
                            {(p.forensic_flags ?? []).length > 0
                                ? <span className="truncate text-[11px] text-neg">{p.forensic_flags.join(', ')}</span>
                                : <OverlayChips overlay={overlay[p.symbol]} />}
                        </span>
                    </div>
                );
            })}

            {active.cash_pct != null && (
                <div className={clsx(GRID, 'border-b border-rule-10 py-2.5')}>
                    <span className="text-[13px] font-extrabold text-ink-2">CASH</span>
                    <span className="text-right font-mono text-[12px] text-ink-2">{active.cash_pct}%</span>
                    <Bar pct={active.cash_pct} color="rgba(255,255,255,.18)" />
                    <span className="font-mono font-semibold text-[11px] uppercase tracking-[.06em] text-ink-3">no edge available</span>
                    <span /><span />
                </div>
            )}

            <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-rule-14 pt-5 lg:grid-cols-2">
                <AllocationBars title="Sector allocation" alloc={active.sector_allocation} />
                <AllocationBars title="Theme allocation" alloc={active.theme_allocation} />
            </div>

            {plan.disclaimer && <p className="mt-6 text-[11px] leading-relaxed text-ink-3">{plan.disclaimer}</p>}
        </section>
    );
}
