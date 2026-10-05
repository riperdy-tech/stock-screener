// The /macro page as pure functions over current_regime.json, cost_of_capital_anchor.json and
// factor_scores.json. Nothing here fetches or renders. Missing data is null and renders "—"; 0 is
// a value (never `||`-defaulted). The macro read is background for the analyst, never a market call.

import type { MriRegime } from '@/lib/data-service';
import { isStale, pctText, strengthKey } from './health';

const DAY = 86_400_000;

/** An MRI stamp older than this is stale (handoff README section 8). */
export const MRI_STALE_MS = 45 * DAY;

/** `sector_quota_source` value that means the macro read is not used to tilt sectors. */
export const SECTOR_NEUTRAL_SOURCE = 'neutral_no_validated_edge';

// source: system map 04_MACRO/03_RS2_DEPTH, update if the design changes
export const MACRO_STATIC_USES = { turbulenceFlagOn: true, regimeFactsOn: true } as const;

/** "goldilocks" -> "Goldilocks", "late_cycle" -> "Late cycle"; null stays null. */
export function regimeName(key: string | null | undefined): string | null {
    if (!key) return null;
    const words = key.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface RegimeBar { key: string; name: string; p: number; leader: boolean }

/**
 * The regime probabilities, largest first. The leader is the *reported* regime (what the machine
 * uses), which can differ from the raw leader when the transition filter held the old one.
 */
export function regimeBars(regime: MriRegime | null | undefined): RegimeBar[] {
    const probs = regime?.regime_probabilities;
    if (!probs) return [];
    return Object.entries(probs)
        .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
        .sort((a, b) => b[1] - a[1])
        .map(([key, p]) => ({ key, name: key.replace(/_/g, ' '), p, leader: key === regime?.reported_regime }));
}

/** Title parts: `{Regime}, {p} %` and the strength i18n key (the page joins them with " — "). */
export function macroTitle(regime: MriRegime | null | undefined): { head: string | null; strength: ReturnType<typeof strengthKey> } {
    const name = regimeName(regime?.reported_regime);
    const head = name === null ? null : `${name}, ${pctText(regime?.reported_regime_probability, 0)}`;
    return { head, strength: strengthKey(regime?.confidence) };
}

/** `0.03` — two decimals, "—" when null. */
export const confidenceText = (c: number | null | undefined): string => (c == null ? '—' : c.toFixed(2));

export interface WhyLine { kind: 'supported' | 'opposed' | 'plain'; dim: string; contribution: string; raw: string }

/**
 * One `explanation[]` line in plain words. The two known sentence shapes are split into a driver
 * name (underscores to spaces) and its signed contribution; anything else passes through verbatim.
 */
export function parseExplanation(line: string): WhyLine {
    const m = /^(\w+) (supported|opposed) the regime with contribution (-?\d+(?:\.\d+)?)\.?$/.exec(line.trim());
    if (!m) return { kind: 'plain', dim: '', contribution: '', raw: line };
    const n = Number(m[3]);
    const contribution = `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(3)}`;
    return { kind: m[2] === 'supported' ? 'supported' : 'opposed', dim: m[1].replace(/_/g, ' '), contribution, raw: line };
}

/** `0.476` -> "48th" (the file stores a fraction of history at or below the current value). */
export function ordinalPercentile(fraction: number | null | undefined): string {
    if (fraction == null || !Number.isFinite(fraction)) return '—';
    const n = Math.round(fraction * 100);
    const mod100 = n % 100;
    const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
    return `${n}${suffix}`;
}

/** `oil_shock` -> "oil shock". */
export const shockName = (id: string): string => id.replace(/_/g, ' ');

export type SectorTilt =
    | { state: 'off' }                       // neutral_no_validated_edge: the known reason, translated
    | { state: 'other'; raw: string }        // any other value: shown raw, no ON/OFF claim
    | { state: 'unknown' };                  // file missing or field absent

/** The sector-tilt line from `factor_scores.sector_quota_source`. */
export function sectorTilt(source: string | null | undefined): SectorTilt {
    if (source == null) return { state: 'unknown' };
    return source === SECTOR_NEUTRAL_SOURCE ? { state: 'off' } : { state: 'other', raw: source };
}

/**
 * Stale = the stamp parses and is older than 45 days. An unreadable or missing stamp is not called
 * stale. A date-only stamp ("2026-09-01") is given a time so every browser parses it the same way.
 */
export const mriStale = (stamp: string | null | undefined, now: number): boolean =>
    isStale(stamp && stamp.length === 10 ? `${stamp}T00:00:00` : stamp, MRI_STALE_MS, now);
