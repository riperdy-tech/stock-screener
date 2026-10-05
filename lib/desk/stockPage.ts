// Pure logic for the stock page (/t/[ticker]): back-link validation, which state the page is in,
// the crux, rule objects in words, watch items, verdict history, book membership and the small
// formatters. No React. `null` renders as "—" and `0` is a value (never `||`-default a number).
//
// Old-analyst verdicts are retired from the Desk: on the stock page they appear only in the verdict
// history, greyed. A name whose only verdict is the old analyst's is in the "no rebuilt verdict yet"
// state. Direction is frozen at verdict time and is never recomputed from a live price.

import type { TRANSLATIONS } from '@/lib/i18n';
import type { DeskRow } from './rankings';
import { deskSections, onList, type DeskSections } from './sections';
import { fmtMcap } from './format';
import { DATA_NOTES, FORENSIC_WARNINGS } from './tone';
import { rebuiltVerdict, type DeskVerdict, type RuleObject } from './verdict';
import { makeAxis } from './band';

type Key = keyof typeof TRANSLATIONS['en'];
export type Translate = (key: Key) => string;

const MINUS = '−';
const DASH = '—';

/** `12.3` with a true minus; no plus sign. */
const num = (v: number, digits: number): string => `${v < 0 ? MINUS : ''}${Math.abs(v).toFixed(digits)}`;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Whole number when it is one, else one decimal. */
const tidy = (v: number): string => num(v, Number.isInteger(v) ? 0 : 1);

// ── Back link ────────────────────────────────────────────────────────────────

export type BackKind = 'desk' | 'track' | 'portfolio' | 'other';

const PROBE = 'http://back.invalid';

/**
 * The page to return to. `from` is the originating relative path (`/?tab=rankings&step=2&verdict=blocked`),
 * passed through `?from=` by the Desk. Anything that is not a plain relative path on this site (an
 * absolute URL, `//host`, a backslash trick, a control character) falls back to `/`. The two legacy
 * values written by the old links (`track`, `port`) keep working.
 */
export function safeBackPath(from: string | null | undefined): string {
    if (!from) return '/';
    if (from === 'track') return '/?tab=track';
    if (from === 'port') return '/?tab=portfolio';
    if (from === 'ai' || from === 'quant') return '/';
    if (from.length > 2000 || !from.startsWith('/') || from.startsWith('//')) return '/';
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    if (/[\\\u0000-\u001f\u007f]/.test(from)) return '/';
    try {
        const u = new URL(from, PROBE);
        if (u.origin !== PROBE) return '/';
        return `${u.pathname}${u.search}`;
    } catch {
        return '/';
    }
}

export function backKind(path: string): BackKind {
    const u = new URL(path, PROBE);
    if (u.pathname !== '/') return 'other';
    const tab = u.searchParams.get('tab');
    return tab === 'track' ? 'track' : tab === 'portfolio' ? 'portfolio' : 'desk';
}

/** `/t/{ticker}?from={encoded current path}`; the root path needs no `from`. */
export function stockHref(ticker: string, backPath: string): string {
    const base = `/t/${encodeURIComponent(ticker)}`;
    return backPath && backPath !== '/' ? `${base}?from=${encodeURIComponent(backPath)}` : base;
}

// ── Which state the page is in ───────────────────────────────────────────────

export type StockMode = 'verdict' | 'vetoed' | 'awaiting';

/** A rebuilt verdict wins; else a vetoed name; else the name is awaiting (queued, or not on the list). */
export function stockMode(row: DeskRow): StockMode {
    if (rebuiltVerdict(row.depth)) return 'verdict';
    return row.vetoed ? 'vetoed' : 'awaiting';
}

const SECTION_KEY: Record<keyof DeskSections, Key> = {
    researchNow: 'dsRn', waiting: 'dsWait', noEdge: 'dsNoEdge', blocked: 'dsBlocked', awaiting: 'dsAwaiting', disqualified: 'dsDisq',
};

