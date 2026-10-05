'use client';

// The three paper books: AI book (rn_depth), Control (equal) and My book. Returns come after the
// scoreboard on purpose. CAGR and Sharpe stay hidden until a book has MIN_OBS_FOR_RATIOS observations.

import React from 'react';
import clsx from 'clsx';
import { TrackSection } from './trackParts';
import { useLanguage } from '@/components/LanguageContext';
import { recentErrorAlerts } from '@/lib/desk/health';
import { fill } from '@/lib/desk/text';
import {
    bookStats, cashSince, fmtPlainPct, fmtPt, fmtRet, ratiosMeaningful, toneClass,
    type BookStats, type LedgerBook,
} from '@/lib/desk/trackBooks';

function Cell({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
    return (
        <div className="min-w-0">
            <div className="font-mono text-[11px] text-ink-3">{label}</div>
            <div className={clsx('mt-1 font-mono text-[20px] font-semibold leading-none', className ?? 'text-ink')}>{value}</div>
            {sub && <div className="mt-1 font-mono text-[11px] text-ink-3">{sub}</div>}
        </div>
    );
}

function StatGrid({ s }: { s: BookStats }) {
    const { t } = useLanguage();
    const obs = s.observations != null ? fill(t('trkObs'), { n: s.observations }) : undefined;
    return (
        <>
            <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5">
                <Cell label={t('trkReturn')} value={fmtRet(s.returnPct)} sub={obs} className={toneClass(s.returnPct)} />
                <Cell label={fill(t('trkVsBench'), { bench: 'IWM' })} value={fmtPt(s.excessIwm)} sub={obs} className={toneClass(s.excessIwm)} />
                <Cell label={t('trkMaxDd')} value={fmtRet(s.maxDrawdown, 1)} className={toneClass(s.maxDrawdown)} />
                <Cell
                    label={t('trkWinRate')} value={fmtPlainPct(s.winRate)}
                    sub={s.closedTrades != null ? fill(t('trkOfClosed'), { n: s.closedTrades }) : undefined}
                />
                <Cell label={t('trkOpen')} value={s.openPositions != null ? String(s.openPositions) : '—'} />
                <Cell label={t('trkAvgHold')} value={s.avgHoldDays != null ? `${s.avgHoldDays} d` : '—'} />
            </div>
            {ratiosMeaningful(s.observations) ? (
                <p className="mt-4 font-mono text-[11px] text-ink-2">
                    {t('trkCagr')} <span className={toneClass(s.cagr)}>{fmtRet(s.cagr)}</span>
                    {' · '}{t('trkSharpe')} <span className="text-ink">{s.sharpe != null ? s.sharpe.toFixed(2) : '—'}</span>
                    {' · '}{obs}
                </p>
            ) : (
                <p className="mt-4 font-mono text-[11px] text-ink-3">
                    {fill(t('trkRatiosHidden'), { n: s.observations ?? '—' })}
                </p>
            )}
        </>
    );
}

function Column({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0 border-t-2 border-ink pt-3">
            <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
            {note && <p className="mt-0.5 text-[12px] text-ink-2">{note}</p>}
            {children}
        </div>
    );
}

export function PaperBooks({ ledgers, loggedIn }: {
    ledgers: { alerts?: { date?: string | null; detail?: string | null; severity?: string | null }[] | null; ledgers?: Record<string, LedgerBook | undefined> };
    loggedIn: boolean;
}) {
    const { t } = useLanguage();
    const books = ledgers.ledgers ?? {};
    const ai = books.rn_depth;
    const control = bookStats(books.equal);
    const aiStats = bookStats(ai);
    const mine = bookStats(books.mine);
    const cash = cashSince(ai);
    // Newest first; error-severity alerts from the last 7 days only (older ones are history).
    const alerts = recentErrorAlerts(ledgers.alerts, Date.now()).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

    return (
        <TrackSection title={t('trkBooksTitle')}>
            <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-3">
                <Column title={t('trkAiBook')} note={t('trkAiNote')}>
                    {aiStats ? <StatGrid s={aiStats} /> : <p className="mt-4 text-[12px] text-ink-3">—</p>}
                    {cash && <p className="mt-3 font-mono text-[11px] text-ink-2">{fill(t('trkCashSince'), { date: cash })}</p>}
                </Column>
                <Column title={t('trkControl')} note={t('trkControlNote')}>
                    {control ? <StatGrid s={control} /> : <p className="mt-4 text-[12px] text-ink-3">—</p>}
                </Column>
                <Column title={t('trkMyBook')} note={loggedIn && mine ? t('trkMyBookNote') : undefined}>
                    {!loggedIn
                        ? <p className="mt-4 max-w-[34ch] text-[13px] leading-snug text-ink-2">{t('trkMyBookOut')}</p>
                        : mine ? <StatGrid s={mine} /> : <p className="mt-4 max-w-[34ch] text-[13px] leading-snug text-ink-2">{t('trkMyBookEmpty')}</p>}
                </Column>
            </div>
            {alerts.length > 0 && (
                <p className="mt-5 font-mono text-[11px] text-warn">
                    {fill(t('trkAlertLine'), { date: alerts[0].date ?? '—', detail: alerts[0].detail ?? '' })}
                </p>
            )}
        </TrackSection>
    );
}
