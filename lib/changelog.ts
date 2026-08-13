// Single source of truth for the app version + changelog shown in the header
// version button (left of the "?" help button in the Cockpit). Newest first.
// Keep this in sync with the root CHANGELOG.md.

export const APP_VERSION = '0.2.1';

export interface ChangelogEntry {
    version: string;
    date: string;        // ISO (YYYY-MM-DD)
    title: string;
    changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
    {
        version: '0.2.1',
        date: '2026-08-13',
        title: 'Non-tradable names removed from the quant and RS2 lanes',
        changes: [
            'Names that have left the NASDAQ/NYSE/AMEX listing — acquired, taken private, ticker renamed, or suspended pending a merger — are now vetoed as not_tradable. They lose their quant band and their RS2 verdict, so they can no longer be ranked, planned, or bought.',
            'Why: the stock database is carry-forward and was never pruned, so a name that left the listing kept its last good record and kept being scored on frozen fundamentals. CPRX left the listing after the 2026-07-16 scan, was never fetched again, and 25 days later was still ranked #6 in the universe with research_now in BOTH lanes — until the broker refused the order as suspended. 231 such records were in the file.',
            'Detection is preemptive: every scan records whether each name is still in the live exchange listing, and a name absent for more than 5 days is vetoed. No broker rejection, no price guesswork.',
            'Guarded both ways: a 5-day grace period absorbs listing-feed hiccups, and if more than 10% of the universe ever reads as unlisted the check disables itself rather than emptying the portfolio. A name that returns to the listing is un-vetoed automatically.',
            'Names that are still listed but cannot be traded anyway (a halt, or a gap on the broker side) can be declared by hand in scripts/not_tradable.json.',
        ],
    },
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