/** The Desk section this name sits in (same rules as the Desk), as an i18n key; null when it is on none. */
export function stockSectionKey(row: DeskRow): Key | null {
    const s = deskSections([row]);
    for (const k of Object.keys(SECTION_KEY) as (keyof DeskSections)[]) if (s[k].length) return SECTION_KEY[k];
    return null;
}

/** `queued · screen rank #14` for a listed name, `not on the list` otherwise. */
export function awaitingSubline(row: DeskRow): { listed: boolean; rank: number | null } {
    return { listed: onList(row), rank: row.fct.fct_rank ?? null };
}

// ── Verdict word and subline ────────────────────────────────────────────────

export function verdictWordKey(d: DeskVerdict): Key {
    switch (d.direction) {
        case 'undervalued': return 'vUndervalued';
        case 'overvalued': return 'vOvervalued';
        case 'hold': return 'dvFair';
        default: return 'vNotUsable';
    }
}

/** Subline pieces, joined with " · ": a single run is a point, not a range; otherwise the direction in a phrase. */
export function sublineKeys(d: DeskVerdict): Key[] {
    if (d.n_basis === 1) return d.size_hint ? ['pgOneRun', 'pgSizeCapped'] : ['pgOneRun'];
    switch (d.direction) {
        case 'undervalued': return ['pgSubUnder'];
        case 'overvalued': return ['pgSubOver'];
        case 'hold': return ['pgSubFair'];
        default: return ['pgSubNone'];
    }
}

// ── The crux ────────────────────────────────────────────────────────────────

interface InputKind { label: Key; fmt: (v: number) => string }

const CRUX_INPUTS: Record<string, InputKind> = {
    growth_years_3_5: { label: 'cxGrowth', fmt: (v) => `${num(v * 100, 1)} %/yr` },
    coe: { label: 'cxCoe', fmt: (v) => `${num(v * 100, 2)} %` },
    fade_years: { label: 'cxFade', fmt: (v) => `${tidy(v)} y` },
    terminal_g: { label: 'cxTermG', fmt: (v) => `${num(v * 100, 2)} %` },
    terminal_ronic: { label: 'cxRonic', fmt: (v) => `${num(v * 100, 1)} %` },
    year2_level: { label: 'cxYear2', fmt: (v) => `${num(v * 100, 1)} %` },
};

/** The plain-words label key of a known input; null for an unknown one (shown raw, in mono). */
export const cruxInputKey = (input: string): Key | null => CRUX_INPUTS[input]?.label ?? null;

/** An input value formatted by its kind (growth `%/yr`, rates `%`, years `y`); unknown kinds as stored; null as "—". */
export function fmtInputValue(input: string, v: number | string | null | undefined): string {
    if (v == null) return DASH;
    if (typeof v === 'string') return v;
    if (!Number.isFinite(v)) return DASH;
    const k = CRUX_INPUTS[input];
    return k ? k.fmt(v) : String(v);
}

const LINE_PAD = 8;

/** Where the two diamonds sit on the number line (percent from the left, 8-92 so they never clip). */
export function numberLine(own: number | null, implied: number | null): { ownAt: number | null; impliedAt: number | null } {
    if (own == null && implied == null) return { ownAt: null, impliedAt: null };
    if (own == null || implied == null || own === implied) {
        return { ownAt: own == null ? null : 50, impliedAt: implied == null ? null : 50 };
    }
    const lo = Math.min(own, implied);
    const span = Math.max(own, implied) - lo;
    const at = (v: number) => LINE_PAD + ((v - lo) / span) * (100 - 2 * LINE_PAD);
    return { ownAt: at(own), impliedAt: at(implied) };
}

export interface CruxEntryView {
    input: string;
    labelKey: Key | null;
    ownText: string;
    /** null when the price-implied value does not exist (no value of this input alone reaches the price). */
    impliedText: string | null;
    ownAt: number | null;
    impliedAt: number | null;
    atDefault: boolean;
    reason: string | null;
}

