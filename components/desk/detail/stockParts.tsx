'use client';

// Small shared pieces of the stock page: a section with its rule and subline, a label/value grid,
// and the collapsed-by-default disclosure. Radius 0, rules instead of cards, 11 px floor.

import React, { useState } from 'react';
import clsx from 'clsx';

export const DASH = '—';

/** README 3.2 section header: 14 px 600 on a 1 px ink rule, optional 12 px ink-2 subline, optional right-aligned count. */
export function Sec({ title, sub, count, className, children }: {
    title: React.ReactNode;
    sub?: React.ReactNode;
    count?: React.ReactNode;
    className?: string;
    children?: React.ReactNode;
}) {
    return (
        <section className={clsx('min-w-0', className)}>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-t border-ink pt-3">
                <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
                {sub && <span className="text-[12px] text-ink-2">{sub}</span>}
                {count != null && <span className="ml-auto font-mono text-[12px] text-ink">{count}</span>}
            </div>
            {children}
        </section>
    );
}

/** Label / value grid; values are mono and wrap anywhere so nothing scrolls sideways. */
export function Grid({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <dl className={clsx('grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-2 sm:grid-cols-[150px_minmax(0,1fr)]', className)}>
            {children}
        </dl>
    );
}

export function Row({ label, children, mono = true }: { label: React.ReactNode; children: React.ReactNode; mono?: boolean }) {
    return (
        <>
            <dt className="text-[12px] text-ink-2">{label}</dt>
            <dd className={clsx('min-w-0 break-words text-[12px] text-ink', mono && 'font-mono')}>{children}</dd>
        </>
    );
}

/** `Title ▸` that opens in place; collapsed by default. */
export function Disclosure({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <section className="min-w-0">
            <div className="border-t border-ink pt-3">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                    className="flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-left hover:bg-hover"
                >
                    <span className="text-[14px] font-semibold text-ink">{title} <span aria-hidden>{open ? '▾' : '▸'}</span></span>
                    {sub && <span className="text-[12px] text-ink-2">{sub}</span>}
                </button>
            </div>
            {open && <div className="mt-3">{children}</div>}
        </section>
    );
}

/** A quiet box for an honest empty state. */
export function Empty({ children }: { children: React.ReactNode }) {
    return <p className="mt-3 border border-dashed border-rule-18 px-3.5 py-3 text-[13px] text-ink-2">{children}</p>;
}
