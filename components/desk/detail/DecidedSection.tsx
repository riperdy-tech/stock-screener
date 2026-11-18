'use client';

// "How this value was decided" inside the AI panel (QwenPanel), shown only for a report that carries `decided`: the AI set each valuation
// input for the company, with a reason and exact quotes from the filings; code checked every quote and did the arithmetic. Everything the
// AI chose is shown with its reason; the notes are stamps, never a gate. Paper only. Mapping and formatting live in lib/desk/decidedText.ts.

import React, { useState } from 'react';
import { useLanguage } from '@/components/LanguageContext';
import type { DecidedValuation, OpusVerdictCode, QwenReport } from '@/lib/data-service';
import { fmtMoney } from '@/lib/desk/format';
import { ffoViews, groupFlags, humanise, inputName, inputRows, isFinancialRun, lossLine, mergedAdjustments, mergedRisks, oldDefaultsValue, pct1, riskValue, runSeeds, situationItems, SUBJECT_WHAT, taxLine, yearsShape, type AdjustmentView, type FfoView, type InputRow, type NoteView, type SitItem } from '@/lib/desk/decidedText';
import { fill } from '@/lib/desk/text';
import { OpusChip } from '../rankings/DeskParts';
import { DASH } from './stockParts';

const GRID = 'grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]';
const money = (v: number | null | undefined) => (v == null ? DASH : fmtMoney(v));

function Quotes({ quotes }: { quotes: { id: string; quote: string }[] }) {
    return (
        <>
            {quotes.map((x, j) => (
                <blockquote key={j} className="mt-1 break-words border-l-2 border-rule-18 pl-3 italic text-ink-3">
                    {x.quote} <span className="font-mono text-[10px] not-italic">[{x.id}]</span>
                </blockquote>
            ))}
        </>
    );
}

/** One adjustment line ("Charge: what, 340M (run 1)") with its quotes under a "why" toggle. */
function AdjustmentLine({ text, quotes }: { text: string; quotes: { id: string; quote: string }[] }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    return (
        <li className="break-words">
            {text}{' '}
            {quotes.length > 0 && (
                <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="font-mono text-[11px] text-accent hover:text-ink">
                    {t('dcWhy')} {open ? '▾' : '▸'}
                </button>
            )}
            {open && <Quotes quotes={quotes} />}
        </li>
    );
}

