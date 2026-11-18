'use client';

// The stored analyses of a name as tabs, one open at a time: "AI read" (the Gemini / Claude Opus / Claude Sonnet read
// of the filings), "Qwen" and "Claude quick valuation". A tab exists only when that source has a stored result for the
// name; each holds that source's own panel, unchanged. The open tab is in the URL (?src=ai|qwen|claude) so a link
// opens the same tab; without it the tab of the source that gave the verdict opens.

import React from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { useLanguage } from '@/components/LanguageContext';
import type { OpusVerdict } from '@/lib/data-service';
import type { MonthlyBooksLike } from '@/lib/desk/stockPage';
import { OpusPanel } from './OpusPanel';
import { QwenPanel } from './QwenPanel';

export type SourceTab = 'ai' | 'qwen' | 'claude';
const ORDER: SourceTab[] = ['ai', 'qwen', 'claude'];
const LABEL = { ai: 'stTabAi', qwen: 'stTabQwen', claude: 'stTabClaude' } as const;

export function SourceTabs({ ticker, live, listed, monthly, hasAi, hasQwen, opus, analystAsOf, verdictTab }: {
    ticker: string;
    live: number | null;
    listed: boolean;
    monthly: MonthlyBooksLike | null;
    /** The name has a row in gemini_c_overlay.json / qwen_overlay.json. */
    hasAi: boolean;
    hasQwen: boolean;
    /** The name's row in opus_overlay.json, when it has one. */
    opus: OpusVerdict | undefined;
    analystAsOf?: string;
    /** The tab of the source that gave the AI verdict; null when there is no verdict. */
    verdictTab: SourceTab | null;
}) {
    const { t } = useLanguage();
    const params = useSearchParams();
    const tabs = ORDER.filter((k) => (k === 'ai' ? hasAi : k === 'qwen' ? hasQwen : opus != null));
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
                {open === 'ai' && <QwenPanel gemini ticker={ticker} live={live} listed={listed} monthly={null} />}
                {open === 'qwen' && <QwenPanel ticker={ticker} live={live} listed={listed} monthly={monthly} />}
                {open === 'claude' && opus && <OpusPanel o={opus} analystAsOf={analystAsOf} />}
            </div>
        </div>
    );
}
