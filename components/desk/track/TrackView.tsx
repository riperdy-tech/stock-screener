'use client';

// Track record: the public paper-trade record. The verdict scoreboard leads (counts before any
// return), then the three paper books, growth of 100, and the append-only ledger of the AI book
// with its drill-downs (holdings, closed round trips, full history, sold too early).

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Chip, Micro } from '../primitives';
import { NavChart } from './NavChart';
import { PaperBooks } from './PaperBooks';
import { ScoreboardView } from './ScoreboardView';
import { TrackSection } from './trackParts';
import { useLanguage } from '@/components/LanguageContext';
import { buildCurve, soldTooEarly, type Trade } from '@/lib/desk/nav';
import { fmtDateShort, fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import { stockHref } from '@/lib/desk/stockPage';
import { fill } from '@/lib/desk/text';
import {
    bookStart, cashSince, ledgerRows, reasonFallback, reasonKey, toneClass, fmtPlainPct,
} from '@/lib/desk/trackBooks';
import { buildScoreboard } from '@/lib/desk/trackScoreboard';

const COMM_KEY = 'desk.commission';   // stored as percent per side ("0.25"), as before
// 25 bps per side is the rate the tracker itself now assumes.
const DEFAULT_BPS = '25';
const BACK = '/track';

type DrillKey = 'holdings' | 'closed' | 'history' | 'early';

const DRILLS: { key: DrillKey; label: 'trkLinkHoldings' | 'trkLinkClosed' | 'trkLinkHistory' | 'trkLinkEarly' }[] = [
    { key: 'holdings', label: 'trkLinkHoldings' },
    { key: 'closed', label: 'trkLinkClosed' },
    { key: 'history', label: 'trkLinkHistory' },
    { key: 'early', label: 'trkLinkEarly' },
];

// `ledgers` and `outcomes` are the raw JSON payloads (loosely typed upstream); every read below is
// through the typed helpers in lib/desk/track*.ts or a null-guarded field access.
export function TrackView({ ledgers, outcomes, outcomesLoaded, loggedIn, loading }: {
    ledgers: any;   // eslint-disable-line @typescript-eslint/no-explicit-any -- raw paper_ledgers.json
    outcomes: any;  // eslint-disable-line @typescript-eslint/no-explicit-any -- raw depth_outcomes.json
    outcomesLoaded: boolean;
    loggedIn: boolean;
    loading: boolean;
}) {
    const { t } = useLanguage();
    const [costBps, setCostBps] = useState(DEFAULT_BPS);
    const [open, setOpen] = useState<Record<DrillKey, boolean>>({ holdings: false, closed: false, history: false, early: false });
    const [tradeQuery, setTradeQuery] = useState('');
    // Opens on the AI book and Control against QQQ, the books' benchmark; SPY and IWM are one click away, SOXX and DRAM sit behind "+ more".
    const [visible, setVisible] = useState<Record<string, boolean>>({
        rn_depth: true, equal: true, QQQ: true, SPY: false, IWM: false,
    });

    useEffect(() => {
        try {
            const saved = localStorage.getItem(COMM_KEY);
            const pct = saved === null ? NaN : Number.parseFloat(saved);
            if (Number.isFinite(pct) && pct >= 0) setCostBps(String(Math.round(pct * 100 * 1e4) / 1e4));
        } catch { /* storage unavailable: keep the default */ }
    }, []);

    const onCostBps = (v: string) => {
        setCostBps(v);
        const n = Number.parseFloat(v);
        if (Number.isFinite(n) && n >= 0) {
            try { localStorage.setItem(COMM_KEY, String(n / 100)); } catch { /* ignore */ }
        }
    };

    const bps = Number.parseFloat(costBps);
    const commissionPct = Number.isFinite(bps) && bps >= 0 ? bps / 100 : 0;

    const books = ledgers?.ledgers ?? {};
    const ai = books.rn_depth;
    const curve = useMemo(() => buildCurve(ledgers, commissionPct), [ledgers, commissionPct]);
    const early = useMemo(() => soldTooEarly(ledgers), [ledgers]);
    const board = useMemo(() => buildScoreboard(outcomes), [outcomes]);
    const rows = useMemo(() => ledgerRows(ai), [ai]);
    const cash = cashSince(ai);
    const since = bookStart(ai) ?? ledgers?.inception ?? '—';

    const holdings = useMemo(() => {
        const h = ai?.state?.holdings ?? {};
        const marks = ai?.last_marks ?? {};
        return Object.entries(h).map(([ticker, v]) => {
            const x = v as { entry_date?: string; entry_price?: number };
            const now: number | null = marks[ticker] ?? null;
            const pl = now != null && x.entry_price ? (now / x.entry_price - 1) * 100 : null;
            return { ticker, entry_date: x.entry_date, entry_price: x.entry_price, now, pl };
        }).sort((a, b) => (b.pl ?? -1e9) - (a.pl ?? -1e9));
    }, [ai]);

    const closed = useMemo(
        () => [...(ai?.closed ?? [])].sort((a: { exit_date?: string }, b: { exit_date?: string }) => (b.exit_date ?? '').localeCompare(a.exit_date ?? '')),
        [ai],
    );

    const tradeRows = useMemo(() => {
        const q = tradeQuery.trim().toUpperCase();
        const all: Trade[] = [...(ai?.trades ?? [])].reverse();
        return (q ? all.filter((x) => x.ticker?.includes(q) || (x.date ?? '').includes(q)) : all).slice(0, 500);
    }, [ai, tradeQuery]);

    if (!ledgers?.ledgers) {
        return <p className="py-16 text-[13px] text-ink-2">{loading ? t('pgLoading') : t('trkNoLedger')}</p>;
    }

    const toggle = (k: DrillKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));
    const tickerLink = (tk: string, cls?: string) => (
        <Link href={stockHref(tk, BACK)} className={clsx('font-mono font-semibold text-ink hover:text-accent', cls)}>{tk}</Link>
    );
    const reasonText = (code: string | undefined) => {
        const k = reasonKey(code);
        return k ? t(k) : reasonFallback(code);
    };
    const sideText = (s: string) => (s === 'buy' ? t('trkSideBuy') : s === 'sell' ? t('trkSideSell') : s);
    const colHead = 'font-mono text-[11px] text-ink-3';
    const heldNow = holdings.length;

    return (
        <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-head text-ink">{t('trackHeadline')}</h1>
            <p className="mt-2 text-[14px] text-ink-2">{t('trackSub')}</p>

            {/* TODO(data request): record_epoch. Show unless deskPhase is C AND rn_depth has trades dated after a go-live date; no go-live field exists yet, so always. */}
            <p
                role="note"
                className="mt-5 border-l-2 px-3.5 py-2.5 text-[13.5px] leading-snug text-ink"
                style={{ background: 'color-mix(in oklch, var(--warn) 10%, var(--bg))', borderLeftColor: 'var(--warn)' }}
            >
                {cash ? fill(t('trkBanner'), { date: cash }) : t('trkBannerNoCash')}
            </p>

            {/* Record switch. Only the archived record has data; the go-live record starts later. */}
            <div className="mt-5 flex flex-wrap items-baseline gap-x-2.5 gap-y-2">
                <Chip active className="font-mono text-[11px]" aria-pressed>{t('trkChipArchived')}</Chip>
                <Chip disabled aria-describedby="golive-note" className="font-mono text-[11px] opacity-60">{t('trkChipGoLive')}</Chip>
                <span id="golive-note" className="font-mono text-[11px] text-ink-3">({t('trkGoLiveNote')})</span>
                <span className="font-mono text-[11px] text-ink-2">
                    {fill(t('trkPaperLine'), { bps: ledgers.config?.cost_bps ?? '—', date: since })}
                </span>
            </div>

            <ScoreboardView board={board} loaded={outcomesLoaded} />

            <PaperBooks ledgers={ledgers} loggedIn={loggedIn} />

            <TrackSection title={t('trkGrowthTitle')}>
                <NavChart
                    curve={curve}
                    visible={visible}
                    onToggle={(k) => setVisible((v) => ({ ...v, [k]: !v[k] }))}
                    commission={commissionPct}
                    costBps={costBps}
                    onCostBps={onCostBps}
                    // TODO(data request): record_epoch. Pass the go-live date as resetDate once the data carries it.
                />
                <Micro className="mt-1 block text-ink-3">
                    {fill(t('trkCostNote'), { bps: ledgers.config?.cost_bps ?? '—' })}
                </Micro>
            </TrackSection>

            {/* THE LEDGER — AI book */}
            <TrackSection title={t('trackLedger')} sub={t('trkAiBook')}>
                {!ai ? (
                    <p className="mt-4 text-[12px] text-ink-3">—</p>
                ) : (
                    <>
                        <div className="scroll-dark mt-4 max-h-[420px] overflow-y-auto">
                            <div className={clsx('hidden grid-cols-[110px_70px_80px_100px_1fr] gap-x-3 border-b border-rule-18 pb-2 sm:grid', colHead)}>
                                <span>{t('trkColDate')}</span><span>{t('trkColSide')}</span><span>{t('trkColTicker')}</span>
                                <span>{t('trkColPrice')}</span><span>{t('trkColReason')}</span>
                            </div>
                            {rows.map((r, i) => (
                                <div
                                    key={`${r.date}-${r.trade?.ticker ?? 'none'}-${i}`}
                                    className="grid grid-cols-[88px_44px_56px_1fr] gap-x-3 gap-y-0.5 border-b border-rule-10 py-2 text-[12.5px] sm:grid-cols-[110px_70px_80px_100px_1fr]"
                                >
                                    <span className="font-mono text-[11.5px] text-ink-2">{r.date}</span>
                                    {r.trade ? (
                                        <>
                                            <span className="font-mono text-[11.5px] text-ink-2">{sideText(r.trade.side)}</span>
                                            {tickerLink(r.trade.ticker, 'text-[12px]')}
                                            <span className="font-mono text-[11.5px] text-ink-2">{fmtMoney(r.trade.price)}</span>
                                            <span className="col-span-4 text-ink-2 sm:col-span-1">{reasonText(r.trade.reason)}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="font-mono text-[11.5px] text-ink-3">—</span>
                                            <span /><span />
                                            <span className="col-span-4 text-ink-3 sm:col-span-1">
                                                {t('trackNoChanges')} · {r.held} {t('trkHeld')}
                                            </span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        <Micro className="mt-2 block text-ink-3">
                            {fill(t('trkAppendOnly'), { n: (ai.nav_series ?? []).length })}
                        </Micro>

                        <p className="mt-4 font-mono text-[11px] text-accent">
                            {DRILLS.map((d, i) => (
                                <React.Fragment key={d.key}>
                                    {i > 0 && <span className="text-off"> · </span>}
                                    <button
                                        type="button"
                                        onClick={() => toggle(d.key)}
                                        aria-expanded={open[d.key]}
                                        className={clsx('hover:text-ink', open[d.key] && 'font-semibold text-ink')}
                                    >
                                        {t(d.label)}
                                    </button>
                                </React.Fragment>
                            ))}
                            <span aria-hidden> ▸</span>
                        </p>

                        {open.holdings && (
                            <div className="mt-4 border-t border-rule-10 pt-3">
                                <Micro className="block">{t('trackHoldings')} · {heldNow}</Micro>
                                {holdings.length === 0 ? (
                                    <p className="mt-2 text-[12px] text-ink-3">{t('trkNoHoldings')}</p>
                                ) : (
                                    <>
                                        <div className={clsx('mt-3 grid grid-cols-[64px_repeat(3,minmax(0,1fr))] gap-x-3 border-b border-rule-18 pb-2 sm:grid-cols-[70px_80px_1fr_1fr_70px]', colHead)}>
                                            <span>{t('trkColTicker')}</span><span className="hidden sm:block">{t('trkColEntered')}</span>
                                            <span className="text-right">{t('trkColEntry')}</span><span className="text-right">{t('trkColNow')}</span>
                                            <span className="text-right">{t('trkColPL')}</span>
                                        </div>
                                        {holdings.map((h) => (
                                            <div key={h.ticker} className="grid grid-cols-[64px_repeat(3,minmax(0,1fr))] gap-x-3 border-b border-rule-10 py-2 sm:grid-cols-[70px_80px_1fr_1fr_70px]">
                                                {tickerLink(h.ticker, 'text-[11.5px]')}
                                                <span className="hidden font-mono text-[11px] text-ink-3 sm:block">{fmtDateShort(h.entry_date)}</span>
                                                <span className="text-right font-mono text-[11px] text-ink-2">{fmtMoney(h.entry_price)}</span>
                                                <span className="text-right font-mono text-[11px] text-ink-2">{fmtMoney(h.now)}</span>
                                                <span className={clsx('text-right font-mono text-[11px]', toneClass(h.pl))}>{h.pl == null ? '—' : fmtSignedPct(h.pl)}</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}

                        {open.closed && (
                            <div className="mt-4 border-t border-rule-10 pt-3">
                                <Micro className="block">
                                    {t('trackClosed')} · {fill(t('trkClosedNote'), { n: closed.length, w: fmtPlainPct(ai.summary?.win_rate_pct) })}
                                </Micro>
                                {closed.length === 0 ? (
                                    <p className="mt-2 text-[12px] text-ink-3">{t('trkNoClosed')}</p>
                                ) : (
                                    <div className="scroll-dark mt-3 max-h-[400px] overflow-y-auto">
                                        <div className={clsx('hidden grid-cols-[70px_80px_80px_60px_80px_90px] gap-x-3 border-b border-rule-18 pb-2 sm:grid', colHead)}>
                                            <span>{t('trkColTicker')}</span><span>{t('trkColEntered')}</span><span>{t('trkColExited')}</span>
                                            <span className="text-right">{t('trkColDays')}</span><span className="text-right">{t('trkReturn')}</span>
                                            <span className="text-right">{t('trkColPostExit')}</span>
                                        </div>
                                        {closed.map((c: { ticker: string; entry_date: string; exit_date: string; hold_days: number; return_pct: number; post_exit_return_pct: number | null }, i: number) => (
                                            <div key={`${c.ticker}-${c.exit_date}-${i}`} className="grid grid-cols-3 gap-x-3 gap-y-1 border-b border-rule-10 py-2 font-mono text-[11px] sm:grid-cols-[70px_80px_80px_60px_80px_90px]">
                                                {tickerLink(c.ticker, 'text-[11.5px]')}
                                                <span className="text-ink-3"><span className="sm:hidden">{t('trkColEntered')} </span>{fmtDateShort(c.entry_date)}</span>
                                                <span className="text-ink-3"><span className="sm:hidden">{t('trkColExited')} </span>{fmtDateShort(c.exit_date)}</span>
                                                <span className="text-ink-3 sm:text-right"><span className="sm:hidden">{t('trkColDays')} </span>{c.hold_days}</span>
                                                <span className={clsx('sm:text-right', toneClass(c.return_pct))}><span className="text-ink-3 sm:hidden">{t('trkReturn')} </span>{fmtSignedPct(c.return_pct)}</span>
                                                <span className={clsx('sm:text-right', toneClass(c.post_exit_return_pct))}>
                                                    <span className="text-ink-3 sm:hidden">{t('trkColPostExit')} </span>
                                                    {c.post_exit_return_pct == null ? '—' : fmtSignedPct(c.post_exit_return_pct)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {open.history && (
                            <div className="mt-4 border-t border-rule-10 pt-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                                    <Micro>{t('trackHistory')} · {fill(t('trkHistNote'), { n: (ai.trades ?? []).length })}</Micro>
                                    <input
                                        value={tradeQuery}
                                        onChange={(e) => setTradeQuery(e.target.value)}
                                        placeholder={t('trkFilter')}
                                        aria-label={t('trkFilterAria')}
                                        className="w-full border border-rule-24 bg-transparent px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[.06em] text-ink placeholder:text-ink-3 sm:w-[210px]"
                                    />
                                </div>
                                <div className="scroll-dark mt-3 max-h-[360px] overflow-y-auto">
                                    {tradeRows.map((x, i) => (
                                        <div key={`${x.ticker}-${x.date}-${i}`} className="grid grid-cols-[88px_44px_56px_1fr] gap-x-3 gap-y-0.5 border-b border-rule-10 py-1.5 sm:grid-cols-[100px_60px_80px_90px_1fr]">
                                            <span className="font-mono text-[11px] text-ink-3">{x.date}</span>
                                            <span className="font-mono text-[11px] text-ink-2">{sideText(x.side)}</span>
                                            {tickerLink(x.ticker, 'text-[11px]')}
                                            <span className="font-mono text-[11px] text-ink-2">{fmtMoney(x.price)}</span>
                                            <span className="col-span-4 text-[11px] text-ink-3 sm:col-span-1">{reasonText(x.reason)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {open.early && (
                            <div className="mt-4 border-t border-rule-10 pt-3">
                                <span className="font-mono text-[11px] font-semibold uppercase tracking-[.05em] text-warn">
                                    {t('trackSoldEarly')} · {early.length}
                                </span>
                                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">
                                    {early.length === 0
                                        ? t('trkNoEarly')
                                        : `${early.slice(0, 4).map((c) => fill(t('trkEarlyLine'), {
                                            ticker: c.ticker, ret: fmtSignedPct(c.return_pct),
                                            post: fmtSignedPct(c.post_exit_return_pct), days: c.post_exit_days,
                                        })).join(' · ')}. ${t('trkEarlyTail')}`}
                                </p>
                            </div>
                        )}
                    </>
                )}
            </TrackSection>
        </div>
    );
}
