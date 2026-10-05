'use client';

// The stock page's left column (handoff 5.2): the verdict, the band, the crux, the numbers, the
// timing, what would prove it wrong, what we are watching, the evidence, the thesis and the run
// transcripts. A name with no rebuilt verdict gets only its header (AWAITING / VETOED).

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useLanguage } from '@/components/LanguageContext';
import type { DepthReportBundle } from '@/lib/data-service';
import type { DeskRow } from '@/lib/desk/rankings';
import { headlineFromSamples } from '@/lib/desk/thesis';
import { fmtMoney } from '@/lib/desk/format';
import { fill } from '@/lib/desk/text';
import { signedPct } from '@/lib/desk/rowText';
import { sizeTone, TONE_COLORS, verdictTone } from '@/lib/desk/tone';
import { vetoCodeOf, vetoFallback, vetoKey } from '@/lib/desk/veto';
import {
    awaitingSubline, briefAge, buyPaused, coeSourceKey, fracPct, hasDirection, momentumKey, plainCode, ronicText,
    ruleValueText, ruleView, signedPts, sublineKeys, terminalText, thesisCheckFor, timingKey, usableRuns, verdictFlag,
    verdictWordKey, watchItems, type RuleView, type StockMode,
} from '@/lib/desk/stockPage';
import type { DeskVerdict, RuleObject } from '@/lib/desk/verdict';
import { BandHero } from './BandHero';
import { CruxPanel } from './CruxPanel';
import { TranscriptViewer } from './TranscriptViewer';
import { DASH, Disclosure, Empty, Grid, Row, Sec } from './stockParts';

type T = ReturnType<typeof useLanguage>['t'];

const fmtStamp = (s: string | null | undefined) => (s && s.length >= 16 ? s.slice(5, 16).replace('T', ' ') : DASH);

/** A rule in words: `6-month momentum below 0 (180-day window)`; an unknown metric stays as its raw key, in mono. */
function RuleText({ r }: { r: RuleView }) {
    return (
        <>
            {r.metricMono ? <span className="font-mono">{r.metric}</span> : r.metric} {r.cmp} {r.threshold}
            {r.window ? ` (${r.window})` : ''}
        </>
    );
}

// ── 1. Kicker, verdict word, subline ────────────────────────────────────────

function Header({ row, d, mode, blocked, bundleRuns }: { row: DeskRow; d: DeskVerdict | undefined; mode: StockMode; blocked: boolean; bundleRuns: number | null }) {
    const { t } = useLanguage();
    if (mode === 'verdict' && d) {
        const tone = verdictTone(d.direction);
        const kicker = fill(t('pgKicker'), {
            date: d.date ?? DASH, n: d.n_basis ?? DASH, m: d.samples_run ?? bundleRuns ?? DASH,
            pack: d.pack_revision ?? DASH, gate: d.gate_version ?? DASH,
        });
        return (
            <div>
                <p className="break-words font-mono text-[11px] tracking-[.03em] text-off">{kicker}</p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[28px] font-bold leading-tight" style={{ color: blocked ? TONE_COLORS.MUTED : tone.color }}>
                        {t(verdictWordKey(d))}
                    </span>
                    <span className="text-[13px] text-ink-2">{sublineKeys(d).map((k) => t(k)).join(' · ')}</span>
                </div>
            </div>
        );
    }
    if (mode === 'vetoed') {
        const code = vetoCodeOf({ fct_veto: row.fct.fct_veto, fct_llm_veto: (row.fct as { fct_llm_veto?: string | null }).fct_llm_veto });
        const key = code ? vetoKey(code) : null;
        return (
            <div>
                <p className="font-mono text-[11px] tracking-[.03em] text-off">{t('pgKickerVetoed')}</p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[28px] font-bold leading-tight text-off">{t('pgVetoed')}</span>
                    <span className="text-[13px] text-ink-2">{code ? (key ? t(key) : vetoFallback(code)) : DASH} {'·'} {t('pgNeverUnderwritten')}</span>
                </div>
            </div>
        );
    }
    const a = awaitingSubline(row);
    return (
        <div>
            <p className="font-mono text-[11px] tracking-[.03em] text-off">{t('pgKickerNone')}</p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[28px] font-bold leading-tight text-ink-2">{t('dvAwaiting')}</span>
                <span className="text-[13px] text-ink-2">
                    {a.listed ? fill(t('pgQueued'), { rank: a.rank ?? DASH }) : t('pgNotOnList')}
                </span>
            </div>
        </div>
    );
}

