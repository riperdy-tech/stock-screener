'use client';

// The panels fed by the MRI's cloud news job (WO_MP2): data health, news scores, the combined ranking, the news sources,
// readiness, classification quality, source coverage, run history and the NBER benchmark. The files come from the cloud run,
// not from the local daily run, so every panel says it comes from the cloud news job and shows the date of its data; a file
// older than CLOUD_STALE_DAYS says so. The news scores and the combined ranking describe what the news said and what the
// ranking would be with it. They are not a signal and no sentence here says they predict anything. A missing file shows
// "not available" for its panel; the page always renders.

import React, { useState } from 'react';
import clsx from 'clsx';
import { useLanguage } from '@/components/LanguageContext';
import type { MacroCloudData, MacroPanelData } from '@/lib/desk/useDeskData';
import { fill } from '@/lib/desk/text';
import { pctText } from '@/lib/desk/health';
import {
    cloudAgeDays, cloudDate, CLOUD_STALE_DAYS, cloudStale, coverageRows, DASH, dimensionName, fallbackNote, filterRuns, labelOf,
    lowConfidenceItems, maxRankChange, medianLeadMonths, newsSectorRows, newsThemeRows, newsWeightRange, overlayMoves,
    prettyId, READINESS_STEPS, runTimeUtc, safeHttpUrl, sectorLabels, seriesName, signed, titleCase, type RunFilter,
} from '@/lib/desk/macroPanels';
import { Chip, Micro, Tag } from '../primitives';
import { DivergingBars, SlopeChart } from './MacroCharts';
import { Gate, Metric, Note, Row, Section } from './MacroPanels';

type K = Parameters<ReturnType<typeof useLanguage>['t']>[0];

/** What every panel here needs: the cloud files and "now" (fixed at page load so the ages do not flicker). */
export interface CloudCtx { cloud: MacroCloudData; panels: MacroPanelData; now: number }

/** "Cloud news job · data of 2026-11-18", and a warning line when that file is older than CLOUD_STALE_DAYS. */
function CloudNote({ file, ctx }: { file: string; ctx: CloudCtx }) {
    const { t } = useLanguage();
    const date = cloudDate(ctx.cloud.manifest, file);
    const age = cloudAgeDays(date, ctx.now);
    return (
        <p className="mt-2 font-mono text-[11px] text-off">
            {date ? fill(t('mcCloudFrom'), { d: date }) : t('mcCloudNoDate')}
            {cloudStale(date, ctx.now) && (
                <span className="text-warn"> · ● {fill(t('mcCloudOld'), { n: age ?? DASH, limit: CLOUD_STALE_DAYS })}</span>
            )}
        </p>
    );
}

const dayText = (t: (k: K) => string, n: number | null | undefined): string =>
    n == null ? DASH : fill(t(n === 1 ? 'mcDayOne' : 'mcDays'), { n });

// ── Overview: input freshness (data_health.json) ──────────────────────────────────────────────────

