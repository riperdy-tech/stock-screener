// The notice banner shown under the freshness strip on every desk surface. Derived from the Desk
// phase (lib/desk/phase.ts) and the number of actionable rebuilt-analyst verdicts, never from a flag.
import type { TRANSLATIONS } from '@/lib/i18n';
import type { DeskPhase } from './phase';

export type NoticeSeverity = 'info' | 'warn' | 'error';

export interface DeskNotice {
    severity: NoticeSeverity;
    /** Key into lib/i18n.ts TRANSLATIONS. */
    messageKey: keyof typeof TRANSLATIONS['en'];
    /** ISO date the condition started, when known. */
    since: string | null;
}

/**
 * Phase A (no rebuilt rows): the analyst is being rebuilt. Phase B/C with rebuilt rows but none
 * actionable: it has started publishing and nothing passes the gate yet. Any actionable rebuilt
 * verdict: no notice. Null phase (overlay not loaded yet): no notice, so nothing flashes.
 */
export function deskNotice(phase: DeskPhase | null, actionableCount: number): DeskNotice | null {
    if (phase === null) return null;
    if (phase === 'A') return { severity: 'warn', messageKey: 'noticeAnalystRebuild', since: '2026-09-24' };
    if (actionableCount > 0) return null;
    return { severity: 'warn', messageKey: 'noticeAnalystPhaseB', since: null };
}
