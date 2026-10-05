// Freshness stamps, staleness and the health dot for the desk shell. Pure functions over the
// payloads in useDeskStatus; nothing here fetches. Missing data is null/undefined and renders "—";
// 0 is a value (never `||`-defaulted).

import type { ChainManifest, DepthOverlayPayload, FactorScoresPayload, MriCostOfCapital, MriRegime } from '@/lib/data-service';
import { deskPhase, isRebuiltRow, type DeskPhase } from './phase';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Staleness cadences (step 1a, simplified from the handoff README section 8).
export const PRICES_STALE_MS = 24 * HOUR;
export const BOOK_STALE_MS = 36 * HOUR;
export const VERDICT_STALE_MS = 14 * DAY;   // only meaningful once the rebuilt analyst is live (phase B/C)
export const ERROR_ALERT_WINDOW_MS = 7 * DAY;

/**
 * Epoch ms of a pipeline stamp. Stamps without a zone suffix ("2026-10-04 23:50",
 * "2026-10-05T14:58:11.741710") are read as UTC; the files do not state their zone.
 */
export function stampMs(stamp: string | null | undefined): number | null {
    if (!stamp) return null;
    const iso = stamp.includes('T') ? stamp : stamp.replace(' ', 'T');
    const ms = Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`);
    return Number.isNaN(ms) ? null : ms;
}

/** "MM-DD HH:mm" from a stamp, or "—". */
export const fmtMdHm = (stamp: string | null | undefined): string =>
    stamp ? stamp.replace('T', ' ').slice(5, 16) : '—';

/** "MM-DD" from a stamp, or "—". */
export const fmtMd = (stamp: string | null | undefined): string => (stamp ? stamp.slice(5, 10) : '—');

export const isStale = (stamp: string | null | undefined, maxAgeMs: number, now: number): boolean => {
    const ms = stampMs(stamp);
    return ms !== null && now - ms > maxAgeMs;
};

export type HealthLevel = 'ok' | 'warn' | 'neg';

export interface PaperAlert {
    date?: string | null;
    detail?: string | null;
    kind?: string | null;
    scope?: string | null;
    severity?: string | null;
}

export interface StatusInput {
    factor: FactorScoresPayload | null;
    depth: DepthOverlayPayload | null;
    ledgers: { alerts?: PaperAlert[] | null } | null;
    manifest: ChainManifest | null;
    regime: MriRegime | null;
    anchor: MriCostOfCapital | null;
    pricesAsOf: string | null;
}

export interface Freshness {
    phase: DeskPhase | null;          // null until the overlay has loaded
    pricesAsOf: string | null;
    pricesStale: boolean;
    bookScoredAt: string | null;
    bookStale: boolean;
    verdictAt: string | null;
    verdictStale: boolean;            // phase B/C only
    rebuiltCount: number;
    /** Rebuilt-analyst rows with `actionable === true`. */
    actionableCount: number;
    listSize: number | null;          // research_now + watchlist, the book the analyst underwrites
}

export function computeFreshness(st: StatusInput, now: number): Freshness {
    const tickers = st.depth?.tickers ?? null;
    const phase = tickers ? deskPhase(tickers) : null;
    const rebuiltCount = tickers ? Object.values(tickers).filter(isRebuiltRow).length : 0;
    const actionableCount = tickers ? Object.values(tickers).filter((r) => isRebuiltRow(r) && r.actionable === true).length : 0;
    const bc = st.factor?.band_counts;
    const listSize = bc && (bc.research_now != null || bc.watchlist != null)
        ? (bc.research_now ?? 0) + (bc.watchlist ?? 0)
        : null;
    const verdictAt = st.depth?.generated_at ?? null;
    return {
        phase,
        pricesAsOf: st.pricesAsOf,
        pricesStale: isStale(st.pricesAsOf, PRICES_STALE_MS, now),
        bookScoredAt: st.factor?.generated_at ?? null,
        bookStale: isStale(st.factor?.generated_at, BOOK_STALE_MS, now),
        verdictAt,
        verdictStale: phase !== null && phase !== 'A' && isStale(verdictAt, VERDICT_STALE_MS, now),
        rebuiltCount,
        actionableCount,
        listSize,
    };
}

/** Alerts dated within the last 7 days with severity "error" (older ones are history, not health). */
export function recentErrorAlerts(alerts: PaperAlert[] | null | undefined, now: number): PaperAlert[] {
    return (alerts ?? []).filter((a) => {
        if (a.severity !== 'error') return false;
        const ms = stampMs(a.date);
        return ms !== null && now - ms <= ERROR_ALERT_WINDOW_MS;
    });
}

export interface Health {
    level: HealthLevel;
    /** Plain-text reasons, worst first; empty when ok. */
    reasons: string[];
}

/**
 * Worst of: manifest not ok (neg), a recent error alert (neg), discount rate not from the
 * anchor (warn), MRI degraded (warn), a stale stamp (warn). Only a loaded file can raise a flag:
 * a file that failed to load is shown as "not loaded" in the drawer, not counted as a failure here.
 */
export function computeHealth(st: StatusInput, fresh: Freshness, now: number): Health {
    const neg: string[] = [];
    const warn: string[] = [];
    if (st.manifest?.ok === false) neg.push('chain manifest failed');
    const errs = recentErrorAlerts(st.ledgers?.alerts, now);
    if (errs.length > 0) neg.push(`${errs.length} error alert${errs.length === 1 ? '' : 's'} in the last 7 days`);
    if (st.factor && st.factor.discount_rate_source !== 'anchor') warn.push('discount rate is not from the macro anchor');
    if (st.anchor?.degraded === true) warn.push('MRI cost of capital degraded');
    if (fresh.pricesStale) warn.push('prices are stale');
    if (fresh.bookStale) warn.push('book scoring is stale');
    if (fresh.verdictStale) warn.push('latest verdict is stale');
    const reasons = [...neg, ...warn];
    return { level: neg.length > 0 ? 'neg' : warn.length > 0 ? 'warn' : 'ok', reasons };
}

/** Macro strength label thresholds (accepted ruling): <0.10 weak, 0.10-0.30 moderate, >0.30 clear. */
export function strengthKey(confidence: number | null | undefined): 'fsWeak' | 'fsModerate' | 'fsClear' | null {
    if (confidence == null) return null;
    if (confidence < 0.10) return 'fsWeak';
    if (confidence <= 0.30) return 'fsModerate';
    return 'fsClear';
}

/** A fraction as a percent string with the given decimals ("30 %", "9.27 %"), or "—" when null. */
export function pctText(fraction: number | null | undefined, digits: number): string {
    return fraction == null ? '—' : `${(fraction * 100).toFixed(digits)} %`;
}
