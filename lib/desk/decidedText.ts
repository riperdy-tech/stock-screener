// Pure formatting and mapping for the "How this value was decided" section of the AI panel (components/desk/detail/DecidedSection.tsx).
// The decided valuation lets the AI set each input; code checks the quotes and does the arithmetic. No React, no i18n: these return i18n
// keys and plain values so the section stays thin and this file is testable. `null` is "no figure" and `0` is a value (never `||`-default).

import type { DecidedQuote, DecidedRun, DecidedValuation, QwenReport } from '@/lib/data-service';
import { fmtMoney, fmtPct, fmtSignedPct } from './format';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** A key or code read as words: underscores to spaces. Used for every key the page has no sentence for, so nothing is dropped and no raw code shows. */
export const humanise = (k: string): string => k.replace(/_/g, ' ').trim();

/** An amount in the filing's currency units, compact: 1.2B, 340M, 29.5M, 12K. */
export function compactAmount(v: unknown): string {
    if (!isNum(v)) return '—';
    const a = Math.abs(v);
    const [n, u] = a >= 1e9 ? [a / 1e9, 'B'] : a >= 1e6 ? [a / 1e6, 'M'] : a >= 1e3 ? [a / 1e3, 'K'] : [a, ''];
    const txt = n >= 100 || u === '' ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '');
    return `${v < 0 ? '−' : ''}${txt}${u}`;
}

/** A plain number with up to four decimals, for an input whose unit the page does not know. */
const plainNum = (v: unknown): string => (isNum(v) ? String(Number(v.toFixed(4))) : '—');

/** Fraction → "3.5%" (one decimal); a missing value is "—". */
export const pct1 = (v: unknown): string => (isNum(v) ? fmtPct(v, 1) : '—');

/** A list of fractions → "3.5%, 5.0%, 4.0%"; an empty or missing list is "—". */
export const pctList = (v: unknown): string => (Array.isArray(v) && v.length > 0 ? v.map(pct1).join(', ') : '—');

/** "40.0% (low 33.0% to high 46.0%)": a figure with its range; no range, no parenthesis. */
export function withRange(v: unknown, range: unknown): string {
    const base = pct1(v);
    return Array.isArray(range) && isNum(range[0]) && isNum(range[1]) ? `${base} (low ${pct1(range[0])} to high ${pct1(range[1])})` : base;
}

/** The runs in seed order: ["1000", "3000"]. The first is "run 1", the second "run 2". */
export const runSeeds = (d: DecidedValuation): string[] => Object.keys(d.runs ?? {}).sort((a, b) => Number(a) - Number(b));

/** The value at the old fixed defaults, per quoted share when the publisher gave that; null when neither is a number. */
export function oldDefaultsValue(d: DecidedValuation): number | null {
    if (isNum(d.value_at_old_defaults_quoted)) return d.value_at_old_defaults_quoted;
    return isNum(d.value_at_old_defaults) ? d.value_at_old_defaults : null;
}

// ── the inputs table ─────────────────────────────────────────────────────────

export const INPUT_LABEL = {
    rev_growth: 'dcInRevGrowth', op_margin: 'dcInOpMargin', long_run_op_margin: 'dcInLongMargin', roe: 'dcInRoe', book_growth: 'dcInBookGrowth',
    long_run_roe: 'dcInLongRoe', terminal_growth: 'dcInLongGrowth', fade_years: 'dcInFade', return_on_new_investment_long_run: 'dcInReturn',
    capex_to_revenue: 'dcInCapex',
} as const;
export type InputLabelKey = (typeof INPUT_LABEL)[keyof typeof INPUT_LABEL];

/** The known inputs in the order the table shows them; an input the page does not know follows these, in the order it arrives. */
export const INPUT_ORDER: string[] = Object.keys(INPUT_LABEL);

/** Inputs that are fractions (printed as percents); `fade_years` is a whole number; any other key is printed as a plain number. */
const isPercentInput = (k: string): boolean => (has(INPUT_LABEL, k) && k !== 'fade_years') || /^(rev_growth|op_margin|roe|book_growth)(\.y\d+|_y3)$/.test(k);

