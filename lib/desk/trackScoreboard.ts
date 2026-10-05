// Verdict scoreboard for the Track record page. Pure functions over depth_outcomes.json.
//
// The scoreboard leads with counts, never with returns. While no graded verdict comes from the
// valid analyst (`analyst_valid === true`), no excess return, %-beat, t-statistic or direction
// cut is produced at all: `perHorizon` is null, so nothing can render it by accident.
// Missing data is null and renders "—"; 0 is a value (never `||`-defaulted).

/** The horizons the scoreboard tiles show (the file also carries 60). */
export const SCOREBOARD_HORIZONS = [30, 91, 182, 365] as const;

/** The cuts worth a table once there is a valid sample. */
export const SCOREBOARD_CUTS = ['direction', 'entry_timing', 'size_hint'] as const;

interface RawStats {
    inconclusive?: boolean | null;
    n_names?: number | null;
    n_verdicts?: number | null;
    mean_excess_iwm_pct?: number | null;
    namewt_mean_excess_iwm_pct?: number | null;
    pct_beat_iwm?: number | null;
    namewt_pct_beat_iwm?: number | null;
    t_stat_excess_iwm_ignoring_overlap?: number | null;
}

/** The fields of depth_outcomes.json this page reads. Loose on purpose: the file carries far more. */
export interface DepthOutcomes {
    generated_at?: string | null;
    benchmark_primary?: string | null;
    caveats?: string[] | null;
    graded?: { analyst_valid?: boolean | null }[] | null;
    graded_verdict_horizons?: number | null;
    pending_verdict_horizons?: number | null;
    gradeable_counts_per_horizon?: Record<string, number | { total?: number | null } | null> | null;
    per_horizon?: Record<string, {
        all?: RawStats | null;
        cuts?: { cut?: string; buckets?: Record<string, RawStats> | null }[] | null;
    } | null> | null;
}

export interface StatRow {
    nNames: number | null;
    nVerdicts: number | null;
    /** Name-weighted mean excess vs the primary benchmark, percent. */
    meanExcess: number | null;
    /** Name-weighted share of names beating the benchmark, percent. */
    pctBeat: number | null;
    /** t-statistic that ignores the overlap between repeat verdicts; null when not computed. */
    tStat: number | null;
    inconclusive: boolean;
}

export interface CutTable {
    cut: string;
    rows: (StatRow & { bucket: string })[];
}

export interface HorizonResult {
    days: number;
    all: StatRow | null;
    cuts: CutTable[];
}

export interface Scoreboard {
    /** Graded verdict-horizons from the valid analyst: `graded[]` rows with analyst_valid === true. */
    validGraded: number;
    /** `graded_verdict_horizons`. */
    graded: number | null;
    /** `pending_verdict_horizons`. */
    pending: number | null;
    horizons: { days: number; total: number | null }[];
    /** Verbatim from the file, one string per line. */
    caveats: string[];
    benchmark: string;
    /** Null while validGraded is 0: no performance figure may be shown in that state. */
    perHorizon: HorizonResult[] | null;
}

function statRow(s: RawStats | null | undefined): StatRow | null {
    if (!s) return null;
    return {
        nNames: s.n_names ?? null,
        nVerdicts: s.n_verdicts ?? null,
        // name-weighted figures first: repeat verdicts on one name are correlated.
        meanExcess: s.namewt_mean_excess_iwm_pct ?? s.mean_excess_iwm_pct ?? null,
        pctBeat: s.namewt_pct_beat_iwm ?? s.pct_beat_iwm ?? null,
        tStat: s.t_stat_excess_iwm_ignoring_overlap ?? null,
        inconclusive: s.inconclusive === true,
    };
}

export function buildScoreboard(out: DepthOutcomes | null | undefined): Scoreboard | null {
    if (!out) return null;
    const validGraded = (out.graded ?? []).filter((g) => g.analyst_valid === true).length;
    const gradeable = out.gradeable_counts_per_horizon ?? {};
    const horizons = SCOREBOARD_HORIZONS.map((days) => {
        const v = gradeable[String(days)];
        return { days, total: typeof v === 'number' ? v : (v?.total ?? null) };
    });

    let perHorizon: HorizonResult[] | null = null;
    if (validGraded > 0) {
        perHorizon = SCOREBOARD_HORIZONS.map((days) => {
            const h = out.per_horizon?.[String(days)];
            const cuts: CutTable[] = [];
            for (const name of SCOREBOARD_CUTS) {
                const c = (h?.cuts ?? []).find((x) => x.cut === name);
                if (!c?.buckets) continue;
                const rows = Object.entries(c.buckets)
                    .map(([bucket, s]) => ({ bucket, ...statRow(s)! }))
                    .sort((a, b) => (b.nVerdicts ?? 0) - (a.nVerdicts ?? 0));
                if (rows.length > 0) cuts.push({ cut: name, rows });
            }
            return { days, all: statRow(h?.all), cuts };
        });
    }

    return {
        validGraded,
        graded: out.graded_verdict_horizons ?? null,
        pending: out.pending_verdict_horizons ?? null,
        horizons,
        caveats: out.caveats ?? [],
        benchmark: out.benchmark_primary ?? 'IWM',
        perHorizon,
    };
}
