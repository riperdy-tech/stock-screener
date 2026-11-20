'use client';

// The /macro route: the macro backdrop the analyst reads, inside the same Shell as the Desk.
// Handoff README 5.5. A missing file shows "—" per field and one "did not load" line; the page
// always renders. Nothing here is a call on the market.

import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/components/LanguageContext';
import { pctText } from '@/lib/desk/health';
import {
    confidenceText, macroTitle, MACRO_STATIC_USES, mriStale, ordinalPercentile, parseExplanation,
    regimeBars, sectorTilt, shockName,
} from '@/lib/desk/macro';
import { driverPhrase, isWarnStep, marketStale, stepKey } from '@/lib/desk/marketState';
import { fill } from '@/lib/desk/text';
import { invalidateDeskCache, useMacroCloudData, useMacroData, useMacroPanelData } from '@/lib/desk/useDeskData';
import { Chip } from '../primitives';
import { Shell } from '../Shell';
import {
    DimensionsPanel, DirectionPanel, IndicatorsPanel, LatestRunPanel, MacroStatsPanel, MethodologyTab, ProbabilityHistoryPanel,
    QuadrantPanel, ReadingLines, RibbonPanel, RiskDialPanel, Section, SectorsTab, SourceHealthPanel, WarningsPanel,
} from './MacroPanels';
import { TodaySection, useDriverText } from './TodayPanels';
import {
    ClassifyPanel, CloudExportRows, CombinedPanel, CoveragePanel, DataHealthPanel, LowConfidencePanel, NberPanel, NewsSourceHealthPanel,
    NewsSourcesPanel, NewsThemesPanel, ReadinessPanel, RunHistoryPanel, type CloudCtx,
} from './MacroCloudPanels';

const DASH = '—';

