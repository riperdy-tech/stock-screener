'use client';

// The panels the /macro tabs hold (WO_MP1): the macro engine's own dashboard, ported into the desk's style.
// Everything here describes the present. The regime label and the sector ranking were tested on 2026-11-12
// and showed no skill at picking sectors or direction, so they are labelled "context only" and nothing on
// this page is a call on the market. A missing file shows "not available" for its panel; the page always renders.

import React, { useState } from 'react';
import clsx from 'clsx';
import { useLanguage } from '@/components/LanguageContext';
import type { MacroCloudData, MacroPanelData } from '@/lib/desk/useDeskData';
import type { MriRegime, MriRiskState } from '@/lib/data-service';
import { fill } from '@/lib/desk/text';
import { pctText } from '@/lib/desk/health';
import {
    bestAbsIc, componentBars, convictionKey, CROSS_SECTION_LABELS, DASH, dimensionAverages, dimensionLabel, directionRows,
    fallbackNote, featureLabel, lastValue, quadrantOf, quadrantTrail, recessionSpans, regimeRuns, sectorName, sectorRows, seriesLabel,
    signed, sourceHealth, timelinePoints, titleCase, unchangedMonths, validationSections, type DirectionCell,
} from '@/lib/desk/macroPanels';
import { Chip, Micro, Tag } from '../primitives';
import { DivergingBars, MiniLine, ProbabilityHistory, QuadrantMap, RegimeRibbon } from './MacroCharts';

export function Section({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="border-t border-ink pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="text-[14px] font-semibold text-ink">
                    {title}
                    {sub && <span className="ml-2 text-[12px] font-normal text-ink-2">{sub}</span>}
                </h2>
                {right}
            </div>
            {children}
        </section>
    );
}

export const Note = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{children}</p>
);

/** One label and value line, with the label wrapping and the value kept on its own side. */
export function Row({ label, sub, value }: { label: React.ReactNode; sub?: React.ReactNode; value: React.ReactNode }) {
    return (
        <li className="flex items-baseline justify-between gap-x-4 border-b border-rule-10 py-1.5 text-[13px] last:border-b-0">
            <span className="min-w-0 text-ink-2">
                {label}
                {sub && <span className="block font-mono text-[11px] text-off">{sub}</span>}
            </span>
            <span className="min-w-0 break-words text-right font-mono text-[12px] text-ink">{value}</span>
        </li>
    );
}

export function Metric({ label, value, sub }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <Micro className="block">{label}</Micro>
            <p className="mt-1 font-mono text-[19px] font-semibold leading-tight text-ink">{value}</p>
            {sub && <p className="mt-1 font-mono text-[11px] text-ink-2">{sub}</p>}
        </div>
    );
}

const NotAvailable = () => {
    const { t } = useLanguage();
    return <p className="mt-3 font-mono text-[11px] text-off">{t('mcNotAvailable')}</p>;
};

/** A panel whose file did not load yet or at all: "loading" until its request settles, then "not available". */
export function Gate({ loaded, ok, children }: { loaded: boolean; ok: boolean; children: React.ReactNode }) {
    const { t } = useLanguage();
    if (!ok) return loaded ? <NotAvailable /> : <p className="mt-3 font-mono text-[11px] text-off">{t('mcLoading')}</p>;
    return <>{children}</>;
}

// ── Overview ──────────────────────────────────────────────────────────────────────────────────────

/** Under the headline: the confidence, how long the label has stood, and what the label is and is not. */
export function ReadingLines({ panels }: { panels: MacroPanelData }) {
    const { t } = useLanguage();
    const months = unchangedMonths(timelinePoints(panels.timeline));
    return (
        <>
            {months !== null && months >= 1 && (
                <p className="mt-1 text-[13px] text-ink-2">
                    {fill(t(months === 1 ? 'mcUnchangedOne' : 'mcUnchanged'), { n: months })}
                </p>
            )}
            <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">{t('mcEvRegime')}</p>
        </>
    );
}

