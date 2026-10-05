'use client';

// The Desk (handoff 5.1): gate status line, funnel, step panel, filter row, the sectioned table, the
// hidden-legacy line. State that should survive reload and back/forward lives in the URL
// (?step=3&how=1&verdict=…&door=…&sector=…&q=…) next to the shell's own ?tab= param, which is left alone.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { useLanguage } from '@/components/LanguageContext';
import type { DepthVerdict, FactorScoresPayload, ValuationModel } from '@/lib/data-service';
import type { StockInfo } from '@/lib/desk/useDeskData';
import { buildRows, sectorsOf } from '@/lib/desk/rankings';
import { deskPhase } from '@/lib/desk/phase';
import { countHiddenLegacy, deskSections, type DeskSections } from '@/lib/desk/sections';
import { funnelCounts } from '@/lib/desk/funnel';
import { DOOR_LABEL_KEY } from '@/lib/desk/doors';
import {
    applyDeskFilters, DOOR_FILTERS, filtersActive, NO_FILTERS, parseDeskUrl, VERDICT_WORDS, writeDeskUrl,
    type DeskFilters, type DeskUrlState, type FunnelStep,
} from '@/lib/desk/filters';
import { fill } from '@/lib/desk/text';
import { DeskTable } from './DeskTable';
import { verdictWordKey } from './DeskParts';
import { FunnelPanel, FunnelRow } from './Funnel';

const sectionTotal = (s: DeskSections) =>
    s.researchNow.length + s.waiting.length + s.noEdge.length + s.blocked.length + s.awaiting.length + s.disqualified.length;

/** A chip-styled native select: the visible text is "Label ▾" (or "Label: value ▾"); the invisible select on top does the work. */
function FilterSelect({ label, value, shown, options, onChange }: {
    label: string;
    value: string;
    /** Display text of the current value when it is not 'all'. */
    shown: string;
    options: [string, string][];
    onChange: (v: string) => void;
}) {
    const active = value !== 'all';
    return (
        <label className={clsx(
            'relative inline-flex items-center border px-2.5 py-1.5 font-mono text-[11px] hover:bg-hover focus-within:outline focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-accent',
            active ? 'border-ink text-ink' : 'border-rule-14 text-ink-2',
        )}>
            <span aria-hidden>{active ? `${label}: ${shown}` : label} {'▾'}</span>
            <select
                aria-label={label}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
        </label>
    );
}