const TABS = [
    { id: 'overview', key: 'mcTabOverview' },
    { id: 'macro', key: 'mcTabMacro' },
    { id: 'sectors', key: 'mcTabSectors' },
    { id: 'news', key: 'mcTabNews' },
    { id: 'monitoring', key: 'mcTabMonitoring' },
    { id: 'history', key: 'mcTabHistory' },
    { id: 'method', key: 'mcTabMethod' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** "MM-DD HH:mm" in the viewer's own time zone from an ISO stamp (the build stamps are UTC, which read a day behind in Asia); "—" when absent or unreadable. */
function localMdHm(stamp: string | null | undefined): string {
    const d = stamp ? new Date(stamp) : null;
    if (!d || Number.isNaN(d.getTime())) return DASH;
    const two = (n: number) => String(n).padStart(2, '0');
    return `${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function MacroPage() {
    const { t } = useLanguage();
    const { regime, anchor, factor, loaded } = useMacroData();
    const panels = useMacroPanelData();
    const cloud = useMacroCloudData();
    const [tab, setTab] = useState<TabId>('overview');
    // The tab lives in the address (/macro#sectors), read after mount so the server and first client render agree.
    useEffect(() => {
        const fromHash = () => {
            const id = window.location.hash.replace('#', '');
            const found = TABS.find((x) => x.id === id);
            if (found) setTab(found.id);
        };
        fromHash();
        window.addEventListener('hashchange', fromHash);
        return () => window.removeEventListener('hashchange', fromHash);
    }, []);
    const selectTab = (id: TabId) => {
        setTab(id);
        window.history.replaceState(null, '', `#${id}`);
    };
    const now = useMemo(() => Date.now(), []);
    const ctx: CloudCtx = { cloud, panels, now };
    const driverText = useDriverText();
    // The headline is the market state when its file loaded and names a step this page knows; else it is the monthly regime, as before.
    const ms = panels.market;
    const stepK = stepKey(ms?.step);
    const live = ms != null && stepK !== null;

    const bars = regimeBars(regime);
    const title = macroTitle(regime);
    const why = (regime?.explanation ?? []).map(parseExplanation);
    const shocks = regime?.active_shocks_on_date ?? null;
    const warnings = regime?.data_health_warnings ?? null;
    const tilt = sectorTilt(factor ? (factor.sector_quota_source ?? null) : null);
    // A stamp older than 45 days turns warn and carries the word "stale".
    const regimeStale = mriStale(regime?.date, now) || mriStale(regime?.built_at, now);
    const anchorStale = mriStale(anchor?.asof, now) || mriStale(anchor?.built_at, now);
    const missing = [
        loaded.regime && !regime ? 'current_regime.json' : null,
        loaded.anchor && !anchor ? 'cost_of_capital_anchor.json' : null,
        loaded.factor && !factor ? 'factor_scores.json' : null,
    ].filter((x): x is string => x !== null);
    const allLoaded = loaded.regime && loaded.anchor && loaded.factor;
    // The track is full at 40 % (as in the design), or at the largest probability if that is higher.
    const scale = Math.max(0.4, ...bars.map((b) => b.p));

    return (
        <Shell tab="macro" onReload={invalidateDeskCache}>
            <div className="pb-6 pt-6">
                {live ? (
                    <>
                        <p className="font-mono text-[11px] uppercase tracking-[.03em] text-off">
                            {fill(t('mcTKicker'), { date: ms.asof ?? DASH, built: localMdHm(ms.built_at) })}
                            {marketStale(ms.asof, now) && <span className="text-warn"> · ● {t('mcStale')}</span>}
                        </p>
                        <h1 className={`mt-1.5 text-[22px] font-bold leading-tight tracking-head sm:text-[24px] ${isWarnStep(ms.step) ? 'text-warn' : 'text-ink'}`}>
                            {[
                                t(stepK),
                                ms.since ? fill(t('mcTSince'), { date: ms.since }) : null,
                                ms.driver ? driverText(driverPhrase(ms.driver)) : null,
                            ].filter(Boolean).join(' · ')}
                        </h1>
                        {ms.summary && <p className="mt-1.5 text-[13.5px] text-ink-2">{ms.summary}</p>}
                    </>
                ) : (
                    <>
                        <p className="font-mono text-[11px] uppercase tracking-[.03em] text-off">
                            {fill(t('mcKicker'), { date: regime?.date ? regime.date.slice(0, 7) : DASH, built: localMdHm(regime?.built_at) })}
                            {regimeStale && <span className="text-warn"> · ● {t('mcStale')}</span>}
                        </p>
                        <h1 className="mt-1.5 text-[22px] font-bold leading-tight tracking-head text-ink sm:text-[24px]">
                            {title.head === null
                                ? DASH
                                : <>{title.head}{title.strength && <> — {t(title.strength)}</>}</>}
                        </h1>
                        <p className="mt-1.5 text-[13.5px] text-ink-2">
                            {fill(t('mcSub'), { c: confidenceText(regime?.confidence) })}
                        </p>
                    </>
                )}
                {missing.length > 0 && (
                    <p className="mt-2 font-mono text-[11px] text-warn">
                        {fill(t('mcFileMissing'), { file: missing.join(', ') })}
                    </p>
                )}
                {!allLoaded && missing.length === 0 && (
                    <p className="mt-2 font-mono text-[11px] text-off">{t('mcLoading')}</p>
                )}
                {!live && <ReadingLines panels={panels} />}

                <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label={t('mcTabsAria')}>
                    {TABS.map((x) => (
                        <Chip key={x.id} role="tab" aria-selected={tab === x.id} active={tab === x.id} className="shrink-0" onClick={() => selectTab(x.id)}>
                            {t(x.key)}
                        </Chip>
                    ))}
                </div>

                {tab === 'overview' && <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0 space-y-6">
                        <TodaySection
                            market={panels.market} economy={panels.economy} exposures={panels.exposures} dailyRead={panels.dailyRead}
                            loaded={panels.loaded.dailyRead}
                        />

                        <Section title={t('mcTSlowTitle')}>
                            <p className="mt-2 text-[12.5px] text-ink-2">{t('mcTSlowSub')}</p>
                            {live && (
                                <>
                                    <p className="mt-2 text-[13.5px] font-semibold text-ink">
                                        {title.head === null ? DASH : <>{title.head}{title.strength && <> — {t(title.strength)}</>}</>}
                                        <span className="ml-2 font-normal text-ink-2">{fill(t('mcSub'), { c: confidenceText(regime?.confidence) })}</span>
                                    </p>
                                    <ReadingLines panels={panels} />
                                </>
                            )}
                            {bars.length === 0
                                ? <p className="mt-3 font-mono text-[11px] text-off">{DASH}</p>
                                : (
                                    <ul className="mt-3 space-y-2">
                                        {bars.map((b) => (
                                            <li key={b.key} className="grid grid-cols-[84px_minmax(0,1fr)_52px] items-center gap-x-3 text-[13px] sm:grid-cols-[110px_minmax(0,1fr)_56px]">
                                                <span className={b.leader ? 'font-semibold text-ink' : 'text-ink-2'}>{b.name}</span>
                                                <span aria-hidden className="h-3.5 bg-track">
                                                    <span
                                                        className="block h-full"
                                                        style={{ width: `${(b.p / scale) * 100}%`, background: b.leader ? 'var(--accent)' : '#aeb8c5' }}
                                                    />
                                                </span>
                                                <span className="text-right font-mono text-[11px] text-ink">{(b.p * 100).toFixed(1)} %</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                        </Section>

                        <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
                            <QuadrantPanel regime={regime} panels={panels} />
                            <DimensionsPanel panels={panels} />
                        </div>

                        <RiskDialPanel risk={panels.risk} loaded={panels.loaded.risk} />

                        <DataHealthPanel ctx={ctx} />

                        <Section title={t('mcWhy')}>
                            {why.length === 0
                                ? <p className="mt-3 font-mono text-[11px] text-off">{DASH}</p>
                                : (
                                    <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
                                        {why.map((w, i) => (
                                            <li key={i} className="break-words">
                                                {w.kind === 'plain'
                                                    ? w.raw
                                                    : fill(t(w.kind === 'supported' ? 'mcSupported' : 'mcOpposed'), { dim: w.dim, c: w.contribution })}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                        </Section>

                        <Section title={t('mcShocks')}>
                            <div className="mt-3 space-y-1.5 font-mono text-[11px] text-ink-2">
                                {shocks === null && <p>{DASH}</p>}
                                {shocks?.length === 0 && <p>{fill(t('mcNoShocks'), { date: regime?.date ?? DASH })}</p>}
                                {shocks?.map((s) => (
                                    <p key={s} className="break-words">
                                        <span aria-hidden className="text-warn">■ </span>
                                        {fill(t('mcShockActive'), { name: shockName(s), date: regime?.date ?? DASH })}
                                    </p>
                                ))}
                            </div>
                        </Section>

                        <Section
                            title={t('mcDataHealth')}
                            sub={warnings === null ? undefined
                                : warnings.length === 0 ? t('mcNoWarnings')
                                    : warnings.length === 1 ? t('mcWarningsOne') : fill(t('mcWarnings'), { n: warnings.length })}
                        >
                            <ul className="mt-3 space-y-1 font-mono text-[11px] text-ink-2">
                                {warnings === null && <li>{DASH}</li>}
                                {warnings?.map((w, i) => <li key={i} className="break-words">· {w}</li>)}
                            </ul>
                        </Section>
                    </div>

                    <aside className="min-w-0 space-y-6">
                        <Section title={t('mcCoC')}>
                            <div className="mt-3 grid grid-cols-2 gap-x-4">
                                <div>
                                    <p className="font-mono text-[11px] text-off">{t('mcErp')}</p>
                                    <p className="mt-1 font-mono text-[26px] font-semibold leading-none text-ink">{pctText(anchor?.implied_erp, 2)}</p>
                                    <p className="mt-1.5 font-mono text-[11px] text-ink-2">
                                        {anchor?.erp_percentile_vs_history == null
                                            ? DASH
                                            : fill(t('mcPercentile'), { n: ordinalPercentile(anchor.erp_percentile_vs_history) })}
                                    </p>
                                </div>
                                <div>
                                    <p className="font-mono text-[11px] text-off">{t('mcCoE')}</p>
                                    <p className="mt-1 font-mono text-[26px] font-semibold leading-none text-ink">{pctText(anchor?.implied_cost_of_equity, 2)}</p>
                                    <p className={`mt-1.5 font-mono text-[11px] ${anchor?.degraded === true ? 'text-warn' : 'text-ink-2'}`}>
                                        {anchor?.degraded == null ? DASH : anchor.degraded ? `● ${t('mcDegraded')}` : t('mcNotDegraded')}
                                    </p>
                                </div>
                            </div>
                            <p className="mt-3 font-mono text-[11px] text-ink-2">
                                {anchor?.asof ? fill(t('mcAnchorAsOf'), { d: anchor.asof }) : DASH}
                                {anchorStale && <span className="text-warn"> · ● {t('mcStale')}</span>}
                            </p>
                            <p className="mt-3 text-[13px] text-ink-2">{t('mcAnchorLine')}</p>
                        </Section>

                        <Section title={t('mcUses')}>
                            <ul className="mt-3 space-y-2.5 text-[13px] text-ink-2">
                                <li>
                                    {tilt.state === 'off' && <><b className="font-mono text-[11px] text-ink">{t('mcOff')}</b> · {t('mcSectorTilt')}. {t('mcTiltReason')}</>}
                                    {tilt.state === 'other' && fill(t('mcTiltOther'), { v: tilt.raw })}
                                    {tilt.state === 'unknown' && (loaded.factor ? t('mcTiltUnknown') : DASH)}
                                </li>
                                {MACRO_STATIC_USES.turbulenceFlagOn && (
                                    <li><b className="font-mono text-[11px] text-ink">{t('mcInfo')}</b> · {t('mcTurbulence')}</li>
                                )}
                                {MACRO_STATIC_USES.regimeFactsOn && (
                                    <li><b className="font-mono text-[11px] text-ink">{t('mcInfo')}</b> · {t('mcRegimeFacts')}</li>
                                )}
                            </ul>
                            <p className="mt-4 font-mono text-[11px] leading-relaxed text-off">{regime?.disclaimer ?? DASH}</p>
                        </Section>
                    </aside>
                </div>}

                {tab === 'macro' && (
                    <div className="mt-6 max-w-4xl space-y-6">
                        <MacroStatsPanel regime={regime} panels={panels} />
                        <DirectionPanel regime={regime} loaded={loaded.regime} />
                        <ProbabilityHistoryPanel panels={panels} />
                        <IndicatorsPanel panels={panels} cloud={cloud} />
                        <SourceHealthPanel panels={panels} />
                    </div>
                )}
                {tab === 'sectors' && <div className="mt-6 max-w-4xl"><SectorsTab panels={panels} /></div>}
                {tab === 'news' && (
                    <div className="mt-6 max-w-4xl space-y-6">
                        <NewsThemesPanel ctx={ctx} />
                        <LowConfidencePanel ctx={ctx} />
                        <CombinedPanel ctx={ctx} />
                        <NewsSourcesPanel ctx={ctx} />
                        <NewsSourceHealthPanel ctx={ctx} />
                    </div>
                )}
                {tab === 'monitoring' && (
                    <div className="mt-6 max-w-4xl space-y-6">
                        <LatestRunPanel panels={panels} extra={<CloudExportRows ctx={ctx} />} />
                        <WarningsPanel panels={panels} />
                        <ReadinessPanel ctx={ctx} />
                        <ClassifyPanel ctx={ctx} />
                        <CoveragePanel ctx={ctx} />
                    </div>
                )}
                {tab === 'history' && (
                    <div className="mt-6 max-w-4xl space-y-6">
                        <RibbonPanel panels={panels} cloud={cloud} />
                        <RunHistoryPanel ctx={ctx} />
                        <NberPanel ctx={ctx} />
                    </div>
                )}
                {tab === 'method' && <div className="mt-6"><MethodologyTab /></div>}
            </div>
        </Shell>
    );
}
