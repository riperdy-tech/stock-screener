'use client';

// Depth run transcripts — the raw model output, verbatim.
//
// Lines run to ~900 characters, so the viewer wraps rather than scrolling
// sideways: `pre-wrap` + `overflow-wrap: anywhere`, and every ancestor in the
// detail grid carries min-w-0 so the column cannot be pushed wider.

import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Micro } from '../primitives';
import { useLanguage } from '@/components/LanguageContext';
import type { DepthReportBundle } from '@/lib/data-service';

const OPEN_KEY = 'desk.transcriptsOpen';

export function TranscriptViewer({ bundle }: { bundle: DepthReportBundle | null }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(true);
    const [tab, setTab] = useState(0);

    useEffect(() => {
        const saved = localStorage.getItem(OPEN_KEY);
        if (saved !== null) setOpen(saved === '1');
    }, []);

    const toggle = () => setOpen((v) => {
        localStorage.setItem(OPEN_KEY, v ? '0' : '1');
        return !v;
    });

    const samples = (bundle?.samples ?? []).filter((s) => s.report && s.report.length > 0);
    if (samples.length === 0) return null;
    const cur = samples[Math.min(tab, samples.length - 1)];

    return (
        <section className="mt-8 border-t border-rule-16 pt-5">
            <div className="flex items-baseline justify-between gap-4">
                <Micro className="font-semibold text-ink">
                    {t('transcriptsTitle')} — {samples.length} sample report{samples.length === 1 ? '' : 's'}
                    {bundle?.run ? ` (${bundle.run})` : ''}
                </Micro>
                <button onClick={toggle} className="font-mono text-[10px] uppercase tracking-[.1em] text-ink-2 hover:text-ink">
                    {open ? `▾ ${t('transcriptsHide')}` : `▸ ${t('transcriptsShow')}`}
                </button>
            </div>

            {open && (
                <>
                    <div className="mt-3.5 flex flex-wrap gap-2">
                        {samples.map((s, i) => (
                            <button
                                key={s.sample}
                                onClick={() => setTab(i)}
                                className={clsx(
                                    'border px-3.5 py-1.5 font-mono text-[11px]',
                                    i === tab
                                        ? 'border-pos/60 bg-pos/[0.08] font-semibold text-pos'
                                        : 'border-rule-14 text-ink-2 hover:text-ink',
                                    !s.plausible && 'line-through decoration-neg/60',
                                )}
                            >
                                Sample {s.sample}{s.iv != null ? ` · $${s.iv}` : ''}{s.truncated ? ' · truncated' : ''}
                            </button>
                        ))}
                    </div>

                    {!cur.plausible && cur.reasons?.length > 0 && (
                        <p className="mt-3 text-[11px] text-warn">
                            Rejected by the guards: {cur.reasons.join('; ')} — this run is excluded from the band.
                        </p>
                    )}

                    <pre className="scroll-dark wrap-anywhere mt-3 max-h-[240px] min-w-0 overflow-y-auto border border-rule-9 bg-page px-3.5 py-3 font-mono text-[10px] leading-[1.65] text-ink-q lg:max-h-[340px] lg:px-5 lg:py-4 lg:text-[11.5px] lg:leading-[1.7]">
                        {cur.report}
                    </pre>

                    <Micro className="mt-2 block text-ink-3">
                        {t('transcriptsFoot')}
                    </Micro>
                </>
            )}
        </section>
    );
}
