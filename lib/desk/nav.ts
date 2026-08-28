// Paper-ledger maths. Pure functions only — the chart components wrap these in
// useMemo.
//
// Every book's NAV is stored indexed to 100 at its own inception; benchmarks are
// stored as raw closes. Both are re-based here to the start of the visible
// window, which is what makes "growth of $10,000" and the window returns agree.

export interface NavPoint {
    date: string;
    nav: number | null;
    bench?: number | null;
    benches?: Record<string, number | null>;
    stale_marks?: string[];
}

export interface Trade {
    date: string;
    side: 'buy' | 'sell';
    ticker: string;
    price: number;
    value: number;
    reason?: string;
}

export const BENCHMARKS = ['IWM', 'SPY', 'QQQ', 'SOXX', 'DRAM'] as const;

/** Strategy books, in the order they appear in the chart legend. */
export const BOOKS: { key: string; label: string; color: string; width: number }[] = [
    // rn_depth is the live AI book (depth-verdict picks); it replaced the *_llm
    // overlay lane in the 2026-08 depth migration. On the chart it is shown as
    // ONE continuous AI record: the retired equal_llm history (inception
    // 2026-07-05, frozen 2026-08-25) chained into rn_depth's returns — see the
    // splice in buildCurve. rn_depth's own NAV index restarted at ~100 on
    // 2026-08-25; the splice removes that reset so the account's progress reads
    // unbroken.
    { key: 'rn_depth', label: 'RS2 AI', color: 'oklch(0.78 0.08 250)', width: 2 },
    // EQUAL takes the factor-value green (no other solid book line uses it). The
    // plan / plan2 / plan3 lanes (and their AI twins) were retired 2026-08-27 —
    // we no longer benchmark books we do not analyse.
    { key: 'equal', label: 'EQUAL', color: '#5a9b6d', width: 1.4 },
    { key: 'mine', label: 'MINE', color: '#cfa14e', width: 1.4 },
];

// The retired AI book whose history the rn_depth chart line continues from.
const AI_PREDECESSOR = 'equal_llm';

export const BENCH_STYLE: Record<string, string> = {
    IWM: '#908d86', SPY: '#6b93c4', QQQ: '#4f9e8f', DRAM: '#8f7fc0', SOXX: '#b56a4f',
};

export interface Curve {
    dates: string[];
    /** Index-100 space, aligned to `dates`; null where a book had not started. */
    series: Record<string, (number | null)[]>;
    /** Cost in NAV-100 points already subtracted from each book, per date. */
    tradeCounts: Record<string, number>;
    tradedValue: Record<string, number>;
}

/** Cumulative extra cost, in NAV-100 points, of re-costing trades at `pct` per side. */
function dragSeries(trades: Trade[], deltaPct: number): { date: string; drag: number }[] {
    const sorted = [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let cum = 0;
    return sorted.map((t) => {
        const v = t.value;
        if (typeof v === 'number' && Number.isFinite(v)) cum += Math.abs(v) * deltaPct / 100;
        return { date: (t.date ?? '').slice(0, 10), drag: cum };
    });
}

function dragAt(drags: { date: string; drag: number }[] | undefined, date: string): number {
    if (!drags?.length) return 0;
    let lo = 0, hi = drags.length - 1, out = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (drags[mid].date <= date) { out = drags[mid].drag; lo = mid + 1; } else hi = mid - 1;
    }
    return out;
}

/**
 * Align every book and benchmark onto one date axis.
 * `commissionPct` re-costs each trade at that rate per side instead of the rate
 * baked into the ledger (`config.cost_bps`); pass null to use the stored one.
 */
