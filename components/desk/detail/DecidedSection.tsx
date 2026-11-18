'use client';

// "How this value was decided" inside the AI panel (QwenPanel), shown only for a report that carries `decided`: the AI set each valuation
// input for the company, with a reason and exact quotes from the filings; code checked every quote and did the arithmetic. Everything the
// AI chose is shown with its reason; flags are stamps, never a gate. Paper only. Mapping and formatting live in lib/desk/decidedText.ts.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import type { DecidedValuation, OpusVerdictCode, QwenReport } from '@/lib/data-service';
import { fmtMoney } from '@/lib/desk/format';
import { inputRows, lossLine, oldDefaultsValue, parseFlag, pct1, riskInputKey, riskValue, runSeeds, taxLine } from '@/lib/desk/decidedText';
import { fill } from '@/lib/desk/text';
import { OpusChip } from '../rankings/DeskParts';
import { DASH } from './stockParts';

const GRID = 'grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]';
const money = (v: number | null | undefined) => (v == null ? DASH : fmtMoney(v));

export function DecidedSection({ q, d, price }: { q: QwenReport & { verdict?: string }; d: DecidedValuation; price: number | null }) {
    const { t } = useLanguage();
    const seeds = runSeeds(d);
    const runs = seeds.map((s) => d.runs[s]);
    const runNo = (i: number) => fill(t('dcRun'), { n: i + 1 });
    const word = (v: string | null | undefined) => (v === 'yes' ? t('dcYes') : v === 'no' ? t('dcNo') : v ?? DASH);
    const conf = (v: string | null | undefined) => (v === 'low' ? t('dcConfLow') : v === 'medium' ? t('dcConfMedium') : v === 'high' ? t('dcConfHigh') : v ?? DASH);
    const old = oldDefaultsValue(d);
    const tax = taxLine(q);
    const loss = lossLine(q);
    const flags = (d.flags ?? []).map(parseFlag);

    return (
        <div className="mt-3 border-t border-rule-14 pt-3">
            <b className="text-[13px] font-semibold">{t('dcTitle')}</b>
            <p className="mt-1 font-mono text-[12px] text-ink-2">
                {fill(t('pgQwValue'), { bear: money(q.value_bear), base: money(q.value_base), bull: money(q.value_bull), price: money(price) })}
                {q.verdict && <> <OpusChip o={{ verdict: q.verdict as OpusVerdictCode }} /></>}
            </p>
            {old != null && <p className="font-mono text-[12px] text-ink-2">{fill(t('dcOldDefaults'), { v: money(old) })}</p>}

            <div className="mt-3">
                <b className="text-[12px] font-semibold">{t('dcSituation')}</b>
                {d.situation_unclear ? (
                    <>
                        <p className="mt-1 text-[12px] text-warn">{t('dcUnclear')}</p>
                        {runs.map((r, i) => (
                            <p key={seeds[i]} className="mt-1 break-words text-[12px] text-ink-2">
                                <span className="font-mono text-[11px] text-ink-3">{runNo(i)}: {word(r?.situation?.cyclical)}. </span>
                                {r?.situation?.margin_position} {r?.situation?.why}
                            </p>
                        ))}
                    </>
                ) : (
                    <>
                        <p className="mt-1 text-[12px] text-ink-2">{fill(t('dcCyclical'), { v: word(runs[0]?.situation?.cyclical) })}</p>
                        {runs[0]?.situation?.margin_position && <p className="mt-1 break-words text-[12px] text-ink-2">{runs[0].situation.margin_position}</p>}
                        {runs[0]?.situation?.why && <p className="mt-1 break-words text-[12px] text-ink-2">{runs[0].situation.why}</p>}
                    </>
                )}
            </div>

            <div className="mt-3">
                <b className="text-[12px] font-semibold">{t('dcInputs')}</b>
                <div className={`mt-1 hidden border-b border-rule-18 pb-1.5 font-mono text-[11px] text-off sm:grid ${GRID}`}>
                    <span />
                    {seeds.map((s, i) => <span key={s}>{runNo(i)}</span>)}
                </div>
                {inputRows(d).map((row) => (
                    <div key={row.key} className={`border-b border-rule-10 py-2 text-[12px] ${GRID}`}>
                        <span className="col-span-2 font-semibold text-ink sm:col-span-1">{t(row.label)}</span>
                        {row.cells.map((c, i) => (
                            <span key={seeds[i]} className="min-w-0 break-words font-mono text-ink-2">
                                <span className="font-sans text-off sm:hidden">{runNo(i)}: </span>{c}
                            </span>
                        ))}
                        <details className="col-span-2 mt-1 sm:col-span-3">
                            <summary className="cursor-pointer font-mono text-[11px] text-accent hover:text-ink">{t('dcWhy')}</summary>
                            {row.whys.map((w, i) => (
                                <div key={seeds[i]} className="mt-1">
                                    <span className="font-mono text-[11px] text-ink-3">{runNo(i)}</span>
                                    <p className="break-words text-ink-2">{w.text || DASH}</p>
                                    {w.quotes.map((x, j) => (
                                        <blockquote key={j} className="mt-1 break-words border-l-2 border-rule-18 pl-3 italic text-ink-3">
                                            {x.quote} <span className="font-mono text-[10px] not-italic">[{x.id}]</span>
                                        </blockquote>
                                    ))}
                                </div>
                            ))}
                        </details>
                    </div>
                ))}
            </div>

            {(runs[0]?.risks ?? []).length > 0 && (
                <div className="mt-3">
                    <b className="text-[12px] font-semibold">{t('dcRisks')}</b>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[12px] text-ink-2">
                        {(runs[0]?.risks ?? []).map((r, i) => {
                            const k = riskInputKey(r.input_hit);
                            return <li key={i} className="break-words">{fill(t('dcRiskLine'), { risk: r.risk ?? DASH, input: k ? t(k) : r.input_hit ?? DASH, v: riskValue(r.input_hit, r.bear_value) })}</li>;
                        })}
                    </ul>
                </div>
            )}

            <div className="mt-3">
                <b className="text-[12px] font-semibold">{t('dcGap')}</b>
                <p className="mt-1 font-mono text-[12px] text-ink-2">{fill(t('dcGapLine'), { gap: pct1(d.run_gap) })}</p>
                <p className="font-mono text-[12px] text-ink-2">{runs.map((r, i) => fill(t('dcConfLine'), { run: runNo(i), c: conf(r?.confidence) })).join(' · ')}</p>
            </div>

            {flags.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-[12px] text-warn">
                    {flags.map((f, i) => (
                        <li key={i} className="break-words">
                            {f.seed != null && <span className="font-mono text-[11px]">{seeds.includes(f.seed) ? runNo(seeds.indexOf(f.seed)) : f.seed}: </span>}
                            {f.key == null ? f.detail
                                : f.key === 'dcFlagQuotes' ? fill(t(f.key), { n: f.n ?? 0, m: f.m ?? 0 })
                                : <>{t(f.key)}{f.detail && <span className="font-mono text-[11px] text-ink-3"> {f.detail}</span>}</>}
                        </li>
                    ))}
                </ul>
            )}

            {tax && <p className="mt-3 font-mono text-[12px] text-ink-2">{fill(t('dcTax'), tax)}</p>}
            {loss && <p className="mt-1 text-[12px] text-ink-2">{fill(t('dcLoss'), { label: loss.label })}{loss.explanation && ` — ${loss.explanation}`}</p>}
            <p className="mt-2 text-[12px] text-ink-3">{t('dcNote')}</p>
        </div>
    );
}