/** How one run's value for one input reads in the table: lists as comma lists, scalars with the run's low to high where it gave one. */
export function inputText(key: string, run: DecidedRun | undefined): string {
    const v = run?.inputs?.[key];
    if (Array.isArray(v)) return v.length === 0 ? '—' : isPercentInput(key) ? pctList(v) : v.map(plainNum).join(', ');
    if (!isNum(v)) return typeof v === 'string' && v.trim() !== '' ? v.trim() : '—';
    if (key === 'fade_years') return String(v);
    return isPercentInput(key) ? withRange(v, run?.ranges?.[key]) : plainNum(v);
}

export interface InputRow {
    key: string;
    /** The i18n key of the plain label; null for an input the page does not know (then `name` is its humanised key). */
    label: InputLabelKey | null;
    name: string;
    cells: string[];
    whys: { text: string; quotes: DecidedQuote[] }[];
}

/** One row per input present in either run's `inputs` (known ones first, in the known order); one cell and one reason per run (a missing value is "—"). */
export function inputRows(d: DecidedValuation): InputRow[] {
    const runs = runSeeds(d).map((s) => d.runs[s]);
    const present: string[] = [];
    for (const r of runs) for (const k of Object.keys(r?.inputs ?? {})) if (!present.includes(k)) present.push(k);
    const known = INPUT_ORDER.filter((k) => present.includes(k));
    return [...known, ...present.filter((k) => !known.includes(k))].map((key) => ({
        key, label: has(INPUT_LABEL, key) ? INPUT_LABEL[key as keyof typeof INPUT_LABEL] : null, name: humanise(key),
        cells: runs.map((r) => inputText(key, r)),
        whys: runs.map((r) => ({ text: r?.reasons?.[key]?.why ?? '', quotes: r?.reasons?.[key]?.quotes ?? [] })),
    }));
}

// ── risks ────────────────────────────────────────────────────────────────────

/** A risk's bear value in the unit of the input it hits (years for the fade, a percent for a known fraction, a plain number otherwise); a list reads as a list. */
export function riskValue(input: string | undefined, v: unknown): string {
    const one = (x: unknown) => (!isNum(x) ? '—' : input === 'fade_years' ? String(x) : input === undefined || isPercentInput(input) ? pct1(x) : plainNum(x));
    return Array.isArray(v) ? v.map(one).join(', ') : one(v);
}

export type YearLabelKey = 'dcInGrowthYear' | 'dcInMarginYear' | 'dcInRoeYear' | 'dcInBookYear';
const YEAR_LABEL = { rev_growth: 'dcInGrowthYear', op_margin: 'dcInMarginYear', roe: 'dcInRoeYear', book_growth: 'dcInBookYear' } as const;

/** The plain label of an input a risk or a flag names: a table input, or one year of a yearly path ("rev_growth.y3", "roe.y1", "book_growth_y3"); null for a name the page does not know. */
export function inputName(raw: string | undefined): { key: InputLabelKey | YearLabelKey; n?: number } | null {
    if (!raw) return null;
    if (has(INPUT_LABEL, raw)) return { key: INPUT_LABEL[raw as keyof typeof INPUT_LABEL] };
    const y = /^(rev_growth|op_margin|roe|book_growth)(?:\.y|_y)(\d+)$/.exec(raw);
    return y ? { key: YEAR_LABEL[y[1] as keyof typeof YEAR_LABEL], n: Number(y[2]) } : null;
}

/** The risks of both runs as one list, one entry per risk text; each entry says which runs named it and what that run says (input, bear value). */
export function mergedRisks(d: DecidedValuation): { risk: string; runs: { run: number; input: string | undefined; value: unknown }[] }[] {
    const out: { risk: string; runs: { run: number; input: string | undefined; value: unknown }[] }[] = [];
    runSeeds(d).forEach((s, i) => {
        for (const r of d.runs[s]?.risks ?? []) {
            const text = (r.risk ?? '').trim();
            if (text === '') continue;
            const e = out.find((x) => x.risk === text) ?? (out.push({ risk: text, runs: [] }), out[out.length - 1]);
            e.runs.push({ run: i, input: r.input_hit, value: r.bear_value });
        }
    });
    return out;
}

// ── flags ────────────────────────────────────────────────────────────────────

