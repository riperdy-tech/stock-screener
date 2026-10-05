'use client';

// Verdict scoreboard: the first block on the Track record page, before any return.
// Counts lead. While no graded verdict comes from the valid analyst, `board.perHorizon` is null and
// this component has nothing to render beyond counts, tiles, caveats and the method line: no excess
// return, %-beat, t-statistic or direction cut can appear (lib/desk/trackScoreboard.ts).

import React from 'react';
import clsx from 'clsx';
import { Micro } from '../primitives';
import { TrackSection } from './trackParts';
import { useLanguage } from '@/components/LanguageContext';
import { fmtCount } from '@/lib/desk/format';
import { fill } from '@/lib/desk/text';
import { fmtPlainPct, fmtPt, toneClass } from '@/lib/desk/trackBooks';
import type { CutTable, HorizonResult, Scoreboard, StatRow } from '@/lib/desk/trackScoreboard';

const CUT_KEYS = { direction: 'trkCutDirection', entry_timing: 'trkCutTiming', size_hint: 'trkCutSize' } as const;

function Count({ value, label, className }: { value: number | null; label: string; className?: string }) {
    return (
        <div className="min-w-0">
            <div className={clsx('font-mono text-[30px] font-semibold leading-none', className ?? 'text-ink')}>{fmtCount(value)}</div>
            <div className="mt-2 font-mono text-[11px] text-ink-2">{label}</div>
        </div>
    );
}

/** One stat line: names, name-weighted mean excess, name-weighted % beating, t-stat, or "inconclusive". */
function StatLine({ row, bench }: { row: StatRow; bench: string }) {
    const { t } = useLanguage();
    return (
        <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[11px] text-ink-2">
            <span>{fmtCount(row.nNames)} {t('trkNNames')}</span>
            <span title={fill(t('trkMeanExcess'), { bench })}>
                <span className={toneClass(row.meanExcess)}>{fmtPt(row.meanExcess)}</span> {fill(t('trkVsBench'), { bench })}
            </span>
            <span title={fill(t('trkPctBeat'), { bench })}>
                <span className="text-ink">{fmtPlainPct(row.pctBeat)}</span> {fill(t('trkPctBeat'), { bench })}
            </span>
            {row.inconclusive
                ? <span className="font-semibold text-warn">{t('trkInconclusive')}</span>
                : row.tStat != null && <span>t {row.tStat.toFixed(2)} · {t('trkTStat')}</span>}
        </span>
    );
}

function Cuts({ cuts, bench }: { cuts: CutTable[]; bench: string }) {
    const { t } = useLanguage();
    return (
        <>
            {cuts.map((c) => (
                <div key={c.cut} className="mt-3">
                    <Micro className="block text-ink-3">{t(CUT_KEYS[c.cut as keyof typeof CUT_KEYS])}</Micro>
                    {c.rows.map((r) => (
                        <div key={r.bucket} className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
                            <span className="w-[110px] font-mono text-[11px] font-semibold text-ink">{r.bucket}</span>
                            <StatLine row={r} bench={bench} />
                        </div>
                    ))}
                </div>
            ))}
        </>
    );
}

/** Built only when the valid-analyst count is above zero. */
function PerHorizon({ results, bench }: { results: HorizonResult[]; bench: string }) {
    const { t } = useLanguage();
    return (
        <div className="mt-6 space-y-5">
            {results.map((h) => (
                <div key={h.days} className="border-t border-rule-10 pt-3">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="font-mono text-[12px] font-semibold text-ink">{fill(t('trkDaysN'), { n: h.days })}</span>
                        {h.all ? <StatLine row={h.all} bench={bench} /> : <span className="font-mono text-[11px] text-ink-3">—</span>}
                    </div>
                    <Cuts cuts={h.cuts} bench={bench} />
                </div>
            ))}
        </div>
    );
}

export function ScoreboardView({ board, loaded }: { board: Scoreboard | null; loaded: boolean }) {
    const { t } = useLanguage();

    if (!board) {
        // Never show zeros for a file that did not load.
        return (
            <TrackSection title={t('trkScoreTitle')}>
                <p className="mt-4 font-mono text-[11px] text-ink-3">{loaded ? t('trkOutcomesMissing') : t('pgLoading')}</p>
            </TrackSection>
        );
    }

    const hasValid = board.validGraded > 0;
    return (
        <TrackSection title={t('trkScoreTitle')} sub={fill(t('trkScoreSub'), { bench: board.benchmark })}>
            <div className="mt-5 flex flex-wrap gap-x-10 gap-y-5">
                <Count value={board.validGraded} label={t('trkValidGraded')} />
                <Count value={board.graded} label={hasValid ? t('trkGradedTotal') : t('trkGradedLegacy')} className="text-ink-2" />
                <Count value={board.pending} label={t('trkPending')} className="text-ink-2" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {board.horizons.map((h) => (
                    <div key={h.days} className="bg-inset px-3.5 py-3">
                        <div className="font-mono text-[11px] text-ink-3">{fill(t('trkDaysN'), { n: h.days })}</div>
                        <div className="mt-1 font-mono text-[20px] font-semibold leading-none text-ink">{fmtCount(h.total)}</div>
                        <div className="mt-1.5 font-mono text-[11px] text-ink-3">
                            {!hasValid && (h.total ?? 0) > 0 ? t('trkGradeableLegacy') : t('trkGradeable')}
                        </div>
                    </div>
                ))}
            </div>

            {hasValid && board.perHorizon && <PerHorizon results={board.perHorizon} bench={board.benchmark} />}

            {/* Verbatim from the file, one per line. */}
            <div className="mt-5 space-y-1">
                {board.caveats.map((c, i) => (
                    <p key={i} className="font-mono text-[11px] leading-relaxed text-ink-2">{`· ${c}`}</p>
                ))}
            </div>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-3">{t('trkMethod')}</p>
        </TrackSection>
    );
}
