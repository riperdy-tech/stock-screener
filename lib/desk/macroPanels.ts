// Pure helpers for the extra panels on /macro (WO_MP1). Nothing here fetches or renders.
// Missing data is null and shows as a dash or "not available"; 0 is a value and is never defaulted away.
// What the page shows is a description of the present. The regime label and the sector ranking were
// tested (2026-11-12) and showed no skill at predicting returns, so nothing here is a signal.

import type {
    MriCloudDaily, MriCombinedDiagnostic, MriDataHealthInput, MriDimensionDirection, MriFeatureSeries, MriHistoryIndex, MriHistoryRun,
    MriMacroFeatures, MriNberBenchmark, MriNewsScoreReport, MriRegime, MriRegimeTimeline, MriScoredItem, MriSectorComponent,
    MriSectorRanking, MriSectorRow, MriSectorValidation, MriSnapshotManifest, MriTimelinePoint, MriValidationRow,
} from '@/lib/data-service';

export const DASH = '—';

/** The ten dimensions in the order the engine's own documents list them. Any other id found in a file is added after these. */
export const DIMENSION_ORDER = [
    'growth_momentum', 'inflation_pressure', 'policy_stance', 'real_rates', 'yield_curve',
    'credit_liquidity', 'monetary_liquidity', 'dollar', 'commodity', 'housing_activity',
] as const;

const DIMENSION_NAMES: Record<string, string> = {
    growth_momentum: 'Growth',
    inflation_pressure: 'Inflation',
    policy_stance: 'Policy',
    credit_liquidity: 'Financial conditions',
    yield_curve: 'Yield curve',
};

/** "housing_activity" -> "Housing activity". */
export function titleCase(id: string): string {
    const words = id.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export const dimensionName = (id: string): string => DIMENSION_NAMES[id] ?? titleCase(id);

const SERIES_NAMES: Record<string, string> = {
    BAA10Y: 'Baa corporate spread',
    BAMLH0A0HYM2: 'High-yield spread',
    CPIAUCSL: 'Consumer prices (CPI)',
    DFII10: '10y real yield',
    DGS10: '10y Treasury yield',
    FEDFUNDS: 'Fed funds rate',
    HOUST: 'Housing starts',
    ICSA: 'Initial jobless claims',
    INDPRO: 'Industrial production',
    M2SL: 'M2 money supply',
    MCOILWTICO: 'WTI crude oil',
    NFCI: 'Financial conditions index',
    NNUSBIS: 'US dollar (narrow index)',
    PAYEMS: 'Nonfarm payrolls',
    PCEPI: 'PCE prices',
    T10Y2Y: 'Yield curve (10y minus 2y)',
    UNRATE: 'Unemployment rate',
};

export const seriesName = (id: string): string => SERIES_NAMES[id] ?? id;

/** "Consumer prices (CPI) · YoY": the series name with the transform the feature id carries. */
export function featureLabel(f: Pick<MriFeatureSeries, 'feature_id' | 'series_id'>): string {
    const id = f.feature_id ?? '';
    const tag = /yoy/.test(id) ? 'YoY' : /12m/.test(id) ? '12m Δ' : /6m/.test(id) ? '6m Δ' : /level/.test(id) ? 'level' : '';
    return `${seriesName(f.series_id || id)}${tag ? ` · ${tag}` : ''}`;
}

/** "+0.27" / "−0.47" / "—". Zero shows as "0.00". */
export function signed(value: number | null | undefined, digits = 2): string {
    if (value == null || !Number.isFinite(value)) return DASH;
    const body = Math.abs(value).toFixed(digits);
    if (Number(body) === 0) return body;   // a value that rounds to zero carries no sign
    return `${value > 0 ? '+' : '−'}${body}`;
}

/** "Nov 2026" for a date or month stamp, in UTC so every time zone reads the same month. */
export function monthYear(date: string | null | undefined): string {
    if (!date) return '';
    const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? date : d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ── The four regimes that have a quadrant, and the colour each regime draws in ─────────────────────

export const REGIME_STACK = ['recession', 'stagflation', 'tightening', 'reflation', 'goldilocks'] as const;

/** One colour per regime, from the desk's own tokens. The legend always names the regime, so colour is never the only cue. */
export const REGIME_COLOR: Record<string, string> = {
    goldilocks: 'var(--pos)',
    reflation: 'var(--list2)',
    stagflation: 'var(--warn)',
    recession: 'var(--neg)',
    tightening: 'var(--off)',
};

export const regimeColor = (regime: string | null | undefined): string =>
    (regime ? REGIME_COLOR[regime] : undefined) ?? 'var(--off)';

/** Growth at or above 0 and inflation below 0 is Goldilocks; both at or above 0 is reflation; and so on. Tightening has no quadrant. */
export function quadrantOf(growth: number, inflation: number): 'goldilocks' | 'reflation' | 'recession' | 'stagflation' {
    if (growth >= 0) return inflation < 0 ? 'goldilocks' : 'reflation';
    return inflation < 0 ? 'recession' : 'stagflation';
}

/** The chart shows plus or minus this many standard deviations; a larger value is pinned to the edge. */
export const Z_RANGE = 2;

/** A z-score as a percent position inside the quadrant square (50 is the centre). */
export function place(value: number): number {
    return 50 + (Math.max(-Z_RANGE, Math.min(Z_RANGE, value)) / Z_RANGE) * 46;
}

// ── The indicator lines ───────────────────────────────────────────────────────────────────────────

export interface DimensionAverage { id: string; points: { date: string; value: number }[] }

/**
 * Mean of the exported indicator z-scores per month, per dimension: a display summary of
 * macro_features_timeline.json, not the engine's own dimension score. The "unmapped" bucket is left out.
 */
export function dimensionAverages(features: MriMacroFeatures | null | undefined): DimensionAverage[] {
    const out: DimensionAverage[] = [];
    for (const dim of features?.dimensions ?? []) {
        const id = dim.dimension_id ?? '';
        if (!id || id === 'unmapped') continue;
        const sums = new Map<string, { total: number; count: number }>();
        for (const feature of dim.features ?? []) {
            for (const p of feature.points ?? []) {
                if (p.date && typeof p.value === 'number' && Number.isFinite(p.value)) {
                    const cell = sums.get(p.date) ?? { total: 0, count: 0 };
                    cell.total += p.value;
                    cell.count += 1;
                    sums.set(p.date, cell);
                }
            }
        }
        const points = Array.from(sums.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, c]) => ({ date, value: c.total / c.count }));
        if (points.length) out.push({ id, points });
    }
    return out.sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
}