const FLAG_KEY = {
    margin_outside_filed_record: 'dcFlagMargin', growth_outside_filed_record: 'dcFlagGrowth', return_above_base_year: 'dcFlagReturn',
    base_year_not_representative: 'dcFlagBaseYear', confidence_low: 'dcFlagConfidence', situation_unclear: 'dcFlagSituation',
    scenario_order_not_monotone: 'dcFlagOrder',
    roe_outside_filed_record: 'dcFlagRoe', book_growth_outside_filed_record: 'dcFlagBookGrowth', growth_above_roe_in_the_long_run: 'dcFlagGrowthRoe',
    tax_rate_representative_no: 'dcFlagTaxRate', debt_level_representative_no: 'dcFlagDebt', capital_constraint_not_modeled: 'dcFlagCapital',
    ffo_derived_vs_reported: 'dcFlagFfoGap', ffo_not_reported_or_not_found: 'dcFlagFfoMissing', ronic0_not_readjusted: 'dcFlagRonic',
    cash_interest_not_readjusted: 'dcFlagCashInterest', nwc_not_classified_taken_as_0: 'dcFlagNwc', real_estate_base: 'dcFlagReBase',
} as const;
export type FlagKey = (typeof FLAG_KEY)[keyof typeof FLAG_KEY] | 'dcFlagQuotes' | 'dcFlagFfoOther';

export interface FlagView {
    /** The sentence's i18n key; null for a flag this page has no sentence for (then `detail` is the whole flag). */
    key: FlagKey | null;
    /** Text after the sentence ("op_margin.y5 0.1830 (filed ...)"), or the whole flag when `key` is null. */
    detail: string;
    /** The run the flag came from ("run 1000: ..." → "1000"); null for a flag of the pair. */
    seed: string | null;
    /** `quotes_verified: n of m`. */
    n?: number;
    m?: number;
}

/** Splits one flag string of the report ("run 1000: margin_outside_filed_record: long_run_op_margin 0.5 (filed 0.1 to 0.4)"). */
export function parseFlag(raw: string): FlagView {
    let s = raw.trim();
    let seed: string | null = null;
    const pre = /^run (\d+):\s*([\s\S]*)$/.exec(s);
    if (pre) { seed = pre[1]; s = pre[2]; }
    const q = /^quotes_verified:\s*(\d+) of (\d+)\s*$/.exec(s);
    if (q) return { key: 'dcFlagQuotes', detail: '', seed, n: Number(q[1]), m: Number(q[2]) };
    const i = s.indexOf(':');
    const name = (i < 0 ? s : s.slice(0, i)).trim();
    const detail = i < 0 ? '' : s.slice(i + 1).trim();
    if (has(FLAG_KEY, name)) return { key: FLAG_KEY[name as keyof typeof FLAG_KEY], detail, seed };
    const words = detail ? `${humanise(name)}: ${detail}` : humanise(name);      // a flag this page has no sentence for: its key as words, then its detail
    if (name.startsWith('ffo_')) return { key: 'dcFlagFfoOther', detail: words, seed };
    return { key: null, detail: words, seed };
}

// ── the two one-liners that ride with a decided row ──────────────────────────

/** The tax-range line's figures, or null when the row has no tax range or the second value could not be computed. The first value is the report's own. */
export function taxLine(q: Pick<QwenReport, 'tax_range' | 'value_base'>): { rate: string; value: string; rateAlt: string; valueAlt: string } | null {
    const tr = q.tax_range;
    if (!tr || !isNum(tr.rate) || !isNum(tr.rate_alt) || !isNum(tr.value_alt?.base) || !isNum(q.value_base)) return null;
    return { rate: pct1(tr.rate), value: fmtMoney(q.value_base), rateAlt: pct1(tr.rate_alt), valueAlt: fmtMoney(tr.value_alt.base) };
}

/** The "why the profit record is thin" line: the label and its explanation; null when the row has none (or the AI could not explain it). */
export function lossLine(q: Pick<QwenReport, 'loss_record'>): { label: string; explanation: string } | null {
    const lr = q.loss_record;
    if (!lr || typeof lr.label !== 'string' || lr.label.trim() === '') return null;
    return { label: lr.label.trim(), explanation: (lr.explanation ?? '').trim() };
}

// ── the notes: flags merged over both runs ───────────────────────────────────

export type NoteKey = FlagKey | 'dcNoteYears' | 'dcNoteLong' | 'dcNoteReturn' | 'dcNoteOrder' | 'dcNoteFfoGap';
export type NoteSubject = 'rev_growth' | 'op_margin' | 'long_run_op_margin' | 'roe' | 'book_growth' | 'long_run_roe';