// ── 4. Stat row and grid ────────────────────────────────────────────────────

function Stats({ row, d, blocked }: { row: DeskRow; d: DeskVerdict; blocked: boolean }) {
    const { t } = useLanguage();
    const size = sizeTone(d.size_hint, d.n_basis);
    const mos = row.storedMos;
    const single = (d.actionable_reasons ?? []).includes('single_sample');
    const sc = d.size_components;
    const buckets = ([['xDispersion', sc?.dispersion?.bucket], ['xMosWord', sc?.mos?.bucket], ['xConviction', sc?.conviction?.bucket], ['xRisk', sc?.risk?.bucket]] as const)
        .filter(([, b]) => b != null)
        .map(([k, b]) => `${t(k)} ${b}`);
    if (single && d.size_hint) buckets.push(fill(t('pgCappedAt'), { h: d.size_hint }));
    const tr = d.reentry_tranches ?? d.scorecard?.reentry_tranches;
    const skew = d.asymmetric_payoff_skew ?? d.scorecard?.asymmetric_payoff_skew;
    const money = (v: number | null | undefined) => (v == null ? DASH : fmtMoney(v));

    const cell = (label: string, value: React.ReactNode, sub: React.ReactNode, color?: string) => (
        <div className="min-w-0">
            <div className="font-mono text-[11px] text-off">{label}</div>
            <div className="mt-1 font-mono text-[22px] font-semibold leading-none text-ink" style={color ? { color } : undefined}>{value}</div>
            <div className="mt-1.5 font-mono text-[11px] text-ink-2">{sub}</div>
        </div>
    );

    return (
        <section className="mt-6 min-w-0">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-y border-rule-14 py-3.5 sm:grid-cols-4">
                {cell(t('statMedianIv').toLowerCase(), money(d.median_iv),
                    mos == null ? DASH : <span style={{ color: mos > 0 ? TONE_COLORS.POS : mos < 0 ? TONE_COLORS.NEG : undefined }}>{fill(t('xMosVs'), { x: signedPct(mos, 0) })}</span>)}
                {cell(t('statRunSpread').toLowerCase(), d.spread_pct != null ? `${d.spread_pct.toFixed(1)} %` : DASH,
                    d.spread_pct == null ? t('pgOneRunShort') : DASH)}
                {cell(t('statSizeHint').toLowerCase(), d.size_hint ? size.label : DASH,
                    single ? t('xCapped') : DASH, d.size_hint ? (blocked ? TONE_COLORS.MUTED : size.color) : undefined)}
                {cell(t('statPlausible').toLowerCase(), fill(t('pgNofM'), { n: d.n_basis ?? DASH, m: d.samples_run ?? DASH }),
                    d.converged == null ? DASH : t(d.converged ? 'pgConverged' : 'pgNotConverged'))}
            </div>
            <Grid className="mt-4">
                <Row label={t('pgSizeBuckets')}>{buckets.length ? buckets.join(' · ') : DASH}</Row>
                <Row label={t('pgUpperBound')}>
                    {d.kelly_fraction_pct != null ? fill(t('pgKellyCap'), { x: d.kelly_fraction_pct.toFixed(2) }) : DASH}
                </Row>
                <Row label={t('pgBearBullSkew')}>
                    {money(d.bear_iv)} {'·'} {money(d.bull_iv)} {'·'} {skew != null ? skew.toFixed(1) : DASH}
                </Row>
                <Row label={t('pgReentry')}>
                    {t('pgStarter')} {money(tr?.tranche_1_starter)} {'·'} {t('pgCore')} {money(tr?.tranche_2_core)}
                </Row>
            </Grid>
        </section>
    );
}