export function buildCurve(ledgers: any, commissionPct: number | null): Curve {
    const books = ledgers?.ledgers ?? {};
    const basePct = ((ledgers?.config?.cost_bps as number | undefined) ?? 10) / 100;
    const deltaPct = commissionPct == null ? 0 : commissionPct - basePct;

    // equal_llm is not its own chart line any more, but its history forms the
    // first leg of the continuous RS2 AI line, so it joins the date axis and
    // gets a series computed like the others.
    const curveKeys = [...BOOKS.map((b) => b.key), AI_PREDECESSOR];

    const dateSet = new Set<string>();
    for (const key of curveKeys) {
        for (const p of (books[key]?.nav_series ?? []) as NavPoint[]) if (p.date) dateSet.add(p.date.slice(0, 10));
    }
    const dates = Array.from(dateSet).sort();
    const idx = new Map(dates.map((d, i) => [d, i]));

    const series: Record<string, (number | null)[]> = {};
    const tradeCounts: Record<string, number> = {};
    const tradedValue: Record<string, number> = {};
    const blank = () => new Array<number | null>(dates.length).fill(null);

    for (const key of curveKeys) {
        const book = books[key];
        if (!book?.nav_series?.length) continue;
        const trades: Trade[] = book.trades ?? [];
        tradeCounts[key] = trades.length;
        tradedValue[key] = trades.reduce((s, t) => s + Math.abs(t.value ?? 0), 0);
        const drags = deltaPct !== 0 ? dragSeries(trades, deltaPct) : undefined;

        const arr = blank();
        for (const p of book.nav_series as NavPoint[]) {
            const i = idx.get((p.date ?? '').slice(0, 10));
            if (i === undefined || p.nav == null) continue;
            arr[i] = p.nav - dragAt(drags, p.date.slice(0, 10));
        }
        series[key] = arr;
    }

    // Splice the AI record into one continuous line: equal_llm's actual NAV up
    // to its freeze, then rn_depth's returns scaled so its first point lands on
    // equal_llm's last — no reset to 100 at the 2026-08-25 handover.
    const llm = series[AI_PREDECESSOR];
    const rn = series.rn_depth;
    if (llm && rn) {
        const j = rn.findIndex((v) => v != null);
        // equal_llm's value at (or last before) rn_depth's first mark.
        let anchor: number | null = null;
        for (let i = j; i >= 0; i--) if (llm[i] != null) { anchor = llm[i]; break; }
        if (j >= 0 && anchor != null && rn[j]) {
            const f = anchor / (rn[j] as number);
            series.rn_depth = rn.map((v, i) => (v != null ? v * f : llm[i]));
            tradeCounts.rn_depth = (tradeCounts.rn_depth ?? 0) + (tradeCounts[AI_PREDECESSOR] ?? 0);
            tradedValue.rn_depth = (tradedValue.rn_depth ?? 0) + (tradedValue[AI_PREDECESSOR] ?? 0);
        }
    }
    // Never a standalone line — either merged above or dropped.
    delete series[AI_PREDECESSOR];
    delete tradeCounts[AI_PREDECESSOR];
    delete tradedValue[AI_PREDECESSOR];

    // Benchmarks: raw closes re-based to 100 at their first observation.
    const benchSource = (books.equal?.nav_series ?? books.equal_llm?.nav_series ?? []) as NavPoint[];
    for (const b of BENCHMARKS) {
        const arr = blank();
        let base: number | null = null;
        for (const p of benchSource) {
            const i = idx.get((p.date ?? '').slice(0, 10));
            const v = p.benches?.[b];
            if (i === undefined || v == null) continue;
            if (base === null) base = v;
            arr[i] = (v / base) * 100;
        }
        if (base !== null) series[b] = arr;
    }

    return { dates, series, tradeCounts, tradedValue };
}

/** First index at or after `from` where the series has a value. */
export function firstValue(arr: (number | null)[], from: number): number | null {
    for (let i = from; i < arr.length; i++) if (arr[i] != null) return arr[i];
    return null;
}

export function lastValue(arr: (number | null)[], to: number): number | null {
    for (let i = Math.min(to, arr.length - 1); i >= 0; i--) if (arr[i] != null) return arr[i];
    return null;
}

/** Percent return of a series across [from, to], re-based to the window start. */
export function windowReturn(arr: (number | null)[] | undefined, from: number, to: number): number | null {
    if (!arr) return null;
    const a = firstValue(arr, from);
    const b = lastValue(arr, to);
    if (a == null || b == null || a === 0) return null;
    return (b / a - 1) * 100;
}

/** Index level at `i`, re-based to 100 at the start of the visible window. */
export function growthAt(arr: (number | null)[] | undefined, from: number, i: number, start = 100): number | null {
    if (!arr) return null;
    const base = firstValue(arr, from);
    const v = arr[i];
    if (base == null || v == null || base === 0) return null;
    return (v / base) * start;
}