export function RankingsView({ factor, depth, valuations, overlay, stockInfo, ledgers }: {
    factor: FactorScoresPayload | null;
    depth: Record<string, DepthVerdict>;
    valuations: Record<string, ValuationModel>;
    overlay: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- the untyped overlay-signals payload, passed through to buildRows unchanged
    stockInfo: Record<string, StockInfo>;
    /** paper_ledgers.json; read only for the "held" figure under funnel step 5 (phase C). */
    ledgers: { ledgers?: { rn_depth?: { summary?: { open_positions?: number | null } } } } | null;
}) {
    const { t } = useLanguage();
    const params = useSearchParams();
    const urlState = useMemo(() => parseDeskUrl(params), [params]);
    const { step, how } = urlState;

    // The search box types fast: it keeps its own text and writes the URL with replaceState.
    const [q, setQ] = useState(urlState.filters.q);
    useEffect(() => { setQ(urlState.filters.q); }, [urlState.filters.q]);
    const filters: DeskFilters = { ...urlState.filters, q };

    const write = useCallback((next: DeskUrlState, mode: 'push' | 'replace') => {
        const p = new URLSearchParams(window.location.search);
        writeDeskUrl(p, next);
        const qs = p.toString();
        const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
        if (mode === 'push') window.history.pushState(null, '', url); else window.history.replaceState(null, '', url);
    }, []);

    const setStep = (s: FunnelStep) => write({ ...urlState, step: s, how: false }, 'push');
    const toggleHow = () => write({ ...urlState, how: !how }, 'push');
    const setFilter = (patch: Partial<DeskFilters>) => write({ ...urlState, filters: { ...urlState.filters, ...patch } }, 'push');
    const clearFilters = () => { setQ(''); write({ ...urlState, filters: NO_FILTERS }, 'push'); };

    const rows = useMemo(
        () => buildRows({ factor, depth, valuations, overlay, stockInfo }),
        [factor, depth, valuations, overlay, stockInfo],
    );
    const sectors = useMemo(() => sectorsOf(rows), [rows]);
    const phase = useMemo(() => (Object.keys(depth).length || factor ? deskPhase(depth) : null), [depth, factor]);
    const counts = useMemo(() => funnelCounts(rows, factor), [rows, factor]);
    const hiddenLegacy = useMemo(() => countHiddenLegacy(rows), [rows]);

    const all = useMemo(() => deskSections(rows), [rows]);
    const active = filtersActive(filters);
    const filtered = useMemo(() => (active ? deskSections(applyDeskFilters(rows, filters)) : all),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `filters` is rebuilt every render; its parts are listed
        [rows, all, active, filters.verdict, filters.door, filters.sector, filters.q]);

    const tr = factor?.band_transitions;
    const entered = tr?.entered_book?.length ?? 0;
    const left = tr?.left_book?.length ?? 0;
    const held = ledgers?.ledgers?.rn_depth?.summary?.open_positions ?? null;
    const n = counts.actionable;

    return (
        <div>
            {/* a. Gate status line */}
            {phase !== null && (
                <p className={clsx('font-mono text-[11px] font-semibold', n > 0 ? 'text-pos' : 'text-warn')}>
                    <span aria-hidden>{'●'} </span>
                    {n > 0 ? fill(t(n === 1 ? 'glActionableOne' : 'glActionable'), { n }) : t('glNone')}
                </p>
            )}

            {/* b/c. Funnel and the selected step's panel */}
            <div className="mt-3">
                <FunnelRow counts={counts} phase={phase} held={held} step={step} onStep={setStep} />
                <FunnelPanel rows={rows} factor={factor} counts={counts} step={step} how={how} onToggle={toggleHow} />
            </div>

            {/* d. Filter row */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="bg-ink px-3 py-1.5 font-mono text-[11px] font-semibold text-surface">{t('flDesk')}</span>
                <div className="flex flex-wrap items-center gap-2">
                    <FilterSelect
                        label={t('flVerdict')}
                        value={filters.verdict}
                        shown={filters.verdict === 'all' ? '' : t(verdictWordKey(filters.verdict))}
                        options={[['all', t('flAll')], ...VERDICT_WORDS.map((w) => [w, t(verdictWordKey(w))] as [string, string])]}
                        onChange={(v) => setFilter({ verdict: v as DeskFilters['verdict'] })}
                    />
                    <FilterSelect
                        label={t('flDoor')}
                        value={filters.door}
                        shown={filters.door === 'all' ? '' : t(DOOR_LABEL_KEY[filters.door])}
                        options={[['all', t('flAll')], ...DOOR_FILTERS.map((d) => [d, t(DOOR_LABEL_KEY[d])] as [string, string])]}
                        onChange={(v) => setFilter({ door: v as DeskFilters['door'] })}
                    />
                    <FilterSelect
                        label={t('flSector')}
                        value={filters.sector}
                        shown={filters.sector}
                        options={[['all', t('flAll')], ...sectors.map((s) => [s, s] as [string, string])]}
                        onChange={(v) => setFilter({ sector: v })}
                    />
                    <input
                        value={q}
                        onChange={(e) => { setQ(e.target.value); write({ ...urlState, filters: { ...urlState.filters, q: e.target.value } }, 'replace'); }}
                        placeholder={t('flSearch')}
                        aria-label={t('flSearch')}
                        className={clsx('w-[110px] border bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-ink placeholder:text-ink-2 sm:w-[140px]', q.trim() ? 'border-ink' : 'border-rule-14')}
                    />
                </div>
            </div>
            {active && (
                <p className="mt-2 font-mono text-[11px] text-ink-2" role="status">
                    {fill(t('flShowing'), { k: sectionTotal(filtered), n: sectionTotal(all) })}
                    {' · '}
                    <button type="button" onClick={clearFilters} className="text-accent hover:text-ink">{t('flClear')}</button>
                </p>
            )}

            {/* h. Since yesterday: counts only, and only when the screen run moved names */}
            {entered + left > 0 && (
                <div className="mt-5 border-l-2 border-rule-24 pl-3">
                    <p className="text-[13px] font-bold text-ink">{t('syTitle')}</p>
                    <p className="font-mono text-[11px] text-ink-2">{fill(t('syLine'), { a: entered, b: left })}</p>
                </div>
            )}

            {/* e/f. The table and its sections */}
            <DeskTable
                sections={filtered}
                phase={phase}
                actionableCount={n}
                queued={counts.queued}
                filtering={active}
            />

            {/* g. Hidden-legacy line (phases A and B) */}
            {(phase === 'A' || phase === 'B') && hiddenLegacy > 0 && (
                <p className="mt-6 border-t border-rule-10 pt-3 font-mono text-[11px] text-off">{fill(t('dsLegacy'), { n: hiddenLegacy })}</p>
            )}
        </div>
    );
}