// ── 5. Timing ───────────────────────────────────────────────────────────────

function Timing({ d }: { d: DeskVerdict }) {
    const { t } = useLanguage();
    const now = d.entry_timing_now ?? d.entry_timing ?? null;
    const nowKey = timingKey(now);
    const mk = momentumKey(d.momentum_view);
    const atVerdict = d.entry_timing_now != null && d.entry_timing != null && d.entry_timing_now !== d.entry_timing
        ? timingKey(d.entry_timing) : null;
    const entry = now == null ? DASH : [
        nowKey ? t(nowKey) : plainCode(now),
        d.momentum_view ? (mk ? t(mk) : plainCode(d.momentum_view)) : null,
        atVerdict ? fill(t('pgAtVerdictWas'), { v: t(atVerdict) }) : null,
    ].filter(Boolean).join(' · ');
    const flip = ruleView(t, d.momentum_flip_condition);
    const brk = ruleView(t, d.momentum_break_rule);
    return (
        <Sec title={t('pgTiming')} className="mt-6">
            <Grid className="mt-3">
                <Row label={t('pgEntryTiming')}>{entry}</Row>
                <Row label={t('pgFlip')}>{flip ? <RuleText r={flip} /> : DASH}</Row>
                <Row label={t('pgBreak')}>{brk ? <RuleText r={brk} /> : DASH}</Row>
            </Grid>
        </Sec>
    );
}

// ── 6. What would prove this wrong ──────────────────────────────────────────

