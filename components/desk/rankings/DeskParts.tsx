'use client';

// Small shared pieces of the Desk: the door marker, the Q M R V G bars and the verdict word.
// Colour is never the only signal: every state also carries a word or a glyph.

import React from 'react';
import { DOOR_COLOR, DOOR_LABEL_KEY, type DoorKind } from '@/lib/desk/doors';
import type { VerdictWord } from '@/lib/desk/filters';
import { PILLARS, pillarBar, signedNum } from '@/lib/desk/rowText';
import { FAMILY, TONE_COLORS } from '@/lib/desk/tone';
import { useLanguage } from '@/components/LanguageContext';
import type { FactorEntry } from '@/lib/data-service';

/** 7px colour square + door name (mono 11px, ink-2). No bordered chip. `held over` has no colour. */
export function DoorMark({ door }: { door: DoorKind | null }) {
    const { t } = useLanguage();
    if (!door) return <span className="font-mono text-[11px] text-off">{'—'}</span>;
    return (
        <span className="inline-flex min-w-0 items-baseline gap-1.5 font-mono text-[11px] text-ink-2">
            {door !== 'held_over' && (
                <span aria-hidden className="inline-block shrink-0" style={{ width: 7, height: 7, background: DOOR_COLOR[door] }} />
            )}
            <span className="min-w-0">{t(DOOR_LABEL_KEY[door])}</span>
        </span>
    );
}

/** Five 7 x 22px bars on the track, centred at 50 %; a missing pillar is an empty track (no outline, so it reads as part of the same set). */
export function PillarBars({ z }: { z: FactorEntry['fct_z'] | undefined }) {
    const label = PILLARS.map((p) => `${p.letter} ${signedNum(z?.[p.key], 1)}`).join(', ');
    return (
        <span role="img" aria-label={label} className="flex items-center" style={{ gap: 3 }}>
            {PILLARS.map((p) => {
                const bar = pillarBar(z?.[p.key]);
                return (
                    <span
                        key={p.key}
                        aria-hidden
                        className="relative block bg-track-12"
                        style={{ width: 7, height: 22 }}
                    >
                        {bar && (
                            <span
                                className="absolute inset-x-0"
                                style={{
                                    height: `${bar.heightPct}%`,
                                    background: FAMILY[p.family],
                                    ...(bar.up ? { bottom: '50%' } : { top: '50%' }),
                                }}
                            />
                        )}
                    </span>
                );
            })}
        </span>
    );
}

/** The `Q M R V G` header letters, laid over the same 7px columns as the bars. */
export function PillarHeader() {
    return (
        <span aria-hidden className="flex" style={{ gap: 3 }}>
            {PILLARS.map((p) => <span key={p.key} className="block text-center" style={{ width: 7 }}>{p.letter}</span>)}
        </span>
    );
}

const WORD_KEY = {
    undervalued: 'vUndervalued',
    fair: 'dvFair',
    overvalued: 'vOvervalued',
    not_usable: 'vNotUsable',
    blocked: 'dvBlocked',
    awaiting: 'dvAwaiting',
} as const;

const WORD_COLOR: Record<VerdictWord, string> = {
    undervalued: TONE_COLORS.POS,
    fair: TONE_COLORS.FAIR,
    overvalued: TONE_COLORS.NEG,
    not_usable: TONE_COLORS.MUTED,
    blocked: TONE_COLORS.MUTED,
    awaiting: 'var(--ink-2)',
};

/** Mono 600 verdict word in its colour. */
export function VerdictWordText({ word }: { word: VerdictWord | null }) {
    const { t } = useLanguage();
    if (!word) return <span className="font-mono text-[11px] text-off">{'—'}</span>;
    return <span className="font-mono text-[12px] font-semibold" style={{ color: WORD_COLOR[word] }}>{t(WORD_KEY[word])}</span>;
}

export const verdictWordKey = (w: VerdictWord) => WORD_KEY[w];