function orderIndex(id: string): number {
    const i = (DIMENSION_ORDER as readonly string[]).indexOf(id);
    return i < 0 ? DIMENSION_ORDER.length : i;
}

export const lastValue = (s: DimensionAverage | undefined): number | null =>
    s && s.points.length ? s.points[s.points.length - 1].value : null;

/** The last `length` months where both growth and inflation have a value, for the fading trail on the quadrant. */
export function quadrantTrail(avgs: DimensionAverage[], length = 12): { date: string; growth: number; inflation: number }[] {
    const growth = avgs.find((d) => d.id === 'growth_momentum');
    const inflation = avgs.find((d) => d.id === 'inflation_pressure');
    if (!growth || !inflation) return [];
    const inflationByDate = new Map(inflation.points.map((p) => [p.date, p.value]));
    return growth.points.slice(-length).flatMap((g) => {
        const i = inflationByDate.get(g.date);
        return i === undefined ? [] : [{ date: g.date, growth: g.value, inflation: i }];
    });
}

/** One entry per FRED series: its last month, and stale when that is earlier than the file's end date. */
export function sourceHealth(features: MriMacroFeatures | null | undefined): { id: string; last: string; stale: boolean }[] {
    const end = features?.end_date ?? '';
    const map = new Map<string, { last: string; stale: boolean }>();
    for (const dim of features?.dimensions ?? []) {
        for (const f of dim.features ?? []) {
            const id = f.series_id || f.feature_id || '';
            const pts = f.points ?? [];
            const last = pts.length ? pts[pts.length - 1].date ?? '' : '';
            const prev = map.get(id);
            if (id && (!prev || last > prev.last)) map.set(id, { last, stale: Boolean(end && last < end) });
        }
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
}

// ── The regime timeline ───────────────────────────────────────────────────────────────────────────

/** Consecutive months with the same reported regime, as runs of [start index, length]. Used by the ribbon and the history strip. */
export function regimeRuns(points: MriTimelinePoint[]): { regime: string; start: number; len: number }[] {
    const runs: { regime: string; start: number; len: number }[] = [];
    points.forEach((p, i) => {
        const regime = p.reported_regime ?? 'unknown';
        const last = runs[runs.length - 1];
        if (last && last.regime === regime) last.len += 1;
        else runs.push({ regime, start: i, len: 1 });
    });
    return runs;
}

/** How many months the reported regime has been the same, counting back from the newest point; null when there are no points. */
export function unchangedMonths(points: MriTimelinePoint[]): number | null {
    if (points.length === 0) return null;
    const runs = regimeRuns(points);
    return runs[runs.length - 1].len;
}

/** A month with no probabilities is a gap, not a zero. */
export function hasReading(p: MriTimelinePoint): boolean {
    return Object.values(p.probabilities ?? {}).reduce((t, v) => t + v, 0) > 0.0001;
}

export const timelinePoints = (t: MriRegimeTimeline | null | undefined): MriTimelinePoint[] => t?.points ?? [];

/** The three confidence bands of the Macro tab's one-line reading. Same cut points as the engine's own dashboard. */
export function convictionKey(confidence: number | null | undefined): 'mcvHigh' | 'mcvModerate' | 'mcvLow' | null {
    if (confidence == null || !Number.isFinite(confidence)) return null;
    if (confidence >= 0.35) return 'mcvHigh';
    if (confidence >= 0.12) return 'mcvModerate';
    return 'mcvLow';
}

// ── Direction beside level ────────────────────────────────────────────────────────────────────────

export interface ReasonText { key: string; vars: Record<string, string | number> }

/**
 * A null direction value's reason, as an i18n key and its fill values. The engine's reason strings are
 * `score_invalid_or_missing_at_as_of`, `score_missing_N_months_before_as_of`, `history_short:N_of_M_changes`
 * and `zero_dispersion`. A reason this page does not know is passed through unchanged.
 */
export function directionReason(raw: string | null | undefined): ReasonText {
    if (!raw) return { key: 'mcdNoReason', vars: {} };
    if (raw === 'score_invalid_or_missing_at_as_of') return { key: 'mcdReasonNow', vars: {} };
    if (raw === 'zero_dispersion') return { key: 'mcdReasonZero', vars: {} };
    let m = /^score_missing_(\d+)_months_before_as_of$/.exec(raw);
    if (m) return { key: 'mcdReasonBefore', vars: { n: Number(m[1]) } };
    m = /^history_short:(\d+)_of_(\d+)_changes$/.exec(raw);
    if (m) return { key: 'mcdReasonShort', vars: { n: Number(m[1]), m: Number(m[2]) } };
    return { key: 'mcdReasonRaw', vars: { raw } };
}

export interface DirectionCell { value: number | null; reason: ReasonText | null }

export interface DirectionRow {
    id: string;
    level: DirectionCell;
    d3: DirectionCell;
    d6: DirectionCell;
    z6: DirectionCell;
}

/**
 * One row per dimension: the level score from `factors` and the 3-month change, 6-month change and
 * standardised 6-month change from `dimension_direction`. A copy of the file built before the direction
 * field existed gives every direction cell the reason `mcdNoField`; a null cell names the engine's reason.
 * The dimensions come from `factors`, in the engine's order.
 */
export function directionRows(regime: MriRegime | null | undefined): DirectionRow[] {
    const factors = regime?.factors ?? null;
    if (!factors) return [];
    const direction = regime?.dimension_direction ?? null;
    const ids = Object.keys(factors).sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b));
    const cell = (entry: MriDimensionDirection | undefined, key: 'd3' | 'd6' | 'z6'): DirectionCell => {
        if (!direction) return { value: null, reason: { key: 'mcdNoField', vars: {} } };
        if (!entry) return { value: null, reason: { key: 'mcdNoEntry', vars: {} } };
        const v = entry[key];
        if (typeof v === 'number' && Number.isFinite(v)) return { value: v, reason: null };
        return { value: null, reason: directionReason(entry.reasons?.[key]) };
    };
    return ids.map((id) => {
        const f = factors[id];
        const score = f?.score;
        const level: DirectionCell = typeof score === 'number' && Number.isFinite(score)
            ? { value: score, reason: null }
            : { value: null, reason: { key: 'mcdLevelNone', vars: { reason: f?.reason ?? DASH } } };
        return { id, level, d3: cell(direction?.[id], 'd3'), d6: cell(direction?.[id], 'd6'), z6: cell(direction?.[id], 'z6') };
    });
}

