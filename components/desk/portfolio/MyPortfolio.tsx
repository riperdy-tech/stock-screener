'use client';

// My Portfolio — the reader's actual holdings, stored in this browser, checked
// against the model. Saving a snapshot (Supabase, RLS-scoped) is what makes the
// private `mine` ledger on Track Record possible.

import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import { Micro, SectionHead } from '../primitives';
import { OverlayChips } from '../rankings/cells';
import { fmtSignedPct } from '@/lib/desk/format';
import {
    loadPortfolio, parseBulkPortfolio, savePortfolio, type Holding,
} from '@/lib/desk/portfolio';
import type { DepthVerdict, FactorEntry } from '@/lib/data-service';
import type { StockInfo } from '@/lib/desk/useDeskData';
import { useLanguage } from '@/components/LanguageContext';

interface Props {
    factor: Record<string, FactorEntry>;
    depth: Record<string, DepthVerdict>;
    overlay: Record<string, any>;
    stockInfo: Record<string, StockInfo>;
    onSelect: (t: string) => void;
    user: any;
    onRequireLogin: () => void;
}

export function MyPortfolio({ factor, depth, overlay, stockInfo, onSelect, user, onRequireLogin }: Props) {
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
        setSaveStatus('saved ✓ — starting ledger refresh…');
        try {
            const r = await fetch('/api/refresh-mine', { method: 'POST' });
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

    const { rows, sectorBreaches, weightedComposite } = useMemo(() => {
        const sectorWeights: Record<string, number> = {};
        const out = holdings.map((h) => {
            const wt = total > 0 ? (h.value / total) * 100 : 0;
            const entry = factor[h.ticker];
            const dv = depth[h.ticker];
            const vetoed = !!entry?.fct_veto;

            // Sizing used to come from quarter-Kelly over the reverse-DCF
            // expectations gap. That dataset is retired, so the model's position
            // size is now the depth run's own `size_hint`, shown verbatim — the
            // desk never recomputes the spread tiers. It is a tier, not a percent,
            // so the verdict compares direction rather than a target weight.
            const sizeHint = !vetoed && dv?.direction === 'undervalued' ? (dv.size_hint ?? null) : null;
            const modelSize = vetoed ? 'NONE' : sizeHint ? sizeHint.toUpperCase() : null;

            let verdict: string;
            let note: string;
            let color: string;
            if (!entry) {
                verdict = 'NO COVERAGE'; color = '#c3bfb5';
                note = 'not in the scored universe';
            } else if (vetoed) {
                verdict = 'VETOED'; color = '#e2917f';
                note = `${entry.fct_veto!.replace(/_/g, ' ')} — hard avoid`;
            } else if (!dv) {
                verdict = 'NO DEPTH RUN'; color = '#c3bfb5';
                note = 'the AI has not read this name yet';
            } else if (dv.direction === 'overvalued') {
                verdict = 'REDUCE'; color = '#cfa14e';
                note = 'AI says overvalued — every run below the price';
            } else if (dv.direction === 'hold') {
                verdict = 'HOLD'; color = '#c3bfb5';
                note = 'the price sits inside the band — no edge either way';
            } else if (dv.direction === 'undervalued') {
                verdict = 'BUY'; color = 'oklch(0.75 0.11 155)';
                note = sizeHint
                    ? `every run above the price — model sizes this ${sizeHint}`
                    : 'every run above the price';
            } else {
                verdict = 'NO PLAUSIBLE RUN'; color = '#c3bfb5';
                note = 'no band was computed for this name';
            }

            const sector = stockInfo[h.ticker]?.sector || 'Unknown';
            sectorWeights[sector] = (sectorWeights[sector] || 0) + wt;
            return { ...h, wt, entry, dv, modelSize, verdict, note, color, sector };
        });

        const covered = out.filter((r) => r.entry && r.entry.fct_composite !== null);
        const wc = covered.length
            ? covered.reduce((s, r) => s + (r.entry!.fct_composite! * r.wt), 0) / covered.reduce((s, r) => s + r.wt, 0)
            : null;

        return {
            rows: out,
            sectorBreaches: Object.entries(sectorWeights).filter(([, w]) => w > 25),
            weightedComposite: wc,
        };
    }, [holdings, total, factor, depth, stockInfo]);

    const field = 'border border-rule-24 bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent';

    return (
        <section>
            <SectionHead
                title={t('portMine')}
                note={t('portMineNote')}
            />

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                    value={newTicker} onChange={(e) => setNewTicker(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addHolding()}
                    placeholder="TICKER" aria-label="Ticker"
                    className={clsx(field, 'w-24 uppercase')}
                />
                <input
                    value={newValue} onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addHolding()}
                    type="number" min="0" placeholder="VALUE $" aria-label="Market value"
                    className={clsx(field, 'w-28')}
                />
                <button onClick={addHolding} className="border border-accent/60 px-3 py-1.5 text-[12px] font-bold text-accent hover:bg-accent/[0.12]">
                    {t('portAdd')}
                </button>
                <label className="ml-2 flex items-center gap-2">
                    <Micro>Cash $</Micro>
                    <input
                        value={cash || ''} onChange={(e) => setCash(parseFloat(e.target.value) || 0)}
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
                <button onClick={() => setShowBulk((v) => !v)} className="font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-ink-2 hover:text-ink">
                    {showBulk ? `${t('transcriptsHide')} — ${t('portBulk')}` : `${t('portBulk')}…`}
                </button>
                {saveStatus && <Micro className="normal-case tracking-normal">{saveStatus}</Micro>}
            </div>

            {showBulk && (
                <div className="mt-3 border border-rule-14 p-3">
                    <p className="text-[11.5px] leading-relaxed text-ink-2">
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
                        <button onClick={() => importBulk(false)} className="border border-accent/60 px-3 py-1.5 text-[12px] font-bold text-accent hover:bg-accent/[0.12]">
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
                    <div className="mt-5 grid grid-cols-[80px_90px_70px_80px_1fr_120px_28px] gap-x-3 border-b border-rule-18 pb-2">
                        <Micro>Holding</Micro>
                        <Micro className="text-right">Value</Micro>
                        <Micro className="text-right">Weight</Micro>
                        <Micro className="text-right">Model size</Micro>
                        <Micro>Verdict</Micro>
                        <Micro>Overlay</Micro>
                        <Micro />
                    </div>
                    {rows.map((r) => (
                        <div key={r.ticker} className="grid grid-cols-[80px_90px_70px_80px_1fr_120px_28px] items-baseline gap-x-3 border-b border-rule-10 py-2.5">
                            <button
                                onClick={() => r.entry && onSelect(r.ticker)}
                                className="text-left text-[13px] font-extrabold text-ink hover:text-accent"
                            >
                                {r.ticker}
                            </button>
                            <span className="text-right font-mono text-[11px] text-ink-2">${r.value.toLocaleString()}</span>
                            <span className="text-right font-mono text-[11.5px] font-semibold text-ink">{r.wt.toFixed(1)}%</span>
                            <span className="text-right font-mono text-[11px] text-ink-2">
                                {r.modelSize ?? '—'}
                            </span>
                            <span className="min-w-0">
                                <span className="text-[11.5px] font-bold" style={{ color: r.color }}>{r.verdict}</span>
                                <span className="ml-2 text-[11px] text-ink-3">{r.note}</span>
                            </span>
                            <span><OverlayChips overlay={overlay[r.ticker]} /></span>
                            <button
                                onClick={() => setHoldings((prev) => prev.filter((h) => h.ticker !== r.ticker))}
                                className="text-right font-mono text-[11px] text-ink-3 hover:text-neg"
                                aria-label={`Remove ${r.ticker}`}
                            >
                                ✕
                            </button>
                        </div>
                    ))}

                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 font-mono text-[11px] text-ink-2">
                        <span>TOTAL <b className="text-ink">${total.toLocaleString()}</b></span>
                        <span>CASH <b className="text-ink">{total > 0 ? ((cash / total) * 100).toFixed(1) : '0.0'}%</b></span>
                        {weightedComposite !== null && (
                            <span>WEIGHTED COMPOSITE <b className="text-ink">{weightedComposite.toFixed(1)}</b></span>
                        )}
                        {sectorBreaches.map(([s, w]) => (
                            <span key={s} className="text-warn">⚠ {s.toUpperCase()} {w.toFixed(0)}% (&gt;25% CONCENTRATION RULE)</span>
                        ))}
                    </div>
                </>
            )}

            {rows.length === 0 && (
                <p className="mt-4 text-[12px] text-ink-3">
                    Nothing entered yet. Add a position above, or paste a broker export.
                </p>
            )}
        </section>
    );
}
