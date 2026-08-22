'use client';

// GlossaryTerm — the "bible" hyperlink system.
//
// <Term term="expectations-gap"> wraps a financial word in a link. Clicking it
// opens a mini-popup right beside the word explaining exactly what it means.
// Clicking another term moves the popup; clicking anywhere else (or pressing
// Escape) closes it. Only one popup is ever open, managed by GlossaryProvider.
//
// The popup is position:fixed and re-positioned on every scroll/resize event
// (capture phase), so it stays anchored to the word as the reader scrolls a
// long document — unlike an absolutely-positioned popup that would drift or get
// clipped inside overflow containers.

import {
    createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
    CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_STYLES, GLOSSARY, lookupTerm, TermDef,
} from '@/lib/glossary';
import { CATEGORY_LABELS_KO, GLOSSARY_KO } from '@/lib/glossary-ko';
import { CATEGORY_LABELS_ZH, GLOSSARY_ZH } from '@/lib/glossary-zh';
import { useLanguage } from './LanguageContext';

/** Pick the localized dictionary for the current site language (undefined = English). */
function localDict(language: string) {
    return language === 'ko' ? GLOSSARY_KO : language === 'zh' ? GLOSSARY_ZH : undefined;
}
function localCatLabels(language: string) {
    return language === 'ko' ? CATEGORY_LABELS_KO : language === 'zh' ? CATEGORY_LABELS_ZH : CATEGORY_LABELS;
}

const POPUP_WIDTH = 340;
const POPUP_HEIGHT_EST = 260; // rough, used only to decide above/below placement

interface OpenState {
    key: string;
    anchor: HTMLElement | null;
}

interface GlossaryCtxValue {
    openKey: string | null;
    open: (key: string, anchorEl: HTMLElement | null) => void;
    close: () => void;
}

const GlossaryCtx = createContext<GlossaryCtxValue>({
    openKey: null,
    open: () => { },
    close: () => { },
});

export function GlossaryProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState<OpenState | null>(null);

    const toggleOpen = useCallback((key: string, anchorEl: HTMLElement | null) => {
        setOpen(prev => (prev && prev.key === key ? null : { key, anchor: anchorEl }));
    }, []);
    const close = useCallback(() => setOpen(null), []);

    // Escape closes the popup.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const value = useMemo(
        () => ({ openKey: open?.key ?? null, open: toggleOpen, close }),
        [open, toggleOpen, close],
    );

    const def = open ? lookupTerm(open.key) : undefined;

    return (
        <GlossaryCtx.Provider value={value}>
            {children}
            {open && open.anchor && def && (
                <TermPopup termKey={open.key} def={def} anchorEl={open.anchor} />
            )}
        </GlossaryCtx.Provider>
    );
}

export function useGlossary() {
    return useContext(GlossaryCtx);
}

/** The visible link wrapper. Renders plain text (not a link) if the key is unknown. */
export function Term({ term, label }: { term: string; label?: string }) {
    const def = lookupTerm(term);
    const { language } = useLanguage();
    const localDef = localDict(language)?.[term];
    const displayName = label ?? localDef?.term ?? def?.term ?? term.replace(/-/g, ' ');
    const { openKey, open } = useGlossary();
    const isOpen = openKey === term;
    const btnRef = useRef<HTMLButtonElement>(null);

    if (!def) {
        // Unknown key → graceful fallback to plain text so the page never breaks.
        return <span className="text-inherit">{label ?? term.replace(/-/g, ' ')}</span>;
    }

    return (
        <button
            ref={btnRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-label={`What does "${displayName}" mean?`}
            onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                open(term, btnRef.current);
            }}
            className={
                'glossary-term font-semibold no-underline outline-none transition-colors ' +
                'border-b border-dotted border-pos/40 pb-px ' +
                'text-pos hover:text-pos hover:border-emerald-300 ' +
                'focus-visible:text-pos'
            }
        >
            {displayName}
        </button>
    );
}