// ── Sectors ───────────────────────────────────────────────────────────────────────────────────────

/** The sector ranking sorted by rank (rows without one go last). */
export function sectorRows(ranking: MriSectorRanking | null | undefined): MriSectorRow[] {
    return [...(ranking?.sector_ranking ?? [])].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
}

/** "oil_gas_ep" -> "Oil & Gas E&P"; every other id is title-cased. Used only when a row carries no label. */
export function sectorName(row: Pick<MriSectorRow, 'label' | 'sector_id'>): string {
    if (row.label) return row.label;
    const overrides: Record<string, string> = { oil_gas_ep: 'Oil & Gas E&P', software: 'Software & SaaS', biotech: 'Biotechnology' };
    const id = row.sector_id ?? '';
    return overrides[id] ?? (id ? titleCase(id) : DASH);
}

export interface ComponentBar { key: string; label: string; value: number }

/** The supporting and opposing components of one sector, largest contribution first. A regime prior reads "Regime prior · Name". */
export function componentBars(row: MriSectorRow | undefined): ComponentBar[] {
    if (!row) return [];
    const all: MriSectorComponent[] = [...(row.top_supporting_components ?? []), ...(row.top_opposing_components ?? [])];
    return all
        .filter((c): c is MriSectorComponent & { contribution: number } => typeof c.contribution === 'number')
        .sort((a, b) => b.contribution - a.contribution)
        .map((c, i) => {
            const id = c.component_id ?? 'unknown';
            return {
                key: `${id}-${i}`,
                label: c.component_type === 'regime_prior' ? `Regime prior · ${titleCase(id)}` : dimensionName(id),
                value: c.contribution,
            };
        });
}

