// My Portfolio storage and the broker bulk-paste parser.

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