export function DataHealthPanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const h = ctx.cloud.health;
    const daily = h?.daily;
    const prices = h?.sector_prices;
    const groups = h?.input_groups ?? null;
    const carried = h?.carried_forward ?? null;
    const failures = daily?.non_fatal_failures ?? null;
    const gap = daily?.feature_freshness?.gap_days;
    const priceLine = prices
        ? `${prices.fresh === true ? t('mchdFresh') : prices.fresh === false ? t('mcStale') : DASH} · ${fill(t('mchdLastPrice'), { d: prices.last_price_date ?? DASH })}${prices.age_days == null ? '' : ` · ${fill(t('mchdBefore'), { n: dayText(t, prices.age_days) })}`}`
        : DASH;
    return (
        <Section title={t('mcuDataHealth')} right={h?.reading_date ? <Tag>{fill(t('mchdReading'), { d: h.reading_date })}</Tag> : undefined}>
            <CloudNote file="data_health.json" ctx={ctx} />
            <Gate loaded={ctx.cloud.loaded.health} ok={h !== null}>
                <ul className="mt-3">
                    <Row label={t('mchdStatus')} value={daily?.status ?? DASH} />
                    <Row label={t('mchdWarnings')} value={daily?.warning_count ?? DASH} />
                    <Row label={t('mchdNonFatal')} value={failures === null ? DASH : failures.length === 0 ? t('mcNone') : failures.join(', ')} />
                    <Row label={t('mchdIndicators')} value={gap == null ? DASH : `${dayText(t, gap)}${daily?.feature_freshness?.stale ? ` · ${t('mcStale')}` : ''}`} />
                    <Row
                        label={t('mchdPrices')}
                        sub={prices?.fresh_within_days != null ? fill(t('mchdPricesNote'), { n: prices.fresh_within_days }) : undefined}
                        value={priceLine}
                    />
                    {prices?.market_observed === false && (
                        <Row label={t('mchdNotMarket')} value={(prices.reasons ?? []).join('; ') || DASH} />
                    )}
                    <Row label={t('mchdCarried')} value={carried === null ? DASH : carried.length === 0 ? t('mcNone') : carried.length} />
                    {(carried ?? []).map((c, i) => (
                        <Row
                            key={i}
                            label={seriesName(c.series_id || c.feature_id || '')}
                            sub={fill(t('mchdCarriedItem'), { g: dimensionName(c.group ?? '') })}
                            value={`${c.observation_date ?? DASH} · ${dayText(t, c.age_days)}`}
                        />
                    ))}
                </ul>
                <Micro className="mt-4 block">{t('mchdOldest')}</Micro>
                {groups ? (
                    <>
                        <ul className="mt-1">
                            {groups.map((g) => {
                                const inputs = g.inputs ?? [];
                                const flags = [
                                    ...(g.carried_forward_count ? [fill(t('mchdCarriedCount'), { n: g.carried_forward_count })] : []),
                                    ...inputs.filter((i) => i.used === false).map((i) => fill(t('mchdNotUsed'), { name: seriesName(i.series_id || i.feature_id || ''), why: i.reason ?? DASH })),
                                    ...inputs.flatMap((i) => {
                                        const note = fallbackNote(i);
                                        return note ? [`${seriesName(i.series_id || i.feature_id || '')} ${fill(t(note.key as K), note.vars)}`] : [];
                                    }),
                                ];
                                return (
                                    <Row
                                        key={g.group}
                                        label={dimensionName(g.group ?? '')}
                                        sub={flags.length ? flags.join(' · ') : undefined}
                                        value={`${g.oldest_input_date ?? DASH} · ${dayText(t, g.oldest_input_age_days)}`}
                                    />
                                );
                            })}
                        </ul>
                        <Note>{fill(t('mchdOldestNote'), { d: h?.reading_date ?? DASH })}</Note>
                    </>
                ) : (
                    <Note>{fill(t('mchdNoGroups'), { why: h?.input_groups_reason ? ` (${h.input_groups_reason})` : '' })}</Note>
                )}
                {(daily?.warnings?.length || daily?.errors?.length) ? (
                    <details className="mt-3">
                        <summary className="cursor-pointer font-mono text-[11px] text-ink-2 hover:text-ink">{t('mchdShowWarnings')}</summary>
                        <ul className="mt-2 space-y-1 font-mono text-[11px] text-ink-2">
                            {(daily?.errors ?? []).map((e, i) => <li key={`e${i}`} className="break-words text-neg">· {e}</li>)}
                            {(daily?.warnings ?? []).map((w, i) => (
                                <li key={`w${i}`} className="break-words">· {w.warning}{(w.count ?? 1) > 1 ? ` × ${w.count}` : ''}</li>
                            ))}
                        </ul>
                    </details>
                ) : null}
            </Gate>
        </Section>
    );
}

// ── News tab ──────────────────────────────────────────────────────────────────────────────────────