export function QuadrantPanel({ regime, panels }: { regime: MriRegime | null; panels: MacroPanelData }) {
    const { t } = useLanguage();
    const avgs = dimensionAverages(panels.features);
    const growth = lastValue(avgs.find((d) => d.id === 'growth_momentum'));
    const inflation = lastValue(avgs.find((d) => d.id === 'inflation_pressure'));
    const reported = regime?.reported_regime ?? null;
    const placed = growth !== null && inflation !== null ? quadrantOf(growth, inflation) : null;
    const differs = placed !== null && reported !== null && reported !== 'tightening' && placed !== reported;
    return (
        <Section title={t('mcQuadrant')}>
            <Gate loaded={panels.loaded.features} ok={growth !== null && inflation !== null}>
                <div className="mt-3">
                    <QuadrantMap growth={growth} inflation={inflation} trail={quadrantTrail(avgs)} regime={reported} />
                </div>
                <Note>{t('mcQuadrantNote')}</Note>
                {differs && (
                    <Note>
                        {fill(t('mcQuadrantDiffers'), { placed: titleCase(placed), reported: titleCase(reported) })}
                    </Note>
                )}
            </Gate>
        </Section>
    );
}

export function DimensionsPanel({ panels }: { panels: MacroPanelData }) {
    const { t } = useLanguage();
    const avgs = dimensionAverages(panels.features);
    return (
        <Section title={t('mcDimensions')}>
            <Gate loaded={panels.loaded.features} ok={avgs.length > 0}>
                <ul className="mt-3">
                    {avgs.map((d) => <Row key={d.id} label={dimensionLabel(t, d.id)} value={signed(lastValue(d))} />)}
                </ul>
                <Note>{t('mcDimensionsNote')}</Note>
            </Gate>
        </Section>
    );
}

const yesNo = (v: boolean | null | undefined, yes: string, no: string, none: string): string => (v === true ? yes : v === false ? no : none);

export function RiskDialPanel({ risk, loaded }: { risk: MriRiskState | null; loaded: boolean }) {
    const { t } = useLanguage();
    const state = risk?.dial?.state;
    const price = risk?.price_rule;
    const macro = risk?.macro_reading;
    const n = (v: number | null | undefined) => (v == null ? DASH : v.toFixed(2));
    return (
        <Section
            title={t('mcDial')}
            right={(
                <span className="flex gap-1.5">
                    {risk?.degraded === true && <Tag className="border-warn/60 text-warn">{t('mcDegraded')}</Tag>}
                    <Tag>{t('mcShadow')}</Tag>
                </span>
            )}
        >
            <Note>{t('mcDialShadow')}</Note>
            <Gate loaded={loaded} ok={risk !== null}>
                {(risk?.reasons ?? []).map((r, i) => <p key={i} className="mt-1 break-words font-mono text-[11px] text-warn">· {r}</p>)}
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                    <Metric
                        label={t('mcDialToday')}
                        value={state === 'full' ? t('mcDialFull') : state === 'half' ? t('mcDialHalf') : DASH}
                        sub={risk?.dial?.since ? fill(t('mcDialSince'), { d: risk.dial.since }) : DASH}
                    />
                    <Metric label={t('mcSpyClose')} value={n(price?.spy_close)} sub={risk?.asof ? fill(t('mcAsOf'), { d: risk.asof }) : DASH} />
                    <Metric
                        label={t('mcSpy200')}
                        value={n(price?.mean_200)}
                        sub={yesNo(price?.below, t('mcSpyBelow'), t('mcSpyNotBelow'), DASH)}
                    />
                </div>
                <Note>{t('mcDialRule')}</Note>
                <Micro className="mt-3 block">{t('mcDialContext')}</Micro>
                <ul className="mt-1">
                    <Row
                        label={`${t('mcRecStag')}${macro?.month ? ` · ${macro.month}` : ''}`}
                        value={macro?.recession_plus_stagflation == null ? DASH : pctText(macro.recession_plus_stagflation, 1)}
                    />
                    <Row label={t('mcTopThird')} value={macro?.top_third_threshold == null ? DASH : pctText(macro.top_third_threshold, 1)} />
                    <Row label={t('mcInTopThird')} value={yesNo(macro?.in_top_third, t('mcYes'), t('mcNo'), DASH)} />
                    <Row label={t('mcVixAlarm')} value={yesNo(risk?.vix_alarm?.active, t('mcActive'), t('mcNotActive'), DASH)} />
                </ul>
                <Note>
                    {fill(t('mcDialVerdict'), { v: risk?.evidence?.verdict ?? DASH })}
                </Note>
            </Gate>
        </Section>
    );
}

