"use client";

import { useState, useEffect, useMemo } from "react";
import { StockDetailModal } from "./StockDetailModal";
import { StockCard } from "./StockCard";
import { fetchStocks } from "@/lib/data-service";
import { ScreeningResult } from "@/lib/blueprint";
import { FilterSidebar, FilterState, DEFAULT_FILTERS } from "./FilterSidebar";
import { LogConsole } from "./LogConsole";
import { LanguageToggle } from "./LanguageToggle";
import { Terminal, RefreshCw, Search, Globe } from "lucide-react";
import { useLanguage } from "./LanguageContext";

export function ScreenerDashboard() {
    const { t, language, setLanguage } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [showLogs, setShowLogs] = useState(false);

    const [rawResults, setRawResults] = useState<ScreeningResult[]>([]);
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS); // Restore Filter State
    const [selectedStock, setSelectedStock] = useState<ScreeningResult | null>(null);

    // Initial Load (Once on mount)
    useEffect(() => {
        // PER USER REQUEST:
        // "The website shall only change # of assets, if the 'refresh data' button is clicked."
        // We try to load cached data from LocalStorage first.
        const cached = localStorage.getItem("stock_data_cache");
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setRawResults(parsed);
                    setLoading(false);
                    return; // Exit, using cache
                }
            } catch (e) {
                console.warn("Invalid cache, falling back to fetch");
                // Fallthrough to loadData triggers fetch
            }
        }

        // If no cache, we fetch fresh data automatically once
        loadData();
    }, []);

    async function loadData(silent = false) {
        if (!silent) setLoading(true);
        try {
            const rawData = await fetchStocks();

            // ADAPTER: Convert CSV Flat Object to ScreeningResult
            const adaptedData = (rawData as any[]).map(item => {
                // The item is now the flat CSV row parsed by data-service
                // metrics are already top-level in 'item' due to data-service mapping
                return {
                    candidate: {
                        symbol: item.symbol,
                        name: item.name,
                        price: item.price,
                        marketCap: item.marketCap,
                        sector: item.sector,
                        industry: item.industry,

                        revenueGrowth: item.revenueGrowth,
                        grossMargin: item.grossMargin,
                        roic: item.roic,
                        pegRatio: item.pegRatio,
                        priceToSales: item.priceToSales || 0,
                        insiderOwnership: item.insiderOwnership,
                        zScore: item.zScore,
                        peRatio: item.peRatio,
                    },
                    // We reconstruct metrics object for the Detail Modal if needed
                    metrics: {
                        revenueGrowth: item.revenueGrowth / 100, // CSV had %, convert back to decimal if app expects decimal?
                        // WAIT: App expects %, but JSON had decimals?
                        // Let's check:
                        // JSON: metrics.revenueGrowth = 0.25 (25%)
                        // Dashboard: (metrics.revenueGrowth || 0) * 100
                        // CSV: "25.0" (Already %)
                        // So if CSV gives 25, we don't multiply by 100?
                        // Let's adjust the candidate mapping above.
                    },
                    passed: item._status === "Pass",
                    score: item._score,
                    reasons: item._reasons || [],
                    failCodes: item._failCodes || [],
                    flags: []
                };
            });

            // Fix Percentage Units:
            // CSV exports raw numbers (e.g. 25.5 for 25.5%).
            // Dashboard Adapter previously multiplied by 100.
            // We should Ensure `candidate` has Correct % values.
            const finalData = adaptedData.map(d => {
                // In CSV mode, fetchStocks returns the number directly from the CSV column.
                // Fetch_data.py exports: r['metrics'].get('revenueGrowth') which IS decimal in JSON logic?
                // Wait, fetch_data.py `process_stock` returns decimals?
                // Let's assume CSV has DECIMALS because we just dumped the python dict values.
                // Python `stock_data.revenue_growth_ttm` is usually decimal (0.25).
                // So CSV has 0.25.
                // So we DOES need to multiply by 100.

                const cand = d.candidate as any;
                cand.revenueGrowth = (cand.revenueGrowth || 0) * 100;
                cand.grossMargin = (cand.grossMargin || 0) * 100;
                cand.roic = (cand.roic || 0) * 100;
                cand.insiderOwnership = (cand.insiderOwnership || 0) * 100;

                return d;
            });

            // PERSIST SNAPSHOT
            try {
                localStorage.setItem("stock_data_cache", JSON.stringify(finalData));
            } catch (e) {
                console.error("Cache save failed (quota?)", e);
            }

            setRawResults(finalData as unknown as ScreeningResult[]);
        } catch (err) {
            console.error("Failed to load or adapt data:", err);
            setRawResults([]);
        }
        setLoading(false);
    }


    // Filtering Logic
    const filteredResults = useMemo(() => {
        return rawResults.filter(r => {
            const c = r.candidate;

            // 1. Search (Symbol or Name)
            const searchMatch = !search ||
                c.symbol.toLowerCase().includes(search.toLowerCase()) ||
                c.name.toLowerCase().includes(search.toLowerCase());

            if (!searchMatch) return false;

            // 2. Sidebar Filters
            const mcapM = c.marketCap / 1_000_000;
            if (filters.minMarketCap > 0 && mcapM < filters.minMarketCap) return false;
            // if (filters.maxMarketCap > 0 && mcapM > filters.maxMarketCap) return false; // Optional max cap check

            if (filters.maxPrice > 0 && c.price > filters.maxPrice) return false;

            if (c.revenueGrowth < filters.minRevenueGrowth) return false;
            if (c.grossMargin < filters.minGrossMargin) return false;
            if (c.roic < filters.minROIC) return false;
            if (c.insiderOwnership < filters.minInsiderOwnership) return false;

            if (c.pegRatio > filters.maxPEG) return false;
            if (c.priceToSales > filters.maxPS) return false;

            if (filters.maxFloat > 0 && r.metrics?.float) {
                const floatM = r.metrics.float / 1_000_000;
                if (floatM > filters.maxFloat) return false;
            }

            return true;
        });
    }, [rawResults, search, filters]);


    // Pagination Logic
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    useEffect(() => {
        setCurrentPage(1);
    }, [search, filters]);

    const totalPages = Math.ceil(filteredResults.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const currentData = filteredResults.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const getPageNumbers = () => {
        const pages = [];
        const maxButtons = 5;
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + maxButtons - 1);
        if (totalPages > maxButtons && end === totalPages) start = Math.max(1, end - maxButtons + 1);
        if (totalPages > maxButtons && start === 1) end = Math.min(totalPages, start + maxButtons - 1);

        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    };

    return (
        <div className="flex min-h-screen bg-background text-foreground animate-in fade-in duration-500">
            {/* 1. Permanent Sidebar */}
            <FilterSidebar
                filters={filters}
                setFilters={setFilters}
                isOpen={true}
                onClose={() => { }}
                totalResults={filteredResults.length}
            />

            {/* 2. Main Content Area */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Header */}
                <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card shrink-0">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                            {t('appTitle')}
                        </h1>
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-mono">
                            Manual Mode
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Manual Refresh Button */}
                        <button
                            onClick={() => loadData(false)}
                            disabled={loading}
                            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium mr-2"
                            title="Refresh Data from CSV"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'Refreshing...' : 'Refresh Data'}
                        </button>

                        {/* Language Toggle */}
                        <LanguageToggle />

                        <button
                            onClick={() => setShowLogs(true)}
                            className="p-2 text-muted-foreground hover:text-primary hover:bg-secondary rounded-md transition-colors"
                            title={t('viewLogs')}
                        >
                            <Terminal className="h-4 w-4" />
                        </button>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder={t('searchPlaceholder')}
                                className="w-full bg-secondary/50 border-none rounded-md pl-9 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </header>

                {/* Content with Scroll */}
                <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            {t('marketOpp')}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {t('showing')} {filteredResults.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredResults.length)} / {filteredResults.length} {t('assets')}
                        </p>
                    </div>

                    {loading && rawResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground animate-pulse">
                            <RefreshCw className="h-8 w-8 mb-4 animate-spin" />
                            <p>{t('initEngine')}</p>
                        </div>
                    ) : filteredResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-dashed border-border rounded-xl">
                            <p className="text-lg">⚠</p>
                            <p>{t('noStocks')}</p>
                            <button onClick={() => setFilters(DEFAULT_FILTERS)} className="mt-4 text-primary text-sm hover:underline">{t('resetFilters')}</button>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                                {currentData.map((result) => (
                                    <StockCard
                                        key={result.candidate.symbol}
                                        result={result}
                                        onClick={() => setSelectedStock(result)}
                                    />
                                ))}
                            </div>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex justify-center items-center gap-2 pb-8">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1 rounded border border-border disabled:opacity-50 hover:bg-secondary"
                                    >
                                        {t('previous')}
                                    </button>

                                    {getPageNumbers().map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setCurrentPage(p)}
                                            className={`w-8 h-8 rounded flex items-center justify-center text-sm ${currentPage === p ? 'bg-primary text-primary-foreground font-bold' : 'hover:bg-secondary'}`}
                                        >
                                            {p}
                                        </button>
                                    ))}

                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1 rounded border border-border disabled:opacity-50 hover:bg-secondary"
                                    >
                                        {t('next')}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>

            {selectedStock && (
                <StockDetailModal
                    result={selectedStock}
                    onClose={() => setSelectedStock(null)}
                />
            )}
            <LogConsole isOpen={showLogs} onClose={() => setShowLogs(false)} />
        </div>
    );
}
