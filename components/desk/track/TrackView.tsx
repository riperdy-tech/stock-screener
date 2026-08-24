'use client';

// Track Record — the public paper-trade record. Chart on top, then the
// append-only ledger, then the drill-downs (closed trades, full trade history)
// and the sold-too-early postmortem.

import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Chip, Micro, SectionHead } from '../primitives';
import { NavChart } from './NavChart';
import {
    BENCHMARKS, BOOKS, buildCurve, soldTooEarly, tradesByDate, type Trade,
} from '@/lib/desk/nav';
import { fmtDateShort, fmtMoney, fmtSignedPct } from '@/lib/desk/format';
import { useLanguage } from '@/components/LanguageContext';

const COMM_KEY = 'desk.commission';
// 25 bps per side is the rate the tracker itself now assumes.
const DEFAULT_COMM = '0.25';

// Always compared against the same three: small caps, large caps, tech.
// SOXX and DRAM stay available as chart lines, but they are not the yardstick.
const BENCH_ROWS = ['IWM', 'SPY', 'QQQ'] as const;

type BookKey = 'equal' | 'plan' | 'plan2' | 'plan3' | 'mine';

const CARDS: { key: BookKey; title: string; note: string }[] = [
    { key: 'equal', title: 'Equal-weight', note: 'the pure stock-picking test' },
    { key: 'plan', title: 'Plan · value core', note: 'kelly-sized · cash-heavy' },
    { key: 'plan2', title: 'Plan2 · hybrid', note: 'value core + quality sleeve' },
    { key: 'plan3', title: 'Plan3 · momentum', note: 'bold sleeve, kill-switch armed' },
    { key: 'mine', title: 'Mine', note: 'your saved portfolio' },
];

function pctClass(v: number | null | undefined) {
    if (v == null) return 'text-ink-3';
    return v > 0 ? 'text-pos' : v < 0 ? 'text-neg' : 'text-ink-2';
}

/**
 * One strategy book. The RS2-picked twin leads — this desk is AI-first — and the
 * quant book it is measured against sits beside it as the control.
 */
