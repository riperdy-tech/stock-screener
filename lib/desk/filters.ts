// Desk filters and the URL state of the Desk (?step=3&how=1&verdict=…&door=…&sector=…&q=…).
// Pure functions, no React. The router's other params (tab, …) are never touched here.

import type { OpusVerdictCode } from '@/lib/data-service';
import type { DeskRow } from './rankings';
import { doorOf, type DoorKind } from './doors';
import { isNotUsable, rebuiltVerdict } from './verdict';
import { onList } from './sections';
import { aiVerdict } from './aiVerdict';

export type VerdictWord = 'undervalued' | 'fair' | 'overvalued' | 'not_usable' | 'blocked' | 'awaiting';

export const VERDICT_WORDS: VerdictWord[] = ['undervalued', 'fair', 'overvalued', 'not_usable', 'blocked', 'awaiting'];
export const DOOR_FILTERS: DoorKind[] = ['compounder', 'value_gap', 'double', 'trend', 'held_over'];
/** The verdicts the AI filter offers; a name with neither a Gemini nor a Claude verdict matches none of them. */
export const AI_FILTERS: OpusVerdictCode[] = ['BUY', 'WATCH', 'AVOID', 'NO_CALL'];

/**
 * The verdict word a row shows. Null for a row that has no verdict and is not awaiting one
 * (a vetoed name shows its veto instead).
 */
export function verdictWord(r: DeskRow): VerdictWord | null {
    const v = rebuiltVerdict(r.depth);
    if (!v) return onList(r) && !r.vetoed ? 'awaiting' : null;
    if (isNotUsable(v)) return 'not_usable';
    if (v.actionable !== true) return 'blocked';
    return v.direction === 'undervalued' ? 'undervalued' : v.direction === 'overvalued' ? 'overvalued' : 'fair';
}

export interface DeskFilters {
    verdict: VerdictWord | 'all';
    door: DoorKind | 'all';
    sector: string;   // 'all' or an exact sector name
    ai: OpusVerdictCode[];   // empty = no AI filter; several = any of them
    q: string;
}

export const NO_FILTERS: DeskFilters = { verdict: 'all', door: 'all', sector: 'all', ai: [], q: '' };

export const filtersActive = (f: DeskFilters): boolean =>
    f.verdict !== 'all' || f.door !== 'all' || f.sector !== 'all' || f.ai.length > 0 || f.q.trim() !== '';

export function applyDeskFilters(rows: DeskRow[], f: DeskFilters): DeskRow[] {
    const q = f.q.trim().toUpperCase();
    return rows.filter((r) => {
        if (f.verdict !== 'all' && verdictWord(r) !== f.verdict) return false;
        if (f.door !== 'all' && doorOf(r.fct.fct_nominated_doors) !== f.door) return false;
        if (f.sector !== 'all' && r.info?.sector !== f.sector) return false;
        if (f.ai.length > 0) {
            const a = aiVerdict(r);
            if (!a || !f.ai.includes(a.verdict)) return false;
        }
        if (q && !r.ticker.includes(q) && !(r.info?.name ?? '').toUpperCase().includes(q)) return false;
        return true;
    });
}

// ── URL state ───────────────────────────────────────────────────────────────

export type FunnelStep = 1 | 2 | 3 | 4 | 5;

export interface DeskUrlState {
    step: FunnelStep;
    how: boolean;
    filters: DeskFilters;
}

export const DEFAULT_STEP: FunnelStep = 3;

/** Unknown or malformed params fall back to their defaults; nothing throws. */
export function parseDeskUrl(p: { get(name: string): string | null }): DeskUrlState {
    const n = Number(p.get('step'));
    const step = (Number.isInteger(n) && n >= 1 && n <= 5 ? n : DEFAULT_STEP) as FunnelStep;
    const verdict = p.get('verdict') as VerdictWord | null;
    const door = p.get('door') as DoorKind | null;
    // `ai=BUY,WATCH`; the older single-value `opus=BUY` is still read when `ai` is absent.
    const aiRaw = p.get('ai') ?? p.get('opus') ?? '';
    const ai = AI_FILTERS.filter((v) => aiRaw.split(',').includes(v));
    return {
        step,
        how: p.get('how') === '1',
        filters: {
            verdict: verdict && VERDICT_WORDS.includes(verdict) ? verdict : 'all',
            door: door && DOOR_FILTERS.includes(door) ? door : 'all',
            sector: p.get('sector') || 'all',
            ai,
            q: p.get('q') ?? '',
        },
    };
}

/** Write the Desk's state into `params`, removing keys that hold their default so URLs stay short. */
export function writeDeskUrl(params: URLSearchParams, s: DeskUrlState): void {
    const put = (k: string, v: string | null) => (v == null || v === '' ? params.delete(k) : params.set(k, v));
    put('step', s.step === DEFAULT_STEP ? null : String(s.step));
    put('how', s.how ? '1' : null);
    put('verdict', s.filters.verdict === 'all' ? null : s.filters.verdict);
    put('door', s.filters.door === 'all' ? null : s.filters.door);
    put('sector', s.filters.sector === 'all' ? null : s.filters.sector);
    put('ai', s.filters.ai.length === 0 ? null : s.filters.ai.join(','));
    params.delete('opus');
    put('q', s.filters.q.trim() === '' ? null : s.filters.q);
}
