// Plain words and formats for the Opus valuation (opus_overlay.json, stocks-workspace/baselines/opus/SPEC.md v1.1),
// shared by the Desk's OPUS columns and the stock page's panel. Pure functions, no React.

import type { OpusVerdict } from '@/lib/data-service';
import type { TRANSLATIONS } from '@/lib/i18n';
import { fill } from './text';
import { TONE_COLORS } from './tone';

type Key = keyof typeof TRANSLATIONS['en'];
type T = (k: Key) => string;

const DASH = '—';

export const OPUS_VERDICT_KEY = { BUY: 'pgOpusBuy', WATCH: 'pgOpusWatch', AVOID: 'pgOpusAvoid', NO_CALL: 'pgOpusNoCall' } as const;
export const OPUS_VERDICT_COLOR: Record<keyof typeof OPUS_VERDICT_KEY, string> = {
    BUY: TONE_COLORS.POS, WATCH: TONE_COLORS.WARN, AVOID: TONE_COLORS.NEG, NO_CALL: TONE_COLORS.MUTED,
};

const has = <M extends object>(m: M, k: string | null | undefined): k is Extract<keyof M, string> =>
    k != null && Object.prototype.hasOwnProperty.call(m, k);

/** A per-share amount in the price currency: a dollar sign only when the file says USD. */
export function opusMoney(v: number | null | undefined, cur: string | null): string {
    if (v == null || !Number.isFinite(v)) return DASH;
    const n = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (cur === 'USD') return `$${n}`;
    return cur ? `${n} ${cur}` : n;
}

/** Value over price minus one, as a fraction; null when either is missing or the price is not positive. */
export function opusGap(value: number | null | undefined, price: number | null | undefined): number | null {
    if (value == null || price == null || !(price > 0)) return null;
    return value / price - 1;
}

// The codes `no_call_reason` carries: "run1_no_call:data_not_ok; run2_no_call:missing_input:debt_lt", or a name-level
// code such as "buy_and_avoid_in_runs".
const REASON_KEY = {
    data_not_ok: 'opRsData', missing_input: 'opRsMissing', method_not_supported: 'opRsMethod',
    buy_and_avoid_in_runs: 'opRsSplit',
} as const;

/** The no-call reason in plain words, each distinct reason once; an unknown code shows as it is. Null when none. */
export function opusNoCallText(t: T, raw: string | null | undefined): string | null {
    if (raw == null || raw.trim() === '') return null;
    const out: string[] = [];
    for (const part of raw.split(';').map((s) => s.trim()).filter(Boolean)) {
        const body = part.replace(/^run\d+_no_call:/, '');
        const [code, ...rest] = body.split(':');
        const arg = rest.join(':');
        const text = has(REASON_KEY, code)
            ? (arg ? fill(t(REASON_KEY[code]), { field: arg.replace(/_/g, ' ') }) : t(REASON_KEY[code]))
            : part;
        if (!out.includes(text)) out.push(text);
    }
    return out.join('; ');
}

const FLAG_KEY = {
    wide_spread: 'opFlWide', buy_not_unanimous: 'opFlBuyNotAll', runs_differ: 'opFlRunsDiffer',
    share_count_mismatch: 'opFlShares', minority_interest_material: 'opFlMinority', foreign_filer: 'opFlForeign',
    trailing_stale_over_200d: 'opFlStale', reported_since_latest_filing: 'opFlReported',
    balance_sheet_incomplete: 'opFlBalance', data_not_ok: 'opFlData', terminal_growth_capped: 'opFlGrowthCap',
    value_floored_at_zero: 'opFlFloored', terminal_value_zero: 'opFlTvZero',
    net_buybacks_dilution_floored_at_zero: 'opFlBuybacks', spread_undefined_zero_median: 'opFlSpreadUndef',
    non_usd_unhandled: 'opFlNonUsd', entity_mismatch_suspected: 'opFlEntity',
    downgraded_by_deep_report: 'opFlDeep',
} as const;

/** A data flag in plain words; an unknown code shows as it is. */
export const opusFlagText = (t: T, code: string): string => (has(FLAG_KEY, code) ? t(FLAG_KEY[code]) : code);

const VIEW_LABEL = {
    price_implies: 'opMvPrice', where_i_differ: 'opMvDiffer', fair_price_requires: 'opMvFair', my_view: 'opMvMine',
} as const;

/** `market_view` split into its two labelled parts ("price_implies: … | where_i_differ: …", or the blind arm's
 *  "fair_price_requires: … | my_view: …"); null when it does not have that form, and the caller shows it as it is. */
export function opusMarketView(t: T, s: string): [string, string][] | null {
    const m = /^\s*(price_implies|fair_price_requires)\s*:\s*([\s\S]*?)\s*\|\s*(where_i_differ|my_view)\s*:\s*([\s\S]*)$/.exec(s);
    if (!m) return null;
    const label = (k: string) => t(VIEW_LABEL[k as keyof typeof VIEW_LABEL]);
    return [[label(m[1]), m[2]], [label(m[3]), m[4].trim()]];
}

/** The verdict chip's word and colour; an unknown verdict shows raw and muted. */
export function opusChip(t: T, o: Pick<OpusVerdict, 'verdict'>): { text: string; color: string } {
    return has(OPUS_VERDICT_KEY, o.verdict)
        ? { text: t(OPUS_VERDICT_KEY[o.verdict]), color: OPUS_VERDICT_COLOR[o.verdict] }
        : { text: String(o.verdict ?? DASH), color: TONE_COLORS.MUTED };
}
