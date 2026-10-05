// Rebuilt-analyst detection and the Desk phase, derived from data (never a flag).
// One rule, used everywhere (operator ruling 2026-10-05; the handoff README had two).

/** The overlay row fields these helpers read. Loose on purpose: follow-up fields are not yet in the contract type. */
export interface PhaseRow {
    gate_version?: number | null;
    actionable_reasons?: string[] | null;
    followup_asof?: string | null;
    watch_items?: unknown[] | null;
}

/** Reason codes that mark a verdict as made by the old analyst. */
const OLD_ANALYST_REASONS = ['pre_v3.1_gates', 'pre_valid_analyst'];

/**
 * A row from the rebuilt analyst: `gate_version` is a number AND the gate did not flag it as
 * old-analyst. `0` is a real gate version, so test the type, never truthiness.
 */
export function isRebuiltRow(row: PhaseRow | null | undefined): boolean {
    if (!row || typeof row.gate_version !== 'number') return false;
    const reasons = row.actionable_reasons ?? [];
    return !OLD_ANALYST_REASONS.some((r) => reasons.includes(r));
}

export type DeskPhase = 'A' | 'B' | 'C';

/**
 * A = no rebuilt rows (today); C = any row carries a follow-up field (`followup_asof` or
 * `watch_items`); otherwise B (baseline fill). `overlay` is `depth_overlay.json`'s `tickers` map.
 */
export function deskPhase(overlay: Record<string, PhaseRow> | null | undefined): DeskPhase {
    const rows = Object.values(overlay ?? {});
    if (!rows.some(isRebuiltRow)) return 'A';
    const hasFollowup = rows.some((r) => r.followup_asof != null || r.watch_items != null);
    return hasFollowup ? 'C' : 'B';
}