/** The label key (a lower-case or capitalised noun phrase) each outside-record subject takes in its note. */
export type WhatKey = 'dcWhatGrowth' | 'dcWhatMargin' | 'dcWhatRoe' | 'dcWhatBook' | 'dcWhatLongMargin' | 'dcWhatLongRoe';
export const SUBJECT_WHAT: Record<NoteSubject, WhatKey> = {
    rev_growth: 'dcWhatGrowth', op_margin: 'dcWhatMargin', roe: 'dcWhatRoe', book_growth: 'dcWhatBook', long_run_op_margin: 'dcWhatLongMargin', long_run_roe: 'dcWhatLongRoe',
};
/** Which subjects each outside-record flag may carry. */
const OUTSIDE_OF: Record<string, NoteSubject[]> = {
    dcFlagMargin: ['op_margin', 'long_run_op_margin'], dcFlagGrowth: ['rev_growth'], dcFlagRoe: ['roe', 'long_run_roe'], dcFlagBookGrowth: ['book_growth'],
};

export interface NoteView {
    /** The sentence to print. `dcFlagMargin` / `dcFlagGrowth` / `dcFlagReturn` / `dcFlagOrder` here mean "detail not recognised": the sentence, then `detail` raw. null: only `detail`. */
    key: NoteKey | null;
    subject?: NoteSubject;
    dir?: 'below' | 'above';
    /** Filed range ("4.3%", "20.8%") for the two outside-record notes. */
    lo?: string;
    hi?: string;
    /** Figures for dcNoteReturn (long-run, base year) and dcNoteOrder (bear, base, bull). */
    vals?: string[];
    /** The runs that raised it (0-based, in seed order; null for a flag of the pair) and, for the year notes, the years each flagged. */
    occ: { run: number | null; years: number[] }[];
    detail: string;
}

export interface GroupedFlags {
    /** Quotes checked word for word, summed over the runs; null when no run reported it. */
    quotes: { n: number; m: number } | null;
    situation: boolean;
    notes: NoteView[];
}

const OUTSIDE = /^(?:(rev_growth|op_margin|roe|book_growth)\.y(\d+)|(long_run_op_margin|long_run_roe)) (-?\d+(?:\.\d+)?) \(filed (-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?)\)$/;
const RETURN = /^long-run (-?\d+(?:\.\d+)?) against the base year's (-?\d+(?:\.\d+)?)$/;
const ORDER = /^bear (-?\d+(?:\.\d+)?), base (-?\d+(?:\.\d+)?), bull (-?\d+(?:\.\d+)?)$/;

