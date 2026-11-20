'use client';

// The Desk (handoff 5.1): gate status line, funnel, step panel, filter row, the sectioned table, the
// hidden-legacy line. State that should survive reload and back/forward lives in the URL
// (?step=3&how=1&verdict=…&door=…&sector=…&q=…) next to the shell's own ?tab= param, which is left alone.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { useLanguage } from '@/components/LanguageContext';
import type { AnalystTargetsPayload, DepthVerdict, FactorScoresPayload, GeminiCRow, OpusVerdict, OpusVerdictCode, ValuationModel } from '@/lib/data-service';
import type { DeskData, StockInfo } from '@/lib/desk/useDeskData';
import { buildRows, sectorsOf } from '@/lib/desk/rankings';
import { deskPhase } from '@/lib/desk/phase';
import { deskSections, onList, type DeskSections } from '@/lib/desk/sections';
import { funnelCounts } from '@/lib/desk/funnel';
import { DOOR_LABEL_KEY } from '@/lib/desk/doors';
import {
    AI_FILTERS, applyDeskFilters, DOOR_FILTERS, filtersActive, NO_FILTERS, parseDeskUrl, writeDeskUrl,
    type DeskFilters, type DeskUrlState, type FunnelStep,
} from '@/lib/desk/filters';
import { fill } from '@/lib/desk/text';
import { OPUS_VERDICT_KEY } from '@/lib/desk/opusText';
import { aiCounts } from '@/lib/desk/yardstick';
import { DeskTable } from './DeskTable';
import { targetOf } from './ListRow';

import { FunnelLine, FunnelPanel } from './Funnel';
import { UniverseHits } from './UniverseHits';

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

/** The AI filter: four real checkboxes (BUY, WATCH, AVOID, no call) that can be ticked together; none ticked filters nothing. */
function AiFilter({ value, onChange }: { value: OpusVerdictCode[]; onChange: (v: OpusVerdictCode[]) => void }) {
    const { t } = useLanguage();
    const active = value.length > 0;
    return (
        <fieldset className={clsx('inline-flex flex-wrap items-center gap-x-3 gap-y-1 border px-2.5 py-1.5 font-mono text-[11px]', active ? 'border-ink text-ink' : 'border-rule-14 text-ink-2')}>
            <legend className="sr-only">{t('flAi')}</legend>
            <span aria-hidden>{t('flAi')}</span>
            {AI_FILTERS.map((v) => (
                <label key={v} className="inline-flex cursor-pointer items-center gap-1 hover:text-ink focus-within:outline focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-accent">
                    <input
                        type="checkbox"
                        checked={value.includes(v)}
                        onChange={(e) => onChange(AI_FILTERS.filter((x) => (x === v ? e.target.checked : value.includes(x))))}
                        className="m-0 accent-[var(--accent)]"
                    />
                    {t(OPUS_VERDICT_KEY[v])}
                </label>
            ))}
        </fieldset>
    );
}

/** "Opus valued … · 11 BUY · …" from the file's own totals; each count sets the AI filter. */
function OpusSummary({ m, onPick }: { m: NonNullable<DeskData['opusMeta']>; onPick: (v: OpusVerdictCode) => void }) {
    const { t } = useLanguage();
    const vc: Partial<Record<OpusVerdictCode, number>> = m.verdict_counts ?? {};
    const valued = vc.BUY != null && vc.WATCH != null && vc.AVOID != null ? vc.BUY + vc.WATCH + vc.AVOID : '—';
    const pick = (k: OpusVerdictCode, key: 'opLineBuy' | 'opLineWatch' | 'opLineAvoid' | 'opLineNoCall') => (
        <button type="button" onClick={() => onPick(k)} className="text-accent hover:text-ink">{fill(t(key), { n: vc[k] ?? '—' })}</button>
    );
    return (
        <p className="mt-1 font-mono text-[11px] font-semibold text-ink-2">
            {fill(t('opLine'), { v: valued, n: m.count ?? '—', d: m.generated_at ? m.generated_at.slice(0, 10) : '—' })}
            {' · '}{pick('BUY', 'opLineBuy')}
            {' · '}{pick('WATCH', 'opLineWatch')}
            {' · '}{pick('AVOID', 'opLineAvoid')}
            {' · '}{pick('NO_CALL', 'opLineNoCall')}
            {' · '}{t('opLinePaper')}
        </p>
    );
}

