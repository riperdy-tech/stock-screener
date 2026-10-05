'use client';

// Conditional banner under the freshness strip, driven by lib/desk/notice.ts.
// Warn style per handoff README 3.1: warn mixed 10% into the canvas + a 2px warn left border.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import { NOTICE, type NoticeSeverity } from '@/lib/desk/notice';

const STYLE: Record<NoticeSeverity, { background: string; borderLeftColor: string }> = {
    warn: { background: 'color-mix(in oklch, var(--warn) 10%, var(--bg))', borderLeftColor: 'var(--warn)' },
    error: { background: 'color-mix(in oklch, var(--neg) 10%, var(--bg))', borderLeftColor: 'var(--neg)' },
    info: { background: 'var(--inset)', borderLeftColor: 'var(--off)' },
};

export function NoticeBanner() {
    const { t } = useLanguage();
    if (!NOTICE) return null;
    return (
        <div className="mx-auto max-w-desk px-5 pt-3 sm:px-10">
            <p
                role="status"
                className="border-l-2 px-3.5 py-2.5 text-[13.5px] leading-snug text-ink"
                style={STYLE[NOTICE.severity]}
            >
                {t(NOTICE.messageKey)}
            </p>
        </div>
    );
}