// ── Macro ─────────────────────────────────────────────────────────────────────────────────────────

export function MacroStatsPanel({ regime, panels }: { regime: MriRegime | null; panels: MacroPanelData }) {
    const { t } = useLanguage();
    const reported = regime?.reported_regime ?? panels.daily?.macro?.reported_regime ?? null;
    const raw = regime?.raw_dominant_regime ?? panels.daily?.macro?.raw_dominant_regime ?? null;
    const confidence = regime?.confidence ?? panels.daily?.macro?.confidence ?? null;
    const held = reported !== null && raw !== null && reported !== raw;
    const rawP = raw ? regime?.regime_probabilities?.[raw] ?? null : null;
    const conviction = convictionKey(confidence);
    return (
        <Section title={t('mcReadVsRaw')}>
            <Gate loaded={panels.loaded.daily} ok={reported !== null || raw !== null}>
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                    <Metric
                        label={t('mcReported')}
                        value={reported ? titleCase(reported) : DASH}
                        sub={confidence === null ? undefined : fill(t('mcConfidenceLine'), { c: confidence.toFixed(2) })}
                    />
                    <Metric
                        label={t('mcRawLeader')}
                        value={raw ? titleCase(raw) : DASH}
                        sub={rawP === null ? undefined : fill(t('mcProbabilityLine'), { p: pctText(rawP, 1) })}
                    />
                    <Metric
                        label={t('mcFilter')}
                        value={held ? fill(t('mcHolding'), { r: titleCase(reported ?? '') }) : t('mcNotHolding')}
                        sub={held ? t('mcHoldingWhy') : t('mcAgreeWhy')}
                    />
                </div>
                {conviction && <Note>{fill(t(conviction), { r: reported ? titleCase(reported) : DASH })}</Note>}
                <Note>{t('mcEvRegime')}</Note>
            </Gate>
        </Section>
    );
}

const cellText = (c: DirectionCell): string => signed(c.value);