/** "Gemini analysed … · 11 BUY · …" from the file's own totals; each count sets the AI filter. */
function GeminiCSummary({ m, onPick }: { m: NonNullable<DeskData['geminiCMeta']>; onPick: (v: OpusVerdictCode) => void }) {
    const { t } = useLanguage();
    const vc: Partial<Record<OpusVerdictCode, number>> = m.verdict_counts ?? {};
    const pick = (k: OpusVerdictCode, key: 'opLineBuy' | 'opLineWatch' | 'opLineAvoid' | 'opLineNoCall') => (
        <button type="button" onClick={() => onPick(k)} className="text-accent hover:text-ink">{fill(t(key), { n: vc[k] ?? '—' })}</button>
    );
    return (
        <p className="mt-1 font-mono text-[11px] font-semibold text-ink-2">
            {fill(t('gcLine'), { n: m.count ?? '—', v: m.valued_count ?? '—', d: m.generated_at ? m.generated_at.slice(0, 10) : '—' })}
            {' · '}{pick('BUY', 'opLineBuy')}
            {' · '}{pick('WATCH', 'opLineWatch')}
            {' · '}{pick('AVOID', 'opLineAvoid')}
            {' · '}{pick('NO_CALL', 'opLineNoCall')}
        </p>
    );
}