export interface CruxView {
    entries: CruxEntryView[];
    /** `crux_valid === true` (the flag shows only then). */
    valid: boolean;
    /** `crux_valid === false`: the verdict is held at FAIR. */
    invalid: boolean;
    /** price_implied inputs that are not reachable and not already shown above. */
    otherUnreachable: { input: string; labelKey: Key | null }[];
    /** Directional or held verdict with nothing stated: "No stated disagreement on record." */
    none: boolean;
}

export function cruxView(v: DeskVerdict): CruxView {
    const entries: CruxEntryView[] = (v.crux ?? [])
        .filter((c): c is NonNullable<typeof c> & { input: string } => !!c && typeof c.input === 'string' && c.input !== '')
        .map((c) => {
            const own = isNum(c.own) ? c.own : null;
            const implied = isNum(c.implied) ? c.implied : null;
            const line = numberLine(own, implied);
            return {
                input: c.input,
                labelKey: cruxInputKey(c.input),
                ownText: fmtInputValue(c.input, own),
                impliedText: implied == null ? null : fmtInputValue(c.input, implied),
                ownAt: line.ownAt,
                impliedAt: line.impliedAt,
                atDefault: c.at_default === true,
                reason: typeof c.reason === 'string' && c.reason !== '' ? c.reason : null,
            };
        });
    const shown = new Set(entries.map((e) => e.input));
    const otherUnreachable = Object.entries(v.price_implied ?? {})
        .filter(([k, p]) => p?.reachable === false && !shown.has(k))
        .map(([k]) => ({ input: k, labelKey: cruxInputKey(k) }));
    return {
        entries,
        valid: v.crux_valid === true,
        invalid: v.crux_valid === false,
        otherUnreachable,
        none: entries.length === 0 && v.crux_valid !== false,
    };
}

/** The crux section only exists for a verdict that has a direction. */
export const hasDirection = (v: DeskVerdict): boolean => v.direction === 'undervalued' || v.direction === 'overvalued' || v.direction === 'hold';

// ── Band hero ───────────────────────────────────────────────────────────────

export interface HeroView {
    ok: boolean;
    at: (v: number | null | undefined) => number | null;
    axisLo: number;
    axisHi: number;
    runs: number[];
    streetLow: number | null;
    streetHigh: number | null;
    single: boolean;
}

/** One axis over every value the hero draws: Street range, bear, bull, band, runs, both prices. */
export function heroView(v: DeskVerdict, runIvs: number[], live: number | null, atVerdict: number | null): HeroView | null {
    const sf = v.street_fence;
    const streetLow = isNum(sf?.low) ? sf!.low! : null;
    const streetHigh = isNum(sf?.high) ? sf!.high! : null;
    const axis = makeAxis([
        v.iv_band_low, v.iv_band_high, v.median_iv, v.bear_iv, v.bull_iv, streetLow, streetHigh, live, atVerdict, ...runIvs,
    ]);
    if (!axis || v.iv_band_low == null || v.iv_band_high == null) return null;
    return {
        ok: true, at: axis.at, axisLo: axis.axisLo, axisHi: axis.axisHi, runs: runIvs,
        streetLow, streetHigh, single: v.n_basis === 1 || v.iv_band_low === v.iv_band_high,
    };
}

/** Plausible runs, in order, from the `depth_reports/{T}.json` samples. */
export function usableRuns(samples: { iv: number | null; plausible: boolean }[] | null | undefined): number[] {
    return (samples ?? []).filter((s) => s.plausible && isNum(s.iv)).map((s) => s.iv as number);
}

/** Whole dollars from $10 up, else cents: the hero's labels. */
export const heroMoney = (x: number): string => `$${Math.abs(x) >= 10 ? Math.round(x).toString() : x.toFixed(2)}`;

/** Where a label sits so it never leaves the track: left-anchored near the left end, right-anchored near the right end. */
export function labelAnchor(pct: number): 'left' | 'center' | 'right' {
    return pct < 12 ? 'left' : pct > 88 ? 'right' : 'center';
}

