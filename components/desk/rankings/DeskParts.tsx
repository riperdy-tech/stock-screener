'use client';

// Small shared pieces of the Desk: the door marker, the Q M R V G bars and the verdict word.
// Colour is never the only signal: every state also carries a word or a glyph.

import React from 'react';
import clsx from 'clsx';
import { DOOR_COLOR, DOOR_LABEL_KEY, type DoorKind } from '@/lib/desk/doors';
import type { VerdictWord } from '@/lib/desk/filters';
import { opusChip } from '@/lib/desk/opusText';
import { PILLARS, pillarBar, signedNum } from '@/lib/desk/rowText';
import { FAMILY, TONE_COLORS } from '@/lib/desk/tone';
import { useLanguage } from '@/components/LanguageContext';
import type { FactorEntry, OpusVerdict } from '@/lib/data-service';
import type { AiSource } from '@/lib/desk/aiVerdict';

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

/** The Opus verdict as a bordered chip in its colour (BUY good, WATCH caution, AVOID bad, no call muted). */
export function OpusChip({ o, large = false, title }: { o: Pick<OpusVerdict, 'verdict'>; large?: boolean; title?: string }) {
    const { t } = useLanguage();
    const c = opusChip(t, o);
    return (
        <span
            title={title}
            className={clsx('inline-block whitespace-nowrap border font-mono font-semibold leading-none', large ? 'px-2 py-1 text-[13px]' : 'px-1.5 py-0.5 text-[10.5px]')}
            style={{ color: c.color, borderColor: c.color }}
        >
            {c.text}
        </span>
    );
}

/** The AI verdict chip with a small source mark beside it: G for Gemini, O for Claude Opus, S for Claude Sonnet (all three read the filings), C for Claude's valuation (the tooltip names it in full). */
export function AiChip({ a, title }: { a: { verdict: OpusVerdict['verdict']; source: AiSource }; title?: string }) {
    const { t } = useLanguage();
    return (
        <>
            <OpusChip o={a} title={title} />
            <span className="ml-1 font-mono text-[9px] text-ink-3" title={t(a.source === 'gemini' ? 'gcSrcGemini' : a.source === 'opus' ? 'gcSrcOpus' : a.source === 'sonnet' ? 'gcSrcSonnet' : 'gcSrcClaude')}>
                {a.source === 'gemini' ? 'G' : a.source === 'opus' ? 'O' : a.source === 'sonnet' ? 'S' : 'C'}
            </span>
        </>
    );
}
