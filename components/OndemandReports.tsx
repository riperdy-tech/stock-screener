'use client';

// On-demand analyses: a ticker requested here or with Telegram /analyze goes to the Qwen worker on the operator's
// PC (rs2-local tools/site/qwen_ondemand.py, operator 2026-11-06). Queued requests run before the worker's refresh
// of the screener's research-now and watchlist names. Each result is the stock page's Qwen panel; this page lists
// the newest ones. Paper only: on-demand names never join a paper book.

import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Shell } from '@/components/desk/Shell';
import { Micro } from '@/components/desk/primitives';
import Link from 'next/link';
import { plainNoValueReason } from '@/lib/desk/qwenText';
import { fetchQwenOverlay, type OndemandQueueRow, type QwenOverlayPayload } from '@/lib/data-service';

const money = (v: number | null | undefined) =>
    v == null ? '—' : Math.abs(v) >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`;

// Desk form tokens (MyPortfolio precedent) — rules and whitespace, no cards.
const field = 'border border-rule-24 bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent';
const actionBtn = 'border border-accent/60 px-3 py-1.5 text-[12px] font-bold text-accent hover:bg-accent/[0.12] disabled:opacity-40';

function RequestForm({ onSubmitted }: { onSubmitted: () => void }) {
    const [ticker, setTicker] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

    const submit = async () => {
        if (!ticker.trim() || !password) {
            setNote({ ok: false, text: 'Ticker and password required.' });
            return;
        }
        setBusy(true); setNote(null);
        try {
            const res = await fetch('/api/ondemand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, ticker: ticker.trim() }),
            });
            const data = await res.json();
            const ok = res.ok;
            setNote({ ok, text: data.message ?? data.error ?? 'Unknown response' });
            if (ok) { setTicker(''); setPassword(''); onSubmitted(); }
        } catch (e: any) {
            setNote({ ok: false, text: `Request failed: ${e.message ?? e}` });
        } finally {
            setBusy(false);
        }
    };

    const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit(); };

    return (
        <div className="mt-6 border-t border-rule-22 pt-5">
            <Micro className="font-semibold text-ink">Request an analysis</Micro>
            <Micro className="mt-0.5 block text-ink-3">
                Qwen runs on the operator&apos;s PC (GPU time, not a cloud call): about 20 minutes a name, requests
                before the list refresh. The result appears on the stock page.
            </Micro>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                    value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    onKeyDown={onKey} placeholder="TICKER" maxLength={10}
                    className={clsx(field, 'w-28 uppercase')}
                />
                <input
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={onKey} placeholder="Password" type="password"
                    className={clsx(field, 'w-36')}
                />
                <button onClick={submit} disabled={busy} className={actionBtn}>
                    {busy ? 'Queuing…' : 'Analyze'}
                </button>
            </div>
            {note && (
                <Micro className={clsx('mt-2 block', note.ok ? 'text-pos' : 'text-neg')}>
                    {note.text}
                </Micro>
            )}
        </div>
    );
}

function QueueStrip({ queue }: { queue: OndemandQueueRow[] }) {
    if (queue.length === 0) return null;
    return (
        <div className="mt-4">
            {queue.map((q) => (
                <div key={q.id} className="flex flex-wrap items-baseline gap-x-4 border-b border-rule-14 py-1.5">
                    <span className="w-16 font-mono text-[11px] font-bold text-ink">{q.ticker}</span>
                    <span className={clsx('font-mono text-[11px]',
                        q.status === 'handled' ? 'text-pos'
                            : q.status === 'failed' ? 'text-neg' : 'text-warn')}>
                        {q.status}
                    </span>
                    <Micro className="font-mono">{q.requested_at?.slice(0, 16).replace('T', ' ')}</Micro>
                    {q.message && <Micro className="text-ink-3">{q.message}</Micro>}
                </div>
            ))}
        </div>
    );
}

function Row({ ticker, r }: { ticker: string; r: QwenOverlayPayload['tickers'][string] }) {
    const ran = r.analysis !== 'not run';
    return (
        <Link href={`/t/${encodeURIComponent(ticker)}`}
            className="flex w-full flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-rule-14 px-1 py-3 text-left hover:bg-track-12">
            <span className="w-16 font-mono text-[13px] font-bold text-ink">{ticker}</span>
            <Micro className="w-36 font-mono">{r.date.slice(0, 16).replace('T', ' ')}</Micro>
            <span className={clsx('font-mono text-[11px]', ran ? 'text-ink-2' : 'text-warn')}>
                {ran ? `${r.claims_supported ?? 0}/${r.claims ?? 0} claims supported` : 'not run'}
            </span>
            <span className="font-mono text-[11.5px] text-ink-q">
                {r.valued ? `value ${money(r.value_base)} (${money(r.value_bear)} to ${money(r.value_bull)})` : (plainNoValueReason(r.no_value_reason) ?? 'not valued')}
            </span>
            <Micro className="ml-auto text-ink-3">{r.source}</Micro>
        </Link>
    );
}

export function OndemandReports() {
    const [overlay, setOverlay] = useState<QwenOverlayPayload | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [queue, setQueue] = useState<OndemandQueueRow[]>([]);

    const loadQueue = () => {
        fetch('/api/ondemand', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : []))
            .then((rows) => setQueue(Array.isArray(rows) ? rows : []))
            .catch(() => { });
    };

    useEffect(() => {
        fetchQwenOverlay().then((x) => { setOverlay(x); setLoaded(true); });
        loadQueue();
        const iv = setInterval(loadQueue, 20000);
        return () => clearInterval(iv);
    }, []);

    // Worker results (requests and the list refresh), newest first; formation names are on the Track page's books.
    const rows = Object.entries(overlay?.tickers ?? {})
        .filter(([, r]) => r.source.startsWith('on request'))
        .sort(([, a], [, b]) => b.date.localeCompare(a.date));

    return (
        <Shell tab={null}>
            <div className="pt-8">
                <h1 className="text-[16px] font-extrabold uppercase tracking-section">On-Demand Analyses</h1>
                <Micro className="mt-1 block max-w-2xl text-ink-3">
                    Qwen&apos;s reading of any ticker&apos;s SEC filings, on request, plus its rolling refresh of the
                    screener&apos;s research-now and watchlist names. Paper only; on-demand names never join a paper book.
                </Micro>

                <RequestForm onSubmitted={loadQueue} />
                <QueueStrip queue={queue} />

                {!loaded && <p className="mt-8 text-[12px] text-ink-3">Loading…</p>}

                {loaded && rows.length === 0 && (
                    <p className="mt-8 text-[12.5px] text-ink-q">
                        No Qwen analyses on request yet: request one with the form above, or{' '}
                        <span className="font-mono">/analyze TICKER</span> on Telegram.
                    </p>
                )}

                {rows.length > 0 && (
                    <div className="mt-6 border-t border-rule-22">
                        {rows.map(([ticker, r]) => <Row key={ticker} ticker={ticker} r={r} />)}
                    </div>
                )}
            </div>
        </Shell>
    );
}
