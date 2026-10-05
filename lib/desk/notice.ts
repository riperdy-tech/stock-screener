// The notice banner shown under the freshness strip on every desk surface. A typed source so it
// can carry a severity and be switched off by setting NOTICE to null when the analyst is live.
import type { TRANSLATIONS } from '@/lib/i18n';

export type NoticeSeverity = 'info' | 'warn' | 'error';

export interface DeskNotice {
    severity: NoticeSeverity;
    /** Key into lib/i18n.ts TRANSLATIONS. */
    messageKey: keyof typeof TRANSLATIONS['en'];
    /** ISO date the notice started. */
    since: string;
}

// Phase A copy. Set to null when the rebuilt analyst goes live.
export const NOTICE: DeskNotice | null = {
    severity: 'warn',
    messageKey: 'noticeAnalystRebuild',
    since: '2026-09-24',
};
