// My Portfolio storage, the broker bulk-paste parser and the machine's stance on each holding.

import type { DepthVerdict, FactorEntry } from '@/lib/data-service';
import { gateReasonsText, sizeTone } from './tone';
import { vetoCodeOf } from './veto';
import { rebuiltVerdict } from './verdict';

export interface Holding { ticker: string; value: number }

export const MY_PORTFOLIO_KEY = 'myPortfolio_v1';

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/**
 * Bulk-paste parser. One position per line: first token = ticker, LAST number
 * on the line = market value (broker exports end the row with market value, so
 * extra columns like shares/price are harmless). `$`, `%`, commas and
 * parentheses are stripped; a line starting with CASH sets cash. Skipped lines
 * are returned so the UI can report them instead of silently dropping input.
 */
export function parseBulkPortfolio(text: string): { holdings: Holding[]; cash: number | null; skipped: string[] } {
    const holdings: Holding[] = [];
    const seen = new Set<string>();
    let cash: number | null = null;
    const skipped: string[] = [];

    for (const rawLine of text.split(/\r?\n/)) {
        // Strip thousands separators (digit,digit) BEFORE tokenizing, otherwise
        // "$1,205.00" splits into 1 and 205.00. Commas followed by whitespace
        // stay column separators, so "AAPL, 8000" still works.
        const line = rawLine.trim().replace(/(\d),(?=\d)/g, '$1');
        if (!line) continue;
        const tokens = line.split(/[\s,;\t]+/);
        const ticker = (tokens[0] || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
        const numbers = tokens.slice(1)
            .map((tok) => parseFloat(tok.replace(/[$%,()]/g, '')))
            .filter((n) => Number.isFinite(n) && n > 0);
        const value = numbers.length ? numbers[numbers.length - 1] : NaN;

        if (ticker === 'CASH' && Number.isFinite(value)) { cash = value; continue; }
        // Header rows ("Symbol  Value") are dropped quietly, not reported.
        if ((ticker === 'SYMBOL' || ticker === 'TICKER') && !Number.isFinite(value)) continue;
        if (!TICKER_RE.test(ticker) || !Number.isFinite(value)) { skipped.push(line.slice(0, 40)); continue; }
        if (!seen.has(ticker)) { seen.add(ticker); holdings.push({ ticker, value }); }
    }

    return { holdings, cash, skipped };
}

export function loadPortfolio(): { holdings: Holding[]; cash: number } {
    try {
        const raw = localStorage.getItem(MY_PORTFOLIO_KEY);
        if (!raw) return { holdings: [], cash: 0 };
        const parsed = JSON.parse(raw);
        return {
            holdings: Array.isArray(parsed.holdings) ? parsed.holdings : [],
            cash: typeof parsed.cash === 'number' ? parsed.cash : 0,
        };
    } catch {
        return { holdings: [], cash: 0 };
    }
}

export function savePortfolio(holdings: Holding[], cash: number) {
    try {
        localStorage.setItem(MY_PORTFOLIO_KEY, JSON.stringify({ holdings, cash }));
    } catch { /* storage full or blocked — non-fatal, the page still works */ }
}

export type StanceKind =
    | 'no_coverage' | 'vetoed' | 'no_analysis' | 'blocked' | 'reduce' | 'fair' | 'buy' | 'no_run';

export interface Stance {
    kind: StanceKind;
    /** vetoed: the `fct_veto` / `fct_llm_veto` code. */
    vetoCode: string | null;
    /** blocked: plain-English gate reasons, joined with " · ". Empty when the row lists none. */
    reasons: string;
    /** buy: FULL / HALF / QUARTER, null when the verdict carries no size hint. */
    size: string | null;
    /** Thesis status and follow-up status of the rebuilt verdict, null when absent. */
    thesis: string | null;
    followup: string | null;
}

/**
 * The machine's stance on one holding, by the same precedence the Desk uses. Only a rebuilt-analyst
 * verdict counts (`isRebuiltRow`): a holding whose only verdict is from the old analyst reads
 * NO ANALYSIS YET. A rebuilt verdict with `actionable === false` is BLOCKED and is never BUY or
 * REDUCE, whatever its direction. The direction is the stored one, never recomputed from a price.
 */
export function holdingStance(entry: FactorEntry | undefined, depth: DepthVerdict | undefined): Stance {
    const base = { vetoCode: null, reasons: '', size: null, thesis: null, followup: null };
    if (!entry) return { ...base, kind: 'no_coverage' };
    const veto = vetoCodeOf(entry);
    if (veto) return { ...base, kind: 'vetoed', vetoCode: veto };
    const v = rebuiltVerdict(depth);
    if (!v) return { ...base, kind: 'no_analysis' };
    const watch = { thesis: v.thesis_status ?? null, followup: v.followup_status ?? null };
    if (v.actionable === false) return { ...base, ...watch, kind: 'blocked', reasons: gateReasonsText(v.actionable_reasons) };
    if (v.direction === 'overvalued') return { ...base, ...watch, kind: 'reduce' };
    if (v.direction === 'hold') return { ...base, ...watch, kind: 'fair' };
    if (v.direction === 'undervalued') {
        const size = v.size_hint ? sizeTone(v.size_hint, v.n_basis).label : null;
        return { ...base, ...watch, kind: 'buy', size };
    }
    return { ...base, ...watch, kind: 'no_run' };
}

/** Sectors holding more than this share of the total (cash included) trip the concentration warning. */
export const SECTOR_LIMIT_PCT = 25;

/** Names the AI book holds today, from `paper_ledgers.ledgers.rn_depth.state.holdings`; null when unreadable. */
export function aiBookHoldings(ledgers: unknown): number | null {
    const l = ledgers as { ledgers?: { rn_depth?: { state?: { holdings?: unknown } } } } | null | undefined;
    const h = l?.ledgers?.rn_depth?.state?.holdings;
    if (Array.isArray(h)) return h.length;
    if (h && typeof h === 'object') return Object.keys(h).length;
    return null;
}