function TermPopup({ termKey, def, anchorEl }: {
    termKey: string;
    def: TermDef;
    anchorEl: HTMLElement;
}) {
    const { open, close } = useGlossary();
    const { language } = useLanguage();
    const localDef = localDict(language)?.[termKey];
    const popRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);

    // Close when clicking anywhere outside the popup. Capture phase: a click on
    // another term's button closes this popup first, then the button's own
    // handler reopens the popup for the new term.
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (popRef.current && !popRef.current.contains(e.target as Node)) close();
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [close]);

    // Place the popup anchored to the clicked term, clamped to the viewport,
    // flipping above when there is not enough room below. Re-run on scroll /
    // resize so it stays glued to the word while the reader scrolls.
    useEffect(() => {
        const place = () => {
            const r = anchorEl.getBoundingClientRect();
            const pad = 10;
            const width = Math.min(POPUP_WIDTH, window.innerWidth - pad * 2);
            const spaceBelow = window.innerHeight - r.bottom;
            const above = spaceBelow < POPUP_HEIGHT_EST;
            const left = Math.min(
                Math.max(pad, r.left + r.width / 2 - width / 2),
                window.innerWidth - width - pad,
            );
            const top = above
                ? Math.max(pad, r.top - POPUP_HEIGHT_EST - 8)
                : r.bottom + 8;
            setPos({ top, left, width, above });
        };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [anchorEl, termKey]);

    const related = (def.related ?? []).map(k => ({ key: k, def: lookupTerm(k) }))
        .filter(x => x.def) as { key: string; def: TermDef }[];

    const displayName = localDef?.term ?? def.term;
    const categoryLabel = localCatLabels(language)[def.category];

    if (typeof document === 'undefined') return null;
    // Render through a portal to <body> so the popup is NOT nested inside the
    // <p>/<span> that contains the term — nesting a <div> inside a <p> is invalid
    // HTML and triggers hydration warnings.
    return createPortal(
        <div
            ref={popRef}
            role="dialog"
            aria-label={`Definition of ${displayName}`}
            style={{
                position: 'fixed',
                top: pos ? pos.top : -9999,
                left: pos ? pos.left : -9999,
                width: pos ? pos.width : POPUP_WIDTH,
            }}
            className="z-[80] border border-rule-16 bg-page p-3"
            onClick={e => e.stopPropagation()}
        >
            {/* Caret */}
            <span
                aria-hidden
                style={pos ? { left: Math.min(pos.width - 14, Math.max(14, anchorEl.getBoundingClientRect().left - pos.left + anchorEl.getBoundingClientRect().width / 2)) } : undefined}
                className={`absolute h-2.5 w-2.5 rotate-45 border border-rule-6 bg-[#0b1220] ${pos?.above ? 'bottom-[-5px] border-t-0 border-l-0' : 'top-[-5px] border-b-0 border-r-0'}`}
            />
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 pr-4">
                    <span className={` border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${CATEGORY_STYLES[def.category]}`}>
                        {categoryLabel}
                    </span>
                    <span className="text-sm font-extrabold leading-tight text-ink">{displayName}</span>
                </div>
                <button
                    type="button"
                    onClick={close}
                    aria-label="Close definition"
                    className="shrink-0 border border-rule-6 p-1 text-ink-3 transition-colors hover:bg-white/5 hover:text-ink"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>

            <p className="mt-1.5 text-[11px] font-semibold italic leading-snug text-pos">
                {localDef?.plain ?? def.plain}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-q">
                {localDef?.definition ?? def.definition}
            </p>

            {related.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-rule-6 pt-2">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-ink-3">See also</span>
                    {related.map(({ key, def: rd }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={e => {
                                e.stopPropagation();
                                // Re-anchor the popup to this chip so the definition
                                // appears next to what the reader just clicked.
                                open(key, e.currentTarget as HTMLElement);
                            }}
                            className="border border-rule-6 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-ink-2 transition-colors hover:border-pos/40 hover:text-pos"
                        >
                            {localDict(language)?.[key]?.term ?? rd.term}
                        </button>
                    ))}
                </div>
            )}

            <p className="mt-2 text-[9px] text-ink-2/50">
                Click anywhere outside or press Esc to close.
            </p>
        </div>,
        document.body,
    );
}

// Re-export the dictionary + category metadata so the help page can build the
// glossary index and the search box from the same source of truth.
export { GLOSSARY, CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_STYLES };
