'use client';

// The /macro route: the macro backdrop the analyst reads, inside the same Shell as the Desk.
// Handoff README 5.5. A missing file shows "—" per field and one "did not load" line; the page
// always renders. Nothing here is a call on the market.

import React, { useMemo } from 'react';
import { useLanguage } from '@/components/LanguageContext';
import { fmtMd, pctText } from '@/lib/desk/health';
import {
    confidenceText, macroTitle, MACRO_STATIC_USES, mriStale, ordinalPercentile, parseExplanation,
    regimeBars, sectorTilt, shockName,
} from '@/lib/desk/macro';
import { fill } from '@/lib/desk/text';
import { invalidateDeskCache, useMacroData } from '@/lib/desk/useDeskData';
import { Shell } from '../Shell';

const DASH = '—';

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
    return (
        <section className="border-t border-ink pt-3">
            <h2 className="text-[14px] font-semibold text-ink">
                {title}
                {sub && <span className="ml-2 text-[12px] font-normal text-ink-2">{sub}</span>}
            </h2>
            {children}
        </section>
    );
}

export function MacroPage() {
    const { t } = useLanguage();
    const { regime, anchor, factor, loaded } = useMacroData();
    const now = useMemo(() => Date.now(), []);

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
                <p className="font-mono text-[11px] uppercase tracking-[.03em] text-off">
                    {fill(t('mcKicker'), { date: regime?.date ?? DASH, built: fmtMd(regime?.built_at) })}
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
                {missing.length > 0 && (
                    <p className="mt-2 font-mono text-[11px] text-warn">
                        {fill(t('mcFileMissing'), { file: missing.join(', ') })}
                    </p>
                )}
                {!allLoaded && missing.length === 0 && (
                    <p className="mt-2 font-mono text-[11px] text-off">{t('mcLoading')}</p>
                )}

                <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0 space-y-6">
                        <Section title={t('mcRegimes')}>
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
                                {anchor?.asof ?? DASH}
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
                                    <li><b className="font-mono text-[11px] text-ink">{t('mcOn')}</b> · {t('mcTurbulence')}</li>
                                )}
                                {MACRO_STATIC_USES.regimeFactsOn && (
                                    <li><b className="font-mono text-[11px] text-ink">{t('mcOn')}</b> · {t('mcRegimeFacts')}</li>
                                )}
                            </ul>
                            <p className="mt-4 font-mono text-[11px] leading-relaxed text-off">{regime?.disclaimer ?? DASH}</p>
                        </Section>
                    </aside>
                </div>
            </div>
        </Shell>
    );
}
