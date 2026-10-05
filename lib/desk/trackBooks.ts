// Paper-book stats and ledger text for the Track record page. Pure functions over
// paper_ledgers.json; only `rn_depth` (AI book), `equal` (Control) and `mine` are read.
// The retired `equal_llm` and plan* books are never touched here.
// Missing data is null and renders "—"; 0 is a value (never `||`-defaulted).

import type { TRANSLATIONS } from '@/lib/i18n';
import type { Trade } from './nav';

type TKey = keyof typeof TRANSLATIONS['en'];

/**
 * CAGR and Sharpe are hidden while a book has fewer observations than this. It is a judgement
 * default, not a statistical rule: annualising a few weeks of daily returns says nothing, and 60
 * trading days (about one quarter) is where it stops being obviously absurd. Raise it if the
 * operator wants a harder floor.
 */
export const MIN_OBS_FOR_RATIOS = 60;

export const ratiosMeaningful = (observations: number | null | undefined): boolean =>
    observations != null && observations >= MIN_OBS_FOR_RATIOS;

/** The `summary` fields of one book, by the names the page uses. */
export interface BookStats {
    returnPct: number | null;
    excessIwm: number | null;
    maxDrawdown: number | null;
    winRate: number | null;
    closedTrades: number | null;
    openPositions: number | null;
    avgHoldDays: number | null;
    observations: number | null;
    cagr: number | null;
    sharpe: number | null;
}

/** Loose view of one ledger book (the file also carries more). */
export interface LedgerBook {
    summary?: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any -- summary is an untyped JSON object
    trades?: Trade[] | null;
    nav_series?: { date?: string }[] | null;
    state?: { holdings?: Record<string, { entry_date?: string }> | null } | null;
    closed?: { entry_date?: string; exit_date?: string }[] | null;
}

export function bookStats(book: LedgerBook | null | undefined): BookStats | null {
    const s = book?.summary;
    if (!s) return null;
    return {
        returnPct: s.cumulative_return_pct ?? null,
        excessIwm: s.excess_vs?.IWM ?? null,
        maxDrawdown: s.max_drawdown_pct ?? null,
        winRate: s.win_rate_pct ?? null,
        closedTrades: s.closed_trades ?? null,
        openPositions: s.open_positions ?? null,
        avgHoldDays: s.avg_hold_days ?? null,
        observations: s.observations ?? null,
        cagr: s.cagr_pct ?? null,
        sharpe: s.sharpe ?? null,
    };
}

/** First nav date of a book: when its own record starts. */
export function bookStart(book: LedgerBook | null | undefined): string | null {
    const d = (book?.nav_series ?? []).map((p) => p.date?.slice(0, 10)).filter((x): x is string => !!x);
    return d.length > 0 ? d.reduce((a, b) => (a < b ? a : b)) : null;
}

/** The newest trade (last in file order among the newest date), or null. */
function lastTrade(trades: Trade[] | null | undefined): Trade | null {
    let best: Trade | null = null;
    for (const t of trades ?? []) {
        if (!t.date) continue;
        if (best === null || t.date.slice(0, 10) >= best.date.slice(0, 10)) best = t;
    }
    return best;
}

/**
 * The date the book went to cash: set when it holds nothing (`open_positions === 0`) and its last
 * trade is a sell, else null. Read from `trades`, never a constant.
 */
export function cashSince(book: LedgerBook | null | undefined): string | null {
    if (book?.summary?.open_positions !== 0) return null;
    const last = lastTrade(book.trades);
    return last && last.side === 'sell' ? last.date.slice(0, 10) : null;
}

// ── ledger text ────────────────────────────────────────────────────────────

const REASON_KEYS: Record<string, TKey> = {
    left_rank: 'trkReasonLeft',
    entered_rank: 'trkReasonEntered',
    rebalance_rank: 'trkReasonRebalance',
};

/** Translation key of a known reason code, else null. */
export const reasonKey = (code: string | null | undefined): TKey | null =>
    code ? (REASON_KEYS[code] ?? null) : null;

/** An unknown code shown as plain words: `new_code_x` becomes `new code x`. */
export const reasonFallback = (code: string | null | undefined): string => (code ?? '').replace(/_/g, ' ');

export interface LedgerRow {
    date: string;
    /** A trade, or null for a day nothing changed. */
    trade: Trade | null;
    /** Positions held at the close of that day. */
    held: number;
}

/**
 * One row per trade, newest first, plus one row per day with no trade. Days come from the nav
 * series and the trades together. Positions held at a day's close are counted from entry and
 * exit dates (closed round trips plus current holdings), so partial rebalances never change them.
 */
export function ledgerRows(book: LedgerBook | null | undefined, limit = 60): LedgerRow[] {
    if (!book) return [];
    const byDate = new Map<string, Trade[]>();
    for (const t of book.trades ?? []) {
        const d = t.date?.slice(0, 10);
        if (!d) continue;
        const list = byDate.get(d);
        if (list) list.push(t); else byDate.set(d, [t]);
    }
    const dates = new Set<string>(byDate.keys());
    for (const p of book.nav_series ?? []) if (p.date) dates.add(p.date.slice(0, 10));

    const held = (d: string) =>
        (book.closed ?? []).filter((c) => (c.entry_date ?? '9') <= d && (c.exit_date ?? '') > d).length
        + Object.values(book.state?.holdings ?? {}).filter((h) => (h.entry_date ?? '9') <= d).length;

    const out: LedgerRow[] = [];
    for (const d of Array.from(dates).sort().reverse()) {
        const trades = byDate.get(d);
        const n = held(d);
        if (trades) for (const t of trades) out.push({ date: d, trade: t, held: n });
        else out.push({ date: d, trade: null, held: n });
        if (out.length >= limit) break;
    }
    return out;
}

// ── number text (percent figures already in percent units) ───────────────────

const signOf = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');

/** "−4.24 %" */
export const fmtRet = (v: number | null | undefined, digits = 2): string =>
    v == null || !Number.isFinite(v) ? '—' : `${signOf(v)}${Math.abs(v).toFixed(digits)} %`;

/** "+1.68 pt": a gap in percentage points against a benchmark. */
export const fmtPt = (v: number | null | undefined, digits = 2): string =>
    v == null || !Number.isFinite(v) ? '—' : `${signOf(v)}${Math.abs(v).toFixed(digits)} pt`;

/** "38.5 %" (unsigned). */
export const fmtPlainPct = (v: number | null | undefined, digits = 1): string =>
    v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)} %`;

/** Gain / loss tone class; zero and missing stay neutral. */
export const toneClass = (v: number | null | undefined): string =>
    v == null || v === 0 ? 'text-ink' : v > 0 ? 'text-pos' : 'text-neg';
