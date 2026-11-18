// Pure formatting and mapping for the "How this value was decided" section of the AI panel (components/desk/detail/DecidedSection.tsx).
// The decided valuation lets the AI set each input; code checks the quotes and does the arithmetic. No React, no i18n: these return i18n
// keys and plain values so the section stays thin and this file is testable. `null` is "no figure" and `0` is a value (never `||`-default).

import type { DecidedInputKey, DecidedQuote, DecidedRun, DecidedValuation, QwenReport } from '@/lib/data-service';
import { fmtMoney, fmtPct } from './format';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Fraction → "3.5%" (one decimal); a missing value is "—". */
export const pct1 = (v: unknown): string => (isNum(v) ? fmtPct(v, 1) : '—');

/** A list of fractions → "3.5%, 5.0%, 4.0%"; an empty or missing list is "—". */
export const pctList = (v: unknown): string => (Array.isArray(v) && v.length > 0 ? v.map(pct1).join(', ') : '—');

/** "40.0% (33.0% to 46.0%)": a figure with its range; no range, no parenthesis. */
export function withRange(v: unknown, range: unknown): string {
    const base = pct1(v);
    return Array.isArray(range) && isNum(range[0]) && isNum(range[1]) ? `${base} (${pct1(range[0])} to ${pct1(range[1])})` : base;
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
    rev_growth: 'dcInRevGrowth', op_margin: 'dcInOpMargin', long_run_op_margin: 'dcInLongMargin', terminal_growth: 'dcInLongGrowth',
    fade_years: 'dcInFade', return_on_new_investment_long_run: 'dcInReturn', capex_to_revenue: 'dcInCapex',
} as const;

export const INPUT_ORDER = Object.keys(INPUT_LABEL) as DecidedInputKey[];

/** How one run's value for one input reads in the table. */
export function inputText(key: DecidedInputKey, run: DecidedRun | undefined): string {
    const inp = run?.inputs;
    const rng = run?.ranges;
    if (!inp) return '—';
    switch (key) {
        case 'rev_growth': return pctList(inp.rev_growth);
        case 'op_margin': return pctList(inp.op_margin);
        case 'long_run_op_margin': return withRange(inp.long_run_op_margin, rng?.long_run_op_margin);
        case 'terminal_growth': return withRange(inp.terminal_growth, rng?.terminal_growth);
        case 'fade_years': return isNum(inp.fade_years) ? String(inp.fade_years) : '—';
        case 'return_on_new_investment_long_run': return pct1(inp.return_on_new_investment_long_run);
        case 'capex_to_revenue': return pct1(inp.capex_to_revenue);
    }
}

export interface InputRow { key: DecidedInputKey; label: (typeof INPUT_LABEL)[DecidedInputKey]; cells: string[]; whys: { text: string; quotes: DecidedQuote[] }[] }

/** One row per input; one cell and one reason per run (runs that are missing show "—"). */
export function inputRows(d: DecidedValuation): InputRow[] {
    const runs = runSeeds(d).map((s) => d.runs[s]);
    return INPUT_ORDER.map((key) => ({
        key, label: INPUT_LABEL[key],
        cells: runs.map((r) => inputText(key, r)),
        whys: runs.map((r) => ({ text: r?.reasons?.[key]?.why ?? '', quotes: r?.reasons?.[key]?.quotes ?? [] })),
    }));
}

// ── risks ────────────────────────────────────────────────────────────────────

/** A risk's bear value in the unit of the input it hits (years for the fade, a percent otherwise); a list reads as a list. */
export function riskValue(input: string | undefined, v: unknown): string {
    if (Array.isArray(v)) return input === 'fade_years' ? v.map((x) => (isNum(x) ? String(x) : '—')).join(', ') : pctList(v);
    if (!isNum(v)) return '—';
    return input === 'fade_years' ? String(v) : pct1(v);
}

/** The label key of the input a risk hits; null for a name the page does not know (shown as the raw text). */
export const riskInputKey = (input: string | undefined) =>
    (input && Object.prototype.hasOwnProperty.call(INPUT_LABEL, input) ? INPUT_LABEL[input as DecidedInputKey] : null);

// ── flags ────────────────────────────────────────────────────────────────────

const FLAG_KEY = {
    margin_outside_filed_record: 'dcFlagMargin', growth_outside_filed_record: 'dcFlagGrowth', return_above_base_year: 'dcFlagReturn',
    base_year_not_representative: 'dcFlagBaseYear', confidence_low: 'dcFlagConfidence', situation_unclear: 'dcFlagSituation',
    scenario_order_not_monotone: 'dcFlagOrder',
} as const;
export type FlagKey = (typeof FLAG_KEY)[keyof typeof FLAG_KEY] | 'dcFlagQuotes';

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
    if (Object.prototype.hasOwnProperty.call(FLAG_KEY, name)) return { key: FLAG_KEY[name as keyof typeof FLAG_KEY], detail, seed };
    return { key: null, detail: raw.trim(), seed };
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