export type PriceReading = 'inside' | 'below' | 'above' | 'unknown';
export function priceReading(price: number | null, low: number | null, high: number | null): PriceReading {
    if (price == null || low == null || high == null) return 'unknown';
    return price < low ? 'below' : price > high ? 'above' : 'inside';
}

// ── Rule objects in words ───────────────────────────────────────────────────

const RULE_METRICS: Record<string, { label: Key; kind: 'frac_pct' | 'pct' }> = {
    mom_6m: { label: 'rmMom6m', kind: 'frac_pct' },
    high_52w_distance: { label: 'rmHigh52', kind: 'frac_pct' },
    revenue_yoy_pct: { label: 'rmRevYoy', kind: 'pct' },
    operating_margin_pct: { label: 'rmOpMargin', kind: 'pct' },
};

const COMPARATOR_KEY: Record<string, Key> = { '<': 'rcBelow', '<=': 'rcAtOrBelow', '>': 'rcAbove', '>=': 'rcAtOrAbove' };

/**
 * A rule value for its metric. Fraction metrics (momentum, distance from the 52-week high) are
 * stored as fractions (-0.25) but some rows carry them already as percent (-25): a magnitude over 1
 * is read as percent, since a fraction beyond 100 % would not be a threshold anyone sets. Zero needs
 * no unit. Unknown metrics show the number as stored.
 */
export function ruleValueText(metric: string | null | undefined, v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return DASH;
    const m = metric ? RULE_METRICS[metric] : undefined;
    if (!m) return String(v);
    const x = m.kind === 'frac_pct' && Math.abs(v) <= 1 ? v * 100 : v;
    return x === 0 ? '0' : `${tidy(x)} %`;
}

export interface RuleView {
    /** Plain-words metric, or the raw key (then `metricMono`). */
    metric: string;
    metricMono: boolean;
    /** `below` / `at or below` / ...; the raw comparator when unknown. */
    cmp: string;
    threshold: string;
    /** `180-day window` for a `window_days` rule; the `window` phrase verbatim for an invalidation rule. */
    window: string | null;
}

export function ruleView(t: Translate, r: RuleObject | null | undefined): RuleView | null {
    if (!r || typeof r.metric !== 'string' || r.metric === '') return null;
    const known = RULE_METRICS[r.metric];
    const cmpKey = r.comparator ? COMPARATOR_KEY[r.comparator] : undefined;
    return {
        metric: known ? t(known.label) : r.metric,
        metricMono: !known,
        cmp: cmpKey ? t(cmpKey) : (r.comparator ?? DASH),
        threshold: ruleValueText(r.metric, r.threshold),
        window: isNum(r.window_days) ? t('rcWindowDays').replace('{n}', String(r.window_days))
            : typeof r.window === 'string' && r.window !== '' ? r.window : null,
    };
}

/** The `thesis_checks[]` entry for an invalidation rule: same metric, comparator and threshold. */
export function thesisCheckFor(rule: RuleObject, checks: DeskVerdict['thesis_checks']) {
    return (checks ?? []).find((c) => c.metric === rule.metric && c.comparator === rule.comparator && c.threshold === rule.threshold);
}

// ── Timing ──────────────────────────────────────────────────────────────────

const TIMING_KEY: Record<string, Key> = { buy_now: 'dkBuyNow', wait_for_momentum: 'pgWaitMomentum', avoid: 'dkAvoid' };
const MOMENTUM_KEY: Record<string, Key> = { confirming: 'pgMomConfirming', neutral: 'pgMomNeutral', contradicting: 'pgMomContradicting' };

export const timingKey = (raw: string | null | undefined): Key | null => (raw ? TIMING_KEY[raw] ?? null : null);
export const momentumKey = (raw: string | null | undefined): Key | null => (raw ? MOMENTUM_KEY[raw] ?? null : null);
export const plainCode = (code: string): string => code.replace(/_/g, ' ');