export function RankingsView({ factor, depth, valuations, overlay, stockInfo, opus, opusMeta, geminiC, geminiCMeta, analystTargets }: {
    factor: FactorScoresPayload | null;
    depth: Record<string, DepthVerdict>;
    valuations: Record<string, ValuationModel>;
    overlay: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- the untyped overlay-signals payload, passed through to buildRows unchanged
    stockInfo: Record<string, StockInfo>;
    /** opus_overlay.json tickers: the Opus valuation beside each list name (paper only). */
    opus: Record<string, OpusVerdict>;
    /** The Opus file's own totals for the summary line; null when the file is absent. */
    opusMeta: DeskData['opusMeta'];
    /** gemini_c_overlay.json tickers: the AI analysis and verdict beside each list name. Empty when the file is absent. */
    geminiC: Record<string, GeminiCRow>;
    /** The Gemini file's own totals for the summary line; null when the file is absent. */
    geminiCMeta: DeskData['geminiCMeta'];
    /** analyst_targets.json: the analysts' target beside each list name. An empty map when the file is absent. */
    analystTargets: AnalystTargetsPayload;
}) {
    const { t } = useLanguage();
    const params = useSearchParams();
    const urlState = useMemo(() => parseDeskUrl(params), [params]);
    const { how } = urlState;
    // Steps 4 and 5 were the old AI counters, which left the front page: a saved ?step=4 or 5 shows the list step.
    const step: FunnelStep = urlState.step > 3 ? 3 : urlState.step;
    const [showSources, setShowSources] = useState(false);

    // The search box types fast: it keeps its own text and writes the URL with replaceState.
    const [q, setQ] = useState(urlState.filters.q);
    useEffect(() => { setQ(urlState.filters.q); }, [urlState.filters.q]);
    // The verdict filter belonged to the old analyst's verdicts; a stale ?verdict= in a saved link is ignored.
    const filters: DeskFilters = { ...urlState.filters, q, verdict: 'all' };

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
        () => buildRows({ factor, depth, valuations, overlay, stockInfo })
            .map((r) => (opus[r.ticker] ? { ...r, opus: opus[r.ticker] } : r))
            .map((r) => (geminiC[r.ticker] ? { ...r, geminiC: geminiC[r.ticker] } : r)),
        [factor, depth, valuations, overlay, stockInfo, opus, geminiC],
    );
    const sectors = useMemo(() => sectorsOf(rows), [rows]);
    const aiLive = Object.keys(geminiC).length > 0;
    const phase = useMemo(() => (aiLive ? 'C' as const : Object.keys(depth).length || factor ? deskPhase(depth) : null), [aiLive, depth, factor]);
    const counts = useMemo(() => funnelCounts(rows, factor), [rows, factor]);

    const all = useMemo(() => deskSections(rows), [rows]);
    const active = filtersActive(filters);
    const filtered = useMemo(() => (active ? deskSections(applyDeskFilters(rows, filters)) : all),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `filters` is rebuilt every render; its parts are listed
        [rows, all, active, filters.door, filters.sector, filters.ai.join(','), filters.q]);

    // Symbols the table already shows for the current filters: the universe hits skip them.
    const shownTickers = useMemo(() => {
        const set = new Set<string>();
        for (const list of [filtered.researchNow, filtered.waiting, filtered.noEdge, filtered.blocked, filtered.awaiting, filtered.disqualified]) {
            for (const r of list) set.add(r.ticker);
        }
        return set;
    }, [filtered]);

    const tr = factor?.band_transitions;
    const entered = tr?.entered_book?.length ?? 0;
    const left = tr?.left_book?.length ?? 0;
    const n = counts.actionable;
    const newest = Object.values(geminiC).reduce((m, r) => (r.analysis !== 'not run' && r.date > m ? r.date : m), '');
    const ai = useMemo(() => aiCounts(rows), [rows]);
    const pick = (k: OpusVerdictCode, key: 'opLineBuy' | 'opLineWatch' | 'opLineAvoid', v: number) => (
        <button type="button" onClick={() => setFilter({ ai: [k] })} className="text-accent hover:text-ink">{fill(t(key), { n: v })}</button>
    );
    // Where each row's analysts' target comes from, and the source and date the note above the table names.
    const sources = { targets: analystTargets, overlayAsOf: opusMeta?.analyst_as_of, overlaySource: opusMeta?.analyst_source };
    // The targets' dates differ by row (the file's fetch date, else the overlay's): the note gives the oldest and the newest.
    const targetDate = useMemo(() => {
        const days = rows.filter(onList).map((r) => targetOf(r, sources)?.asOf).filter((d): d is string => d != null).sort();
        return days.length === 0 ? null : days[0] === days[days.length - 1] ? days[0] : `${days[0]} – ${days[days.length - 1]}`;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `sources` is rebuilt every render; its parts are listed
    }, [rows, analystTargets, opusMeta]);
    const targetSource = analystTargets.source ?? opusMeta?.analyst_source ?? t('stYahoo');

    return (
        <div>
            {/* a. One status line; the per-source lines sit behind "sources" */}
            {factor != null && (
                <p className="font-mono text-[11px] font-semibold text-ink-2">
                    {fill(t('stLineList'), { n: counts.list ?? '—' })}
                    {' · '}{fill(t('stLineVerdicts'), { v: ai.verdicts })}
                    {' ('}{pick('BUY', 'opLineBuy', ai.buy)}{' · '}{pick('WATCH', 'opLineWatch', ai.watch)}{' · '}{pick('AVOID', 'opLineAvoid', ai.avoid)}{')'}
                    {' · '}{fill(t('stLineNewest'), { d: ai.newestRead ?? '—' })}
                    {' · '}{t('stLinePaper')}
                    {' · '}
                    <button type="button" aria-expanded={showSources} aria-controls="desk-sources" onClick={() => setShowSources(!showSources)} className="text-accent hover:text-ink">
                        {t('stSources')} {showSources ? '▴' : '▾'}
                    </button>
                </p>
            )}
            {showSources && (
                <div id="desk-sources" className="mt-1 border-l-2 border-rule-24 pl-3">
                    {factor != null && (
                        <p className={clsx('font-mono text-[11px] font-semibold', counts.verdicts > 0 ? 'text-pos' : 'text-warn')}>
                            <span aria-hidden>{'●'} </span>
                            {fill(t('dqLine'), { a: counts.verdicts, n: counts.list ?? '—', v: n, d: newest ? newest.slice(5, 10) : '—' })}
                        </p>
                    )}
                    {opusMeta && <OpusSummary m={opusMeta} onPick={(v) => setFilter({ ai: [v] })} />}
                    {geminiCMeta && <GeminiCSummary m={geminiCMeta} onPick={(v) => setFilter({ ai: [v] })} />}
                </div>
            )}

            {/* b/c. The funnel as one line, and the selected step's panel (closed by default) */}
            <div className="mt-3">
                <FunnelLine counts={counts} withVerdict={factor != null ? ai.verdicts : null} step={step} onStep={setStep} />
                <FunnelPanel rows={rows} factor={factor} stockInfo={stockInfo} counts={counts} step={step} how={how} onToggle={toggleHow} />
            </div>

            {/* d. Filter row */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="bg-ink px-3 py-1.5 font-mono text-[11px] font-semibold text-surface">{t('flDesk')}</span>
                <div className="flex flex-wrap items-center gap-2">
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
                    <AiFilter value={filters.ai} onChange={(v) => setFilter({ ai: v })} />
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

            {/* Names the table cannot hold (screened, but not on the list and without a verdict, e.g. NVDA) are
                found by the same search here, so "search a name" works for every US stock, not just the list. */}
            {q.trim() !== '' && factor != null && (
                <div className="mt-3 border-l-2 border-rule-24 pl-3">
                    <p className="font-mono text-[11px] text-ink-2">{t('srchOffList')}</p>
                    <div className="mt-1.5" role="status">
                        <UniverseHits factor={factor} stockInfo={stockInfo} query={q} exclude={shownTickers} quietWhenEmpty />
                    </div>
                </div>
            )}

            {/* h. Since yesterday: counts only, and only when the screen run moved names */}
            {entered + left > 0 && (
                <div className="mt-5 border-l-2 border-rule-24 pl-3">
                    <p className="text-[13px] font-bold text-ink">{t('syTitle')}</p>
                    <p className="font-mono text-[11px] text-ink-2">{fill(t('syLine'), { a: entered, b: left })}</p>
                </div>
            )}

            <p className="mt-5 text-[11px] leading-relaxed text-ink-2">
                {fill(t('stLegend'), { src: targetSource, d: targetDate ?? t('stDateUnknown') })}
            </p>

            {/* e/f. The table and its sections */}
            <DeskTable
                sources={sources}
                sections={filtered}
                phase={phase}
                actionableCount={n}
                queued={counts.queued}
                filtering={active}
                loaded={factor != null}
            />

        </div>
    );
}
