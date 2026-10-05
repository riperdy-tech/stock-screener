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
    fetchChainManifest, fetchDepthOutcomes, fetchDepthOverlay, fetchFactorScores, fetchMriCostOfCapital,
    fetchMriRegime, fetchOverlaySignals,
    fetchPaperLedgers, fetchStocks,
    fetchValuationModels,
    type ChainManifest, type DepthOverlayPayload, type DepthVerdict, type FactorScoresPayload,
    type MriCostOfCapital, type MriRegime, type ValuationModel,
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
    overlay: Record<string, any>;
    depth: Record<string, DepthVerdict>;
    depthMeta: { generated_at: string | null; count: number; actionable_count: number | null };
    ledgers: any | null;
    stockInfo: Record<string, StockInfo>;
    /** Pipeline status files. Each is null when its file did not load; none blocks the page. */
    manifest: ChainManifest | null;
    regime: MriRegime | null;
    anchor: MriCostOfCapital | null;
    /** Newest per-row quote stamp in stocks.csv ("YYYY-MM-DD HH:mm"), null when none. */
    pricesAsOf: string | null;
}

const EMPTY: DeskData = {
    factor: null, valuations: {}, overlay: {},
    depth: {}, depthMeta: { generated_at: null, count: 0, actionable_count: null },
    ledgers: null, stockInfo: {},
    manifest: null, regime: null, anchor: null, pricesAsOf: null,
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

// Hooks that show derived status (the shell) re-read after an invalidation.
const invalidationListeners = new Set<() => void>();

/** Drop every cached payload so the next load hits the network. */
export function invalidateDeskCache() {
    cache.clear();
    invalidationListeners.forEach((fn) => fn());
}

/** 0 / NaN / undefined all mean "not stored" in the screener CSV. */
const nz = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null;

/** Newest `Last_Updated` stamp among the screener rows; the stamps share one sortable format. */
function latestQuoteStamp(rows: { lastUpdated?: string }[] | undefined): string | null {
    let latest: string | null = null;
    for (const r of rows ?? []) {
        if (r.lastUpdated && (latest === null || r.lastUpdated > latest)) latest = r.lastUpdated;
    }
    return latest;
}

async function loadBag(): Promise<Omit<DeskData, 'ledgers'> & { ledgers: any }> {
    // The status files are optional context: a failure in one resolves to null and never rejects
    // the bag, so the verdict list still renders.
    const optional = <T,>(key: string, loader: () => Promise<T | null>) =>
        cached(key, loader).catch(() => null as T | null);
    const [f, v, ov, pl, s, dp, manifest, regime, anchor] = await Promise.all([
        cached('factor', fetchFactorScores),
        cached('valuations', fetchValuationModels),
        cached('overlay', fetchOverlaySignals),
        cached('ledgers', fetchPaperLedgers),
        cached('stocks', () => fetchStocks('US')),
        cached('depth', fetchDepthOverlay),
        optional('manifest', fetchChainManifest),
        optional('regime', fetchMriRegime),
        optional('anchor', fetchMriCostOfCapital),
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
        overlay: ov?.tickers ?? {},
        depth: depthPayload?.tickers ?? {},
        depthMeta: {
            generated_at: depthPayload?.generated_at ?? null,
            count: depthPayload?.count ?? 0,
            // Legacy overlays carry no top-level count: count the passing rows instead.
            actionable_count: depthPayload == null ? null
                : depthPayload.actionable_count
                    ?? Object.values(depthPayload.tickers ?? {}).filter((d) => d.actionable === true).length,
        },
        ledgers: pl,
        stockInfo,
        manifest, regime, anchor,
        pricesAsOf: latestQuoteStamp(s?.data as { lastUpdated?: string }[] | undefined),
    };
}

/** What the shell's freshness strip and health drawer read. Raw cached payloads, filled as each arrives. */
export interface DeskStatus {
    factor: FactorScoresPayload | null;
    depth: DepthOverlayPayload | null;
    ledgers: any | null;
    manifest: ChainManifest | null;
    regime: MriRegime | null;
    anchor: MriCostOfCapital | null;
    pricesAsOf: string | null;
}

const EMPTY_STATUS: DeskStatus = {
    factor: null, depth: null, ledgers: null, manifest: null, regime: null, anchor: null, pricesAsOf: null,
};

/**
 * Status for the shell, which renders on pages (like /ondemand) that do not use useDeskData. It
 * shares the module-level cache with the bag, so on the desk and ticker pages it adds no fetches.
 * Each file lands independently and a failure leaves that field null.
 */
export function useDeskStatus(): DeskStatus {
    const [status, setStatus] = useState<DeskStatus>(EMPTY_STATUS);

    useEffect(() => {
        let alive = true;
        const put = (patch: Partial<DeskStatus>) => { if (alive) setStatus((prev) => ({ ...prev, ...patch })); };
        const run = () => {
            cached('factor', fetchFactorScores).then((factor) => put({ factor })).catch(() => { });
            cached('depth', fetchDepthOverlay).then((depth) => put({ depth })).catch(() => { });
            cached('ledgers', fetchPaperLedgers).then((ledgers) => put({ ledgers })).catch(() => { });
            cached('manifest', fetchChainManifest).then((manifest) => put({ manifest })).catch(() => { });
            cached('regime', fetchMriRegime).then((regime) => put({ regime })).catch(() => { });
            cached('anchor', fetchMriCostOfCapital).then((anchor) => put({ anchor })).catch(() => { });
            cached('stocks', () => fetchStocks('US'))
                .then((s) => put({ pricesAsOf: latestQuoteStamp(s?.data as { lastUpdated?: string }[] | undefined) }))
                .catch(() => { });
        };
        run();
        invalidationListeners.add(run);
        return () => { alive = false; invalidationListeners.delete(run); };
    }, []);

    return status;
}

/**
 * depth_outcomes.json for the Track record scoreboard. Shares the module cache, so only the track
 * page fetches it; a failure leaves it null and the page says so instead of showing zeros.
 */
export function useDepthOutcomes(): { outcomes: any | null; loaded: boolean } {
    const [state, setState] = useState<{ outcomes: any | null; loaded: boolean }>({ outcomes: null, loaded: false });
    useEffect(() => {
        let alive = true;
        const run = () => {
            cached('outcomes', fetchDepthOutcomes)
                .then((outcomes) => { if (alive) setState({ outcomes, loaded: true }); })
                .catch(() => { if (alive) setState({ outcomes: null, loaded: true }); });
        };
        run();
        invalidationListeners.add(run);
        return () => { alive = false; invalidationListeners.delete(run); };
    }, []);
    return state;
}

/**
 * The three files the Macro page reads. Each lands independently; `loaded` flips once that file's
 * request has settled, so the page can tell "still loading" from "did not load" (null + loaded).
 */
export interface MacroData {
    regime: MriRegime | null;
    anchor: MriCostOfCapital | null;
    factor: FactorScoresPayload | null;
    loaded: { regime: boolean; anchor: boolean; factor: boolean };
}

export function useMacroData(): MacroData {
    const [state, setState] = useState<MacroData>({
        regime: null, anchor: null, factor: null, loaded: { regime: false, anchor: false, factor: false },
    });
    useEffect(() => {
        let alive = true;
        const settle = <K extends 'regime' | 'anchor' | 'factor'>(key: K, value: MacroData[K]) => {
            if (alive) setState((prev) => ({ ...prev, [key]: value, loaded: { ...prev.loaded, [key]: true } }));
        };
        const run = () => {
            cached('regime', fetchMriRegime).then((v) => settle('regime', v)).catch(() => settle('regime', null));
            cached('anchor', fetchMriCostOfCapital).then((v) => settle('anchor', v)).catch(() => settle('anchor', null));
            cached('factor', fetchFactorScores).then((v) => settle('factor', v)).catch(() => settle('factor', null));
        };
        run();
        invalidationListeners.add(run);
        return () => { alive = false; invalidationListeners.delete(run); };
    }, []);
    return state;
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