function ProveWrong({ d }: { d: DeskVerdict }) {
    const { t } = useLanguage();
    const triggers = d.thesis_invalidation_triggers ?? d.scorecard?.thesis_invalidation_triggers ?? [];
    const rules: RuleObject[] = d.invalidation_rules ?? [];
    return (
        <Sec title={t('pgProveWrong')} sub={fill(t('pgThesisStatus'), { s: d.thesis_status ?? t('xUnknown') })} className="mt-6">
            {triggers.length > 0 ? (
                <div className="mt-3 space-y-2">
                    {triggers.map((tr, i) => <p key={i} className="break-words text-[13px] leading-relaxed text-ink">{tr}</p>)}
                </div>
            ) : <p className="mt-3 text-[13px] text-ink-2">{t('pgNoTriggers')}</p>}

            {rules.length > 0 && (
                <div className="mt-4">
                    <div className="hidden grid-cols-[minmax(0,1.2fr)_90px_minmax(0,1.3fr)_minmax(0,0.9fr)] gap-x-3 border-b border-rule-18 pb-1.5 font-mono text-[11px] text-off sm:grid">
                        <span>{t('pgColRule')}</span><span>{t('pgColThreshold')}</span><span>{t('pgColWindow')}</span><span>{t('pgColNow')}</span>
                    </div>
                    {rules.map((r, i) => {
                        const v = ruleView(t, r);
                        if (!v) return null;
                        const check = thesisCheckFor(r, d.thesis_checks);
                        const cur = check?.current_value;
                        return (
                            <div key={i} className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-rule-10 py-2 text-[12px] sm:grid-cols-[minmax(0,1.2fr)_90px_minmax(0,1.3fr)_minmax(0,0.9fr)]">
                                <span className="min-w-0 break-words text-ink">{v.metricMono ? <span className="font-mono">{v.metric}</span> : v.metric}</span>
                                <span className="min-w-0 break-words font-mono text-ink">{r.comparator ?? DASH} {v.threshold}</span>
                                <span className="min-w-0 break-words text-ink-2">{v.window ?? DASH}</span>
                                <span className={clsx('min-w-0 break-words font-mono', check?.breached ? 'font-semibold text-warn' : 'text-ink-2')}>
                                    {cur == null ? t('pgUnknownNow') : `${ruleValueText(r.metric, cur)}${check?.breached ? ` ✕ ${t('pgBreached')}` : ''}`}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </Sec>
    );
}

// ── 7. What we're watching ──────────────────────────────────────────────────

function Watching({ d }: { d: DeskVerdict }) {
    const { t } = useLanguage();
    const items = watchItems(d);
    const paused = buyPaused(d);
    return (
        <Sec title={t('pgWatching')} className="mt-6">
            {items.length === 0 ? (
                <Empty>{t('pgNoWatch')}</Empty>
            ) : (
                <ul className="mt-3 divide-y divide-rule-10 border-y border-rule-10">
                    {items.map((w, i) => (
                        <li key={w.id ?? i} className="min-w-0 py-2.5">
                            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span className="border border-rule-24 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                                    {w.statusKey ? t(w.statusKey) : w.status}
                                </span>
                                {w.side && <span className="font-mono text-[11px] text-ink-2">{w.sideKey ? t(w.sideKey) : w.side}</span>}
                                {w.text && <span className="min-w-0 break-words text-[13px] text-ink">{w.text}</span>}
                            </p>
                            {w.quote && (
                                <blockquote className="mt-1.5 break-words border-l-2 border-rule-14 pl-3 text-[13px] leading-relaxed text-ink-q">
                                    {'“'}{w.quote}{'”'}
                                </blockquote>
                            )}
                            <p className="mt-1 break-words font-mono text-[11px] text-ink-2">
                                {[w.source, w.date].filter(Boolean).join(' · ') || DASH}
                                {' · '}
                                <span className={w.verified ? 'text-pos' : 'text-off'}>{w.verified ? `✓ ${t('wiVerified')}` : t('wiUnverified')}</span>
                                {' · '}{fill(t('wiChecked'), { at: fmtStamp(w.checkedAt) })}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
            {paused.state !== 'none' && (
                <p className="mt-2.5 break-words font-mono text-[11px] text-ink-2">
                    {paused.state === 'free' ? t('fuNotPaused')
                        : paused.state === 'unknown' ? t('fuPausedUnknown') : t('fuPaused')}
                    {paused.reasons.length > 0 && ` · ${paused.reasons.join(', ')}`}
                    {d.followup_asof && ` · ${fill(t('fuAsOf'), { at: fmtStamp(d.followup_asof) })}`}
                </p>
            )}
        </Sec>
    );
}

// ── 8. Evidence & integrity ─────────────────────────────────────────────────

function Evidence({ d }: { d: DeskVerdict }) {
    const { t } = useLanguage();
    const src = coeSourceKey(d.coe_source);
    const age = briefAge(d);
    const flags = (d.flags ?? []).map(verdictFlag);
    const violations = d.fiduciary_violations ?? [];
    return (
        <Sec title={t('pgEvidence')} className="mt-6">
            <Grid className="mt-3">
                <Row label={t('evCoe')}>
                    {d.coe_used != null ? fracPct(d.coe_used, 2) : DASH}
                    {d.coe_source && ` · ${t('evSource')}: ${src ? t(src) : plainCode(d.coe_source)}`}
                    {d.coe_minus_anchor != null && ` (${signedPts(d.coe_minus_anchor, 2)})`}
                </Row>
                <Row label={t('evTerminal')}>
                    {d.terminal_method === 'gordon' ? t('evGordon') : d.terminal_method ? plainCode(d.terminal_method) : DASH}
                    {' '}{terminalText(d.terminal_method, d.terminal_multiple_or_g)}
                    {` · ${fill(t('evFade'), { n: d.fade_years ?? DASH })}`}
                    {` · RONIC ${ronicText(d.terminal_ronic)}`}
                </Row>
                <Row label={t('evCalculator')}>
                    {d.desk_calls != null ? fill(t('evUsed'), { n: d.desk_calls }) : DASH}
                    {' · '}
                    {d.desk_iv_match == null ? DASH : d.desk_iv_match ? `${t('evMatched')} ✓` : t('evNotMatched')}
                </Row>
                <Row label={t('evFiduciary')}>
                    {d.fiduciary_verdict ?? DASH}{violations.length > 0 && ` · ${fill(t('evViolations'), { n: violations.length })}`}
                </Row>
                <Row label={t('evBrief')}>
                    {age.days != null ? fill(t('evDaysOld'), { n: age.days }) : DASH}{age.stamp && ` · ${age.stamp}`}
                </Row>
                <Row label={t('evFlags')}>
                    {flags.length === 0 ? DASH : flags.map((f, i) => (
                        <span key={i}>{i > 0 && ' · '}<span className={f.known ? undefined : 'text-ink-2'}>{f.text}</span></span>
                    ))}
                </Row>
            </Grid>
        </Sec>
    );
}

// ── 9-10. Thesis and transcripts ────────────────────────────────────────────

function Thesis({ bundle, blocked }: { bundle: DepthReportBundle | null | undefined; blocked: boolean }) {
    const { t } = useLanguage();
    const headline = useMemo(() => headlineFromSamples(bundle?.samples), [bundle]);
    return (
        <Disclosure title={t('pgThesis')}>
            {headline ? (
                <div className="border-l-2 border-rule-14 bg-page px-4 py-3">
                    <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink-q">
                        {headline.bullets.map((b, i) => <li key={i} className="break-words">{b}</li>)}
                    </ul>
                    {!blocked && headline.action && (
                        <p className="mt-2.5 break-words text-[13px] font-semibold text-ink">{t('pgAction')}: {headline.action}</p>
                    )}
                </div>
            ) : <p className="text-[13px] text-ink-2">{t('pgNoThesis')}</p>}
        </Disclosure>
    );
}

export function StockLeft({ row, d, mode, bundle, live, atVerdict, blocked }: {
    row: DeskRow;
    d: DeskVerdict | undefined;
    mode: StockMode;
    /** undefined while the depth report is loading, null when there is none. */
    bundle: DepthReportBundle | null | undefined;
    live: number | null;
    atVerdict: number | null;
    blocked: boolean;
}) {
    const { t } = useLanguage();
    const [sample, setSample] = useState(0);
    const runIvs = useMemo(() => usableRuns(bundle?.samples), [bundle]);
    const samples = bundle?.samples ?? [];

    return (
        <div className="min-w-0">
            <Header row={row} d={d} mode={mode} blocked={blocked} bundleRuns={samples.length || null} />
            {mode === 'verdict' && d && (
                <>
                    <BandHero d={d} runIvs={runIvs} live={live} atVerdict={atVerdict} blocked={blocked} />
                    {hasDirection(d) && <CruxPanel d={d} />}
                    <Stats row={row} d={d} blocked={blocked} />
                    <Timing d={d} />
                    <ProveWrong d={d} />
                    <Watching d={d} />
                    <Evidence d={d} />
                    <div className="mt-6"><Thesis bundle={bundle} blocked={blocked} /></div>
                    <div className="mt-4">
                        {samples.length > 0 ? (
                            <Disclosure
                                title={t('pgTranscripts')}
                                sub={fill(t(samples.length === 1 ? 'pgRunsOne' : 'pgRunsMany'), { n: samples.length })}
                            >
                                <TranscriptViewer bundle={bundle ?? null} activeTab={sample} onTabChange={setSample} bare />
                            </Disclosure>
                        ) : bundle === null ? (
                            <Sec title={t('pgTranscripts')}><p className="mt-3 text-[13px] text-ink-2">{t('pgNoTranscripts')}</p></Sec>
                        ) : null}
                    </div>
                </>
            )}
        </div>
    );
}
