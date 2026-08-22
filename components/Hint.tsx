'use client';

// Hint — a small (?) marker that reveals a plain-English explanation on
// hover, focus, or tap. The popup is position:fixed so it escapes
// overflow-x containers (e.g. the rankings table wrapper), which would
// clip an absolutely-positioned tooltip.

import { useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

const POPUP_WIDTH = 264;

export function Hint({ text, label }: { text: string; label?: string }) {
    const btnRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const open = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (!r) return;
        const left = Math.min(
            Math.max(8, r.left + r.width / 2 - POPUP_WIDTH / 2),
            window.innerWidth - POPUP_WIDTH - 8,
        );
        setPos({ top: r.bottom + 6, left });
    };
    const close = () => setPos(null);

    // A fixed-position popup goes stale the moment anything scrolls — just close it.
    useEffect(() => {
        if (!pos) return;
        const onScroll = () => setPos(null);
        window.addEventListener('scroll', onScroll, true);
        return () => window.removeEventListener('scroll', onScroll, true);
    }, [pos]);

    return (
        <span className="relative inline-flex" onMouseEnter={open} onMouseLeave={close}>
            <button
                ref={btnRef}
                type="button"
                aria-label={label ? `What does "${label}" mean?` : 'What does this mean?'}
                onClick={e => {
                    e.stopPropagation();
                    if (pos) close(); else open();
                }}
                onBlur={close}
                className="outline-none text-ink-3 hover:text-pos focus:text-pos"
            >
                <HelpCircle className="h-3 w-3" />
            </button>
            {pos && (
                <span
                    role="tooltip"
                    style={{ top: pos.top, left: pos.left, width: POPUP_WIDTH }}
                    className="fixed z-[70] border border-rule-9 bg-page p-2.5 text-left text-[11px] font-medium normal-case leading-relaxed tracking-normal text-ink"
                >
                    {text}
                </span>
            )}
        </span>
    );
}