export const CROSS_SECTION_LABELS: Record<string, string> = {
    gics_11: '11 sectors',
    subindustry_6: '6 sub-industries',
    pooled_17: 'All 17',
};

/** The validation rows grouped by cross-section (in file order), for the two pill rows. */
export function validationSections(v: MriSectorValidation | null | undefined): { section: string; rows: MriValidationRow[] }[] {
    const order: string[] = [];
    const by = new Map<string, MriValidationRow[]>();
    for (const r of v?.summary ?? []) {
        const k = r.cross_section ?? 'all';
        if (!by.has(k)) { by.set(k, []); order.push(k); }
        by.get(k)!.push(r);
    }
    return order.map((section) => ({ section, rows: by.get(section) ?? [] }));
}

/** The largest absolute rank correlation among rows, used for the one-word result. */
export const bestAbsIc = (rows: MriValidationRow[]): number =>
    rows.reduce((m, r) => Math.max(m, typeof r.rank_ic_spearman === 'number' ? Math.abs(r.rank_ic_spearman) : 0), 0);

// ── Files from the cloud news job (WO_MP2) ────────────────────────────────────────────────────────

/**
 * A cloud file older than this many days is called out on its panel. Three: the cloud job runs once a day, so one weekend
 * (two days with no run) plus one missed run is still ordinary; a fourth day without a new file means something stopped.
 */
export const CLOUD_STALE_DAYS = 3;

const DAY_MS = 86_400_000;

/** Whole days between a YYYY-MM-DD date (read as UTC midnight) and `now`; null when the date is absent or unreadable. Never negative. */
export function cloudAgeDays(date: string | null | undefined, now: number): number | null {
    if (!date) return null;
    const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** True only when the age is known and more than CLOUD_STALE_DAYS; an unknown date is not called stale (the panel says it is unknown). */
export const cloudStale = (date: string | null | undefined, now: number): boolean => {
    const age = cloudAgeDays(date, now);
    return age !== null && age > CLOUD_STALE_DAYS;
};

/** The file's own date as the sync recorded it in the snapshot manifest, or null. */
export const cloudDate = (manifest: MriSnapshotManifest | null | undefined, file: string): string | null =>
    manifest?.cloud_files?.[file]?.date ?? null;

const ACRONYMS = new Set(['ai', 'bbc', 'bls', 'cnbc', 'dol', 'eia', 'gdelt', 'rss', 'scmp', 'sec', 'us']);

/** "cnbc_retail" -> "CNBC Retail", "technology_ai" -> "Technology AI": a news group or source id for people. Names stay in English. */
export const prettyId = (id: string): string =>
    id.split('_').map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');

/** Only an http or https address may become a link; anything else in a file fetched from the internet is shown as text. */
export function safeHttpUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const u = new URL(url);
        return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
    } catch {
        return null;
    }
}

