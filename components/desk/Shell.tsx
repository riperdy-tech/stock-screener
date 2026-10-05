'use client';

// The app shell every desk surface renders inside: masthead, nav, freshness strip, notice banner,
// the 1280px content column and the disclaimer footer. Radius 0, rules instead of cards.
// The outermost element carries `.theme-light` (app/globals.css), which is how the desk gets the
// v3 light theme while /admin and the legacy pages stay dark.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { APP_VERSION, CHANGELOG } from '@/lib/changelog';
import { useLanguage } from '@/components/LanguageContext';
import { AuthModal } from '@/components/AuthModal';
import { useAuth } from '@/lib/useAuth';
import { computeFreshness, computeHealth } from '@/lib/desk/health';
import { deskNotice } from '@/lib/desk/notice';
import { useDeskStatus } from '@/lib/desk/useDeskData';
import { FreshnessStrip } from './FreshnessStrip';
import { HealthDrawer } from './HealthDrawer';
import { NoticeBanner } from './NoticeBanner';
import { Micro, Modal } from './primitives';

export type DeskTab = 'rankings' | 'track' | 'portfolio' | 'macro' | 'help';

// The tabs that sit in the mobile bar. Macro is a header link and lives under More on a phone.
const TABS: { id: DeskTab; key: 'navDesk' | 'navTrackRecord' | 'navPortfolio'; shortKey: 'navDesk' | 'navTrackShort' | 'navPortfolio'; href: string }[] = [
    { id: 'rankings', key: 'navDesk', shortKey: 'navDesk', href: '/?tab=rankings' },
    { id: 'track', key: 'navTrackRecord', shortKey: 'navTrackShort', href: '/track' },
    { id: 'portfolio', key: 'navPortfolio', shortKey: 'navPortfolio', href: '/?tab=portfolio' },
];

const LANGS = [{ code: 'en', label: 'EN' }, { code: 'ko', label: 'KO' }, { code: 'zh', label: 'ZH' }] as const;

function NavLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            aria-current={active ? 'page' : undefined}
            className={clsx('pb-1 text-[13px]', active ? 'font-semibold text-ink' : 'text-ink-2 hover:text-ink')}
            style={active ? { boxShadow: 'inset 0 -2px 0 var(--ink)' } : undefined}
        >
            {children}
        </Link>
    );
}

