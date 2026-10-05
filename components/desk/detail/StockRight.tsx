'use client';

// The stock page's right column (handoff 5.2): how the name got here, the market's expectations, the
// price chart, key financials, verdict history and book membership. These blocks show for every
// name, with or without a rebuilt verdict.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import type { ValuationModel } from '@/lib/data-service';
import type { DeskRow } from '@/lib/desk/rankings';
import { doorOf } from '@/lib/desk/doors';
import { fmtMoney } from '@/lib/desk/format';
import { fill } from '@/lib/desk/text';
import { PILLARS, pillarBar, signedNum, signedPct, topPct } from '@/lib/desk/rowText';
import { onList } from '@/lib/desk/sections';
import { DATA_NOTES, FAMILY, FORENSIC_WARNINGS, TONE_COLORS } from '@/lib/desk/tone';
import { vetoCodeOf, vetoFallback, vetoKey } from '@/lib/desk/veto';
import {
    bookMembership, keyFinancials, verdictHistory, verdictWordKey, type LedgersLike, type StockMode,
} from '@/lib/desk/stockPage';
import type { DeskVerdict } from '@/lib/desk/verdict';
import { DoorMark } from '../rankings/DeskParts';
import { plainWords } from '../rankings/Funnel';
import { PriceChart } from './PriceChart';
import { DASH, Row, Sec } from './stockParts';

const PILLAR_LABEL = { quality: 'phQuality', momentum: 'phMomentum', revisions: 'phRevisions', value: 'phValue', exp_gap: 'phExpGap' } as const;

/** Five centred bars, label 76 px, `+0.6 σ` or `missing`. Same height rule as the Desk's mini bars. */
function PillarRows({ z }: { z: DeskRow['fct']['fct_z'] | undefined }) {
    const { t } = useLanguage();
    return (
        <ul className="mt-4 space-y-1.5">
            {PILLARS.map((p) => {
                const v = z?.[p.key];
                const bar = pillarBar(v);
                return (
                    <li key={p.key} className="grid grid-cols-[76px_minmax(0,1fr)_64px] items-center gap-x-3 text-[12px]">
                        <span className="text-ink-2">{t(PILLAR_LABEL[p.family])}</span>
                        <span className="relative block h-[10px] bg-track-12" aria-hidden>
                            {bar ? (
                                <span
                                    className="absolute inset-y-0"
                                    style={{ width: `${bar.heightPct}%`, background: FAMILY[p.family], ...(bar.up ? { left: '50%' } : { right: '50%' }) }}
                                />
                            ) : (
                                <span className="absolute inset-0 border border-dashed border-off" />
                            )}
                            <span className="absolute inset-y-0 w-px bg-ink" style={{ left: '50%' }} />
                        </span>
                        <span className="text-right font-mono text-[11px] text-ink">{bar ? `${signedNum(v, 1)} σ` : t('phMissing')}</span>
                    </li>
                );
            })}
        </ul>
    );
}

function flagText(code: string): string {
    return FORENSIC_WARNINGS[code] ?? DATA_NOTES[code] ?? code.replace(/_/g, ' ');
}