/** sector_id to label, from the sector ranking (the cloud files carry ids only). */
export function sectorLabels(ranking: MriSectorRanking | null | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of ranking?.sector_ranking ?? []) if (r.sector_id && r.label) out[r.sector_id] = r.label;
    return out;
}

export const labelOf = (id: string | null | undefined, labels: Record<string, string>): string =>
    id ? labels[id] ?? sectorName({ sector_id: id, label: null }) : DASH;

export interface ScoreRow { key: string; id: string; score: number; items: number | null }

const scoreRows = (...lists: (MriScoredItem[] | null | undefined)[]): ScoreRow[] =>
    lists
        .flatMap((l) => l ?? [])
        .filter((i): i is MriScoredItem & { id: string; score: number } => Boolean(i.id) && typeof i.score === 'number' && Number.isFinite(i.score))
        .sort((a, b) => b.score - a.score)
        .map((i, n) => ({ key: `${i.id}-${n}`, id: i.id, score: i.score, items: typeof i.item_count === 'number' ? i.item_count : null }));

/** The macro themes, positive and negative together, strongest first. */
export const newsThemeRows = (r: MriNewsScoreReport | null | undefined): ScoreRow[] =>
    scoreRows(r?.top_positive_macro_themes, r?.top_negative_macro_themes);

/** The sectors with the strongest news tailwinds and headwinds together, strongest first. Not every sector. */
export const newsSectorRows = (r: MriNewsScoreReport | null | undefined): ScoreRow[] =>
    scoreRows(r?.top_sector_news_tailwinds, r?.top_sector_news_headwinds);

export const NEWS_ITEMS_SHOWN = 8;

/** The items the classifier was least sure of, as the file lists them (at most NEWS_ITEMS_SHOWN). */
export const lowConfidenceItems = (r: MriNewsScoreReport | null | undefined) =>
    (r?.low_confidence_items ?? []).filter((i) => i.title || i.summary).slice(0, NEWS_ITEMS_SHOWN);

export interface OverlayMove { id: string; from: number; to: number; thin: boolean }

/**
 * Macro-only rank against combined rank over the same sectors. The macro-only rank is the rank of each row's own macro score
 * (the ranking numbers parent sectors and sub-industries separately). A sector is "thin" when the overlay gives its news no
 * weight. Empty when any row lacks an id, a rank or a macro score: a partial slope would mislead.
 */
export function overlayMoves(c: MriCombinedDiagnostic | null | undefined): OverlayMove[] {
    const rows = c?.combined_experimental_ranking ?? [];
    if (rows.length === 0 || rows.some((r) => !r.sector_id || typeof r.rank !== 'number' || typeof r.sector_macro_score !== 'number')) return [];
    const byMacro = [...rows].sort((a, b) => (b.sector_macro_score as number) - (a.sector_macro_score as number));
    const macroRank = new Map(byMacro.map((r, i) => [r.sector_id as string, i + 1]));
    return rows.map((r) => ({
        id: r.sector_id as string,
        from: macroRank.get(r.sector_id as string) as number,
        to: r.rank as number,
        thin: (r.news_component_weight ?? 0) === 0,
    }));
}

/** The smallest and largest share of a sector's combined score that comes from news; null when the rows carry none. */
export function newsWeightRange(c: MriCombinedDiagnostic | null | undefined): { min: number; max: number } | null {
    const w = (c?.combined_experimental_ranking ?? []).map((r) => r.news_component_weight).filter((v): v is number => typeof v === 'number');
    return w.length ? { min: Math.min(...w), max: Math.max(...w) } : null;
}

export const maxRankChange = (moves: OverlayMove[]): number => moves.reduce((m, r) => Math.max(m, Math.abs(r.from - r.to)), 0);