/** The report's flags as notes: one per kind, merged over the runs. A detail this does not recognise keeps its sentence and prints the raw detail; no flag is dropped. */
export function groupFlags(flags: string[], seeds: string[]): GroupedFlags {
    const out: GroupedFlags = { quotes: null, situation: false, notes: [] };
    const byKey = new Map<string, NoteView>();
    const note = (id: string, make: () => Omit<NoteView, 'occ'>, run: number | null, year?: number) => {
        let nv = byKey.get(id);
        if (!nv) { nv = { ...make(), occ: [] }; byKey.set(id, nv); out.notes.push(nv); }
        let o = nv.occ.find((x) => x.run === run);
        if (!o) { o = { run, years: [] }; nv.occ.push(o); nv.occ.sort((a, b) => (a.run ?? -1) - (b.run ?? -1)); }
        if (year != null && !o.years.includes(year)) { o.years.push(year); o.years.sort((a, b) => a - b); }
    };
    for (const raw of flags) {
        const f = parseFlag(raw);
        const i = f.seed == null ? -1 : seeds.indexOf(f.seed);
        const run = i < 0 ? null : i;
        if (f.key === 'dcFlagQuotes') { out.quotes = { n: (out.quotes?.n ?? 0) + (f.n ?? 0), m: (out.quotes?.m ?? 0) + (f.m ?? 0) }; continue; }
        if (f.key === 'dcFlagSituation') { out.situation = true; continue; }
        const raw0 = (): Omit<NoteView, 'occ'> => ({ key: f.key, detail: f.detail });
        const fallback = () => note(`f|${f.key}|${f.detail}`, raw0, run);
        if (f.key != null && has(OUTSIDE_OF, f.key)) {
            const m = OUTSIDE.exec(f.detail);
            const subject = m ? ((m[1] ?? m[3]) as NoteSubject) : null;
            if (!m || !subject || !OUTSIDE_OF[f.key].includes(subject)) { fallback(); continue; }
            const v = Number(m[4]), lo = Number(m[5]), hi = Number(m[6]);
            const dir = v < lo ? 'below' : v > hi ? 'above' : null;
            if (dir == null) { fallback(); continue; }
            note(`y|${subject}|${dir}|${m[5]}|${m[6]}`, () => ({ key: m[3] != null ? 'dcNoteLong' : 'dcNoteYears', subject, dir, lo: pct1(lo), hi: pct1(hi), detail: '' }),
                run, m[2] == null ? undefined : Number(m[2]));
        } else if (f.key === 'dcFlagReturn' && RETURN.test(f.detail)) {
            const m = RETURN.exec(f.detail) as RegExpExecArray;
            note(`r|${m[1]}|${m[2]}`, () => ({ key: 'dcNoteReturn', vals: [pct1(Number(m[1])), pct1(Number(m[2]))], detail: '' }), run);
        } else if (f.key === 'dcFlagOrder' && ORDER.test(f.detail)) {
            const m = ORDER.exec(f.detail) as RegExpExecArray;
            note(`o|${m[1]}|${m[2]}|${m[3]}`, () => ({ key: 'dcNoteOrder', vals: [fmtMoney(Number(m[1])), fmtMoney(Number(m[2])), fmtMoney(Number(m[3]))], detail: '' }), run);
        } else if (f.key === 'dcFlagFfoGap' && /^[+\-−]?\d+(?:\.\d+)?%$/.test(f.detail)) {
            note(`g|${f.detail}`, () => ({ key: 'dcNoteFfoGap', vals: [f.detail], detail: '' }), run);
        } else fallback();
    }
    return out;
}

/** Years as plain words' parts: [] → null; one year "year 1"; three or more in a row "years 1 to 5"; otherwise "years 1, 4". */
export function yearsShape(years: number[]): { kind: 'one'; n: number } | { kind: 'span'; a: number; b: number } | { kind: 'list'; list: string } | null {
    if (years.length === 0) return null;
    if (years.length === 1) return { kind: 'one', n: years[0] };
    const span = years.length >= 3 && years.every((y, i) => i === 0 || y === years[i - 1] + 1);
    return span ? { kind: 'span', a: years[0], b: years[years.length - 1] } : { kind: 'list', list: years.join(', ') };
}

// ── operating v2: what the AI took out of the base year ──────────────────────

export interface AdjustmentView {
    kind: 'cash' | 'charge' | 'gain' | 'other';
    what: string;
    /** Compact, in the filing's currency units ("1.2B", "340M"). */
    amount: string;
    quotes: DecidedQuote[];
    /** The runs (0-based) that made it. */
    runs: number[];
}

/** The cash that is not free and each base-year one-off of both runs, one entry per item (same kind, text and amount), with the runs that made it. Empty when nothing was adjusted. */
export function mergedAdjustments(d: DecidedValuation): AdjustmentView[] {
    const out: AdjustmentView[] = [];
    runSeeds(d).forEach((s, i) => {
        const adj = d.runs[s]?.adjustments;
        const items: [AdjustmentView['kind'], NonNullable<NonNullable<DecidedRun['adjustments']>['cash_not_free']>][] = [];
        if (adj?.cash_not_free) items.push(['cash', adj.cash_not_free]);
        for (const o of adj?.base_year_one_offs ?? []) items.push([o.sign === 'charge' ? 'charge' : o.sign === 'gain' ? 'gain' : 'other', o]);
        for (const [kind, it] of items) {
            const what = (it.what ?? '').trim();
            const amount = compactAmount(it.amount);
            const e = out.find((x) => x.kind === kind && x.what === what && x.amount === amount) ?? (out.push({ kind, what, amount, quotes: it.quotes ?? [], runs: [] }), out[out.length - 1]);
            e.runs.push(i);
        }
    });
    return out;
}

// ── real estate: funds from operations ───────────────────────────────────────