// ── Watch items (follow-up fields; Phase C) ─────────────────────────────────

export interface WatchItemView {
    id: string | null;
    text: string | null;
    status: string;
    statusKey: Key | null;
    side: string | null;
    sideKey: Key | null;
    quote: string | null;
    source: string | null;
    date: string | null;
    verified: boolean;
    checkedAt: string | null;
}

const STATUS_KEY: Record<string, Key> = { reported: 'wiReported', not: 'wiNot', unclear: 'wiUnclear' };
const SIDE_KEY: Record<string, Key> = { break: 'wiBreak', confirm: 'wiConfirm' };

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function watchItems(v: DeskVerdict): WatchItemView[] {
    return (Array.isArray(v.watch_items) ? v.watch_items : [])
        .filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null)
        .map((o) => {
            const status = str(o.status) ?? DASH;
            const side = str(o.side);
            return {
                id: str(o.id),
                text: str(o.text),
                status,
                statusKey: STATUS_KEY[status] ?? null,
                side,
                sideKey: side ? SIDE_KEY[side] ?? null : null,
                quote: str(o.quote),
                source: str(o.source),
                date: str(o.date),
                verified: o.verified === true,
                checkedAt: str(o.checked_at),
            };
        });
}

const FOLLOWUP_KEY: Record<string, Key> = {
    reanalysis_queued: 'fuReanalysis', break_condition_met: 'fuBreak', unknown: 'fuUnknown',
};

/** The warning banner for a follow-up state other than ok; null when there is none (or no follow-up field at all). */
export function followupWarning(v: DeskVerdict): { key: Key | null; raw: string } | null {
    const s = v.followup_status;
    if (typeof s !== 'string' || s === '' || s === 'ok') return null;
    return { key: FOLLOWUP_KEY[s] ?? null, raw: s };
}

/** buy_paused: true / false / null (unknown counts as paused). `none` when the row has no follow-up fields. */
export function buyPaused(v: DeskVerdict): { state: 'none' | 'paused' | 'unknown' | 'free'; reasons: string[] } {
    const known = v.buy_paused != null || v.followup_asof != null;
    if (!known) return { state: 'none', reasons: [] };
    const reasons = (v.buy_paused_reasons ?? []).map(plainCode);
    if (v.buy_paused === false) return { state: 'free', reasons };
    return { state: v.buy_paused === true ? 'paused' : 'unknown', reasons };
}

// ── Verdict history ─────────────────────────────────────────────────────────
// TODO(data request): per-ticker history. There is no history file yet, so the overlay's single row is
// the only record; `instability.prior_iv` is the only trace of an earlier verdict.

export interface HistoryLine {
    kind: 'rebuilt' | 'old' | 'earlier';
    date: string | null;
    wordKey: Key | null;
    /** The gate blocked it (or it is the old analyst's): shown in grey. */
    blocked: boolean;
    priorIv: number | null;
}

export function verdictHistory(d: DeskVerdict | undefined): HistoryLine[] {
    if (!d) return [];
    const rebuilt = rebuiltVerdict(d) !== undefined;
    const lines: HistoryLine[] = [{
        kind: rebuilt ? 'rebuilt' : 'old', date: d.date ?? null, wordKey: verdictWordKey(d),
        blocked: !rebuilt || d.actionable !== true, priorIv: null,
    }];
    if (rebuilt && isNum(d.instability?.prior_iv)) {
        lines.push({ kind: 'earlier', date: null, wordKey: null, blocked: true, priorIv: d.instability!.prior_iv! });
    }
    return lines;
}

// ── Banners ─────────────────────────────────────────────────────────────────

export interface InstabilityDelta { delta: number; prior: number; current: number }

/** The value-moved sentence's numbers, when the base value jumped since the prior verdict. */
export function instabilityDelta(d: DeskVerdict): InstabilityDelta | null {
    const i = d.instability;
    if (!i || i.unstable !== true || !isNum(i.delta_pct) || !isNum(i.prior_iv) || !isNum(i.current_iv)) return null;
    return { delta: i.delta_pct, prior: i.prior_iv, current: i.current_iv };
}