/** Percent return between two indexed NAV points (used by the status strip). */
export function seriesReturnPct(series: NavPoint[] | undefined, from = 0, to?: number): number | null {
    if (!series || series.length < 2) return null;
    const end = to === undefined ? series.length - 1 : Math.min(to, series.length - 1);
    const a = series[Math.max(0, from)]?.nav;
    const b = series[end]?.nav;
    if (a == null || b == null || a === 0) return null;
    return (b / a - 1) * 100;
}

/** Percent return of one benchmark over the same index window as the book. */
export function benchReturnPct(series: NavPoint[] | undefined, sym: string, from = 0, to?: number): number | null {
    if (!series || series.length < 2) return null;
    const end = to === undefined ? series.length - 1 : Math.min(to, series.length - 1);
    const a = series[Math.max(0, from)]?.benches?.[sym];
    const b = series[end]?.benches?.[sym];
    if (a == null || b == null || a === 0) return null;
    return (b / a - 1) * 100;
}

/**
 * The standing record shown in the header status strip. The AI record is one
 * continuous account: the retired `equal_llm` history chained into the live
 * `rn_depth` book (which restarted its own NAV index on 2026-08-25), so the
 * headline return compounds both legs. Falls back to whichever single book
 * exists when there is nothing to chain.
 */
export function standingRecord(ledgers: any, benchSym = 'QQQ'): {
    key: string; aiPct: number | null; benchSym: string; benchPct: number | null;
} | null {
    const books = ledgers?.ledgers;
    if (!books) return null;
    const key = books.rn_depth?.nav_series?.length ? 'rn_depth'
        : books[AI_PREDECESSOR]?.nav_series?.length ? AI_PREDECESSOR
        : books.equal?.nav_series?.length ? 'equal' : null;
    if (!key) return null;
    let series: NavPoint[] = books[key].nav_series;
    const cumOf = (b: any): number | null =>
        b?.summary?.cumulative_return_pct ?? seriesReturnPct(b?.nav_series);
    let aiPct = cumOf(books[key]);
    if (key === 'rn_depth') {
        const prior = cumOf(books[AI_PREDECESSOR]);
        if (prior != null && aiPct != null) {
            aiPct = ((1 + prior / 100) * (1 + aiPct / 100) - 1) * 100;
            // Benches are raw closes, so the yardstick spans the same chained
            // window by simply prepending the predecessor's series.
            series = [...(books[AI_PREDECESSOR].nav_series as NavPoint[]), ...series];
        }
    }
    return {
        key,
        aiPct,
        benchSym,
        benchPct: benchReturnPct(series, benchSym),
    };
}

/** Group trades by ISO date — the Daily Activity ledger column. */
export function tradesByDate(trades: Trade[] | undefined): Map<string, Trade[]> {
    const map = new Map<string, Trade[]>();
    for (const t of trades ?? []) {
        const d = (t.date ?? '').slice(0, 10);
        if (!d) continue;
        const list = map.get(d);
        if (list) list.push(t); else map.set(d, [t]);
    }
    return map;
}

export interface ClosedTrade {
    ticker: string;
    entry_date: string;
    entry_price: number;
    exit_date: string;
    exit_price: number;
    hold_days: number;
    return_pct: number;
    post_exit_days: number;
    post_exit_return_pct: number | null;
    ledger?: string;
}

/** Exits that kept running without us — the postmortem strip. */
export function soldTooEarly(ledgers: any, books = ['rn_depth', 'equal_llm', 'equal']): ClosedTrade[] {
    const L = ledgers?.ledgers;
    if (!L) return [];
    const out: ClosedTrade[] = [];
    for (const name of books) {
        for (const c of (L[name]?.closed ?? []) as ClosedTrade[]) {
            if (c.post_exit_return_pct != null && c.post_exit_return_pct > 10) out.push({ ...c, ledger: name });
        }
    }
    return out.sort((a, b) => (b.post_exit_return_pct ?? 0) - (a.post_exit_return_pct ?? 0)).slice(0, 10);
}