/** The four steps of the news-history readiness track, in order: the id the engine writes, and the strings for its name, what it needs and what it means. */
export const READINESS_STEPS = [
    { id: 'insufficient_history', label: 'mcrdInsufficient', range: 'mcrdInsufficientRange', meaning: 'mcrdMeanInsufficient' },
    { id: 'early_history', label: 'mcrdEarly', range: 'mcrdEarlyRange', meaning: 'mcrdMeanEarly' },
    { id: 'monitor_ready', label: 'mcrdMonitor', range: 'mcrdMonitorRange', meaning: 'mcrdMeanMonitor' },
    { id: 'validation_candidate', label: 'mcrdValidation', range: 'mcrdValidationRange', meaning: 'mcrdMeanValidation' },
] as const;

/** One source group: how many of its configured sources reported ok in the cloud run. */
export interface CoverageRow { id: string; ok: number; total: number; uncovered: boolean }

/** From the cloud run's news health: per group, the sources reporting ok (and not dead) out of those configured. */
export function coverageRows(d: MriCloudDaily | null | undefined): CoverageRow[] {
    const health = d?.news_health;
    const status = new Map((health?.sources ?? []).map((s) => [s.source_id ?? '', s]));
    return (health?.groups ?? []).map((g) => {
        const ids = g.sources ?? [];
        const ok = ids.filter((id) => {
            const s = status.get(id);
            return s?.status === 'ok' && !s.dead;
        }).length;
        return { id: g.group ?? '', ok, total: ids.length, uncovered: g.uncovered === true };
    });
}

/**
 * Why an input in the data-health file was extended, as an i18n key and fill values; null when it was not. The one series the
 * engine knows by name is the narrow dollar index, which the Fed stopped publishing and the engine extends with the broad one.
 * `months` is "" or a number; the string carries its own wording.
 */
export function fallbackNote(input: Pick<MriDataHealthInput, 'series_id' | 'extended_by_fallback' | 'fallback_months'>): ReasonText | null {
    if (input.extended_by_fallback !== true) return null;
    const months = typeof input.fallback_months === 'number' ? input.fallback_months : null;
    const key = input.series_id === 'NNUSBIS' ? 'mcfbNarrow' : 'mcfbGeneric';
    return { key: months === null ? key : `${key}Months`, vars: { n: months ?? '' } };
}

/** The NBER recession spans for the ribbon; none unless the benchmark file says its status is ok. */
export function recessionSpans(n: MriNberBenchmark | null | undefined): { start: string; end: string }[] {
    if (n?.status !== 'ok') return [];
    return (n.nber_recessions ?? []).flatMap((r) => (r.start && r.end ? [{ start: r.start, end: r.end }] : []));
}

/** Median of the lead or lag, in months, between the label crossing its threshold and the NBER start (negative is early); null if none. */
export function medianLeadMonths(n: MriNberBenchmark | null | undefined): number | null {
    const leads = (n?.recession_detection ?? [])
        .map((r) => r.lead_lag_months)
        .filter((v): v is number => typeof v === 'number')
        .sort((a, b) => a - b);
    if (leads.length === 0) return null;
    return (leads[Math.floor((leads.length - 1) / 2)] + leads[Math.ceil((leads.length - 1) / 2)]) / 2;
}

export type RunFilter = 'all' | 'live' | 'replay';

export const RUNS_SHOWN = 30;

/** The newest RUNS_SHOWN runs that match the filter, and how many matched in all. */
export function filterRuns(h: MriHistoryIndex | null | undefined, filter: RunFilter, limit = RUNS_SHOWN): { rows: MriHistoryRun[]; total: number } {
    const all = h?.runs ?? [];
    const kept = all.filter((r) => (filter === 'all' ? true : filter === 'replay' ? r.run_mode === 'replay' : r.run_mode !== 'replay'));
    return { rows: kept.slice(0, limit), total: kept.length };
}

/** "03:59 UTC" from a run id like 20261118T035925Z-b08d849a (several runs can share a date); null when the id does not carry a time. */
export function runTimeUtc(runId: string | null | undefined): string | null {
    const m = runId?.match(/^\d{8}T(\d{2})(\d{2})\d{2}Z/);
    return m ? `${m[1]}:${m[2]} UTC` : null;
}
