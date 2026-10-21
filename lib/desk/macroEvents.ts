// MRI news candidates for one stock (MRI-15, Stage 1). Display only: nothing here feeds a score, rank or verdict.
// Tiers, strongest first: the news names the company; it names a company in the same cluster; the classifier tied it
// to the stock's sector. A candidate appears once, in its strongest tier.

import type { MacroEventCandidate, MacroEventsPayload } from '@/lib/data-service';

export type MacroEventTier = 'named' | 'peer' | 'sector';

export interface MacroEventItem { tier: MacroEventTier; c: MacroEventCandidate }

export function macroEventsFor(p: MacroEventsPayload | null, ticker: string, sector: string | null | undefined,
                               limit = 6): MacroEventItem[] {
    if (!p) return [];
    const t = ticker.toUpperCase();
    const cluster = p.cluster_of[t];
    const tiers: [MacroEventTier, number[]][] = [
        ['named', p.named[t] ?? []],
        ['peer', cluster ? (p.peer[cluster] ?? []) : []],
        ['sector', sector ? (p.sector[sector] ?? []) : []],
    ];
    const seen = new Set<number>();
    const out: MacroEventItem[] = [];
    for (const [tier, refs] of tiers) {
        for (const i of refs) {
            const c = p.candidates[i];
            if (!c || seen.has(i)) continue;
            // A peer candidate that names this very company is already shown as named.
            if (tier === 'peer' && c.named_tickers.includes(t)) continue;
            seen.add(i);
            out.push({ tier, c });
        }
    }
    const order: Record<MacroEventTier, number> = { named: 0, peer: 1, sector: 2 };
    out.sort((a, b) => order[a.tier] - order[b.tier] || (b.c.onset ?? '').localeCompare(a.c.onset ?? ''));
    return out.slice(0, limit);
}

/** The register is a day behind by design; more than two days behind (or a failed run) is stale. */
export function macroEventsStale(p: MacroEventsPayload | null, today = new Date()): boolean {
    if (!p) return false;
    if (p.register_run_status && p.register_run_status !== 'ok') return true;
    if (!p.register_as_of_date) return true;
    const asOf = Date.parse(`${p.register_as_of_date}T00:00:00Z`);
    return Number.isFinite(asOf) && today.getTime() - asOf > 2 * 86_400_000;
}
