// Geometry for the IV-band visualisations: the 16px row strip and the 58px
// detail hero share one scaler so a ticker reads identically in both places.
//
// The axis spans the whole story — the band AND today's price, whichever is
// wider — with 8% padding each side, so a price far outside the band still
// lands inside the track instead of clipping at the edge.

export interface BandInput {
    price: number | null | undefined;
    low: number | null | undefined;
    high: number | null | undefined;
    median?: number | null | undefined;
    runs?: (number | null | undefined)[];
}

export interface BandGeometry {
    ok: boolean;
    axisLo: number;
    axisHi: number;
    /** Percent offsets (0–100) ready for `left`/`width` styles. */
    bandLeft: number;
    bandWidth: number;
    medianAt: number | null;
    priceAt: number | null;
    runsAt: number[];
}

const EMPTY: BandGeometry = {
    ok: false, axisLo: 0, axisHi: 0, bandLeft: 0, bandWidth: 0,
    medianAt: null, priceAt: null, runsAt: [],
};

export function scaleBand({ price, low, high, median, runs }: BandInput, padFrac = 0.08): BandGeometry {
    if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high)) return EMPTY;

    const points = [low, high, ...(price != null && Number.isFinite(price) ? [price] : [])];
    const lo = Math.min(...points);
    const hi = Math.max(...points);
    const span = hi - lo;
    // A zero-width span (band collapsed to a point at the price) still needs an axis.
    const pad = span > 0 ? span * padFrac : Math.max(Math.abs(hi) * 0.04, 0.5);
    const axisLo = lo - pad;
    const axisHi = hi + pad;
    const width = axisHi - axisLo;
    const at = (v: number | null | undefined) =>
        v == null || !Number.isFinite(v) ? null : ((v - axisLo) / width) * 100;

    const bandLeft = at(low) ?? 0;
    const bandRight = at(high) ?? 0;

    return {
        ok: true,
        axisLo, axisHi,
        bandLeft,
        bandWidth: Math.max(0.6, bandRight - bandLeft),
        medianAt: at(median),
        priceAt: at(price),
        runsAt: (runs ?? []).map(at).filter((x): x is number => x !== null),
    };
}

/** "$158–166 · MED 162" — the strip subline. */
export function bandLabel(low: number | null | undefined, high: number | null | undefined, median?: number | null): string {
    if (low == null || high == null) return '—';
    const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(v % 1 === 0 ? 0 : 1));
    const head = `$${fmt(low)}–${fmt(high)}`;
    return median == null ? head : `${head} · MED ${fmt(median)}`;
}