/** One input: its label, the two runs' values and a "why" toggle (on the label's row from the sm breakpoint) that opens the reasons and quotes. */
function InputLine({ row, runNo }: { row: InputRow; runNo: (i: number) => string }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    return (
        <div className={`border-b border-rule-10 py-2 text-[12px] ${GRID}`}>
            <span className="col-span-2 font-semibold text-ink sm:col-span-1">{row.label ? t(row.label) : row.name}</span>
            {row.cells.map((c, i) => (
                <span key={i} className="min-w-0 break-words font-mono text-ink-2">
                    <span className="font-sans text-off sm:hidden">{runNo(i)}: </span>{c}
                </span>
            ))}
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
                className="col-span-2 text-left font-mono text-[11px] text-accent hover:text-ink sm:col-span-1 sm:text-right">
                {t('dcWhy')} {open ? '▾' : '▸'}
            </button>
            {open && (
                <div className="col-span-2 mt-1 sm:col-span-4">
                    {row.whys.map((w, i) => (
                        <div key={i} className="mt-1">
                            <span className="font-mono text-[11px] text-ink-3">{runNo(i)}</span>
                            <p className="break-words text-ink-2">{w.text || DASH}</p>
                            <Quotes quotes={w.quotes} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function DecidedSection({ q, d, price }: { q: QwenReport & { verdict?: string }; d: DecidedValuation; price: number | null }) {
    const { t } = useLanguage();
    const seeds = runSeeds(d);
    const runs = seeds.map((s) => d.runs[s]);
    const runNo = (i: number) => fill(t('dcRun'), { n: i + 1 });
    const word = (v: string | null | undefined) => (v === 'yes' ? t('dcYes') : v === 'no' ? t('dcNo') : v === 'unclear' ? t('dcMaybe') : v == null ? DASH : humanise(v));
    const conf = (v: string | null | undefined) => (v === 'low' ? t('dcConfLow') : v === 'medium' ? t('dcConfMedium') : v === 'high' ? t('dcConfHigh') : v ?? DASH);
    const old = oldDefaultsValue(d);
    const tax = taxLine(q);
    const loss = lossLine(q);
    const risks = mergedRisks(d);
    const g = groupFlags(d.flags ?? [], seeds);
    const adjustments = mergedAdjustments(d);
    const ffo = ffoViews(d);
    const unclearKey = isFinancialRun(runs[0]) ? 'dcUnclearFin' : 'dcUnclear';

    // "run 1", "run 2" or "both runs" for the runs that raised a note
    const runsText = (n: NoteView) => {
        const idx = n.occ.map((o) => o.run).filter((r): r is number => r != null);
        if (idx.length === 0) return '';
        return idx.length > 1 && idx.length === seeds.length ? t('dcRunsBoth') : idx.map((r) => fill(t('dcRunOne'), { n: r + 1 })).join(', ');
    };
    const yearsText = (years: number[]) => {
        const y = yearsShape(years);
        return y == null ? '' : y.kind === 'one' ? fill(t('dcYearOne'), { n: y.n }) : y.kind === 'span' ? fill(t('dcYearsSpan'), { a: y.a, b: y.b }) : fill(t('dcYearsList'), { list: y.list });
    };
    /** "years 1 to 5 (run 1) and years 1, 4 (run 2)", or "years 1 to 5 (both runs)" when the runs flagged the same years. */
    const whereText = (n: NoteView) => {
        const same = n.occ.length > 1 && n.occ.length === seeds.length && n.occ.every((o) => yearsText(o.years) === yearsText(n.occ[0].years));
        if (same) return `${yearsText(n.occ[0].years)} (${t('dcRunsBoth')})`;
        return n.occ.map((o) => `${yearsText(o.years)}${o.run == null ? '' : ` (${fill(t('dcRunOne'), { n: o.run + 1 })})`}`).join(` ${t('dcAnd')} `);
    };
    const noteText = (n: NoteView): React.ReactNode => {
        const dir = n.dir === 'below' ? t('dcBelow') : t('dcAbove');
        const mark = runsText(n) ? ` (${runsText(n)})` : '';
        switch (n.key) {
            case 'dcNoteYears': return fill(t('dcNoteYears'), { what: n.subject ? t(SUBJECT_WHAT[n.subject]) : DASH, where: whereText(n), dir, lo: n.lo ?? DASH, hi: n.hi ?? DASH });
            case 'dcNoteLong': return fill(t('dcNoteLong'), { what: n.subject ? t(SUBJECT_WHAT[n.subject]) : DASH, where: runsText(n), dir, lo: n.lo ?? DASH, hi: n.hi ?? DASH });
            case 'dcNoteFfoGap': return fill(t('dcNoteFfoGap'), { gap: n.vals?.[0] ?? DASH }) + mark;
            case 'dcNoteReturn': return fill(t('dcNoteReturn'), { a: n.vals?.[0] ?? DASH, b: n.vals?.[1] ?? DASH }) + mark;
            case 'dcNoteOrder': return fill(t('dcNoteOrder'), { a: n.vals?.[0] ?? DASH, b: n.vals?.[1] ?? DASH, c: n.vals?.[2] ?? DASH }) + mark;
            case null: return <>{n.detail}{mark}</>;
            default: return <>{t(n.key)}{mark}{n.detail && <span className="font-mono text-[11px] text-ink-3"> {n.detail}</span>}</>;
        }
    };

    const onRuns = (idx: number[]) => (idx.length > 1 && idx.length === seeds.length ? t('dcRunsBoth') : idx.map((r) => fill(t('dcRunOne'), { n: r + 1 })).join(', '));
    const adjText = (a: AdjustmentView) => {
        const key = a.kind === 'cash' ? 'dcAdjCash' : a.kind === 'charge' ? 'dcAdjCharge' : a.kind === 'gain' ? 'dcAdjGain' : 'dcAdjOther';
        return `${fill(t(key), { what: a.what || DASH, amount: a.amount })}${seeds.length > 1 && a.runs.length < seeds.length ? ` (${onRuns(a.runs)})` : ''}`;
    };
    const perShare = (v: string | null, per: boolean) => (v == null ? DASH : per ? fill(t('dcPerShare'), { v }) : v);
    const ffoText = (f: FfoView) => {
        const mark = seeds.length > 1 && f.runs.length < seeds.length ? ` (${onRuns(f.runs)})` : '';
        const rep = perShare(f.reported, f.perShare);
        if (f.status === 'compared') return fill(t('dcFfoCompared'), { rep, der: perShare(f.derived, f.perShare), gap: f.gap ?? DASH }) + mark;
        if (f.status === 'missing') return t('dcFfoMissing') + mark;
        if (f.status === 'not_derivable') return fill(t('dcFfoNotDerivable'), { rep }) + mark;
        return fill(t('dcFfoOther'), { status: humanise(f.raw) }) + mark;
    };
    const sitLine = (it: SitItem, i: number) => it.kind === 'word' ? (
        <p key={i} className="mt-1 break-words text-[12px] text-ink-2">
            {it.label ? fill(t(it.label as Parameters<typeof t>[0]), { v: word(it.value) }) : `${it.name}: ${word(it.value)}`}
            {it.why && <span className="text-ink-3"> {it.why}</span>}
        </p>
    ) : (
        <p key={i} className="mt-1 break-words text-[12px] text-ink-2">
            {(it.head || it.name) && <span className="font-mono text-[11px] text-ink-3">{it.head ? t(it.head as Parameters<typeof t>[0]) : it.name}: </span>}{it.text}
        </p>
    );

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
                        <p className="mt-1 text-[12px] text-warn">{t(unclearKey)}</p>
                        {runs.map((r, i) => (
                            <div key={seeds[i]} className="mt-1">
                                <span className="font-mono text-[11px] text-ink-3">{runNo(i)}</span>
                                {situationItems(r).map(sitLine)}
                            </div>
                        ))}
                    </>
                ) : (
                    <>
                        {g.situation && <p className="mt-1 text-[12px] text-warn">{t(unclearKey)}</p>}
                        {situationItems(runs[0]).map(sitLine)}
                    </>
                )}
            </div>

            {adjustments.length > 0 && (
                <div className="mt-3">
                    <b className="text-[12px] font-semibold">{t('dcAdjTitle')}</b>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[12px] text-ink-2">
                        {adjustments.map((a, i) => <AdjustmentLine key={i} text={adjText(a)} quotes={a.quotes} />)}
                    </ul>
                </div>
            )}
            {ffo.map((f, i) => <p key={i} className="mt-3 font-mono text-[12px] text-ink-2">{ffoText(f)}</p>)}

            <div className="mt-3">
                <b className="text-[12px] font-semibold">{t('dcInputs')}</b>
                <div className={`mt-1 hidden border-b border-rule-18 pb-1.5 font-mono text-[11px] text-off sm:grid ${GRID}`}>
                    <span />
                    {seeds.map((s, i) => <span key={s}>{runNo(i)}</span>)}
                </div>
                {inputRows(d).map((row) => <InputLine key={row.key} row={row} runNo={runNo} />)}
            </div>

            {risks.length > 0 && (
                <div className="mt-3">
                    <b className="text-[12px] font-semibold">{t('dcRisks')}</b>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[12px] text-ink-2">
                        {risks.map((r, i) => (
                            <li key={i} className="break-words">
                                {r.risk}
                                {r.runs.map((x) => {
                                    const nm = inputName(x.input);
                                    return (
                                        <span key={x.run} className="block font-mono text-[11px] text-ink-3">
                                            {fill(t('dcRiskRun'), { run: runNo(x.run), input: nm ? fill(t(nm.key), { n: nm.n ?? '' }) : x.input ? humanise(x.input) : DASH, v: riskValue(x.input, x.value) })}
                                        </span>
                                    );
                                })}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="mt-3">
                <b className="text-[12px] font-semibold">{t('dcGap')}</b>
                <p className="mt-1 font-mono text-[12px] text-ink-2">{fill(t('dcGapLine'), { gap: pct1(d.run_gap) })}</p>
                <p className="font-mono text-[12px] text-ink-2">{runs.map((r, i) => fill(t('dcConfLine'), { run: runNo(i), c: conf(r?.confidence) })).join(' · ')}</p>
                {g.quotes && <p className="font-mono text-[12px] text-ink-2">{fill(t('dcFlagQuotes'), { n: g.quotes.n, m: g.quotes.m })}</p>}
            </div>

            {g.notes.length > 0 && (
                <details className="mt-3 text-[12px]">
                    <summary className="cursor-pointer font-mono text-[11px] text-accent hover:text-ink">{fill(t('dcNotes'), { n: g.notes.length })}</summary>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
                        {g.notes.map((n, i) => <li key={i} className="break-words">{noteText(n)}</li>)}
                    </ul>
                </details>
            )}

            {tax && <p className="mt-3 font-mono text-[12px] text-ink-2">{fill(t('dcTax'), tax)}</p>}
            {loss && <p className="mt-1 text-[12px] text-ink-2">{fill(t('dcLoss'), { label: loss.label })}{loss.explanation && ` — ${loss.explanation}`}</p>}
            <p className="mt-2 text-[12px] text-ink-3">{t('dcNote')}</p>
        </div>
    );
}
