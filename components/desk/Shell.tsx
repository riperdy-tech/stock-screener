'use client';

// The app shell every desk surface renders inside: masthead, nav, status strip,
// and the 1280px content column. Radius 0, rules instead of cards.

import React, { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { APP_VERSION, CHANGELOG } from '@/lib/changelog';
import { useLanguage } from '@/components/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { AuthModal } from '@/components/AuthModal';
import { useAuth } from '@/lib/useAuth';
import { Micro, Modal } from './primitives';

export type DeskTab = 'rankings' | 'track' | 'portfolio';

const TABS: { id: DeskTab; label: string; href: string }[] = [
    { id: 'rankings', label: 'Rankings', href: '/?tab=rankings' },
    { id: 'track', label: 'Track Record', href: '/?tab=track' },
    { id: 'portfolio', label: 'Portfolio', href: '/?tab=portfolio' },
];

function NavLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className={clsx(
                'border-b-2 pb-1 text-[13px] font-semibold transition-colors',
                active ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink',
            )}
        >
            {children}
        </Link>
    );
}

export function ChangelogModal({ onClose }: { onClose: () => void }) {
    return (
        <Modal onClose={onClose} labelledBy="changelog-title" className="max-w-2xl">
            <div className="flex items-baseline justify-between border-b border-rule-22 px-6 py-4">
                <h2 id="changelog-title" className="text-[14px] font-extrabold uppercase tracking-section">
                    What&apos;s new — v{APP_VERSION}
                </h2>
                <button onClick={onClose} className="font-mono text-[11px] text-ink-2 hover:text-ink">CLOSE ✕</button>
            </div>
            <div className="scroll-dark max-h-[70vh] overflow-y-auto px-6 py-5">
                {CHANGELOG.map((entry: any) => (
                    <section key={entry.version} className="mb-6 last:mb-0">
                        <div className="flex items-baseline gap-3">
                            <span className="border border-rule-24 px-2 py-0.5 font-mono text-[11px] text-accent">v{entry.version}</span>
                            <Micro>{entry.date}</Micro>
                        </div>
                        <h3 className="mt-2 text-[13.5px] font-bold text-ink">{entry.title}</h3>
                        <ul className="mt-2 space-y-1.5">
                            {(entry.changes ?? []).map((item: string, i: number) => (
                                <li key={i} className="border-l border-rule-24 pl-3 text-[12.5px] leading-relaxed text-ink-q">{item}</li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </Modal>
    );
}

/** Run provenance, mono 11px. */
export function StatusStrip({ factor, depthMeta }: {
    factor?: {
        generated_at?: string;
        scored_count?: number;
        sector_quota_source?: string | null;
        discount_rate_source?: string | null;
        discount_rate_reason?: string | null;
        discount_rate_asof?: string | null;
    } | null;
    depthMeta?: { generated_at: string | null; count: number; actionable_count?: number | null };
}) {
    const depthDate = (depthMeta?.generated_at ?? '').slice(0, 10);
    const left = [
        depthDate ? `AI VERDICTS ${depthDate}` : 'AI VERDICTS — NONE',
        depthMeta?.count ? `${depthMeta.count} ON RECORD` : null,
        depthMeta?.actionable_count != null ? `${depthMeta.actionable_count} PASS THE GATE` : null,
        factor?.scored_count ? `${factor.scored_count.toLocaleString('en-US')} QUANT-SCORED` : null,
    ].filter(Boolean).join(' · ');

    // Second line: how the quant screen was run. Each piece appears only when the data carries it.
    const quotaSource = factor?.sector_quota_source;
    const tilt = quotaSource == null ? null
        : !quotaSource.startsWith('neutral') ? 'SECTOR TILT ON'
            : `SECTOR TILT OFF${quotaSource === 'neutral_fallback' ? ' (macro ranking unavailable)'
                : quotaSource === 'neutral_no_validated_edge' ? ' (no proven edge)' : ''}`;
    const rateSource = factor?.discount_rate_source;
    const rate = rateSource == null ? null
        : rateSource === 'constant_fallback'
            ? `DISCOUNT RATE: 10% FALLBACK${factor?.discount_rate_reason === 'anchor_missing' ? ' (macro anchor missing)' : ''}`
            : `DISCOUNT RATE: FROM MACRO ENGINE${factor?.discount_rate_asof ? ` AS OF ${factor.discount_rate_asof}` : ''}`;
    const runDate = (factor?.generated_at ?? '').slice(0, 10);
    const screen = [tilt, rate, runDate ? `SCREEN RUN ${runDate}` : null].filter(Boolean).join(' · ');

    return (
        <div className="border-b border-rule-14">
            <div className="mx-auto flex max-w-desk flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-2 sm:px-10">
                <span className="font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-ink-2">{left}</span>
            </div>
            {screen && (
                <div className="mx-auto max-w-desk px-5 pb-2 sm:px-10">
                    <span className="font-mono text-[10.5px] uppercase tracking-[.05em] text-ink-3">{screen}</span>
                </div>
            )}
        </div>
    );
}

export function Shell({ tab, factor, depthMeta, loading, onReload, children }: {
    tab?: DeskTab | null;
    factor?: any;
    depthMeta?: { generated_at: string | null; count: number; actionable_count?: number | null };
    loading?: boolean;
    onReload?: () => void;
    children: React.ReactNode;
}) {
    const { t } = useLanguage();
    const [showChangelog, setShowChangelog] = useState(false);
    const [showAuth, setShowAuth] = useState(false);
    // Auth state is read by the surfaces themselves; the shell only needs the buttons.
    const auth = useAuth();

    // The app surface sits one step above the body ground (#1c1e21 over #15171a) so
    // inset panels, transcript viewers and tooltips can drop back to the page colour
    // and still read as recessed.
    return (
        <div className="min-h-screen bg-surface text-ink">
            <header className="border-b border-rule-22">
                <div className="mx-auto flex max-w-desk flex-wrap items-baseline gap-x-6 gap-y-3 px-5 py-4 sm:px-10">
                    <Link href="/" className="flex items-baseline gap-3">
                        <span className="text-[21px] font-extrabold tracking-brand text-ink">STOCKPEAK</span>
                        <Micro className="hidden sm:inline">{t('deskBrand')}</Micro>
                    </Link>

                    <nav className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                        {TABS.map((x) => (
                            <NavLink key={x.id} href={x.href} active={tab === x.id}>{x.label}</NavLink>
                        ))}
                        <NavLink href="/help">{t('deskHandbook')}</NavLink>
                    </nav>

                    <div className="ml-auto flex flex-wrap items-baseline justify-end gap-x-4 gap-y-2 font-mono font-semibold text-[11px] uppercase tracking-[.05em]">
                        <Link href="/lenses" className="text-ink-2 hover:text-ink">{t('navLenses')}</Link>
                        <Link href="/reports" className="text-ink-2 hover:text-ink">{t('navReports')}</Link>
                        <Link href="/ondemand" className="text-ink-2 hover:text-ink">{t('navOndemand')}</Link>
                        <button onClick={() => setShowChangelog(true)} className="text-ink-2 hover:text-ink" title="What's new">
                            v{APP_VERSION}
                        </button>
                        <LanguageToggle />
                        {auth.ready && (auth.user ? (
                            <button onClick={() => auth.signOut()} className="text-ink-2 hover:text-ink" title={auth.user.email || ''}>
                                {t('logOut')}
                            </button>
                        ) : (
                            <button onClick={() => setShowAuth(true)} className="text-accent hover:text-ink">{t('logIn')}</button>
                        ))}
                        {onReload && (
                            <button onClick={onReload} className="text-ink-2 hover:text-ink" aria-label="Refresh data">
                                {loading ? t('deskLoading') : t('deskRefresh')}
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <StatusStrip factor={factor} depthMeta={depthMeta} />

            <main className="mx-auto max-w-desk px-5 pb-24 sm:px-10 lg:pb-16">{children}</main>

            {/* Mobile tab bar — the header nav is out of reach on a phone. */}
            <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-rule-14 bg-surface lg:hidden">
                {TABS.map((x) => (
                    <Link
                        key={x.id}
                        href={x.href}
                        className={clsx('flex-1 py-3.5 text-center text-[11px]',
                            tab === x.id ? 'font-bold text-accent' : 'text-ink-2')}
                    >
                        {x.label}
                    </Link>
                ))}
                <Link href="/help" className="flex-1 py-3.5 text-center text-[11px] text-ink-2">More</Link>
            </nav>

            {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
            {showAuth && <AuthModal onClose={() => setShowAuth(false)} signIn={auth.signIn} signUp={auth.signUp} />}
        </div>
    );
}
