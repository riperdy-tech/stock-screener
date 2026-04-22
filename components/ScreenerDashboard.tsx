"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { StockDetailModal } from "./StockDetailModal";
import { StockCard } from "./StockCard";
import { fetchStocks, Market } from "@/lib/data-service";
import { buildPrompt, buildSimplePrompt } from "@/lib/prompt-builder";
import { ScreeningResult } from "@/lib/blueprint";
import { FilterSidebar, FilterState, STRICT_FILTERS, DEFAULT_FILTERS, ZERO_BASE_FILTERS } from "./FilterSidebar";
import { LanguageToggle } from "./LanguageToggle";
import { Sparkles, RefreshCw, X, Search, Filter, Copy, Check } from 'lucide-react';
import { useLanguage } from "./LanguageContext";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import clsx from "clsx";

export function ScreenerDashboard() {
    const { t, language, setLanguage } = useLanguage();
    const [loading, setLoading] = useState(true);

    const [rawResults, setRawResults] = useState<ScreeningResult[]>([]);
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState<FilterState>(STRICT_FILTERS); // Restore Filter State
    const [selectedStock, setSelectedStock] = useState<ScreeningResult | null>(null);
    const [lastUpdatedFile, setLastUpdatedFile] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [selectedMarket, setSelectedMarket] = useState<Market>('US');
    
    // Maintain a ref to current rawResults for the setInterval closure
    const rawResultsRef = useRef<ScreeningResult[]>([]);
    useEffect(() => { rawResultsRef.current = rawResults; }, [rawResults]);

    // AI Review State
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [selectedAiTicker, setSelectedAiTicker] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState<string | null>(null);
    const [aiSimpleResult, setAiSimpleResult] = useState<string | null>(null);

    const [copied, setCopied] = useState(false);
    const [copiedSimple, setCopiedSimple] = useState(false);

    const copyToClipboard = (text: string, isSimple: boolean) => {
        if (text) {
            navigator.clipboard.writeText(text);
            if (isSimple) {
                setCopiedSimple(true);
                setTimeout(() => setCopiedSimple(false), 2000);
            } else {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        }
    };

    const handleAiReview = async (result: ScreeningResult) => {
        const ticker = result.candidate.symbol;
        setSelectedAiTicker(ticker);
        setAiModalOpen(true);
        setAiLoading(true);
        setAiResult(null);
        setAiSimpleResult(null);
        setCopied(false);
        setCopiedSimple(false);
        try {
            const prompt = await buildPrompt(ticker, result);
            const simplePrompt = await buildSimplePrompt(ticker, result);
            setAiResult(prompt);
            setAiSimpleResult(simplePrompt);
        } catch (e: any) {
            setAiResult("Error: " + e.message);
        } finally {
            setAiLoading(false);
        }
    };



    // Initial Load (Once on mount)
    useEffect(() => {
        // Load filters from localStorage
        if (typeof window !== 'undefined') {
            const savedFilters = localStorage.getItem('screener_filters');
            if (savedFilters) {
                try {
                    setFilters(JSON.parse(savedFilters));
                } catch (e) {
                    console.error("Failed to parse saved filters", e);
                }
            }
        }

        loadData(true, selectedMarket);

        // Auto-refresh prices ONLY silently every 5 minutes
        const interval = setInterval(() => {
            refreshPricesOnly(selectedMarket);
        }, 5 * 60 * 1000);

        return () => clearInterval(interval); // Cleanup on unmount
    }, []);

    // Save filters to localStorage whenever they change
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('screener_filters', JSON.stringify(filters));
        }
    }, [filters]);

    // Re-load data when market changes
    useEffect(() => {
        // Reset filters when switching away from US (since strict filters usually don't apply)
        if (selectedMarket !== 'US') {
            setFilters(ZERO_BASE_FILTERS);
            setSearch("");
        }
        loadData(false, selectedMarket);
    }, [selectedMarket]);

    async function refreshPricesOnly(market: Market) {
        const tickers = rawResultsRef.current.map(r => r.candidate.symbol);
        if (tickers.length === 0) return;

        try {
            const res = await fetch('/api/live-prices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tickers })
            });
            const { prices } = await res.json();
            
            if (prices && Object.keys(prices).length > 0) {
                setRawResults(prev => prev.map(r => {
                    const livePrice = prices[r.candidate.symbol];
                    if (livePrice) {
                        return {
                            ...r,
                            candidate: {
                                ...r.candidate,
                                price: livePrice
                            }
                        };
                    }
                    return r;
                }));
            }
        } catch (err) {
            console.error("Failed to refresh prices:", err);
        }
    }

    async function loadData(silent = false, market: Market) {
        if (!silent) setLoading(true);
        try {
            const { data: rawData, lastUpdated: updateDate } = await fetchStocks(market);
            
            if (updateDate) setLastUpdatedFile(updateDate);

            // ADAPTER: Convert CSV Flat Object to ScreeningResult
            const adaptedData = (rawData as any[]).map(item => {
                // The item is now the flat CSV row parsed by data-service
                // metrics are already top-level in 'item' due to data-service mapping
                return {
                    candidate: {
                        symbol: item.symbol,
                        name: item.name,
                        description: item.description,
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
                        revenueGrowth: item.revenueGrowth,
                        grossMargin: item.grossMargin,
                        roic: item.roic,
                        float: item.floatShares,
                        ocf: item.ocf,
                        capex: item.capex
                    },
                    passed: item._status === "Pass",
                    score: item._score,
                    reasons: item._reasons || [],
                    failCodes: item._failCodes || [],
                    flags: [],
                    financialData: item._financialData,
                    description: item.description,
                    industry: item.industry
                };
            });

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
            // Scaling Market Cap: 
            // US: c.marketCap is in $, filters.minMarketCap is in M $. So mcapM = marketCap / 1M.
            // India: c.marketCap is in Cr. filters.minMarketCap is in Cr. So mcapM = marketCap. 
            // Korea: c.marketCap is in B ₩. filters.minMarketCap is in B ₩. So mcapM = marketCap.
            let mcapValue = c.marketCap;
            if (selectedMarket === 'US') {
                mcapValue = c.marketCap / 1_000_000;
            } else if (selectedMarket === 'India') {
                mcapValue = c.marketCap / 10_000_000; // Crores
            } else if (selectedMarket === 'Korea') {
                mcapValue = c.marketCap / 1_000_000_000; // Billions
            } else if (selectedMarket === 'Taiwan') {
                mcapValue = c.marketCap / 100_000_000; // 億元
            }
            
            if (filters.minMarketCap > 0 && mcapValue < filters.minMarketCap) return false;
            // if (filters.maxMarketCap > 0 && mcapValue > filters.maxMarketCap) return false;

            if (filters.maxPrice > 0 && filters.maxPrice < 1000 && c.price > filters.maxPrice) return false;

            if (filters.minRevenueGrowth > -50 && !(selectedMarket !== 'US' && c.revenueGrowth === 0) && c.revenueGrowth < filters.minRevenueGrowth) return false;
            if (filters.minGrossMargin > -50 && !(selectedMarket !== 'US' && c.grossMargin === 0) && c.grossMargin < filters.minGrossMargin) return false;
            if (filters.minROIC > -50 && !(selectedMarket !== 'US' && c.roic === 0) && c.roic < filters.minROIC) return false;
            if (c.insiderOwnership < filters.minInsiderOwnership) return false;

            if (filters.maxPEG < 10 && c.pegRatio > filters.maxPEG) return false;
            if (filters.maxPS < 50 && c.priceToSales > filters.maxPS) return false;

            if (filters.maxFloat > 0 && r.metrics?.float) {
                const floatM = r.metrics.float / 1_000_000;
                if (filters.maxFloat < 5000 && floatM > filters.maxFloat) return false;
            }

            return true;
        });
    }, [rawResults, search, filters, selectedMarket]);


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
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div 
                    onClick={() => setIsSidebarOpen(false)}
                    className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
                />
            )}
            
            {/* 1. Permanent/Sliding Sidebar */}
            <FilterSidebar
                filters={filters}
                setFilters={setFilters}
                isOpen={isSidebarOpen}
                market={selectedMarket}
                onClose={() => setIsSidebarOpen(false)}
                totalResults={filteredResults.length}
            />

            {/* 2. Main Content Area */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden relative w-full">
                {/* Header */}
                <header className="py-3 md:h-16 border-b border-border/50 flex flex-col md:flex-row flex-shrink-0 items-start md:items-center justify-between px-4 md:px-6 bg-card/70 backdrop-blur-xl sticky top-0 z-30 shadow-sm gap-3 md:gap-0">
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                        <div className="flex items-center gap-2 md:gap-4">
                            <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent truncate max-w-[150px] sm:max-w-none">
                                {t('appTitle')}
                            </h1>
                            <span className="hidden sm:inline-block text-xs text-muted-foreground uppercase tracking-widest font-mono border border-border px-2 py-1 rounded">
                                Phase 1
                            </span>
                        </div>
                        
                        <div className="flex md:hidden items-center gap-2 shrink-0">
                             <Link href="/phase2" className="flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors text-xs font-medium border border-primary/20">
                                → Phase 2
                             </Link>
                             <button onClick={() => setIsSidebarOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors text-xs font-medium border border-border/50">
                                <Filter className="h-3.5 w-3.5" />
                                Filters
                            </button>
                        </div>
                        
                        <Link href="/phase2" className="hidden md:flex text-sm text-primary hover:underline ml-4 font-medium items-center gap-2">
                           → To Phase 2
                        </Link>
                    </div>

                    <div className="flex bg-secondary/50 p-1 rounded-lg border border-border/50 shadow-inner scale-90 md:scale-100 overflow-x-auto no-scrollbar max-w-[280px] sm:max-w-none">
                        {(['US', 'India', 'Korea', 'Taiwan'] as Market[]).map((m) => (
                            <button
                                key={m}
                                onClick={() => setSelectedMarket(m)}
                                className={clsx(
                                    "px-4 py-1.5 text-xs font-bold rounded-md transition-all duration-300 flex items-center gap-2 whitespace-nowrap",
                                    selectedMarket === m 
                                        ? "bg-primary text-primary-foreground shadow-lg scale-105" 
                                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                                )}
                            >
                                <span>{m === 'US' ? '🇺🇸' : m === 'India' ? '🇮🇳' : m === 'Korea' ? '🇰🇷' : '🇹🇼'}</span>
                                <span className={clsx(selectedMarket === m ? "block" : "hidden sm:block")}>
                                    {m === 'US' ? t('usStocks') : m === 'India' ? t('indiaStocks') : m === 'Korea' ? t('koreaStocks') : t('taiwanStocks')}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                            {/* Language Toggle */}
                            <LanguageToggle />
                        </div>

                        <div className="relative w-full md:w-64 mt-1 md:mt-0">
                            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder={t('searchPlaceholder')}
                                className="w-full bg-secondary/50 border border-border/50 md:border-none rounded-md pl-9 pr-4 py-1.5 md:py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:bg-secondary transition-all"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </header>

                {/* Content with Scroll */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            {t('marketOpp')}
                            <span className="flex items-center gap-1.5 text-xs font-mono font-medium text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full" title="Prices auto-refresh every 5 minutes">
                                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse inline-block"></span>
                                LIVE
                            </span>
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {t('showing')} {filteredResults.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredResults.length)} / {filteredResults.length} {t('assets')} · Auto-refreshes every 5 min
                        </p>
                    </div>

                    {loading && rawResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground animate-pulse">
                            <p>{t('initEngine')}</p>
                        </div>
                    ) : filteredResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-dashed border-border rounded-xl">
                            <p className="text-lg">⚠</p>
                            <p>{t('noStocks')}</p>
                            <button onClick={() => setFilters(ZERO_BASE_FILTERS)} className="mt-4 text-primary text-sm hover:underline">{t('resetFilters')}</button>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                                {currentData.map((result, i) => (
                                    <StockCard
                                        key={result.candidate.symbol}
                                        result={result}
                                        onClick={() => setSelectedStock(result)}
                                        index={i}
                                        lastUpdated={lastUpdatedFile}
                                        market={selectedMarket}
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
                    market={selectedMarket}
                    onClose={() => setSelectedStock(null)}
                    onAskGemini={(ticker: string) => handleAiReview(selectedStock)}
                />
            )}

            {/* AI Modal Overlay */}
            {aiModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card w-full sm:max-w-[95vw] lg:max-w-7xl h-[92vh] sm:h-auto sm:max-h-[90vh] rounded-t-2xl sm:rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30 shrink-0">
                            <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                                <Sparkles className="h-5 w-5 text-accent shrink-0" />
                                <span className="truncate">Prompt Exporter: {selectedAiTicker}</span>
                            </h3>
                            <button onClick={() => setAiModalOpen(false)} className="text-muted-foreground hover:text-foreground shrink-0 ml-2">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-3 sm:p-6 overflow-hidden flex flex-col flex-1 min-h-0 gap-3 sm:gap-4">
                            {aiLoading ? (
                                <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-4">
                                    <RefreshCw className="h-8 w-8 animate-spin text-accent" />
                                    <p className="text-sm font-medium text-center">Injecting latest real-time statements and building prompt...</p>
                                </div>
                            ) : aiResult ? (
                                <div className="flex flex-col flex-1 min-h-0 gap-3 sm:gap-4">
                                    <p className="text-sm text-foreground/80 font-medium">
                                        To calculate intrinsic value of the stock, copy paste below prompt to your AI of choice.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-[350px] sm:min-h-[450px]">
                                        {/* Simple Prompt Box */}
                                        <div className="relative flex-1 bg-[#0d121c] border border-border rounded-xl overflow-hidden flex flex-col shadow-inner">
                                            <div className="bg-secondary/40 px-3 sm:px-5 py-2.5 border-b border-border flex justify-between items-center shrink-0">
                                                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider font-semibold">SIMPLE VERSION</span>
                                                <button
                                                    onClick={() => copyToClipboard(aiSimpleResult!, true)}
                                                    className="flex items-center gap-2 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md transition-colors shadow-sm"
                                                >
                                                    {copiedSimple ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                    {copiedSimple ? 'COPIED!' : 'COPY PROMPT'}
                                                </button>
                                            </div>
                                            <textarea
                                                readOnly
                                                value={aiSimpleResult || ""}
                                                className="flex-1 w-full h-full bg-transparent p-4 sm:p-5 text-sm font-mono resize-none focus:outline-none focus:ring-0 text-foreground/90 overflow-y-auto leading-relaxed"
                                            />
                                        </div>

                                        {/* Detailed Prompt Box */}
                                        <div className="relative flex-1 bg-[#0d121c] border border-border rounded-xl overflow-hidden flex flex-col shadow-inner">
                                            <div className="bg-secondary/40 px-3 sm:px-5 py-2.5 border-b border-border flex justify-between items-center shrink-0">
                                                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider font-semibold">DETAILED VERSION</span>
                                                <button
                                                    onClick={() => copyToClipboard(aiResult!, false)}
                                                    className="flex items-center gap-2 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md transition-colors shadow-sm"
                                                >
                                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                    {copied ? 'COPIED!' : 'COPY PROMPT'}
                                                </button>
                                            </div>
                                            <textarea
                                                readOnly
                                                value={aiResult || ""}
                                                className="flex-1 w-full h-full bg-transparent p-4 sm:p-5 text-sm font-mono resize-none focus:outline-none focus:ring-0 text-foreground/90 overflow-y-auto leading-relaxed"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 sm:gap-4 shrink-0 mt-2">
                                        <a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-2.5 bg-[#1A73E8] hover:bg-[#1557B0] text-white py-4 sm:py-6 rounded-xl font-semibold transition-transform hover:scale-[1.02] active:scale-95 shadow-md">
                                            <img src="https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64" alt="Gemini" className="w-8 h-8 rounded-md shrink-0 shadow-sm bg-white p-1" />
                                            <span className="text-sm font-bold tracking-wide">Gemini</span>
                                        </a>
                                        <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-2.5 bg-[#D97757] hover:bg-[#C26547] text-white py-4 sm:py-6 rounded-xl font-semibold transition-transform hover:scale-[1.02] active:scale-95 shadow-md">
                                            <img src="https://www.google.com/s2/favicons?domain=claude.ai&sz=64" alt="Claude" className="w-8 h-8 rounded-md shrink-0 shadow-sm bg-white p-1" />
                                            <span className="text-sm font-bold tracking-wide">Claude</span>
                                        </a>
                                        <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-2.5 bg-[#10A37F] hover:bg-[#0E906F] text-white py-4 sm:py-6 rounded-xl font-semibold transition-transform hover:scale-[1.02] active:scale-95 shadow-md">
                                            <img src="https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64" alt="ChatGPT" className="w-8 h-8 rounded-md shrink-0 shadow-sm bg-white p-1" />
                                            <span className="text-sm font-bold tracking-wide">ChatGPT</span>
                                        </a>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}


        </div>
    );
}
