'use client';

// The stored analyses of a name as tabs, one open at a time: "AI read" (the Gemini / Claude Opus / Claude Sonnet read
// of the filings) and "Claude quick valuation". A tab exists only when that source has a stored result for the
// name; each holds that source's own panel, unchanged. The open tab is in the URL (?src=ai|claude) so a link
// opens the same tab; without it the tab of the source that gave the verdict opens.

import React from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { useLanguage } from '@/components/LanguageContext';
import type { OpusVerdict } from '@/lib/data-service';
import { OpusPanel } from './OpusPanel';
import { QwenPanel } from './QwenPanel';

export type SourceTab = 'ai' | 'claude';
const ORDER: SourceTab[] = ['ai', 'claude'];
const LABEL = { ai: 'stTabAi', claude: 'stTabClaude' } as const;

export function SourceTabs({ ticker, live, hasAi, opus, analystAsOf, verdictTab }: {
    ticker: string;
    live: number | null;
    /** The name has a row in gemini_c_overlay.json. */
    hasAi: boolean;
    /** The name's row in opus_overlay.json, when it has one. */
    opus: OpusVerdict | undefined;
    analystAsOf?: string;
    /** The tab of the source that gave the AI verdict; null when there is no verdict. */
    verdictTab: SourceTab | null;
}) {
    const { t } = useLanguage();
    const params = useSearchParams();
    const tabs = ORDER.filter((k) => (k === 'ai' ? hasAi : opus != null));
    if (tabs.length === 0) return <p className="mt-4 text-[12px] text-ink-2">{t('stNoTabs')}</p>;

    const asked = params.get('src') as SourceTab | null;
    const open = asked && tabs.includes(asked) ? asked : verdictTab && tabs.includes(verdictTab) ? verdictTab : tabs[0];
    const pick = (k: SourceTab) => {
        const p = new URLSearchParams(window.location.search);
        p.set('src', k);
        window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
    };

    return (
        <div className="mt-5 min-w-0">
            <div role="tablist" aria-label={t('stTabs')} className="flex flex-wrap gap-x-1 border-b border-rule-14">
                {tabs.map((k) => (
                    <button
                        key={k}
                        type="button"
                        role="tab"
                        id={`src-tab-${k}`}
                        aria-selected={open === k}
                        aria-controls="src-panel"
                        onClick={() => pick(k)}
                        className={clsx('px-3 py-2 text-[13px] hover:bg-hover', open === k ? 'font-semibold text-ink' : 'text-ink-2')}
                        style={open === k ? { boxShadow: 'inset 0 -2px 0 var(--ink)' } : undefined}
                    >
                        {t(LABEL[k])}
                    </button>
                ))}
            </div>
            <div role="tabpanel" id="src-panel" aria-labelledby={`src-tab-${open}`}>
                {open === 'ai' && <QwenPanel ticker={ticker} live={live} />}
                {open === 'claude' && opus && <OpusPanel o={opus} analystAsOf={analystAsOf} />}
            </div>
        </div>
    );
}