function HowItGotHere({ row, d, mode, blocked }: { row: DeskRow; d: DeskVerdict | undefined; mode: StockMode; blocked: boolean }) {
    const { t } = useLanguage();
    const f = row.fct;
    // A depth-only row carries a placeholder band (no rank, no composite): it is not in today's screen.
    const inScreen = f.fct_rank != null || f.fct_composite != null;
    const door = doorOf(f.fct_nominated_doors);
    const pct = topPct(f.fct_percentile);
    const code = vetoCodeOf({ fct_veto: f.fct_veto, fct_llm_veto: (f as { fct_llm_veto?: string | null }).fct_llm_veto });
    const vetoText = code ? (vetoKey(code) ? t(vetoKey(code)!) : vetoFallback(code)) : DASH;
    const bandName = f.fct_band === 'research_now' ? t('bandResearchNow') : f.fct_band === 'watchlist' ? t('bandWatchlist')
        : f.fct_band === 'pass' ? t('pgBandPass') : (f.fct_band ?? DASH);
    const flags = f.fct_flags ?? [];

    const lines: { glyph: string; node: React.ReactNode }[] = [];
    if (row.vetoed) lines.push({ glyph: '✕', node: t('pgRemoved') });
    else if (!inScreen) lines.push({ glyph: '●', node: t('pgNotInScreen') });
    else {
        lines.push({ glyph: '✓', node: t('pgPassedSafety') });
        lines.push({
            glyph: '●',
            node: door ? <span className="inline-flex flex-wrap items-baseline gap-x-1.5"><DoorMark door={door} />{pct && <span>{'·'} {pct}</span>}</span> : t('srchNoDoor'),
        });
        lines.push({ glyph: '●', node: `${bandName}${f.fct_rank != null ? ` · ${fill(t('pgRank'), { rank: f.fct_rank })}` : ''}` });
    }
    if (mode === 'verdict' && d) lines.push({ glyph: '●', node: fill(t('pgAiVerdict'), { state: blocked ? t('pgBlockedByGate') : t(verdictWordKey(d)) }) });
    else if (mode === 'vetoed') lines.push({ glyph: '●', node: t('pgNotUnderwritten') });
    else lines.push({ glyph: '●', node: onList(row) ? t('pgWaitingAnalyst') : t('pgNotQueued') });

    return (
        <Sec title={t('pgHow')} className="min-w-0">
            {row.vetoed && (
                <p className="mt-3 break-words border-l-2 border-off bg-page px-3 py-2 text-[13px] font-semibold text-ink">
                    {'✕'} {vetoText}
                </p>
            )}
            <ul className="mt-3 space-y-1.5">
                {lines.map((l, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] text-ink">
                        <span aria-hidden className="w-3 shrink-0 text-ink-2">{l.glyph}</span>
                        <span className="min-w-0 break-words">{l.node}</span>
                    </li>
                ))}
            </ul>
            {!row.vetoed && door && (
                <p className="mt-3 text-[13px] leading-relaxed text-ink-2 first-letter:uppercase">{plainWords(t, row)}</p>
            )}
            <PillarRows z={f.fct_z} />
            <p className="mt-3 break-words text-[12px] text-ink-2">
                <span className="text-off">{t('xFlags')}: </span>
                {flags.length ? flags.map(flagText).join(' · ') : t('xNone')}
            </p>
        </Sec>
    );
}

// ── 2. Expectations ─────────────────────────────────────────────────────────

const pct1 = (frac: number) => `${frac < 0 ? '−' : ''}${Math.abs(frac * 100).toFixed(1)}`;

function Expectations({ val }: { val: (ValuationModel & { gap_basis?: string | null; hist_owner_cf_cagr_5y?: number | null }) | undefined }) {
    const { t } = useLanguage();
    if (!val || val.implied_growth == null) {
        return (
            <Sec title={t('pgExpect')} className="mt-6">
                <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                    {fill(t('exNoModel'), { reason: val ? (val.reason ?? t('exNoGrowth')) : t('exMissing') })}
                </p>
            </Sec>
        );
    }
    // The delivered growth the model compared against: the basis it names, else the first one stored.
    const bases: [string, number | null | undefined, 'exOwnerCf' | 'exFcf' | 'exRevenue'][] = [
        ['owner_cf', val.hist_owner_cf_cagr_5y, 'exOwnerCf'],
        ['fcf', val.hist_fcf_cagr_5y, 'exFcf'],
        ['revenue', val.hist_revenue_cagr_5y, 'exRevenue'],
    ];
    const named = bases.find(([k, v]) => k === val.gap_basis && v != null);
    const used = named ?? bases.find(([, v]) => v != null);
    return (
        <Sec title={t('pgExpect')} className="mt-6">
            <p className="mt-3 text-[13px] leading-relaxed text-ink">
                {fill(t('exSentence'), { g: pct1(val.implied_growth), y: val.assumptions?.stage1_years ?? DASH })}
                {' '}
                {used ? fill(t('exDelivered'), { d: pct1(used[1] as number), basis: t(used[2]) }) : t('exNoDelivered')}
                {val.implied_growth_clamped ? ` ${t('exClamped')}` : ''}
            </p>
            {val.verdict && <p className="mt-2 break-words text-[13px] leading-relaxed text-ink-2">{val.verdict}</p>}
        </Sec>
    );
}

// ── 4-6 ─────────────────────────────────────────────────────────────────────