export function DirectionPanel({ regime, loaded }: { regime: MriRegime | null; loaded: boolean }) {
    const { t } = useLanguage();
    const rows = directionRows(regime);
    const fieldMissing = rows.length > 0 && rows.every((r) => r.d3.reason?.key === 'mcdNoField');
    const asOf = (Object.values(regime?.dimension_direction ?? {})[0]?.as_of ?? regime?.date) ?? null;
    const reasonText = (c: DirectionCell): string | null => {
        if (c.reason === null || c.reason.key === 'mcdNoField') return null;
        return fill(t(c.reason.key as Parameters<typeof t>[0]), c.reason.vars);
    };
    const cell = (c: DirectionCell) => (
        <td className="px-2 py-1.5 text-right align-top font-mono text-[12px] text-ink">
            {cellText(c)}
            {reasonText(c) && <span className="mt-0.5 block text-right font-sans text-[10.5px] font-normal leading-snug text-off">{reasonText(c)}</span>}
        </td>
    );
    return (
        <Section title={t('mcDirection')} sub={asOf ? fill(t('mcAsOf'), { d: asOf.slice(0, 7) }) : undefined}>
            <Note>{t('mcDirectionLine')}</Note>
            <Gate loaded={loaded} ok={rows.length > 0}>
                {fieldMissing && <p className="mt-2 font-mono text-[11px] text-warn">{t('mcdNoField')}</p>}
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-left">
                        <thead>
                            <tr className="border-b border-rule-18">
                                <th className="px-2 py-1.5 text-left"><Micro>{t('mcdDimension')}</Micro></th>
                                <th className="px-2 py-1.5 text-right"><Micro>{t('mcdLevel')}</Micro></th>
                                <th className="px-2 py-1.5 text-right"><Micro>{t('mcd3')}</Micro></th>
                                <th className="px-2 py-1.5 text-right"><Micro>{t('mcd6')}</Micro></th>
                                <th className="px-2 py-1.5 text-right"><Micro>{t('mcdZ6')}</Micro></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b border-rule-10 last:border-b-0">
                                    <td className="px-2 py-1.5 align-top text-[13px] text-ink-2">{dimensionLabel(t, r.id)}</td>
                                    {cell(r.level)}
                                    {cell(r.d3)}
                                    {cell(r.d6)}
                                    {cell(r.z6)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Note>{t('mcdUnits')}</Note>
            </Gate>
        </Section>
    );
}

export function ProbabilityHistoryPanel({ panels }: { panels: MacroPanelData }) {
    const { t } = useLanguage();
    const points = timelinePoints(panels.timeline);
    return (
        <Section title={t('mcProbHistory')}>
            <Gate loaded={panels.loaded.timeline} ok={points.length > 1}>
                <div className="mt-3"><ProbabilityHistory points={points.slice(-24)} /></div>
                <Note>{t('mcProbHistoryNote')}</Note>
            </Gate>
        </Section>
    );
}

export function IndicatorsPanel({ panels, cloud }: { panels: MacroPanelData; cloud: MacroCloudData }) {
    const { t } = useLanguage();
    const order = dimensionAverages(panels.features).map((d) => d.id);   // the engine's dimension order
    const sorted = (panels.features?.dimensions ?? [])
        .filter((d) => order.includes(d.dimension_id ?? '') && (d.features?.length ?? 0) > 0)
        .sort((a, b) => order.indexOf(a.dimension_id ?? '') - order.indexOf(b.dimension_id ?? ''));
    const [pick, setPick] = useState<string | null>(null);
    const active = sorted.find((d) => d.dimension_id === pick) ?? sorted[0];
    // Inputs the engine extended with a fallback series (from the cloud job's data-health file), for the dimension on show.
    const fallbackNotes = (cloud.health?.input_groups ?? [])
        .filter((g) => g.group === active?.dimension_id)
        .flatMap((g) => g.inputs ?? [])
        .flatMap((input) => {
            const note = fallbackNote(input);
            return note ? [`${seriesLabel(t, input.series_id || input.feature_id || '')} ${fill(t(note.key as Parameters<typeof t>[0]), note.vars)}`] : [];
        });
    return (
        <Section title={t('mcIndicators')}>
            <Gate loaded={panels.loaded.features} ok={active !== undefined}>
                <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist">
                    {sorted.map((d) => (
                        <Chip
                            key={d.dimension_id}
                            role="tab"
                            aria-selected={d.dimension_id === active?.dimension_id}
                            active={d.dimension_id === active?.dimension_id}
                            className="shrink-0"
                            onClick={() => setPick(d.dimension_id ?? null)}
                        >
                            {dimensionLabel(t, d.dimension_id ?? '')}
                        </Chip>
                    ))}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
                    {(active?.features ?? []).map((f, i) => (
                        <div key={`${f.feature_id}-${i}`} className="min-w-0">
                            <Micro className="block break-words normal-case tracking-normal" title={f.series_id ?? f.feature_id ?? ''}>{featureLabel(f, (id) => seriesLabel(t, id))}</Micro>
                            <div className="mt-1"><MiniLine points={f.points ?? []} /></div>
                        </div>
                    ))}
                </div>
                <Note>{t('mcIndicatorsNote')}</Note>
                {fallbackNotes.map((n) => <Note key={n}>{n}</Note>)}
            </Gate>
        </Section>
    );
}

export function SourceHealthPanel({ panels }: { panels: MacroPanelData }) {
    const { t } = useLanguage();
    const items = sourceHealth(panels.features);
    return (
        <Section title={fill(t('mcSourceHealth'), { n: items.length })}>
            <Gate loaded={panels.loaded.features} ok={items.length > 0}>
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {items.map((s) => (
                        <Tag key={s.id} className={s.stale ? 'border-warn/60 text-warn' : undefined}>
                            <span title={s.id} className="normal-case tracking-normal">
                                {seriesLabel(t, s.id)}{s.stale ? ` · ${t('mcLast')} ${s.last.slice(0, 7)}` : ''}
                            </span>
                        </Tag>
                    ))}
                </div>
                <Note>{t('mcSourceHealthNote')}</Note>
            </Gate>
        </Section>
    );
}

// ── Sectors ───────────────────────────────────────────────────────────────────────────────────────

export function SectorsTab({ panels }: { panels: MacroPanelData }) {
    const { t } = useLanguage();
    const rows = sectorRows(panels.ranking);
    const [pick, setPick] = useState<string | null>(null);
    const selected = rows.find((r) => r.sector_id === pick) ?? rows[0];
    const bars = componentBars(selected);
    const sections = validationSections(panels.validation);
    const [sectionPick, setSectionPick] = useState<string | null>(null);
    const [horizonPick, setHorizonPick] = useState<string | null>(null);
    const activeSection = sections.find((s) => s.section === sectionPick) ?? sections[0];
    const inSection = activeSection?.rows ?? [];
    const active = inSection.find((r) => r.horizon === horizonPick) ?? inSection[0];
    const spread = active?.top_minus_bottom_spread;
    return (
        <div className="space-y-6">
            <Section title={t('mcSectorRanking')} right={<Tag>{t('mcContextOnly')}</Tag>}>
                <Note>{t('mcEvSector')}</Note>
                <Gate loaded={panels.loaded.ranking} ok={rows.length > 0}>
                    <details className="mt-3 group">
                        <summary className="cursor-pointer font-mono text-[11px] text-ink-2 hover:text-ink">{t('mcShowRanking')}</summary>
                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full min-w-[420px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-rule-18">
                                        <th className="w-8 px-2 py-1.5 text-left"><Micro>#</Micro></th>
                                        <th className="px-2 py-1.5 text-left"><Micro>{t('mcSector')}</Micro></th>
                                        <th className="px-2 py-1.5 text-left"><Micro>{t('mcProxy')}</Micro></th>
                                        <th className="px-2 py-1.5 text-right"><Micro>{t('mcRaw')}</Micro></th>
                                        <th className="px-2 py-1.5 text-right"><Micro>{t('mcConfAdj')}</Micro></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r, i) => {
                                        const on = r.sector_id === selected?.sector_id;
                                        const choose = () => setPick(r.sector_id ?? null);
                                        return (
                                            <tr
                                                key={r.sector_id ?? i}
                                                tabIndex={0}
                                                aria-selected={on}
                                                onClick={choose}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } }}
                                                className={clsx('cursor-pointer border-b border-rule-10 last:border-b-0 hover:bg-track-12', on && 'bg-track-12')}
                                            >
                                                <td className="px-2 py-1.5 font-mono text-[12px] text-ink-2">{r.rank ?? i + 1}</td>
                                                <td className={clsx('px-2 py-1.5 text-[13px]', on ? 'font-semibold text-ink' : 'text-ink-2')}>{sectorName(r)}</td>
                                                <td className="px-2 py-1.5 font-mono text-[12px] text-ink-2">{r.proxy_ticker ?? DASH}</td>
                                                <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink">{signed(r.raw_sector_score)}</td>
                                                <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink">{signed(r.confidence_adjusted_score)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </Gate>
            </Section>

            <Section title={`${t('mcComponents')}${selected ? ` · ${sectorName(selected)}` : ''}`} right={<Tag>{t('mcContextOnly')}</Tag>}>
                <Gate loaded={panels.loaded.ranking} ok={rows.length > 0}>
                    <div className="mt-3"><DivergingBars rows={bars} /></div>
                    <Note>{t('mcComponentsNote')}</Note>
                </Gate>
            </Section>

            <Section
                title={t('mcValidation')}
                right={active ? (
                    <span className="flex flex-wrap gap-1.5">
                        {sections.length > 1 && sections.map((s) => (
                            <Chip key={s.section} active={s.section === activeSection?.section} onClick={() => { setSectionPick(s.section); setHorizonPick(null); }}>
                                {CROSS_SECTION_LABELS[s.section] ?? s.section}
                            </Chip>
                        ))}
                        {inSection.length > 1 && inSection.map((r) => (
                            <Chip key={r.horizon} active={r.horizon === active.horizon} onClick={() => setHorizonPick(r.horizon ?? null)}>{r.horizon}</Chip>
                        ))}
                    </span>
                ) : undefined}
            >
                <Gate loaded={panels.loaded.validation} ok={active !== undefined}>
                    <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                        <Metric label={t('mcRankIc')} value={signed(active?.rank_ic_spearman)} />
                        <Metric label={t('mcTopBottom')} value={spread == null ? DASH : `${signed(spread * 100, 1)} %`} />
                        <Metric label={t('mcHitRate')} value={pctText(active?.hit_rate_top_positive, 1)} />
                    </div>
                    <Note>
                        {fill(t('mcValidationNote'), {
                            n: active?.observation_count ?? DASH,
                            from: panels.validation?.score_start_date?.slice(0, 7) ?? DASH,
                            to: panels.validation?.score_end_date?.slice(0, 7) ?? DASH,
                        })}
                        {bestAbsIc(inSection) < 0.1 ? ` ${t('mcValidationWeak')}` : ''}
                    </Note>
                </Gate>
            </Section>
        </div>
    );
}

