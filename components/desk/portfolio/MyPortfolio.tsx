'use client';

// My Portfolio — the reader's actual holdings, stored in this browser, checked
// against the machine. Saving a snapshot (Supabase, RLS-scoped) is what makes the
// private `mine` ledger on Track Record possible. The stance column reads rebuilt-analyst
// verdicts only (lib/desk/portfolio.ts holdingStance); old-analyst verdicts never show here.

import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import { Micro } from '../primitives';
import { TONE_COLORS } from '@/lib/desk/tone';
import {
    aiBookHoldings, holdingStance, loadPortfolio, parseBulkPortfolio, savePortfolio, SECTOR_LIMIT_PCT,
    type Holding, type Stance, type StanceKind,
} from '@/lib/desk/portfolio';
import { fill } from '@/lib/desk/text';
import { vetoFallback, vetoKey } from '@/lib/desk/veto';
import type { DepthVerdict, FactorEntry } from '@/lib/data-service';
import type { StockInfo } from '@/lib/desk/useDeskData';
import { useLanguage } from '@/components/LanguageContext';

interface Props {
    factor: Record<string, FactorEntry>;
    depth: Record<string, DepthVerdict>;
    ledgers: unknown;
    stockInfo: Record<string, StockInfo>;
    onSelect: (t: string) => void;
    user: any;
    onRequireLogin: () => void;
}

const STANCE_COLOR: Record<StanceKind, string> = {
    no_coverage: TONE_COLORS.MUTED, vetoed: TONE_COLORS.MUTED, no_analysis: 'var(--ink-2)',
    blocked: TONE_COLORS.MUTED, reduce: TONE_COLORS.NEG, fair: TONE_COLORS.FAIR,
    buy: TONE_COLORS.POS, no_run: TONE_COLORS.MUTED,
};

// Phone: ticker + weight + remove on line 1, stance and note stacked below. Tablet and up: four columns.
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto_24px] items-baseline gap-x-3 gap-y-1 sm:grid-cols-[96px_70px_minmax(0,1.4fr)_minmax(0,1fr)_24px] sm:gap-x-4';