function KeyFinancialsBlock({ row }: { row: DeskRow }) {
    const { t } = useLanguage();
    const k = keyFinancials(row);
    return (
        <Sec title={t('kfTitle')} className="mt-6">
            <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5">
                {k.cells.map((c) => (
                    <React.Fragment key={c.labelKey}>
                        <dt className="text-[12px] text-ink-2">{t(c.labelKey)}</dt>
                        <dd className="text-right font-mono text-[12px] text-ink">{c.text}</dd>
                    </React.Fragment>
                ))}
            </dl>
            <p className="mt-3 break-words text-[12px] text-ink-2">
                <span className="text-off">{t('kfForensic')}: </span>
                {k.forensic.length > 0
                    ? <span className="text-warn">{k.forensic.join(' · ')}</span>
                    : t('kfNoForensic')}
                <span className="text-off"> ({t('kfWarningsOnly')})</span>
            </p>
            {k.notes.length > 0 && <p className="mt-1 break-words text-[11px] text-ink-2">{t('kfNotes')}: {k.notes.join(' · ')}</p>}
        </Sec>
    );
}

function History({ d }: { d: DeskVerdict | undefined }) {
    const { t } = useLanguage();
    const lines = verdictHistory(d);
    return (
        <Sec title={t('pgHistory')} className="mt-6">
            {lines.length === 0 ? (
                <p className="mt-3 font-mono text-[12px] text-ink-2">{t('pgNoHistory')}</p>
            ) : (
                <ul className="mt-3 space-y-1.5">
                    {lines.map((l, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 font-mono text-[12px]" style={{ color: l.blocked ? 'var(--off)' : 'var(--ink)' }}>
                            {l.kind === 'earlier' ? (
                                <span>{fill(t('pgEarlier'), { v: l.priorIv != null ? l.priorIv.toFixed(2) : DASH })}</span>
                            ) : (
                                <>
                                    <span>{l.date ?? DASH}</span>
                                    <span className="font-semibold">{l.wordKey ? t(l.wordKey) : DASH}</span>
                                    {l.kind === 'rebuilt' && <span>{'·'} {t(l.blocked ? 'dvBlocked' : 'pgActionable').toLowerCase()}</span>}
                                    <span className="text-[11px]">{l.kind === 'rebuilt' ? t('pgRebuiltTag') : t('pgOldTag')}</span>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Sec>
    );
}

function Books({ ledgers, ticker, live }: { ledgers: LedgersLike | null; ticker: string; live: number | null }) {
    const { t } = useLanguage();
    const held = bookMembership(ledgers, ticker, live);
    return (
        <Sec title={t('pgBooks')} className="mt-6">
            {held.length === 0 ? (
                <p className="mt-3 font-mono text-[12px] text-ink-2">{t('pgNotHeld')}</p>
            ) : (
                <ul className="mt-3 space-y-2">
                    {held.map((h) => (
                        <li key={h.book} className="text-[12px]">
                            <span className="font-semibold text-ink">{t(h.labelKey)}</span>
                            <span className="block break-words font-mono text-[12px] text-ink-2">
                                {fill(t('bkEntry'), { date: h.entryDate ?? DASH, price: h.entryPrice != null ? fmtMoney(h.entryPrice) : DASH })}
                                {' · '}
                                <span style={{ color: h.pnlPct == null ? undefined : h.pnlPct > 0 ? TONE_COLORS.POS : h.pnlPct < 0 ? TONE_COLORS.NEG : undefined }}>
                                    {fill(t('bkPnl'), { x: signedPct(h.pnlPct, 1) })}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Sec>
    );
}

export function StockRight({ row, d, mode, blocked, ledgers, live }: {
    row: DeskRow;
    d: DeskVerdict | undefined;
    mode: StockMode;
    blocked: boolean;
    ledgers: LedgersLike | null;
    live: number | null;
}) {
    const { t } = useLanguage();
    // History shows the overlay row whether or not the rebuilt analyst made it (old rows greyed, tagged).
    const historyRow = row.depth as DeskVerdict | undefined;
    return (
        <div className="min-w-0">
            <HowItGotHere row={row} d={d} mode={mode} blocked={blocked} />
            <Expectations val={row.val} />
            <Sec title={t('pgChart')} className="mt-6"><PriceChart ticker={row.ticker} d={d} blocked={blocked} /></Sec>
            <KeyFinancialsBlock row={row} />
            <History d={historyRow} />
            <Books ledgers={ledgers} ticker={row.ticker} live={live} />
        </div>
    );
}

// `Row` is re-exported for symmetry with the left column's grids; the right column uses plain lists.
export { Row };