export function NewsThemesPanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const report = ctx.cloud.newsScores;
    const themes = newsThemeRows(report);
    const sectors = newsSectorRows(report);
    const labels = sectorLabels(ctx.panels.ranking);
    return (
        <Section title={t('mcuThemes')} right={<Tag>{t('mcnDescription')}</Tag>}>
            <CloudNote file="news_score_report.json" ctx={ctx} />
            <Note>{t('mcnDescribes')}</Note>
            <Gate loaded={ctx.cloud.loaded.newsScores} ok={report !== null && (themes.length > 0 || sectors.length > 0)}>
                <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
                    <div className="min-w-0">
                        <Micro className="block">{t('mcnThemes')}</Micro>
                        <ul className="mt-1">
                            {themes.map((r) => <Row key={r.key} label={prettyId(r.id)} value={signed(r.score)} />)}
                        </ul>
                    </div>
                    <div className="min-w-0">
                        <Micro className="block">{t('mcnSectors')}</Micro>
                        <div className="mt-2">
                            <DivergingBars
                                rows={sectors.map((r) => ({
                                    key: r.key,
                                    label: labelOf(r.id, labels),
                                    value: r.score,
                                    note: r.items === null ? undefined : fill(t('mcnItems'), { n: r.items }),
                                }))}
                            />
                        </div>
                        <Note>{t('mcnSectorsNote')}</Note>
                    </div>
                </div>
            </Gate>
        </Section>
    );
}

export function LowConfidencePanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const report = ctx.cloud.newsScores;
    const items = lowConfidenceItems(report);
    return (
        <Section title={t('mcuLowConf')}>
            <CloudNote file="news_score_report.json" ctx={ctx} />
            <Gate loaded={ctx.cloud.loaded.newsScores} ok={report !== null}>
                {items.length === 0
                    ? <p className="mt-3 font-mono text-[11px] text-ink-2">{t('mcNone')}</p>
                    : (
                        <ul className="mt-3">
                            {items.map((item, i) => (
                                <li key={`${item.news_id}-${i}`} className="flex items-start justify-between gap-x-4 border-b border-rule-10 py-2 text-[13px] last:border-b-0">
                                    <span className="min-w-0">
                                        <span className="block break-words text-ink">{item.title ?? DASH}</span>
                                        {item.summary && <span className="mt-0.5 block break-words text-[12px] text-ink-2">{item.summary}</span>}
                                    </span>
                                    <Tag className="shrink-0">{fill(t('mcnConf'), { c: item.confidence == null ? DASH : item.confidence.toFixed(2) })}</Tag>
                                </li>
                            ))}
                        </ul>
                    )}
                <Note>{t('mcnLowNote')}</Note>
            </Gate>
        </Section>
    );
}

export function CombinedPanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const combined = ctx.cloud.combined;
    const labels = sectorLabels(ctx.panels.ranking);
    const moves = overlayMoves(combined);
    const rows = moves.map((m) => ({ ...m, label: labelOf(m.id, labels) })).sort((a, b) => a.from - b.from);
    const fallback = moves.filter((m) => m.thin).length;
    const weights = newsWeightRange(combined);
    const overlay = ctx.cloud.monitoring?.overlay_monitoring;
    const guardrail = ctx.cloud.cloudDaily?.step_statuses?.guardrail_status;
    return (
        <Section title={t('mcuCombined')} right={<span className="flex gap-1.5"><Tag>{t('mccbExperimental')}</Tag><Tag>{t('mcnDescription')}</Tag></span>}>
            <CloudNote file="combined_sector_diagnostic.json" ctx={ctx} />
            <Gate loaded={ctx.cloud.loaded.combined} ok={rows.length > 0}>
                <div className="mt-3"><SlopeChart rows={rows} /></div>
                <Note>{t('mccbSlopeNote')}</Note>
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                    <Metric label={t('mccbMaxChange')} value={maxRankChange(moves)} />
                    <Metric label={t('mccbFallback')} value={fill(t(fallback === 1 ? 'mccbSectorOne' : 'mccbSectors'), { n: fallback })} />
                    <Metric label={t('mccbGuardrail')} value={guardrail ?? DASH} />
                </div>
                <Note>
                    {weights === null
                        ? null
                        : weights.max === 0
                            ? t('mccbNoWeight')
                            : fill(t('mccbWeight'), { min: pctText(weights.min, 0), max: pctText(weights.max, 0) })}
                </Note>
                {overlay && (
                    <Note>{fill(t('mccbOverlay'), { s: overlay.overlay_status ?? DASH, n: overlay.news_item_count ?? DASH })}</Note>
                )}
            </Gate>
        </Section>
    );
}

