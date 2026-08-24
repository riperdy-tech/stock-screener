'use client';

// Shared building blocks for the AI Research Desk.
// House rules: radius 0, no cards, no shadows — rules and whitespace only.
// Micro-labels are mono, uppercase, 11px/600, .04–.07em tracking (rev1 legibility pass).

import React, { useCallback, useEffect, useRef } from 'react';
import clsx from 'clsx';

/** Mono uppercase micro-label — used for every column header and stat caption. */
export function Micro({ className, children, as: As = 'span', ...rest }: {
    className?: string;
    children?: React.ReactNode;
    as?: any;
} & React.HTMLAttributes<HTMLElement>) {
    return (
        <As
            className={clsx('font-mono font-semibold text-[11px] uppercase leading-tight tracking-micro text-ink-2', className)}
            {...rest}
        >
            {children}
        </As>
    );
}

/** Section start: 2px light rule + uppercase 800 header, optional right micro-copy. */
export function SectionHead({ title, note, right, className, id }: {
    title: React.ReactNode;
    note?: React.ReactNode;
    right?: React.ReactNode;
    className?: string;
    id?: string;
}) {
    return (
        <div id={id} className={clsx('border-t-2 border-ink pt-3.5', className)}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-[14px] font-extrabold uppercase tracking-section text-ink">{title}</h2>
                {note && <Micro className="text-ink-3">{note}</Micro>}
                {right}
            </div>
        </div>
    );
}

/** Thin section divider (1px .09) used between blocks inside a section. */
export function Rule({ className }: { className?: string }) {
    return <div className={clsx('border-t border-rule-14', className)} />;
}

export type ChipTone = 'default' | 'accent' | 'pos' | 'warn' | 'neg';

const CHIP_ON: Record<ChipTone, string> = {
    default: 'bg-ink text-surface border-ink font-bold',
    accent: 'border-accent/60 text-accent bg-accent/[0.08] font-semibold',
    pos: 'border-pos/60 text-pos bg-pos/[0.08] font-semibold',
    warn: 'border-warn/60 text-warn bg-warn/10 font-semibold',
    neg: 'border-neg/60 text-neg bg-neg/10 font-semibold',
};

/** Square chip. Active default chip is the inverted ink/surface pill from the design. */
export function Chip({ active, tone = 'default', className, children, ...rest }: {
    active?: boolean;
    tone?: ChipTone;
    className?: string;
    children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            className={clsx(
                'border px-3.5 py-1.5 text-[12px] transition-colors',
                active ? CHIP_ON[tone] : 'border-rule-24 bg-transparent text-ink-2 hover:text-ink',
                className,
            )}
            {...rest}
        >
            {children}
        </button>
    );
}

/** Non-interactive chip (evidence chips, band tags). */
export function Tag({ className, style, children }: {
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}) {
    return (
        <span
            className={clsx('inline-flex border border-rule-24 px-2.5 py-1 font-mono font-semibold text-[11px] uppercase tracking-[.06em] text-ink-2', className)}
            style={style}
        >
            {children}
        </span>
    );
}

/** Big mono figure over a micro caption — funnel counts, stat bands, detail stats. */
export function Stat({ label, value, sub, valueClass, subClass, className, size = 'lg' }: {
    label: React.ReactNode;
    value: React.ReactNode;
    sub?: React.ReactNode;
    valueClass?: string;
    subClass?: string;
    className?: string;
    size?: 'lg' | 'md' | 'sm';
}) {
    const sizeClass = size === 'lg' ? 'text-[28px]' : size === 'md' ? 'text-[19px]' : 'text-[15px]';
    return (
        <div className={className}>
            <div className={clsx('font-mono font-semibold leading-none', sizeClass, valueClass ?? 'text-ink')}>{value}</div>
            <Micro className="mt-1 block">{label}</Micro>
            {sub && <div className={clsx('mt-1 text-[11px]', subClass ?? 'text-ink-3')}>{sub}</div>}
        </div>
    );
}

/** Horizontal bar on a square track — factor bars, DCF bars, plan weights. */
export function Bar({ pct, color, track = 'rgba(255,255,255,.12)', height = 6, className }: {
    pct: number;
    color: string;
    track?: string;
    height?: number;
    className?: string;
}) {
    const w = Math.max(0, Math.min(100, pct));
    return (
        <span className={clsx('block w-full', className)} style={{ height, background: track }}>
            <span className="block h-full" style={{ width: `${w}%`, background: color }} />
        </span>
    );
}

/**
 * Full-screen overlay with Escape-to-close and a focus trap — the legacy modals
 * had neither. Radius 0, 1px rule border, page-dark backdrop.
 */
export function Modal({ onClose, labelledBy, className, children }: {
    onClose: () => void;
    labelledBy?: string;
    className?: string;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);

    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
        if (e.key !== 'Tab' || !ref.current) return;
        const focusables = ref.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }, [onClose]);

    useEffect(() => {
        const prev = document.activeElement as HTMLElement | null;
        ref.current?.focus();
        return () => prev?.focus?.();
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                className={clsx('w-full max-w-3xl border border-rule-22 bg-surface outline-none', className)}
            >
                {children}
            </div>
        </div>
    );
}

/** Static loading placeholder (no shimmer animation — the desk is instant and dense). */
export function Skel({ className }: { className?: string }) {
    return <span className={clsx('block h-3 bg-track-12', className)} />;
}
