'use client';

// Read-only system-health drawer, opened from the freshness strip's health dot.
// 420px, right side, 1px ink left border; Esc closes; Tab is trapped inside. Handbook README 5.6.

import React, { useCallback, useEffect, useRef } from 'react';
import { useLanguage } from '@/components/LanguageContext';
import { LEVEL_COLOR } from './FreshnessStrip';
import { fmtMd, fmtMdHm, type Freshness, type HealthLevel, type PaperAlert, type StatusInput } from '@/lib/desk/health';

function Dot({ level }: { level: HealthLevel | 'off' }) {
    return <span aria-hidden style={{ color: level === 'off' ? 'var(--off)' : LEVEL_COLOR[level] }}>●</span>;
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
    return (
        <section className="mt-5 border-t border-ink pt-3">
            <h3 className="text-[14px] font-semibold text-ink">
                {title}
                {sub && <span className="ml-2 text-[12px] font-normal text-ink-2">{sub}</span>}
            </h3>
            <div className="mt-2.5 space-y-1.5 font-mono text-[11px] text-ink-2">{children}</div>
        </section>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[110px_minmax(0,1fr)] items-baseline gap-x-3">
            <span className="font-sans text-[12px] text-ink-2">{label}</span>
            <span className="min-w-0 break-words">{children}</span>
        </div>
    );
}

export function HealthDrawer({ status, fresh, onClose }: {
    status: StatusInput;
    fresh: Freshness;
    onClose: () => void;
}) {
    const { t } = useLanguage();
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

    const { manifest, factor, regime, anchor } = status;
    const alerts: PaperAlert[] = [...(status.ledgers?.alerts ?? [])]
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const phaseA = fresh.phase === 'A';
    const mriWarnings = regime?.data_health_warnings?.length ?? null;

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end bg-black/30"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <aside
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-labelledby="health-title"
                tabIndex={-1}
                onKeyDown={onKeyDown}
                className="h-full w-[420px] max-w-full overflow-y-auto border-l border-ink bg-surface px-6 py-6 outline-none"
            >
                <div className="flex items-baseline justify-between gap-4">
                    <h2 id="health-title" className="text-[16px] font-bold tracking-head text-ink">{t('hdTitle')}</h2>
                    <button onClick={onClose} className="font-mono text-[11px] text-ink-2 hover:text-ink">✕ {t('hdClose')}</button>
                </div>
                <p className="mt-3 text-[13px] text-ink-2">{t('hdSub')}</p>

                <Section title={t('hdFreshness')}>
                    <Row label={t('fsPrices')}>
                        {fmtMdHm(fresh.pricesAsOf)}{' '}
                        <Dot level={fresh.pricesStale ? 'warn' : 'ok'} /> {fresh.pricesStale ? t('hdStale') : t('hdOk')} · {t('hdCadencePrices')}
                    </Row>
                    <Row label={t('fsBook')}>
                        {fmtMd(fresh.bookScoredAt)}{' '}
                        <Dot level={fresh.bookStale ? 'warn' : 'ok'} /> {fresh.bookStale ? t('hdStale') : t('hdOk')} · {t('hdCadenceBook')}
                    </Row>
                    <Row label={t('fsVerdict')}>
                        {phaseA
                            ? <span className="text-warn"><Dot level="warn" /> {t('fsAnalystNotLive')}</span>
                            : <>{fmtMd(fresh.verdictAt)} <Dot level={fresh.verdictStale ? 'warn' : 'ok'} /> {fresh.verdictStale ? t('hdStale') : t('hdOk')}</>}
                    </Row>
                </Section>

                <Section title={t('hdAnalyst')}>
                    <Row label={t('hdState')}>
                        {fresh.phase === null ? '—'
                            : phaseA ? <span className="text-warn">{t('hdStateNotLive')}</span> : t('hdStateLive')}
                    </Row>
                    <Row label={t('hdBaseline')}>
                        {fresh.phase === null ? '—' : `${fresh.rebuiltCount} of ${fresh.listSize ?? '—'}`}
                    </Row>
                    <Row label={t('hdMirror')}>
                        {/* TODO(data request): no published source for the real-money mirror state; static until one exists. */}
                        {t('hdMirrorHalted')}
                    </Row>
                </Section>

                <Section title={t('hdAlerts')} sub={t('hdPaperLedgers')}>
                    {alerts.length === 0
                        ? <div>{status.ledgers ? t('hdNoAlerts') : t('hdMissing')}</div>
                        : alerts.map((a, i) => (
                            <div key={`${a.date}-${a.kind}-${i}`} className="break-words">
                                <Dot level={a.severity === 'error' ? 'neg' : a.severity === 'warn' ? 'warn' : 'off'} />{' '}
                                {a.severity ?? '—'} · {fmtMd(a.date)} · {a.detail ?? '—'}
                            </div>
                        ))}
                </Section>

                <Section title={t('hdChecks')}>
                    {manifest
                        ? <>
                            <div><Dot level={manifest.ok === false ? 'neg' : 'ok'} /> {manifest.ok === false ? t('hdChainFail') : t('hdChainOk')}</div>
                            {(manifest.invariants ?? []).map((inv) => (
                                <div key={inv.name} className="break-words pl-4">
                                    <span style={{ color: inv.ok ? 'var(--pos)' : 'var(--neg)' }}>{inv.ok ? '✓' : '✕'}</span>{' '}
                                    {inv.name} · {inv.ok ? t('hdPass') : t('hdFail')} · {inv.level}
                                    {inv.detail && <span className="text-off"> · {inv.detail}</span>}
                                </div>
                            ))}
                        </>
                        : <div><Dot level="off" /> {t('hdChainManifest')}: {t('hdMissing')}</div>}
                    <div>
                        <Dot level={!factor ? 'off' : factor.discount_rate_source === 'anchor' ? 'ok' : 'warn'} />{' '}
                        {t('hdDiscount')}: {factor ? (factor.discount_rate_source ?? '—') : t('hdMissing')}
                    </div>
                    <div>
                        <Dot level={mriWarnings === null ? 'off' : mriWarnings > 0 || anchor?.degraded === true ? 'warn' : 'ok'} />{' '}
                        {t('hdMriWarnings')}: {mriWarnings ?? t('hdMissing')}
                        {anchor?.degraded === true && <span className="text-warn"> · {t('hdMriDegraded')}</span>}
                    </div>
                    <div>
                        <Dot level="off" /> {t('hdFollowup')}: {fresh.phase === 'C' ? t('hdOk') : t('hdNotLive')}
                    </div>
                </Section>
            </aside>
        </div>
    );
}