// ── Monitoring and history ────────────────────────────────────────────────────────────────────────

/** `extra` is more rows for the list (the cloud export rows, which come from a file this module does not load). */
export function LatestRunPanel({ panels, extra }: { panels: MacroPanelData; extra?: React.ReactNode }) {
    const { t } = useLanguage();
    const d = panels.daily;
    const fresh = d?.feature_freshness;
    return (
        <Section title={t('mcLatestRun')}>
            <Gate loaded={panels.loaded.daily} ok={d !== null}>
                <ul className="mt-3">
                    <Row label={t('mcRunDate')} value={d?.run_date ?? DASH} />
                    <Row label={t('mcRunStatus')} value={d?.status ?? DASH} />
                    <Row label={t('mcRunId')} value={d?.run_id ?? DASH} />
                    <Row label={t('mcGuardrail')} value={d?.step_statuses?.guardrail_status ?? DASH} />
                    <Row
                        label={t('mcFeatureFreshness')}
                        sub={fresh?.max_feature_date ? fill(t('mcNewestFeature'), { d: fresh.max_feature_date }) : undefined}
                        value={fresh?.gap_days == null ? DASH : `${fill(t(fresh.gap_days === 1 ? 'mcDayOne' : 'mcDays'), { n: fresh.gap_days })}${fresh.stale ? ` · ${t('mcStale')}` : ''}`}
                    />
                    <Row
                        label={t('mcNonFatal')}
                        value={d?.non_fatal_failures == null ? DASH : d.non_fatal_failures.length === 0 ? t('mcNone') : d.non_fatal_failures.join(', ')}
                    />
                    {extra}
                </ul>
                <Note>{t('mcLatestRunNote')}</Note>
            </Gate>
        </Section>
    );
}