export function NewsSourcesPanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const groups = (ctx.cloud.sources?.groups ?? []).filter((g) => (g.sources?.length ?? 0) > 0);
    return (
        <Section title={t('mcuSources')}>
            <CloudNote file="news_sources.json" ctx={ctx} />
            <Gate loaded={ctx.cloud.loaded.sources} ok={groups.length > 0}>
                <Note>{t('mcsNote')}</Note>
                <div className="mt-3 space-y-3">
                    {groups.map((g) => (
                        <div key={g.group} className="min-w-0">
                            <Micro className="block">{prettyId(g.group ?? '')}</Micro>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {(g.sources ?? []).map((s, i) => {
                                    const href = safeHttpUrl(s.url);
                                    const name = prettyId(s.name ?? '');
                                    return href
                                        ? (
                                            <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="border border-rule-24 px-2 py-1 font-mono text-[11px] text-ink-2 hover:text-ink">
                                                {name}
                                            </a>
                                        )
                                        : <Tag key={i} className="normal-case tracking-normal">{name}</Tag>;
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </Gate>
        </Section>
    );
}

export function NewsSourceHealthPanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const health = ctx.cloud.cloudDaily?.news_health;
    const sources = [...(health?.sources ?? [])].sort((a, b) => (b.dead ? 1 : 0) - (a.dead ? 1 : 0));
    return (
        <Section title={t('mcuSourceHealth')}>
            <CloudNote file="cloud_daily_diagnostic_summary.json" ctx={ctx} />
            <Gate loaded={ctx.cloud.loaded.cloudDaily} ok={sources.length > 0}>
                <p className="mt-3 font-mono text-[11px] text-ink-2">
                    {fill(t('mcshStatus'), { s: health?.status ?? DASH })}
                    {(health?.reasons ?? []).length > 0 && ` · ${(health?.reasons ?? []).join(', ')}`}
                </p>
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[460px] border-collapse text-left">
                        <thead>
                            <tr className="border-b border-rule-18">
                                <th className="px-2 py-1.5 text-left"><Micro>{t('mcshSource')}</Micro></th>
                                <th className="px-2 py-1.5 text-left"><Micro>{t('mcshState')}</Micro></th>
                                <th className="px-2 py-1.5 text-right"><Micro>{t('mcshNew')}</Micro></th>
                                <th className="px-2 py-1.5 text-left"><Micro>{t('mcshLast')}</Micro></th>
                                <th className="px-2 py-1.5 text-right"><Micro>{t('mcshStreak')}</Micro></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sources.map((s, i) => (
                                <tr key={`${s.source_id}-${i}`} className="border-b border-rule-10 last:border-b-0">
                                    <td className="px-2 py-1.5 font-mono text-[12px] text-ink-2">{s.source_id ?? DASH}</td>
                                    <td className={clsx('px-2 py-1.5 text-[13px]', s.dead ? 'text-warn' : 'text-ink-2')}>
                                        {s.status ?? DASH}{s.dead ? ` (${t('mcshDead')})` : ''}
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink">{s.items_new ?? DASH}</td>
                                    <td className="px-2 py-1.5 font-mono text-[12px] text-ink-2">{s.last_new_at ? s.last_new_at.slice(0, 16).replace('T', ' ') : t('mcshNever')}</td>
                                    <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink">{s.consecutive_bad_runs ?? DASH}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Note>{t('mcshNote')}</Note>
            </Gate>
        </Section>
    );
}

// ── Monitoring tab ────────────────────────────────────────────────────────────────────────────────

export function ReadinessPanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const a = ctx.cloud.accumulation;
    const label = a?.readiness_label ?? a?.latest_run?.readiness_label ?? 'insufficient_history';
    const step = READINESS_STEPS.find((s) => s.id === label) ?? READINESS_STEPS[0];
    const classified = a?.total_classified_items ?? a?.latest_run?.classified_items;
    return (
        <Section title={t('mcuReadiness')}>
            <CloudNote file="news_accumulation_report.json" ctx={ctx} />
            <Gate loaded={ctx.cloud.loaded.accumulation} ok={a !== null}>
                <ol className="mt-3 grid grid-cols-2 gap-px border border-rule-18 bg-rule-18 sm:grid-cols-4">
                    {READINESS_STEPS.map((s) => (
                        <li key={s.id} className={clsx('bg-surface px-3 py-2 text-[12.5px]', s.id === step.id ? 'font-bold text-ink' : 'text-ink-3')} aria-current={s.id === step.id ? 'step' : undefined}>
                            {t(s.label)}
                            <span className="block font-mono text-[10.5px] font-normal text-off">{t(s.range)}</span>
                        </li>
                    ))}
                </ol>
                <Note>{fill(t('mcrdCaption'), { n: classified == null ? DASH : classified.toLocaleString('en-US'), meaning: t(step.meaning) })}</Note>
            </Gate>
        </Section>
    );
}

export function ClassifyPanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const m = ctx.cloud.monitoring;
    const daily = ctx.cloud.cloudDaily;
    const input = m?.input_quality;
    const items = input?.unique_item_count ?? input?.raw_item_count;
    const unmapped = input?.details_json?.unmapped_pct;
    // An unmapped share of 0 over zero items is "nothing counted", not "everything mapped".
    const unmappedKnown = typeof unmapped === 'number' && items !== 0;
    return (
        <Section title={t('mcuClassify')}>
            <CloudNote file="news_monitoring_report.json" ctx={ctx} />
            <Gate loaded={ctx.cloud.loaded.monitoring} ok={m !== null}>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                    <Metric label={t('mcclSuccess')} value={pctText(m?.classification_quality?.success_rate, 1)} />
                    <Metric label={t('mcclUnmapped')} value={unmappedKnown ? pctText(unmapped, 1) : DASH} sub={!unmappedKnown && items === 0 ? t('mcclUnmappedNone') : undefined} />
                    <Metric label={t('mcclWarnings')} value={daily?.warnings ? daily.warnings.length : DASH} />
                    <Metric label={t('mcclErrors')} value={daily?.errors ? daily.errors.length : DASH} />
                </div>
                <Note>{t('mcclNote')}</Note>
            </Gate>
        </Section>
    );
}

export function CoveragePanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const rows = coverageRows(ctx.cloud.cloudDaily);
    return (
        <Section title={t('mcuCoverage')}>
            <CloudNote file="cloud_daily_diagnostic_summary.json" ctx={ctx} />
            <Gate loaded={ctx.cloud.loaded.cloudDaily} ok={rows.length > 0}>
                <ul className="mt-3 space-y-1.5">
                    {rows.map((r) => (
                        <li key={r.id} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_40px] items-center gap-x-3 text-[13px] sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)_40px_80px]">
                            <span className="min-w-0 break-words text-ink-2">{prettyId(r.id)}</span>
                            <span aria-hidden className="h-3.5 bg-track-12">
                                <span className="block h-full" style={{ width: `${r.total ? (r.ok / r.total) * 100 : 0}%`, background: 'var(--accent)' }} />
                            </span>
                            <span className="text-right font-mono text-[11px] text-ink">{r.ok}/{r.total}</span>
                            <span className="col-span-3 sm:col-span-1">{r.uncovered && <Tag className="border-warn/60 text-warn">{t('mccvUncovered')}</Tag>}</span>
                        </li>
                    ))}
                </ul>
                <Note>{t('mccvNote')}</Note>
            </Gate>
        </Section>
    );
}

