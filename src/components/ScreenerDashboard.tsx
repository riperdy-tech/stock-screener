"use client";

import { useState, useEffect, useMemo } from "react";
import { StockDetailModal } from "./StockDetailModal";
import { StockCard } from "./StockCard";
import { fetchStocks } from "@/lib/data-service";
import { ScreeningResult } from "@/lib/blueprint";
import { FilterSidebar, FilterState, DEFAULT_FILTERS } from "./FilterSidebar";
import { LogConsole } from "./LogConsole";
import { Terminal, RefreshCw, Search, Play, Pause, Square, Globe } from "lucide-react";
import { useLanguage } from "./LanguageContext";

export function ScreenerDashboard() {
    const { t, language, setLanguage } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [showLogs, setShowLogs] = useState(false);
    const [scannerStatus, setScannerStatus] = useState<'running' | 'paused' | 'stopped'>('stopped');

    const [rawResults, setRawResults] = useState<ScreeningResult[]>([]);
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS); // Restore Filter State
    const [selectedStock, setSelectedStock] = useState<ScreeningResult | null>(null);

    // Initial Load
    useEffect(() => {
        loadData();
        checkStatus();
    }, []);

    // Helper: Toggle Scanner
    async function toggleScanner(action: 'start' | 'pause' | 'stop') {
        try {
            await fetch('/api/scanner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            checkStatus(); // Refresh status immediately
            if (action === 'start') {
                // Wait a moment for file create then reload
                setTimeout(loadData, 2000);
            }
        } catch (e) {
            console.error(e);
        }
    }

    // Checking Status & Polling
    async function checkStatus() {
        try {
            const res = await fetch('/api/scanner');
            const data = await res.json();
            if (data.status) setScannerStatus(data.status);
        } catch (e) { }
    }

    // Combined Polling loop (Status + Data)
    const [progress, setProgress] = useState({ scanned: 0, total: 0, passed: 0, skipped: 0 });
    useEffect(() => {
        const interval = setInterval(async () => {
            await checkStatus();

            // Poll Progress
            try {
                const res = await fetch("/data/progress.json");
                if (res.ok) setProgress(await res.json());
            } catch (e) { /* ignore */ }

            // Live Data Refetch (Only if running or just started)
            // We use a lighter check or just call loadData if we see progress change?
            // For simplicity, refetch data every 5s if running
            if (scannerStatus === 'running') {
                // Actually relying on "live" might meet race conditions if we don't assume atomic writes.
                // Since we implemented atomic writes, this is safe!
                loadData(true); // pass true to silent loading
            }

        }, 2000);
        return () => clearInterval(interval);
    }, [scannerStatus]);

    async function loadData(silent = false) {
        if (!silent) setLoading(true);
        try {
            const rawData = await fetchStocks();

            // ADAPTER: Convert flat JSON to nested ScreeningResult AND specific Units (%)
            const adaptedData = (rawData as any[]).map(item => {
                const metrics = item.metrics || {};
                return {
                    candidate: {
                        symbol: item.symbol,
                        name: item.name || item.symbol,
                        price: item.price || 0,
                        marketCap: item.marketCap || metrics.marketCap || 0,
                        sector: item.sector || "Unknown",
                        revenueGrowth: (metrics.revenueGrowth || 0) * 100, // Dec -> %
                        grossMargin: (metrics.grossMargin || 0) * 100,    // Dec -> %
                        roic: (metrics.roic || 0) * 100,                  // Dec -> %
                        pegRatio: metrics.pegRatio || 0,
                        priceToSales: metrics.psRatio || 0,
                        insiderOwnership: (metrics.insiderOwnership || 0) * 100, // Dec -> %
                        zScore: metrics.zScore || 0,
                        peRatio: item.peRatio || 0,
                    },
                    metrics: metrics,
                    passed: item.status === "Pass",
                    score: item.score || 0,
                    reasons: item.reasons || [],
                    flags: []
                };
            });

            console.log("Loaded & Adapted Data:", adaptedData.length > 0 ? adaptedData[0] : "Empty");
            setRawResults(adaptedData as unknown as ScreeningResult[]);
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

                        {/* Controls */}
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 bg-secondary/30 rounded-lg p-1 border border-border/50">
                                <button
                                    onClick={() => toggleScanner('start')}
                                    disabled={scannerStatus === 'running'}
                                    className={`p-1.5 rounded-md transition-all ${scannerStatus === 'running' ? 'text-green-500 bg-green-500/10' : 'text-muted-foreground hover:text-green-500 hover:bg-green-500/10'}`}
                                    title="Start Scan"
                                >
                                    <Play className="h-4 w-4 fill-current" />
                                </button>
                                <button
                                    onClick={() => toggleScanner('pause')}
                                    disabled={scannerStatus === 'stopped'}
                                    className={`p-1.5 rounded-md transition-all ${scannerStatus === 'paused' ? 'text-yellow-500 bg-yellow-500/10' : 'text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10'}`}
                                    title={scannerStatus === 'paused' ? "Resume" : "Pause"}
                                >
                                    <Pause className="h-4 w-4 fill-current" />
                                </button>
                                <button
                                    onClick={() => toggleScanner('stop')}
                                    disabled={scannerStatus === 'stopped'}
                                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
                                    title="Stop Scan"
                                >
                                    <Square className="h-4 w-4 fill-current" />
                                </button>
                            </div>

                            {/* Text Status Badge */}
                            <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${scannerStatus === 'running' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                scannerStatus === 'paused' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                    'bg-secondary text-muted-foreground border-border'
                                }`}>
                                {t('status')}: {scannerStatus}
                            </div>
                        </div>

                        {(loading || progress.total > 0) && (
                            <div className="flex items-center gap-3 text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full border border-border/50">
                                {scannerStatus === 'running' ? (
                                    <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                                ) : (
                                    <div className={`h-2 w-2 rounded-full ${scannerStatus === 'paused' ? 'bg-yellow-500' : scannerStatus === 'stopped' ? 'bg-red-500' : 'bg-gray-500'}`} />
                                )}

                                <div className="flex flex-col leading-none gap-0.5">
                                    <span className="font-medium">
                                        {progress.scanned} / {progress.total}
                                        <span className="text-muted-foreground/60 ml-1">({((progress.scanned / Math.max(progress.total, 1)) * 100).toFixed(1)}%)</span>
                                    </span>
                                    <span className="text-[10px] opacity-70">
                                        {progress.scanned - (progress.skipped || 0)} {t('saved')} • {progress.passed} {t('gems')} • {progress.skipped || 0} {t('skipped')}
                                    </span>
                                </div>

                                <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden ml-1">
                                    <div
                                        className={`h-full transition-all duration-300 ${scannerStatus === 'paused' ? 'bg-yellow-500' : 'bg-primary'}`}
                                        style={{ width: `${(progress.scanned / Math.max(progress.total, 1)) * 100}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Language Toggle */}
                        <button
                            onClick={() => setLanguage(language === 'en' ? 'ko' : 'en')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary text-sm font-medium transition-colors border border-border/50"
                            title="Switch Language"
                        >
                            <Globe className="h-3.5 w-3.5" />
                            {language === 'en' ? 'KO' : 'EN'}
                        </button>

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
