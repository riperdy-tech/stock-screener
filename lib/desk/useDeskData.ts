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
