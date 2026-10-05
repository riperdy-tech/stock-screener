// The screen's "doors": why a name made the list. Pure functions, no React.
//
// DOOR PRECEDENCE (operator ruling 2026-10-05, the single definition used for both labelling and
// counting; a name has exactly one door here even when `fct_nominated_doors` lists several):
//   DOUBLE_DOOR_CHAMPION -> Double door only (never also Door 1 or Door 2)
//   else DOOR_1_COMPOUNDER -> Compounder
//   else DOOR_2_VALUE_GAP  -> Value gap
//   else DOOR_3_TREND_LEADER -> Trend leader
// A name whose only door is HYSTERESIS_RETAINED shows `held over` and has no door colour.
// GLOBAL_WILDCARD is how a place was won, not a door, and never decides the label.

import type { TRANSLATIONS } from '@/lib/i18n';

type Key = keyof typeof TRANSLATIONS['en'];

export type Door = 'double' | 'compounder' | 'value_gap' | 'trend';
export type DoorKind = Door | 'held_over';

/** Doors in the order the funnel's step 3 draws them. */
export const DOORS: Door[] = ['compounder', 'value_gap', 'double', 'trend'];

export function doorOf(doors: string[] | null | undefined): DoorKind | null {
    const d = doors ?? [];
    if (d.includes('DOUBLE_DOOR_CHAMPION')) return 'double';
    if (d.includes('DOOR_1_COMPOUNDER')) return 'compounder';
    if (d.includes('DOOR_2_VALUE_GAP')) return 'value_gap';
    if (d.includes('DOOR_3_TREND_LEADER')) return 'trend';
    if (d.includes('HYSTERESIS_RETAINED')) return 'held_over';
    return null;
}

export const DOOR_LABEL_KEY: Record<DoorKind, Key> = {
    compounder: 'doorCompounder',
    value_gap: 'doorValueGap',
    double: 'doorDouble',
    trend: 'doorTrend',
    held_over: 'doorHeldOver',
};

/** README 3.1 door colours (the marker square). `held_over` has none. */
export const DOOR_COLOR: Record<Door, string> = {
    compounder: '#a774d6',
    value_gap: '#149c82',
    double: '#374151',
    trend: '#fb9dbb',
};

/** How many of `rows` fall in each door under the precedence rule; names with no door are not counted. */
export function countDoors(rows: { fct: { fct_nominated_doors?: string[] | null } }[]): Record<Door, number> {
    const out: Record<Door, number> = { compounder: 0, value_gap: 0, double: 0, trend: 0 };
    for (const r of rows) {
        const k = doorOf(r.fct.fct_nominated_doors);
        if (k && k !== 'held_over') out[k] += 1;
    }
    return out;
}