function StatCard({ book, llm, title, note, active, onClick }: {
    book: any; llm: any; title: string; note: string;
    active: boolean; onClick: () => void;
}) {
    const s = book?.summary;
    const sl = llm?.summary;
    type Kind = 'signed' | 'pct' | 'num' | 'count';
    // AI column first, quant second.
    const rows: [string, number | null | undefined, number | null | undefined, Kind][] = [
        ['Cum', sl?.cumulative_return_pct, s?.cumulative_return_pct, 'signed'],
        ['CAGR', sl?.cagr_pct, s?.cagr_pct, 'signed'],
        ['Max DD', sl?.max_drawdown_pct, s?.max_drawdown_pct, 'signed'],
        ['Sharpe', sl?.sharpe, s?.sharpe, 'num'],
        ['Win', sl?.win_rate_pct, s?.win_rate_pct, 'pct'],
        ['Open', sl?.open_positions, s?.open_positions, 'count'],
        ...BENCH_ROWS.map((b) => [
            `vs ${b}`, sl?.excess_vs?.[b], s?.excess_vs?.[b], 'signed',
        ] as [string, number | null | undefined, number | null | undefined, Kind]),
    ];
    const cell = (v: number | null | undefined, kind: Kind) => {
        if (v == null) return '\u2014';
        if (kind === 'signed') return fmtSignedPct(v);
        if (kind === 'pct') return `${v.toFixed(1)}%`;
        if (kind === 'count') return String(Math.round(v));
        return v.toFixed(2);
    };
    const diff = (sl?.cumulative_return_pct != null && s?.cumulative_return_pct != null)
        ? sl.cumulative_return_pct - s.cumulative_return_pct : null;
    // The headline figure is the AI book's, falling back to the quant book where
    // the A/B has not started (plan3 and mine have no LLM twin).
    const lead = sl?.cumulative_return_pct ?? s?.cumulative_return_pct;

    return (
        <button
            onClick={onClick}
            className={clsx('block w-full min-w-0 overflow-hidden border-t border-rule-14 px-3 py-3 text-left',
                active && 'bg-hover')}
        >
            <div className="flex items-baseline justify-between gap-2">
                <Micro className={clsx('truncate', active && 'text-ink')}>{title}</Micro>
                {diff != null && (
                    <span className={clsx('shrink-0 font-mono text-[11px]', diff >= 0 ? 'text-pos' : 'text-neg')}>
                        AI {diff >= 0 ? '+' : '\u2212'}{Math.abs(diff).toFixed(1)}pts
                    </span>
                )}
            </div>
            <div className={clsx('mt-1.5 font-mono text-[22px] leading-none', pctClass(lead))}>
                {lead != null ? fmtSignedPct(lead) : '\u2014'}
            </div>
            <div className="mt-1 text-[11px] leading-snug text-ink-3">{note}</div>

            {!book && <div className="mt-2 text-[11px] text-ink-3">no ledger yet</div>}

            {book && (
                <table className="mt-2.5 w-full table-fixed font-mono text-[11px]">
                    <thead>
                        <tr className="text-ink-3">
                            <th className="w-[38%] text-left font-normal" />
                            <th className="w-[31%] text-right font-normal text-accent">AI</th>
                            <th className="w-[31%] text-right font-normal">quant</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(([label, ai, quant, kind]) => (
                            <tr key={label}>
                                <td className="truncate py-px text-ink-3">{label}</td>
                                <td className={clsx('py-px text-right', kind === 'signed' ? pctClass(ai) : 'text-ink')}>
                                    {cell(ai, kind)}
                                </td>
                                <td className={clsx('py-px text-right opacity-70', kind === 'signed' ? pctClass(quant) : 'text-ink-2')}>
                                    {cell(quant, kind)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </button>
    );
}

export function TrackView({ ledgers, loggedIn, onOpenTicker }: {
    ledgers: any;
    loggedIn: boolean;
    onOpenTicker: (t: string) => void;
}) {
    const { t } = useLanguage();
    const [commInput, setCommInput] = useState(DEFAULT_COMM);
    const [ledgerView, setLedgerView] = useState<BookKey>('equal');
    const [posSource, setPosSource] = useState<'baseline' | 'llm'>('llm');
    const [tradeQuery, setTradeQuery] = useState('');
    // Opens on the AI book against all three benchmarks; the quant books are
    // one click away rather than crowding the first read.
    const [visible, setVisible] = useState<Record<string, boolean>>({
        equal_llm: true, IWM: true, SPY: true, QQQ: true,
    });

    useEffect(() => {
        const saved = localStorage.getItem(COMM_KEY);
        if (saved !== null) setCommInput(saved);
    }, []);

    const commission = Number.parseFloat(commInput);
    const commissionPct = Number.isFinite(commission) && commission >= 0 ? commission : 0;

    const curve = useMemo(() => buildCurve(ledgers, commissionPct), [ledgers, commissionPct]);
    const early = useMemo(() => soldTooEarly(ledgers), [ledgers]);

    const books = ledgers?.ledgers ?? {};
    const posKey = posSource === 'llm' && books[`${ledgerView}_llm`] ? `${ledgerView}_llm` : ledgerView;
    const active = books[posKey];

    const holdings = useMemo(() => {
        const h = active?.state?.holdings ?? {};
        const marks = active?.last_marks ?? {};
        return Object.entries(h).map(([ticker, v]: [string, any]) => {
            const now = marks[ticker] ?? null;
            const pl = now != null && v.entry_price ? (now / v.entry_price - 1) * 100 : null;
            return { ticker, entry_date: v.entry_date, entry_price: v.entry_price, now, pl };
        }).sort((a, b) => (b.pl ?? -1e9) - (a.pl ?? -1e9));
    }, [active]);

    /** One row per trading day, including the days nothing happened. */
    const activity = useMemo(() => {
        const byDate = tradesByDate(active?.trades);
        const dates = (active?.nav_series ?? []).map((p: any) => p.date).filter(Boolean).reverse();
        return dates.slice(0, 40).map((date: string) => ({
            date,
            trades: byDate.get(date) ?? [],
        }));
    }, [active]);

    const closed = useMemo(
        () => [...(active?.closed ?? [])].sort((a: any, b: any) => (b.exit_date ?? '').localeCompare(a.exit_date ?? '')),
        [active],
    );

    const tradeRows = useMemo(() => {
        const q = tradeQuery.trim().toUpperCase();
        const all: Trade[] = [...(active?.trades ?? [])].reverse();
        return (q ? all.filter((t) => t.ticker?.includes(q) || (t.date ?? '').includes(q)) : all).slice(0, 500);
    }, [active, tradeQuery]);

    if (!ledgers?.ledgers) {
        return <p className="py-16 text-[13px] text-ink-2">No paper ledger yet — run the chain once to create one.</p>;
    }

    const heldCount = Object.keys(active?.state?.holdings ?? {}).length;

    return (
        <div>
            {/* Header + what-if costs */}
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 py-7">
                <div className="max-w-[620px]">
                    <h1 className="text-[22px] font-bold leading-snug tracking-head text-ink">
                        {t('trackHeadline')}
                    </h1>
                    <p className="mt-2 text-[12.5px] text-ink-2">
                        {t('trackSub')} Live since {ledgers.inception ?? '—'}.
                    </p>
                </div>
                <div>
                    <Micro className="block">{t('trackWhatIf')}</Micro>
                    <div className="mt-1.5 flex items-baseline gap-2 border border-rule-24 px-2.5 py-1">
                        <input
                            type="number" min={0} max={1} step={0.05}
                            value={commInput}
                            onChange={(e) => { setCommInput(e.target.value); localStorage.setItem(COMM_KEY, e.target.value); }}
                            aria-label="Commission percent per trade"
                            className="w-[52px] bg-transparent font-mono text-[12px] font-semibold text-ink outline-none"
                        />
                        <Micro className="text-ink-3">{t('trackPerTrade')}</Micro>
                    </div>
                    <Micro className="mt-1.5 block text-ink-3">
                        {((ledgers.config?.cost_bps ?? 10) / 100).toFixed(2)}% baked into the ledger · recosts every trade
                    </Micro>
                </div>
            </div>

            {/* Strategy stat band */}
            <div className="grid grid-cols-1 gap-x-5 border-t border-rule-14 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {CARDS.map((c) => (
                    <StatCard
                        key={c.key}
                        book={books[c.key]}
                        llm={books[`${c.key}_llm`]}
                        title={c.title}
                        note={c.key === 'mine' && !loggedIn ? 'log in and save a portfolio snapshot' : c.note}
                        active={ledgerView === c.key}
                        onClick={() => setLedgerView(c.key)}
                    />
                ))}
            </div>

            {(books.plan3?.state?.halted || books.plan3?.state?.risk_tier) && (
                <div className="flex flex-wrap items-center gap-3 border-t border-rule-14 pt-4">
                    {books.plan3?.state?.halted ? (
                        <span className="font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-neg">
                            \u25a0 PLAN3 HALTED \u2014 kill switch fired
                        </span>
                    ) : (
                        <span className="font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-warn">
                            PLAN3 DE-RISK TIER {books.plan3.state.risk_tier}
                        </span>
                    )}
                </div>
            )}

            <NavChart
                curve={curve}
                visible={visible}
                onToggle={(k) => setVisible((v) => ({ ...v, [k]: !v[k] }))}
                commission={commissionPct}
                commissionLabel={commInput}
            />

            {/* THE LEDGER */}
            <section className="mt-9">
                <SectionHead
                    title={t('trackLedger')}
                    note={`${BOOKS.find((b) => b.key === posKey)?.label ?? posKey} — every position held and every trade made, appended daily`}
                    right={
                        <span className="flex items-center gap-2">
                            <Chip active={posSource === 'baseline'} onClick={() => setPosSource('baseline')} className="px-2.5 py-1 text-[11px]">Quant</Chip>
                            <Chip active={posSource === 'llm'} onClick={() => setPosSource('llm')} className="px-2.5 py-1 text-[11px]">RS2 AI</Chip>
                        </span>
                    }
                />

                {!active ? (
                    <p className="py-6 text-[12px] text-ink-3">
                        {ledgerView === 'mine' && !loggedIn
                            ? 'Log in and save a My Portfolio snapshot to track your own book here.'
                            : 'This book has no ledger yet.'}
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-x-11 lg:grid-cols-[1fr_1.15fr]">
                        {/* Current holdings */}
                        <div className="min-w-0 py-5">
                            <Micro className="block">{t('trackHoldings')} · {heldCount}</Micro>
                            <div className="mt-3 grid grid-cols-[70px_70px_1fr_1fr_60px] gap-x-3 border-b border-rule-18 pb-2">
                                <Micro>Ticker</Micro><Micro>Entered</Micro>
                                <Micro className="text-right">Entry</Micro><Micro className="text-right">Now</Micro>
                                <Micro className="text-right">P&amp;L</Micro>
                            </div>
                            {holdings.slice(0, 25).map((h) => (
                                <div
                                    key={h.ticker}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onOpenTicker(h.ticker)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') onOpenTicker(h.ticker); }}
                                    className="grid cursor-pointer grid-cols-[70px_70px_1fr_1fr_60px] gap-x-3 border-b border-rule-10 py-2 hover:bg-hover"
                                >
                                    <span className="font-mono text-[11.5px] font-semibold text-ink">{h.ticker}</span>
                                    <span className="font-mono text-[11px] text-ink-3">{fmtDateShort(h.entry_date)}</span>
                                    <span className="text-right font-mono text-[11px] text-ink-2">{fmtMoney(h.entry_price)}</span>
                                    <span className="text-right font-mono text-[11px] text-ink-2">{fmtMoney(h.now)}</span>
                                    <span className={clsx('text-right font-mono text-[11px]', pctClass(h.pl))}>
                                        {h.pl == null ? '—' : fmtSignedPct(h.pl)}
                                    </span>
                                </div>
                            ))}
                            {holdings.length > 25 && (
                                <Micro className="mt-2 block text-ink-3">+ {holdings.length - 25} more</Micro>
                            )}
                        </div>

                        {/* Daily activity */}
                        <div className="min-w-0 py-5">
                            <Micro className="block">{t('trackActivity')}</Micro>
                            <div className="scroll-dark mt-3 max-h-[520px] overflow-y-auto">
                                {activity.map(({ date, trades }: { date: string; trades: Trade[] }) => (
                                    <div key={date} className="grid grid-cols-[70px_1fr] gap-x-3 border-b border-rule-10 py-2">
                                        <span className="font-mono text-[11px] text-ink-3">{fmtDateShort(date)}</span>
                                        <span className="min-w-0">
                                            {trades.length === 0 ? (
                                                <span className="text-[11px] text-ink-3">— {t('trackNoChanges')} · {heldCount} {t('trackPositionsHeld')}</span>
                                            ) : trades.map((t, i) => (
                                                <span key={i} className="block text-[11px] text-ink-2">
                                                    <span className={clsx('font-mono font-semibold', t.side === 'buy' ? 'text-pos' : 'text-neg')}>
                                                        {t.side.toUpperCase()}
                                                    </span>{' '}
                                                    <button onClick={() => onOpenTicker(t.ticker)} className="font-semibold text-ink hover:text-accent">
                                                        {t.ticker}
                                                    </button>{' '}
                                                    <span className="font-mono text-ink-3">{fmtMoney(t.price)}</span>
                                                    {t.reason && <span className="text-ink-3"> · {t.reason}</span>}
                                                </span>
                                            ))}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <Micro className="mt-2 block text-ink-3">
                                Append-only — {(active.nav_series ?? []).length} days on file
                            </Micro>
                        </div>
                    </div>
                )}
            </section>

            {/* Closed trades */}
            {closed.length > 0 && (
                <section className="mt-8">
                    <SectionHead title={t('trackClosed')} note={`${closed.length} round trips · win rate ${active?.summary?.win_rate_pct ?? '—'}%`} />
                    <div className="scroll-dark mt-3 max-h-[400px] overflow-y-auto">
                        <div className="grid grid-cols-[70px_80px_80px_60px_80px_90px] gap-x-3 border-b border-rule-18 pb-2">
                            <Micro>Ticker</Micro><Micro>Entered</Micro><Micro>Exited</Micro>
                            <Micro className="text-right">Days</Micro><Micro className="text-right">Return</Micro>
                            <Micro className="text-right">Post-exit</Micro>
                        </div>
                        {closed.map((c: any, i: number) => (
                            <div key={`${c.ticker}-${c.exit_date}-${i}`} className="grid grid-cols-[70px_80px_80px_60px_80px_90px] gap-x-3 border-b border-rule-10 py-2">
                                <button onClick={() => onOpenTicker(c.ticker)} className="text-left font-mono text-[11.5px] font-semibold text-ink hover:text-accent">
                                    {c.ticker}
                                </button>
                                <span className="font-mono text-[11px] text-ink-3">{fmtDateShort(c.entry_date)}</span>
                                <span className="font-mono text-[11px] text-ink-3">{fmtDateShort(c.exit_date)}</span>
                                <span className="text-right font-mono text-[11px] text-ink-3">{c.hold_days}</span>
                                <span className={clsx('text-right font-mono text-[11px]', pctClass(c.return_pct))}>{fmtSignedPct(c.return_pct)}</span>
                                <span className={clsx('text-right font-mono text-[11px]', pctClass(c.post_exit_return_pct))}>
                                    {c.post_exit_return_pct == null ? '—' : fmtSignedPct(c.post_exit_return_pct)}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Full trade history */}
            <section className="mt-8">
                <SectionHead
                    title={t('trackHistory')}
                    note={`${(active?.trades ?? []).length} trades on file · latest 500 shown`}
                    right={
                        <input
                            value={tradeQuery}
                            onChange={(e) => setTradeQuery(e.target.value)}
                            placeholder="FILTER TICKER OR DATE"
                            aria-label="Filter trades"
                            className="w-[180px] border border-rule-24 bg-transparent px-2.5 py-1 font-mono font-semibold text-[11px] uppercase tracking-[.06em] text-ink placeholder:text-ink-3"
                        />
                    }
                />
                <div className="scroll-dark mt-3 max-h-[360px] overflow-y-auto">
                    {tradeRows.map((t, i) => (
                        <div key={`${t.ticker}-${t.date}-${i}`} className="grid grid-cols-[80px_50px_70px_80px_1fr] gap-x-3 border-b border-rule-10 py-1.5">
                            <span className="font-mono text-[11px] text-ink-3">{t.date}</span>
                            <span className={clsx('font-mono text-[11px] font-semibold', t.side === 'buy' ? 'text-pos' : 'text-neg')}>
                                {t.side.toUpperCase()}
                            </span>
                            <button onClick={() => onOpenTicker(t.ticker)} className="text-left font-mono text-[11px] font-semibold text-ink hover:text-accent">
                                {t.ticker}
                            </button>
                            <span className="text-right font-mono text-[11px] text-ink-2">{fmtMoney(t.price)}</span>
                            <span className="truncate text-[11px] text-ink-3">{t.reason ?? ''}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Postmortem */}
            {early.length > 0 && (
                <div className="mt-8 border-t border-rule-14 pt-4">
                    <span className="font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-warn">
                        {t('trackSoldEarly')} · {early.length}
                    </span>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">
                        {early.slice(0, 4).map((c) => `${c.ticker} exited ${fmtSignedPct(c.return_pct)}, ${fmtSignedPct(c.post_exit_return_pct)} in the ${c.post_exit_days} days after`).join(' · ')}
                        . A recurring pattern here means the exit rule needs work.
                    </p>
                </div>
            )}
        </div>
    );
}