export interface FfoView {
    status: 'compared' | 'missing' | 'not_derivable' | 'other';
    /** The company's reported figure and code's derivation, formatted; `perShare` says they are per share. */
    reported: string | null;
    derived: string | null;
    perShare: boolean;
    gap: string | null;
    /** The raw status, for the "other" kind. */
    raw: string;
    runs: number[];
}

/** The funds-from-operations comparison of each run that has one, runs with the same figures merged. */
export function ffoViews(d: DecidedValuation): FfoView[] {
    const out: FfoView[] = [];
    runSeeds(d).forEach((s, i) => {
        const f = d.runs[s]?.real_estate?.ffo;
        if (!f || typeof f.status !== 'string') return;
        const rep = f.reported && isNum(f.reported.value) ? f.reported : null;
        const perShare = rep?.per === 'per_share';
        const div = f.per_share_divisor;
        const der = f.derived_after_preferred;
        const v: FfoView = {
            status: f.status === 'compared' ? 'compared' : f.status === 'not_reported_or_not_found' ? 'missing' : f.status === 'not_derivable' ? 'not_derivable' : 'other',
            reported: rep ? (perShare ? fmtMoney(rep.value) : compactAmount(rep.value)) : null,
            derived: isNum(der) ? (perShare && isNum(div) && div > 0 ? fmtMoney(der / div) : compactAmount(der)) : null,
            perShare, gap: isNum(f.gap_after_preferred) ? fmtSignedPct(f.gap_after_preferred * 100, 1) : null, raw: f.status, runs: [i],
        };
        const same = out.find((x) => x.status === v.status && x.reported === v.reported && x.derived === v.derived && x.gap === v.gap && x.raw === v.raw);
        if (same) same.runs.push(i); else out.push(v);
    });
    return out;
}

// ── the company's situation, whatever the route ──────────────────────────────

export type SitItem =
    | { kind: 'word'; label: string | null; name: string; value: string; why: string }
    | { kind: 'text'; head: string | null; name: string | null; text: string };

const SIT_WORD = { cyclical: 'dcCyclical', institution: 'dcSitInstitution', property_business: 'dcSitProperty', capital_constrained: 'dcSitCapital',
    tax_rate_representative: 'dcSitTax', debt_level_representative: 'dcSitDebt' } as const;
const SIT_ORDER = ['cyclical', 'institution', 'property_business', 'margin_position', 'roe_position', 'why', 'capital_constrained', 'tax_rate_representative', 'debt_level_representative'];
/** Known to the page and either shown elsewhere (as a note) or not wanted as a line. */
const SIT_SKIP = ['base_year_representative'];

const isAnswer = (v: unknown): v is { answer?: unknown; why?: unknown } => typeof v === 'object' && v !== null && !Array.isArray(v) && 'answer' in v;

/** One run's situation as lines: a short answer (with its sentence where the AI gave one) or a paragraph. Keys the page does not know follow, under their humanised names. */
export function situationItems(run: DecidedRun | undefined): SitItem[] {
    const sit = (run?.situation ?? {}) as Record<string, unknown>;
    const keys = [...SIT_ORDER.filter((k) => has(sit, k)), ...Object.keys(sit).filter((k) => !SIT_ORDER.includes(k) && !SIT_SKIP.includes(k))];
    const out: SitItem[] = [];
    for (const k of keys) {
        const v = sit[k];
        const label = has(SIT_WORD, k) ? SIT_WORD[k as keyof typeof SIT_WORD] : null;
        if (isAnswer(v)) {
            if (typeof v.answer === 'string') out.push({ kind: 'word', label, name: humanise(k), value: v.answer, why: typeof v.why === 'string' ? v.why.trim() : '' });
        } else if (typeof v === 'string' && v.trim() !== '') {
            if (label) out.push({ kind: 'word', label, name: humanise(k), value: v.trim(), why: '' });
            else if (k === 'margin_position' || k === 'why') out.push({ kind: 'text', head: null, name: null, text: v.trim() });
            else if (k === 'roe_position') out.push({ kind: 'text', head: 'dcSitRoeWhy', name: null, text: v.trim() });
            else out.push({ kind: 'text', head: null, name: humanise(k), text: v.trim() });
        }
    }
    return out;
}

/** True when the run's situation is a financial one (institution) rather than an operating one (cyclical): the wording of "the two runs disagreed" differs. */
export const isFinancialRun = (run: DecidedRun | undefined): boolean => run?.situation != null && 'institution' in run.situation;