/** The two rows of the latest-run panel that come from the cloud job's export manifest. */
export function CloudExportRows({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const x = ctx.cloud.cloudExport;
    const when = x?.generated_at ? new Date(x.generated_at) : null;
    const two = (n: number) => String(n).padStart(2, '0');
    const stamp = when && !Number.isNaN(when.getTime())
        ? `${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}:${two(when.getMinutes())}`
        : DASH;
    return (
        <>
            <Row label={t('mclrExported')} value={stamp} />
            <Row label={t('mclrDataStatus')} value={x?.data_status ?? DASH} />
        </>
    );
}

// ── History tab ───────────────────────────────────────────────────────────────────────────────────

export function RunHistoryPanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const [filter, setFilter] = useState<RunFilter>('all');
    const history = ctx.cloud.history;
    const { rows, total } = filterRuns(history, filter);
    const options: { id: RunFilter; label: K }[] = [
        { id: 'all', label: 'mcrhAll' }, { id: 'live', label: 'mcrhLive' }, { id: 'replay', label: 'mcrhReplay' },
    ];
    return (
        <Section
            title={t('mcuRunHistory')}
            right={(
                <span className="flex gap-1.5">
                    {options.map((o) => <Chip key={o.id} active={filter === o.id} onClick={() => setFilter(o.id)}>{t(o.label)}</Chip>)}
                </span>
            )}
        >
            <CloudNote file="history_index.json" ctx={ctx} />
            <Gate loaded={ctx.cloud.loaded.history} ok={history !== null}>
                {rows.length === 0
                    ? <p className="mt-3 font-mono text-[11px] text-ink-2">{t('mcrhNone')}</p>
                    : (
                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full min-w-[480px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-rule-18">
                                        <th className="px-2 py-1.5 text-left"><Micro>{t('mcrhDate')}</Micro></th>
                                        <th className="px-2 py-1.5 text-left"><Micro>{t('mcrhMode')}</Micro></th>
                                        <th className="px-2 py-1.5 text-left"><Micro>{t('mcrhRegime')}</Micro></th>
                                        <th className="px-2 py-1.5 text-left"><Micro>{t('mcrhGuard')}</Micro></th>
                                        <th className="px-2 py-1.5 text-right"><Micro>{t('mcrhWarn')}</Micro></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r, i) => (
                                        <tr key={`${r.run_id}-${i}`} className={clsx('border-b border-rule-10 last:border-b-0', r.run_mode === 'replay' && 'text-off')}>
                                            <td className="px-2 py-1.5 align-top font-mono text-[12px] text-ink-2">
                                                {r.run_date ?? DASH}
                                                {runTimeUtc(r.run_id) && <span className="text-off"> {runTimeUtc(r.run_id)}</span>}
                                            </td>
                                            <td className="px-2 py-1.5 align-top text-[13px] text-ink-2">{r.run_mode === 'replay' ? t('mcrhReplay') : r.run_mode ?? t('mcrhDaily')}</td>
                                            <td className="px-2 py-1.5 align-top text-[13px] text-ink-2">
                                                {r.macro_regime ? titleCase(r.macro_regime) : DASH}
                                                <span className="text-off"> · {(r.top_combined_sectors ?? []).slice(0, 2).map((s) => labelOf(s, sectorLabels(ctx.panels.ranking))).join(', ') || DASH}</span>
                                            </td>
                                            <td className={clsx('px-2 py-1.5 align-top text-[13px]', r.guardrail_status === 'passed' ? 'text-ink-2' : 'text-warn')}>{r.guardrail_status ?? DASH}</td>
                                            <td className="px-2 py-1.5 text-right align-top font-mono text-[12px] text-ink">{r.warning_count ?? 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                {total > rows.length && <Note>{fill(t('mcrhShowing'), { n: rows.length, m: total })}</Note>}
                <Note>{t('mcrhNote')}</Note>
            </Gate>
        </Section>
    );
}

export function NberPanel({ ctx }: { ctx: CloudCtx }) {
    const { t } = useLanguage();
    const n = ctx.cloud.nber;
    const ok = n?.status === 'ok';
    const lead = medianLeadMonths(n);
    return (
        <Section title={t('mcuNber')}>
            <CloudNote file="nber_benchmark.json" ctx={ctx} />
            <Gate loaded={ctx.cloud.loaded.nber} ok={ok}>
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                    <Metric label={t('mcnbAuroc')} value={n?.auroc == null ? DASH : n.auroc.toFixed(2)} />
                    <Metric label={t('mcnbHit')} value={pctText(n?.label_metrics?.reported?.recession_hit_rate, 0)} />
                    <Metric
                        label={t('mcnbTiming')}
                        value={lead === null ? DASH : fill(t(lead <= 0 ? 'mcnbEarly' : 'mcnbLate'), { n: Math.abs(lead) })}
                    />
                </div>
                <Note>{t('mcnbNote')}</Note>
                {n?.disclaimer && <p className="mt-2 font-mono text-[11px] leading-relaxed text-off">{n.disclaimer}</p>}
            </Gate>
        </Section>
    );
}