export function WarningsPanel({ panels }: { panels: MacroPanelData }) {
    const { t } = useLanguage();
    const errors = panels.daily?.errors ?? [];
    const warnings = panels.daily?.warnings ?? [];
    return (
        <Section title={t('mcWarningsTitle')} sub={panels.daily ? fill(t('mcWarningsCount'), { e: errors.length, w: warnings.length }) : undefined}>
            <Gate loaded={panels.loaded.daily} ok={panels.daily !== null}>
                {errors.length + warnings.length === 0
                    ? <p className="mt-3 font-mono text-[11px] text-ink-2">{t('mcNone')}</p>
                    : (
                        <ul className="mt-3 space-y-1 font-mono text-[11px] text-ink-2">
                            {errors.map((e, i) => <li key={`e${i}`} className="break-words text-neg">· {e}</li>)}
                            {warnings.map((w, i) => <li key={`w${i}`} className="break-words">· {w}</li>)}
                        </ul>
                    )}
            </Gate>
        </Section>
    );
}

export function RibbonPanel({ panels, cloud }: { panels: MacroPanelData; cloud: MacroCloudData }) {
    const { t } = useLanguage();
    const points = timelinePoints(panels.timeline);
    const since = points[0]?.date?.slice(0, 4);
    const runs = regimeRuns(points);
    return (
        <Section title={since ? fill(t('mcRibbonSince'), { y: since }) : t('mcRibbon')} sub={runs.length > 0 ? fill(t('mcRibbonRuns'), { n: runs.length, m: points.length }) : undefined}>
            <Gate loaded={panels.loaded.timeline} ok={points.length > 1}>
                <div className="mt-3"><RegimeRibbon points={points} recessions={recessionSpans(cloud.nber)} /></div>
                <Note>{t('mcRibbonNote')}</Note>
            </Gate>
        </Section>
    );
}