// ── Book membership ─────────────────────────────────────────────────────────

export interface LedgersLike {
    ledgers?: Record<string, { state?: { holdings?: Record<string, { entry_date?: string | null; entry_price?: number | null } | undefined> } } | undefined>;
}

export interface BookHolding { book: 'rn_depth' | 'equal' | 'mine'; labelKey: Key; entryDate: string | null; entryPrice: number | null; pnlPct: number | null }

const BOOKS: { book: BookHolding['book']; labelKey: Key }[] = [
    { book: 'rn_depth', labelKey: 'bkAi' }, { book: 'equal', labelKey: 'bkControl' }, { book: 'mine', labelKey: 'bkMine' },
];

/** The books that hold the name now, with entry date, entry price and P&L against the live price. */
export function bookMembership(ledgers: LedgersLike | null | undefined, ticker: string, live: number | null): BookHolding[] {
    const out: BookHolding[] = [];
    for (const { book, labelKey } of BOOKS) {
        const h = ledgers?.ledgers?.[book]?.state?.holdings?.[ticker];
        if (!h) continue;
        const entryPrice = isNum(h.entry_price) ? h.entry_price : null;
        out.push({
            book, labelKey, entryDate: h.entry_date ?? null, entryPrice,
            pnlPct: live != null && entryPrice != null && entryPrice > 0 ? (live / entryPrice - 1) * 100 : null,
        });
    }
    return out;
}

// ── Key financials ──────────────────────────────────────────────────────────

export interface FinCell { labelKey: Key; text: string }

/** The existing metrics set; `—` where a value is not stored. Forensic tags are warnings only. */
export function keyFinancials(row: DeskRow): { cells: FinCell[]; forensic: string[]; notes: string[] } {
    const m = row.info?.metrics;
    const price = row.depth?.price ?? row.info?.price;
    const mcap = row.info?.marketCap;
    const pe = m?.epsTtm != null && m.epsTtm > 0 && price ? price / m.epsTtm : null;
    const fwdPe = m?.forwardEpsEstimate != null && m.forwardEpsEstimate > 0 && price ? price / m.forwardEpsEstimate : null;
    const fcf = m?.ocf != null && m?.capex != null ? m.ocf + m.capex : null;
    const fcfYield = fcf != null && mcap && mcap > 0 ? (fcf / mcap) * 100 : null;
    const netIncomeEst = m?.epsTtm != null && price && mcap ? (m.epsTtm / price) * mcap : null;
    const cashConv = m?.ocf != null && netIncomeEst != null && netIncomeEst > 0 ? (m.ocf / netIncomeEst) * 100 : null;

    const pts = (v: number | null | undefined, digits = 1) => (v == null ? DASH : `${num(v, digits)} %`);
    const mult = (v: number | null | undefined) => (v == null ? DASH : `${v.toFixed(2)}x`);
    const flags = row.fct.fct_flags ?? [];
    return {
        cells: [
            { labelKey: 'kfPe', text: pe != null ? pe.toFixed(1) : DASH },
            { labelKey: 'kfFwdPe', text: fwdPe != null ? fwdPe.toFixed(1) : DASH },
            { labelKey: 'kfPs', text: mult(m?.priceToSales) },
            { labelKey: 'kfPb', text: mult(m?.priceToBook) },
            { labelKey: 'kfPeg', text: mult(m?.pegRatio) },
            { labelKey: 'kfRevGrowth', text: pts(m?.revenueGrowth) },
            { labelKey: 'kfGrossMargin', text: pts(m?.grossMargin) },
            { labelKey: 'kfRoic', text: pts(m?.roic) },
            { labelKey: 'kfFcf', text: fcf != null ? fmtMcap(fcf) : DASH },
            { labelKey: 'kfFcfYield', text: pts(fcfYield) },
            { labelKey: 'kfCashConv', text: pts(cashConv, 0) },
            { labelKey: 'kfAltman', text: m?.zScore != null ? m.zScore.toFixed(2) : DASH },
            { labelKey: 'kfInsider', text: pts(m?.insiderOwnership, 0) },
            { labelKey: 'kfMcap', text: fmtMcap(mcap) },
        ],
        forensic: flags.filter((f) => f in FORENSIC_WARNINGS).map((f) => FORENSIC_WARNINGS[f]),
        notes: flags.filter((f) => f in DATA_NOTES).map((f) => DATA_NOTES[f]),
    };
}

