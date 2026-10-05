'use client';

// Small shared pieces of the Track record page.

import React from 'react';
import clsx from 'clsx';

/** Section start: 1px ink rule, 14px semibold title and an optional plain subline (handoff 5.3). */
export function TrackSection({ title, sub, className, children }: {
    title: React.ReactNode;
    sub?: React.ReactNode;
    className?: string;
    children?: React.ReactNode;
}) {
    return (
        <section className={clsx('mt-9', className)}>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-t border-ink pt-3">
                <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
                {sub && <span className="text-[12px] text-ink-2">{sub}</span>}
            </div>
            {children}
        </section>
    );
}
