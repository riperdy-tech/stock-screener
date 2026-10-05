// The stock page's "Price, 400 days" chart: pick one ticker's closes out of daily_closes.json and
// lay them out as an inline-SVG path, with the verdict's value band as a shaded horizontal band and a
// marker at the verdict date. Pure functions, no React. A ticker with no series gets no chart.

/** `{asof, tickers: {T: {YYYY-MM-DD: [close, volume]}}}`, ~4.7 MB; fetched only on the stock page. */
export interface DailyClosesPayload {
    asof?: string;
    tickers: Record<string, Record<string, [number, number] | undefined> | undefined>;
}

export interface Series { dates: string[]; closes: number[] }

const DAY_MS = 86_400_000;
const ms = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

/** The last `days` calendar days of a ticker's closes, oldest first; null when it has no usable series. */
export function seriesFor(p: DailyClosesPayload | null | undefined, ticker: string, days = 400): Series | null {
    const raw = p?.tickers?.[ticker];
    if (!raw) return null;
    const dates = Object.keys(raw)
        .filter((d) => { const c = raw[d]?.[0]; return typeof c === 'number' && Number.isFinite(c); })
        .sort();
    if (dates.length < 2) return null;
    const cutoff = ms(dates[dates.length - 1]) - days * DAY_MS;
    const kept = dates.filter((d) => ms(d) >= cutoff);
    return kept.length < 2 ? null : { dates: kept, closes: kept.map((d) => raw[d]![0]) };
}

export interface ChartInput { low: number | null; high: number | null; verdictDate: string | null }

export interface ChartGeometry {
    path: string;
    /** Value band as y pixels (top, bottom); a single value draws as a line (top === bottom). */
    band: { top: number; bottom: number } | null;
    /** x pixel of the verdict date, or null when it falls outside the drawn range. */
    verdictX: number | null;
    /** Axis end labels. */
    yLo: number;
    yHi: number;
    first: string;
    last: string;
}

export function chartGeometry(s: Series, c: ChartInput, w: number, h: number, pad = { l: 4, r: 4, t: 6, b: 6 }): ChartGeometry {
    const vals = [...s.closes];
    if (c.low != null) vals.push(c.low);
    if (c.high != null) vals.push(c.high);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || Math.max(Math.abs(hi) * 0.04, 0.5);
    const yLo = lo - span * 0.06;
    const yHi = hi + span * 0.06;
    const t0 = ms(s.dates[0]);
    const t1 = ms(s.dates[s.dates.length - 1]);
    const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (w - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - yLo) / (yHi - yLo)) * (h - pad.t - pad.b);

    const path = s.dates.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(ms(d)).toFixed(1)},${y(s.closes[i]).toFixed(1)}`).join(' ');
    const band = c.low != null && c.high != null
        ? { top: y(Math.max(c.low, c.high)), bottom: y(Math.min(c.low, c.high)) }
        : null;
    const vt = c.verdictDate ? ms(c.verdictDate) : NaN;
    const verdictX = Number.isFinite(vt) && vt >= t0 && vt <= t1 ? x(vt) : null;
    return { path, band, verdictX, yLo, yHi, first: s.dates[0], last: s.dates[s.dates.length - 1] };
}