export function MyPortfolio({ factor, depth, ledgers, stockInfo, onSelect, user, onRequireLogin }: Props) {
    const { t } = useLanguage();
    const [holdings, setHoldings] = useState<Holding[]>([]);
    const [cash, setCash] = useState(0);
    const [newTicker, setNewTicker] = useState('');
    const [newValue, setNewValue] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [showBulk, setShowBulk] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkStatus, setBulkStatus] = useState<string | null>(null);

    useEffect(() => {
        const p = loadPortfolio();
        setHoldings(p.holdings);
        setCash(p.cash);
        setLoaded(true);
    }, []);

    useEffect(() => { if (loaded) savePortfolio(holdings, cash); }, [holdings, cash, loaded]);

    const importBulk = (replace: boolean) => {
        const { holdings: parsed, cash: parsedCash, skipped } = parseBulkPortfolio(bulkText);
        if (parsed.length === 0 && parsedCash === null) {
            setBulkStatus('Nothing parseable found — expected lines like "AAPL 12500".');
            return;
        }
        setHoldings((prev) => {
            if (replace) return parsed;
            const merged = [...prev];
            for (const p of parsed) {
                const i = merged.findIndex((h) => h.ticker === p.ticker);
                if (i >= 0) merged[i] = p; else merged.push(p);
            }
            return merged;
        });
        if (parsedCash !== null) setCash(parsedCash);
        setBulkStatus(
            `${replace ? 'Replaced with' : 'Imported'} ${parsed.length} position${parsed.length === 1 ? '' : 's'}`
            + `${parsedCash !== null ? ` + cash $${parsedCash.toLocaleString()}` : ''}`
            + `${skipped.length ? ` · skipped ${skipped.length}: ${skipped.slice(0, 3).join(', ')}` : ''}`,
        );
    };

    const saveSnapshot = async () => {
        if (!user) { onRequireLogin(); return; }
        if (!supabase) { setSaveStatus('cloud storage unavailable'); return; }
        const clean = holdings.filter((h) => h.value > 0);
        setSaveStatus('saving…');
        // RLS scopes this upsert to the logged-in user (user_id = auth.uid()).
        const { error } = await supabase.from('my_portfolio').upsert({
            user_id: user.id,
            holdings: clean,
            cash: Number.isFinite(cash) && cash >= 0 ? cash : 0,
            saved_at: new Date().toISOString(),
        });
        if (error) {
            setSaveStatus(`failed: ${error.message}`);
            setTimeout(() => setSaveStatus(null), 6000);
            return;
        }
        // Fire the Update Mine Ledger workflow so the ledger refreshes without a
        // trip to the Actions tab. ~1 min; the daily chain is the fallback.
        const { data: sess } = await supabase.auth.getSession();
        const accessToken: string | undefined = sess?.session?.access_token;
        if (!accessToken) {
            setSaveStatus('saved ✓ — no session, ledger refresh not started; run Update Mine Ledger manually');
            setTimeout(() => setSaveStatus(null), 9000);
            return;
        }
        setSaveStatus('saved ✓ — starting ledger refresh…');
        try {
            const r = await fetch('/api/refresh-mine', {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const d = await r.json();
            setSaveStatus(d?.ok
                ? 'saved ✓ — ledger updating (~1 min), then refresh this page'
                : `saved ✓ — auto-refresh failed (${d?.error || r.status}); run Update Mine Ledger manually`);
        } catch {
            setSaveStatus('saved ✓ — auto-refresh unreachable; run Update Mine Ledger manually');
        }
        setTimeout(() => setSaveStatus(null), 9000);
    };

    const addHolding = () => {
        const t = newTicker.trim().toUpperCase();
        const v = parseFloat(newValue);
        if (!t || !Number.isFinite(v) || v <= 0) return;
        setHoldings((prev) => [...prev.filter((h) => h.ticker !== t), { ticker: t, value: v }]);
        setNewTicker('');
        setNewValue('');
    };

    const total = holdings.reduce((s, h) => s + h.value, 0) + cash;

    const { rows, sectorBreaches } = useMemo(() => {
        const sectorWeights: Record<string, number> = {};
        const out = holdings.map((h) => {
            const wt = total > 0 ? (h.value / total) * 100 : 0;
            const entry = factor[h.ticker];
            const stance = holdingStance(entry, depth[h.ticker]);
            const sector = stockInfo[h.ticker]?.sector || 'Unknown';
            sectorWeights[sector] = (sectorWeights[sector] || 0) + wt;
            return { ...h, wt, entry, stance };
        });
        return {
            rows: out,
            sectorBreaches: Object.entries(sectorWeights).filter(([, w]) => w > SECTOR_LIMIT_PCT),
        };
    }, [holdings, total, factor, depth, stockInfo]);

    const stanceText = (st: Stance): string => {
        switch (st.kind) {
            case 'no_coverage': return t('stNoCoverage');
            case 'no_analysis': return t('stNoAnalysis');
            case 'vetoed': {
                const key = st.vetoCode ? vetoKey(st.vetoCode) : null;
                return `${t('stVetoed')} · ${key ? t(key) : vetoFallback(st.vetoCode ?? '')}`;
            }
            case 'blocked': return st.reasons ? `${t('stBlocked')} · ${st.reasons}` : t('stBlocked');
            case 'reduce': return t('stReduce');
            case 'fair': return t('stFair');
            case 'buy': return st.size ? `${t('stBuy')} · ${st.size}` : t('stBuy');
            case 'no_run': return t('stNoRun');
        }
    };
    // Thesis status / follow-up status of the rebuilt verdict, else an em dash.
    const noteText = (st: Stance): string => {
        const parts = [
            st.thesis ? fill(t('pfThesis'), { s: st.thesis.replace(/_/g, ' ') }) : null,
            st.followup ? fill(t('pfFollowup'), { s: st.followup.replace(/_/g, ' ') }) : null,
        ].filter((x): x is string => x !== null);
        return parts.length ? parts.join(' · ') : '—';
    };

    const aiHolds = aiBookHoldings(ledgers);
    const aiHoldsText = aiHolds === null ? '—'
        : aiHolds === 0 ? t('pfCashWord') : aiHolds === 1 ? t('pfNameOne') : fill(t('pfNames'), { n: aiHolds });

    const field = 'border border-rule-24 bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent';
    const cashPct = total > 0 ? (cash / total) * 100 : 0;

    return (
        <section>
            <h1 className="text-[22px] font-bold tracking-head text-ink sm:text-[24px]">{t('portMine')}</h1>
            <p className="mt-1 text-[13.5px] text-ink-2">{t('pfSub')}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                    value={newTicker} onChange={(e) => setNewTicker(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addHolding()}
                    placeholder={t('pfTicker')} aria-label="Ticker"
                    className={clsx(field, 'w-28 uppercase')}
                />
                <input
                    value={newValue} onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addHolding()}
                    type="number" min="0" placeholder={t('pfValue')} aria-label="Market value"
                    className={clsx(field, 'w-28')}
                />
                <button onClick={addHolding} className="border border-ink bg-ink px-3.5 py-1.5 text-[12px] font-bold text-surface hover:opacity-85">
                    {t('pfAdd')}
                </button>
                <button onClick={() => setShowBulk((v) => !v)} className="border border-rule-24 px-3.5 py-1.5 text-[12px] text-ink-2 hover:text-ink">
                    {t('pfPaste')}
                </button>
                <label className="flex items-center gap-2 sm:ml-2">
                    <Micro>Cash $</Micro>
                    <input
                        value={cash ?? ''} onChange={(e) => setCash(parseFloat(e.target.value) || 0)}
                        type="number" min="0" aria-label="Cash"
                        className={clsx(field, 'w-28')}
                    />
                </label>
                <button
                    onClick={saveSnapshot}
                    disabled={holdings.length === 0}
                    title="Saves your holdings to the cloud so the daily tracker measures your real portfolio in the 'mine' ledger"
                    className="border border-rule-24 px-3 py-1.5 text-[12px] font-bold text-ink-2 hover:text-ink disabled:opacity-40"
                >
                    {t('portSaveSnapshot')}
                </button>
                {saveStatus && <Micro className="normal-case tracking-normal">{saveStatus}</Micro>}
            </div>

            {showBulk && (
                <div className="mt-3 border border-rule-14 p-3">
                    <p className="text-[12px] leading-relaxed text-ink-2">
                        One position per line: <span className="font-mono text-ink">TICKER value</span> — the <b>last number</b> on
                        each line is taken as market value, so broker rows with extra columns paste fine.
                        Separators: spaces, commas or tabs. <span className="font-mono text-ink">CASH 5000</span> sets cash.
                    </p>
                    <textarea
                        value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                        rows={6} placeholder={'NVDA 12500\nAAPL 8000\nINCY 5,250.75\nCASH 3000'}
                        aria-label="Bulk paste holdings"
                        className="mt-2 w-full border border-rule-24 bg-transparent p-2 font-mono text-[11.5px] text-ink outline-none focus:border-accent"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button onClick={() => importBulk(false)} className="border border-ink bg-ink px-3 py-1.5 text-[12px] font-bold text-surface hover:opacity-85">
                            Import (merge)
                        </button>
                        <button onClick={() => importBulk(true)} className="border border-warn/50 px-3 py-1.5 text-[12px] font-bold text-warn hover:bg-warn/10">
                            Replace all
                        </button>
                        {bulkStatus && <Micro className="normal-case tracking-normal">{bulkStatus}</Micro>}
                    </div>
                </div>
            )}

            {rows.length > 0 && (
                <>
                    <div className={clsx('mt-5 hidden border-b border-ink pb-2 sm:grid', GRID)}>
                        <span className="font-mono text-[11px] text-off">{t('pfHolding')}</span>
                        <span className="font-mono text-[11px] text-off">{t('pfWeight')}</span>
                        <span className="font-mono text-[11px] text-off">{t('pfStance')}</span>
                        <span className="font-mono text-[11px] text-off">{t('pfNote')}</span>
                        <span />
                    </div>
                    <div className="mt-4 border-t border-ink sm:hidden" />
                    {rows.map((r) => (
                        <div key={r.ticker} className={clsx(GRID, 'border-b border-rule-10 py-2.5')}>
                            <button
                                onClick={() => r.entry && onSelect(r.ticker)}
                                className="text-left text-[13px] font-bold text-ink hover:text-accent"
                            >
                                {r.ticker}
                            </button>
                            <span className="text-right font-mono text-[11px] text-ink sm:text-left" title={`$${r.value.toLocaleString()}`}>
                                {r.wt.toFixed(0)} %
                            </span>
                            <span
                                className="order-last col-span-3 min-w-0 break-words font-mono text-[11px] font-semibold sm:order-none sm:col-span-1"
                                style={{ color: STANCE_COLOR[r.stance.kind] }}
                            >
                                {stanceText(r.stance)}
                            </span>
                            <span className="order-last col-span-3 min-w-0 break-words text-[12px] text-ink-2 sm:order-none sm:col-span-1">
                                {noteText(r.stance)}
                            </span>
                            <button
                                onClick={() => setHoldings((prev) => prev.filter((h) => h.ticker !== r.ticker))}
                                className="text-right font-mono text-[11px] text-ink-3 hover:text-neg"
                                aria-label={fill(t('pfRemove'), { ticker: r.ticker })}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    {cash > 0 && (
                        <div className={clsx(GRID, 'border-b border-rule-10 py-2.5')}>
                            <span className="text-[13px] font-bold text-ink">{t('pfCash')}</span>
                            <span className="text-right font-mono text-[11px] text-ink sm:text-left">{cashPct.toFixed(0)} %</span>
                        </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[11px] text-ink-2">
                        <span>{t('pfTotal')} <b className="text-ink">${total.toLocaleString()}</b></span>
                        <span>{t('pfCashPct')} <b className="text-ink">{cashPct.toFixed(1)} %</b></span>
                        {sectorBreaches.map(([sector, w]) => (
                            <span key={sector} className="text-warn">● {fill(t('pfConc'), { sector, w: w.toFixed(0) })}</span>
                        ))}
                        <span>{t('pfAiHolds')} <b className="text-ink">{aiHoldsText}</b></span>
                    </div>
                </>
            )}

            {rows.length === 0 && (
                <>
                    <p className="mt-4 text-[12.5px] text-ink-2">{t('pfEmpty')}</p>
                    <p className="mt-3 font-mono text-[11px] text-ink-2">{t('pfAiHolds')} <b className="text-ink">{aiHoldsText}</b></p>
                </>
            )}
        </section>
    );
}