// ── Methodology ───────────────────────────────────────────────────────────────────────────────────

type K = Parameters<ReturnType<typeof useLanguage>['t']>[0];

const METHOD_SECTIONS: { title: K; lines: K[] }[] = [
    { title: 'mmWhatTitle', lines: ['mmWhat1', 'mmWhat2'] },
    { title: 'mmFlowTitle', lines: ['mmFlow1', 'mmFlow2', 'mmFlow3', 'mmFlow4', 'mmFlow5', 'mmFlow6'] },
    { title: 'mmNotTitle', lines: ['mmNot1', 'mmNot2'] },
    { title: 'mmLimitsTitle', lines: ['mmLimits1', 'mmLimits2', 'mmLimits3', 'mmLimits4'] },
];

const GLOSSARY: { term: K; def: K }[] = [
    { term: 'mgRegime', def: 'mgRegimeDef' },
    { term: 'mgConfidence', def: 'mgConfidenceDef' },
    { term: 'mgRawReported', def: 'mgRawReportedDef' },
    { term: 'mgDimension', def: 'mgDimensionDef' },
    { term: 'mgLevelDirection', def: 'mgLevelDirectionDef' },
    { term: 'mgPrior', def: 'mgPriorDef' },
    { term: 'mgZ', def: 'mgZDef' },
    { term: 'mgRankIc', def: 'mgRankIcDef' },
];

export function MethodologyTab() {
    const { t } = useLanguage();
    return (
        <div className="max-w-3xl space-y-6">
            <p className="text-[13.5px] leading-relaxed text-ink-2">{t('mmIntro')}</p>
            {METHOD_SECTIONS.map((s) => (
                <Section key={s.title} title={t(s.title)}>
                    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
                        {s.lines.map((l) => <li key={l}>{t(l)}</li>)}
                    </ul>
                </Section>
            ))}
            <Section title={t('mmGlossaryTitle')}>
                <dl className="mt-3 space-y-2.5 text-[13px] leading-relaxed">
                    {GLOSSARY.map((g) => (
                        <div key={g.term}>
                            <dt className="font-semibold text-ink">{t(g.term)}</dt>
                            <dd className="text-ink-2">{t(g.def)}</dd>
                        </div>
                    ))}
                </dl>
            </Section>
            <p className="font-mono text-[11px] leading-relaxed text-off">{t('mmDisclaimer')}</p>
        </div>
    );
}
