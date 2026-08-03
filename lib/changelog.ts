// Single source of truth for the app version + changelog shown in the header
// version button (left of the "?" help button in the Cockpit). Newest first.
// Keep this in sync with the root CHANGELOG.md.

export const APP_VERSION = '0.2.0';

export interface ChangelogEntry {
    version: string;
    date: string;        // ISO (YYYY-MM-DD)
    title: string;
    changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
    {
        version: '0.2.0',
        date: '2026-08-04',
        title: 'equal_llm churn fix — exit hysteresis (F-04)',
        changes: [
            'equal_llm now RETAINS a held name that has slipped out of the strict research_now gate until it drops below a looser exit band (live margin-of-safety < 10% or conviction < 9.0; deep-value MoS ≥ 25% always holds). The entry gate is unchanged.',
            'This stops the F-04 boundary churn: names parked near the MoS/conviction cliff no longer round-trip in and out of the book on ordinary daily price noise. A genuine bearish or hard-sell verdict still exits immediately.',
            'Benchmarked over a git-history replay at 0.25%/side: nets more than the old hard cliff (about +0.5pt after the verdict-stability fix) while cutting equal_llm trades roughly 30%.',
            'Added this version button and changelog.',
        ],
    },
];