// ── Evidence & integrity ────────────────────────────────────────────────────

const COE_SOURCE_KEY: Record<string, Key> = { anchor: 'evCoeAnchor', anchor_adjusted: 'evCoeAnchorAdj', own: 'evCoeOwn' };
export const coeSourceKey = (s: string | null | undefined): Key | null => (s ? COE_SOURCE_KEY[s] ?? null : null);

/** Fraction -> percent text with a true minus. */
export const fracPct = (v: number | null | undefined, digits = 2): string => (isNum(v) ? `${num(v * 100, digits)} %` : DASH);

/** Signed percentage points (`+0.12 pt`) from a fraction difference. */
export function signedPts(frac: number | null | undefined, digits = 2): string {
    if (!isNum(frac)) return DASH;
    const x = frac * 100;
    return `${x > 0 ? '+' : x < 0 ? MINUS : ''}${Math.abs(x).toFixed(digits)} pt`;
}

/** Terminal growth for a Gordon terminal, else the stored value as is. */
export function terminalText(method: string | null | undefined, v: number | null | undefined): string {
    if (!isNum(v)) return DASH;
    return method === 'gordon' ? fracPct(v, 2) : String(v);
}

/** `terminal_ronic` is a fraction, or the word "unlimited". */
export const ronicText = (v: number | string | null | undefined): string =>
    v == null ? DASH : typeof v === 'string' ? v : fracPct(v, 1);

interface KnownFlag { re: RegExp; text: (m: RegExpMatchArray) => string }

// The verdict's own `flags[]`: machine-ish strings. Known shapes read as plain words; unknown ones stay verbatim.
const KNOWN_FLAGS: KnownFlag[] = [
    { re: /^MODE_INSTABILITY$/, text: () => 'mode instability' },
    { re: /^above_52w_high_([\d.]+)x$/, text: (m) => `${m[1]}× 52-week high` },
    { re: /^above_analyst_high_([\d.]+)x_cap_[\d.]+x$/, text: (m) => `${m[1]}× analyst high` },
    { re: /^mos_([+-]?\d+)pct_beyond_\d+pct$/, text: (m) => `MoS ${m[1].startsWith('-') ? MINUS + m[1].slice(1) : m[1].startsWith('+') ? m[1] : `+${m[1]}`} %` },
    { re: /^compounder_near_fair_value$/, text: () => 'compounder near fair value' },
    { re: /^risk_flag_unavailable$/, text: () => 'risk flag unavailable' },
];

export function verdictFlag(code: string): { text: string; known: boolean } {
    for (const f of KNOWN_FLAGS) {
        const m = code.match(f.re);
        if (m) return { text: f.text(m), known: true };
    }
    return { text: code, known: false };
}

/** Age in days with one decimal and the stamp's date and time. */
export function briefAge(d: DeskVerdict): { days: number | null; stamp: string | null } {
    const days = isNum(d.research_brief_age_days) ? d.research_brief_age_days : null;
    const s = d.research_brief_asof;
    return { days, stamp: typeof s === 'string' && s.length >= 16 ? s.slice(5, 16).replace('T', ' ') : null };
}

/** `MM-DD` of a stamp or date. */
export const mmdd = (s: string | null | undefined): string => (s && s.length >= 10 ? s.slice(5, 10) : DASH);