/** The "⋯" menu: On-demand, then the retired Archive pages. */
function MoreMenu() {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const item = 'flex items-baseline justify-between gap-4 px-3 py-2 text-[13px] text-ink-2 hover:bg-hover hover:text-ink';
    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={t('navMore')}
                className="text-[13px] text-ink-2 hover:text-ink"
            >
                ⋯
            </button>
            {open && (
                <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-56 border border-rule-22 bg-surface py-1">
                    <Link role="menuitem" href="/ondemand" onClick={() => setOpen(false)} className={item}>{t('navOndemand')}</Link>
                    <div className="mt-1 border-t border-rule-10 px-3 pb-1 pt-2 font-mono text-[11px] text-off">{t('navArchive')}</div>
                    {([['/lenses', 'archiveLenses'], ['/reports', 'navReports'], ['/youtube-strategy', 'archiveYoutube']] as const).map(([href, key]) => (
                        <Link key={href} role="menuitem" href={href} onClick={() => setOpen(false)} className={item}>
                            {t(key)}
                            <span className="font-mono text-[11px] text-off">{t('archiveRetired')}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Mobile "More": a menu that opens above the tab bar. Macro lives here, with the pages the header holds. */
function MobileMore({ active }: { active: boolean }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('touchstart', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('touchstart', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const item = 'flex items-baseline justify-between gap-4 px-4 py-3 text-[13px] text-ink-2 hover:bg-hover hover:text-ink';
    return (
        <div ref={ref} className="relative flex-1">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={t('navMoreMenu')}
                className={clsx('w-full py-3.5 text-center text-[11px]', active ? 'font-bold text-ink' : 'text-ink-2')}
            >
                {t('navMore')}
            </button>
            {open && (
                <div role="menu" className="absolute bottom-full right-0 z-40 w-60 max-w-[calc(100vw-16px)] border border-rule-22 bg-surface py-1">
                    <Link role="menuitem" href="/macro" onClick={() => setOpen(false)} className={clsx(item, active && 'font-semibold text-ink')}>{t('navMacro')}</Link>
                    <Link role="menuitem" href="/help" onClick={() => setOpen(false)} className={item}>{t('deskHandbook')}</Link>
                    <Link role="menuitem" href="/ondemand" onClick={() => setOpen(false)} className={item}>{t('navOndemand')}</Link>
                    <div className="mt-1 border-t border-rule-10 px-4 pb-1 pt-2 font-mono text-[11px] text-off">{t('navArchive')}</div>
                    {([['/lenses', 'archiveLenses'], ['/reports', 'navReports'], ['/youtube-strategy', 'archiveYoutube']] as const).map(([href, key]) => (
                        <Link key={href} role="menuitem" href={href} onClick={() => setOpen(false)} className={item}>
                            {t(key)}
                            <span className="font-mono text-[11px] text-off">{t('archiveRetired')}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
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

export function Shell({ tab, loading, onReload, children }: {
    tab?: DeskTab | null;
    loading?: boolean;
    onReload?: () => void;
    children: React.ReactNode;
}) {
    const { t, language, setLanguage } = useLanguage();
    const [showChangelog, setShowChangelog] = useState(false);
    const [showAuth, setShowAuth] = useState(false);
    const [showHealth, setShowHealth] = useState(false);
    // Auth state is read by the surfaces themselves; the shell only needs the buttons.
    const auth = useAuth();
    const status = useDeskStatus();
    const { fresh, health } = useMemo(() => {
        const now = Date.now();
        const f = computeFreshness(status, now);
        return { fresh: f, health: computeHealth(status, f, now) };
    }, [status]);

    // The app surface sits one step above the body ground so inset panels, transcript
    // viewers and tooltips can drop back to the page colour and still read as recessed.
    return (
        <div className="theme-light min-h-screen bg-surface font-sans text-ink">
            <header className="mx-auto max-w-desk px-5 pt-4 sm:px-10">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-b border-rule-10 pb-2">
                    <Link href="/" className="flex items-baseline gap-2.5">
                        <span className="text-[16px] font-bold tracking-head text-ink">Stockpeak</span>
                        <span className="hidden text-[12px] text-ink-2 sm:inline">{t('deskTagline')}</span>
                    </Link>

                    <div className="flex flex-wrap items-baseline justify-end gap-x-[18px] gap-y-2">
                        <nav className="flex flex-wrap items-baseline gap-x-[18px] gap-y-2">
                            {TABS.map((x) => (
                                <NavLink key={x.id} href={x.href} active={tab === x.id}>{t(x.key)}</NavLink>
                            ))}
                            <NavLink href="/macro" active={tab === 'macro'}>{t('navMacro')}</NavLink>
                            <NavLink href="/help" active={tab === 'help'}>{t('deskHandbook')}</NavLink>
                        </nav>
                        <MoreMenu />
                        <div className="flex items-baseline gap-1.5 font-mono text-[11px]">
                            {LANGS.map((l, i) => (
                                <React.Fragment key={l.code}>
                                    {i > 0 && <span aria-hidden className="text-off">·</span>}
                                    <button
                                        type="button"
                                        onClick={() => setLanguage(l.code)}
                                        aria-pressed={language === l.code}
                                        className={language === l.code ? 'font-semibold text-ink' : 'text-ink-2 hover:text-ink'}
                                    >
                                        {l.label}
                                    </button>
                                </React.Fragment>
                            ))}
                        </div>
                        <div className="flex items-baseline gap-x-4 font-mono text-[11px]">
                            {auth.ready && (auth.user ? (
                                <button onClick={() => auth.signOut()} className="text-ink-2 hover:text-ink" title={auth.user.email || ''}>
                                    {t('logOut')}
                                </button>
                            ) : (
                                <button onClick={() => setShowAuth(true)} className="text-accent hover:text-ink">{t('logIn')}</button>
                            ))}
                            <button onClick={() => setShowChangelog(true)} className="text-ink-2 hover:text-ink" title="What's new">
                                v{APP_VERSION}
                            </button>
                            {onReload && (
                                <button onClick={onReload} className="text-ink-2 hover:text-ink" aria-label="Refresh data">
                                    {loading ? t('deskLoading') : t('deskRefresh')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <FreshnessStrip
                fresh={fresh}
                health={health}
                regime={status.regime}
                anchor={status.anchor}
                onOpenHealth={() => setShowHealth(true)}
            />
            <NoticeBanner notice={deskNotice(fresh.phase, fresh.actionableCount)} />

            <main className="mx-auto max-w-desk px-5 pb-8 sm:px-10">{children}</main>

            <footer className="mx-auto max-w-desk px-5 pb-24 sm:px-10 lg:pb-16">
                <p className="border-t border-rule-10 pt-3 font-mono text-[11px] leading-relaxed text-off">
                    {t('footerDisclaimer')}{' '}
                    <Link href="/help#disclaimer" className="text-accent hover:text-ink">{t('footerFull')}</Link>
                </p>
            </footer>

            {/* Mobile tab bar — the header nav is out of reach on a phone. */}
            <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-rule-14 bg-surface lg:hidden">
                {TABS.map((x) => (
                    <Link
                        key={x.id}
                        href={x.href}
                        className={clsx('flex-1 py-3.5 text-center text-[11px]',
                            tab === x.id ? 'font-bold text-ink' : 'text-ink-2')}
                    >
                        {t(x.shortKey)}
                    </Link>
                ))}
                <MobileMore active={tab === 'macro'} />
            </nav>

            {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
            {showAuth && <AuthModal onClose={() => setShowAuth(false)} signIn={auth.signIn} signUp={auth.signUp} />}
            {showHealth && <HealthDrawer status={status} fresh={fresh} onClose={() => setShowHealth(false)} />}
        </div>
    );
}
