'use client';

// One data bag for every desk surface (rankings, detail, track record, portfolio).
//
// The payloads are large — factor_scores.json ~4 MB and stocks.csv ~12 MB, the
// latter hand-parsed character by character — so results are memoised at module
// level. Navigating rankings → /t/TICKER → back must not refetch or reparse
// anything; only an explicit reload() drops the cache.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import {
    fetchDepthOverlay, fetchFactorScores, fetchMacroState, fetchOverlaySignals,
    fetchPaperLedgers, fetchPortfolioPlan, fetchPortfolioPlanLlm, fetchStocks,
    fetchValuationModels,
    type DepthOverlayPayload, type DepthVerdict, type FactorScoresPayload,
    type MacroStatePayload, type ValuationModel,
} from '@/lib/data-service';

export interface StockInfo {
    name: string;
    sector: string;
    industry: string;
    price: number;
    marketCap: number;
    /** Screener metrics for the Key financials panel. Sparse — roughly 49–99%
     *  populated depending on the field, so every cell there null-guards. */
    metrics: StockMetrics;
}

/**
 * Only the fields the desk renders. `fetchStocks` already scales the four ratio
 * fields to percentage points, so they arrive as 24.2 rather than 0.242 — the
 * panel formats them as-is.
 */
export interface StockMetrics {
    priceToSales: number | null;
    pegRatio: number | null;
    priceToBook: number | null;
    epsTtm: number | null;
    forwardEpsEstimate: number | null;
    fiveYearAveragePe: number | null;
    /** percentage points */
    revenueGrowth: number | null;
    /** percentage points */
    grossMargin: number | null;
    /** percentage points */
    roic: number | null;
    zScore: number | null;
    /** percentage points */
    insiderOwnership: number | null;
    ocf: number | null;
    capex: number | null;
}

export interface DeskData {
    factor: FactorScoresPayload | null;
    valuations: Record<string, ValuationModel>;
    plan: any | null;
    planLlm: any | null;
    overlay: Record<string, any>;
    depth: Record<string, DepthVerdict>;
    depthMeta: { generated_at: string | null; count: number };
    ledgers: any | null;
    stockInfo: Record<string, StockInfo>;
    macro: MacroStatePayload | null;
}

const EMPTY: DeskData = {
    factor: null, valuations: {}, plan: null, planLlm: null, overlay: {},
    depth: {}, depthMeta: { generated_at: null, count: 0 },
    ledgers: null, stockInfo: {}, macro: null,
};

// ── module-level promise cache ────────────────────────────────────────────
const cache = new Map<string, Promise<any>>();

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit) return hit as Promise<T>;
    const p = loader().catch((e) => { cache.delete(key); throw e; });
    cache.set(key, p);
    return p;
}

/** Drop every cached payload so the next load hits the network. */
export function invalidateDeskCache() {
    cache.clear();
}

/** 0 / NaN / undefined all mean "not stored" in the screener CSV. */
const nz = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null;

async function loadBag(): Promise<Omit<DeskData, 'ledgers'> & { ledgers: any }> {
    const [f, v, p, ov, pl, s, pllm, dp, mc] = await Promise.all([
        cached('factor', fetchFactorScores),
        cached('valuations', fetchValuationModels),
        cached('plan', fetchPortfolioPlan),
        cached('overlay', fetchOverlaySignals),
        cached('ledgers', fetchPaperLedgers),
        cached('stocks', () => fetchStocks('US')),
        cached('planLlm', fetchPortfolioPlanLlm),
        cached('depth', fetchDepthOverlay),
        cached('macro', fetchMacroState),
    ]);

    const stockInfo: Record<string, StockInfo> = {};
    for (const row of ((s?.data ?? []) as any[])) {
        if (row.symbol) {
            stockInfo[row.symbol] = {
                name: row.name, sector: row.sector, industry: row.industry,
                price: row.price, marketCap: row.marketCap,
                // fetchStocks zero-fills missing numbers; 0 is not a real ratio for
                // any of these, so it is normalised back to null for the panel.
                metrics: {
                    priceToSales: nz(row.priceToSales),
                    pegRatio: nz(row.pegRatio),
                    priceToBook: nz(row.priceToBook),
                    epsTtm: nz(row.epsTtm),
                    forwardEpsEstimate: nz(row.forwardEpsEstimate),
                    fiveYearAveragePe: nz(row.fiveYearAveragePe),
                    revenueGrowth: nz(row.revenueGrowth),
                    grossMargin: nz(row.grossMargin),
                    roic: nz(row.roic),
                    zScore: nz(row.zScore),
                    insiderOwnership: nz(row.insiderOwnership),
                    ocf: nz(row.ocf),
                    capex: nz(row.capex),
                },
            };
        }
    }

    const depthPayload = dp as DepthOverlayPayload | null;
    return {
        factor: f,
        valuations: v?.tickers ?? {},
        plan: p,
        planLlm: pllm,
        overlay: ov?.tickers ?? {},
        depth: depthPayload?.tickers ?? {},
        depthMeta: { generated_at: depthPayload?.generated_at ?? null, count: depthPayload?.count ?? 0 },
        ledgers: pl,
        stockInfo,
        macro: mc,
    };
}

/**
 * Loads (or reuses) every desk payload and merges the signed-in user's private
 * `mine` ledger from Supabase, which lives outside paper_ledgers.json.
 */
export function useDeskData() {
    const auth = useAuth();
    const [data, setData] = useState<DeskData>(EMPTY);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const bag = await loadBag();
        setData(bag);
        setLoading(false);
    }, []);

    const reload = useCallback(async () => {
        invalidateDeskCache();
        await load();
    }, [load]);

    useEffect(() => { load(); }, [load]);

    // Real-time background sweep listener: polls every 25s + on window focus.
    // When a new depth run finishes in orchestrate_depth.py and pushes to production,
    // this immediately catches the new generated_at timestamp and refreshes the desk.
    useEffect(() => {
        let active = true;
        const checkSweepUpdate = async () => {
            try {
                const res = await fetch(`/data/depth_overlay.json?t=${Date.now()}`);
                if (!res.ok) return;
                const fresh = await res.json();
                if (active && fresh && fresh.generated_at && fresh.generated_at !== data.depthMeta.generated_at) {
                    invalidateDeskCache();
                    await load();
                }
            } catch {}
        };

        const interval = setInterval(checkSweepUpdate, 25000);
        const onFocus = () => { checkSweepUpdate(); };
        window.addEventListener('focus', onFocus);
        return () => {
            active = false;
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
        };
    }, [data.depthMeta.generated_at, load]);

    // The private `mine` book is RLS-scoped, so it re-attaches on every auth change.
    useEffect(() => {
        if (!auth.ready) return;
        let cancelled = false;
        (async () => {
            let mine: any = undefined;
            if (supabase && auth.user) {
                const { data: row } = await supabase
                    .from('user_mine_ledgers').select('data').eq('user_id', auth.user.id).maybeSingle();
                mine = row?.data?.ledger;
            }
            if (cancelled) return;
            setData((prev) => prev.ledgers
                ? { ...prev, ledgers: { ...prev.ledgers, ledgers: { ...prev.ledgers.ledgers, mine } } }
                : prev);
        })();
        return () => { cancelled = true; };
    }, [auth.user, auth.ready]);

    return { ...data, loading, reload, auth };
}
