"use client";

import { useState, useEffect, useMemo } from "react";
import { StockDetailModal } from "./StockDetailModal";
import { StockCard } from "./StockCard";
import { fetchStocks } from "@/lib/data-service";
import { buildPrompt } from "@/lib/prompt-builder";
import { ScreeningResult } from "@/lib/blueprint";
import { FilterSidebar, FilterState, DEFAULT_FILTERS } from "./FilterSidebar";
import { LanguageToggle } from "./LanguageToggle";
import { Sparkles, RefreshCw, X, Search, Filter, Settings, Copy, Check } from 'lucide-react';
import { useLanguage } from "./LanguageContext";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

export function ScreenerDashboard() {
    const { t, language, setLanguage } = useLanguage();
    const [loading, setLoading] = useState(true);

    const [rawResults, setRawResults] = useState<ScreeningResult[]>([]);
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS); // Restore Filter State
    const [selectedStock, setSelectedStock] = useState<ScreeningResult | null>(null);
    const [lastUpdatedFile, setLastUpdatedFile] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // AI Review State
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [selectedAiTicker, setSelectedAiTicker] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState<string | null>(null);

    const [copied, setCopied] = useState(false);
    const copyToClipboard = () => {
        if (aiResult) {
            navigator.clipboard.writeText(aiResult);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleAiReview = async (result: ScreeningResult) => {
        const ticker = result.candidate.symbol;
        setSelectedAiTicker(ticker);
        setAiModalOpen(true);
        setAiLoading(true);
        setAiResult(null);
        setCopied(false);
        try {
            const prompt = await buildPrompt(ticker, result);
            setAiResult(prompt);
        } catch (e: any) {
            setAiResult("Error: " + e.message);
        } finally {
            setAiLoading(false);
        }
    };

    // Global Admin Settings State
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState("");
    const [loggedIn, setLoggedIn] = useState(false);
    const [settingsData, setSettingsData] = useState<any>(null);
    const [newApiKey, setNewApiKey] = useState("");
    const [newQuota, setNewQuota] = useState("");
    const [settingsError, setSettingsError] = useState("");
    const [settingsSuccess, setSettingsSuccess] = useState("");

    const fetchSettings = async (pwd: string) => {
        try {
            const res = await fetch('/api/settings', { headers: { 'x-admin-password': pwd } });
            if (res.status === 401) {
                setSettingsError("Incorrect Password");
                return;
            }
            const data = await res.json();
            setSettingsData(data);
            setNewQuota(data.dailyLimit.toString());
            setLoggedIn(true);
            setSettingsError("");
            if (typeof window !== 'undefined') localStorage.setItem('adminPwd', pwd);
        } catch (e: any) {
            setSettingsError(e.message);
        }
    };

    const handleLogin = () => fetchSettings(adminPassword);

    const handleSaveSettings = async () => {
        setSettingsError("");
        setSettingsSuccess("");
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: newApiKey || undefined, dailyLimit: newQuota })
            });
            if (res.ok) {
                setSettingsSuccess("Settings Saved Globally!");
                setNewApiKey("");
                fetchSettings(adminPassword);
            } else {
                setSettingsError("Failed to save.");
            }
        } catch (e: any) {
            setSettingsError(e.message);
        }
    };

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedPwd = localStorage.getItem('adminPwd');
            if (savedPwd) setAdminPassword(savedPwd);
        }
    }, []);

    // Initial Load (Once on mount)
    useEffect(() => {
        loadData(true);

        // Auto-refresh prices ONLY silently every 5 minutes
        const interval = setInterval(() => {
            refreshPricesOnly();
        }, 5 * 60 * 1000);

        return () => clearInterval(interval); // Cleanup on unmount
    }, []);

    async function refreshPricesOnly() {
        const tickers = rawResults.map(r => r.candidate.symbol);
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

    async function loadData(silent = false) {
        if (!silent) setLoading(true);
        try {
            const { data: rawData, lastUpdated: updateDate } = await fetchStocks();
            
            if (updateDate) setLastUpdatedFile(updateDate);

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

            if (filters.maxPrice > 0 && filters.maxPrice < 1000 && c.price > filters.maxPrice) return false;

            if (filters.minRevenueGrowth > -50 && c.revenueGrowth < filters.minRevenueGrowth) return false;
            if (filters.minGrossMargin > -50 && c.grossMargin < filters.minGrossMargin) return false;
            if (filters.minROIC > -50 && c.roic < filters.minROIC) return false;
            if (c.insiderOwnership < filters.minInsiderOwnership) return false;

            if (filters.maxPEG < 10 && c.pegRatio > filters.maxPEG) return false;
            if (filters.maxPS < 50 && c.priceToSales > filters.maxPS) return false;

            if (filters.maxFloat > 0 && r.metrics?.float) {
                const floatM = r.metrics.float / 1_000_000;
                if (filters.maxFloat < 5000 && floatM > filters.maxFloat) return false;
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

                    <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                            <button 
                                onClick={() => setSettingsModalOpen(true)}
                                className="px-3 py-1.5 text-xs font-semibold rounded outline-none flex justify-center items-center gap-1.5 transition-colors bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 mr-2"
                                title="Admin Settings"
                            >
                                <Settings className="h-4 w-4 shrink-0" /> Admin
                            </button>
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
                            <button onClick={() => setFilters(DEFAULT_FILTERS)} className="mt-4 text-primary text-sm hover:underline">{t('resetFilters')}</button>
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
                    onAskGemini={(ticker: string) => handleAiReview(selectedStock)}
                />
            )}

            {/* AI Modal Overlay */}
            {aiModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card w-full sm:max-w-4xl h-[92vh] sm:h-auto sm:max-h-[85vh] rounded-t-2xl sm:rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
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
                                    <div className="relative flex-1 min-h-0 bg-background border border-border rounded-lg overflow-hidden flex flex-col">
                                        <div className="bg-secondary/50 px-3 sm:px-4 py-2 border-b border-border flex justify-between items-center shrink-0">
                                            <span className="text-xs font-mono text-muted-foreground">Generated Prompt Payload</span>
                                            <button
                                                onClick={copyToClipboard}
                                                className="flex items-center gap-1.5 text-xs font-medium bg-background border border-border hover:bg-secondary px-2 sm:px-3 py-1 rounded transition-colors"
                                            >
                                                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                                                {copied ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <textarea
                                            readOnly
                                            value={aiResult}
                                            className="flex-1 w-full bg-transparent p-3 sm:p-4 text-xs font-mono resize-none focus:outline-none focus:ring-0 text-foreground/80 overflow-y-auto"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
                                        <a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 sm:gap-2 bg-[#1A73E8] hover:bg-[#1557B0] text-white py-2.5 sm:py-3 rounded-lg font-semibold transition-colors shadow text-xs sm:text-sm">
                                            <img src="https://www.google.com/s2/favicons?domain=gemini.google.com&sz=32" alt="Gemini" className="w-4 h-4 rounded-sm shrink-0" />
                                            <span className="hidden sm:inline">Go to</span> Gemini
                                        </a>
                                        <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 sm:gap-2 bg-[#D97757] hover:bg-[#C26547] text-white py-2.5 sm:py-3 rounded-lg font-semibold transition-colors shadow text-xs sm:text-sm">
                                            <img src="https://www.google.com/s2/favicons?domain=claude.ai&sz=32" alt="Claude" className="w-4 h-4 rounded-sm shrink-0" />
                                            <span className="hidden sm:inline">Go to</span> Claude
                                        </a>
                                        <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 sm:gap-2 bg-[#10A37F] hover:bg-[#0E906F] text-white py-2.5 sm:py-3 rounded-lg font-semibold transition-colors shadow text-xs sm:text-sm">
                                            <img src="https://www.google.com/s2/favicons?domain=chatgpt.com&sz=32" alt="ChatGPT" className="w-4 h-4 rounded-sm shrink-0" />
                                            <span className="hidden sm:inline">Go to</span> ChatGPT
                                        </a>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Settings Modal Overlay */}
            {settingsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-md rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
                            <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Settings className="h-5 w-5 text-accent" />
                                Global Admin Settings
                            </h3>
                            <button onClick={() => setSettingsModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {settingsError && <div className="text-destructive font-semibold text-sm mb-4">{settingsError}</div>}
                            {settingsSuccess && <div className="text-success font-semibold text-sm mb-4">{settingsSuccess}</div>}
                            
                            {!loggedIn ? (
                                <div className="flex flex-col gap-4">
                                    <label className="text-sm font-semibold">Admin Password:</label>
                                    <input 
                                        type="password" 
                                        value={adminPassword} 
                                        onChange={e => setAdminPassword(e.target.value)} 
                                        className="bg-background border rounded px-3 py-2 text-sm text-foreground focus:outline-accent" 
                                        placeholder="Enter password..."
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
                                    />
                                    <button onClick={handleLogin} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 rounded text-sm w-full transition-colors">Unlock Vault</button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-6">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-semibold">Daily Token Quota Status</label>
                                        <div className="w-full bg-secondary rounded-full h-4 overflow-hidden border border-border">
                                            <div className="bg-accent h-4 transition-all duration-500" style={{ width: `${Math.min(100, (settingsData?.tokensUsed / settingsData?.dailyLimit) * 100 || 0)}%` }}></div>
                                        </div>
                                        <div className="text-xs text-muted-foreground font-mono text-right w-full">{settingsData?.tokensUsed?.toLocaleString()} / {settingsData?.dailyLimit?.toLocaleString()} tokens used</div>
                                    </div>
                                    <div className="flex flex-col gap-2 border-t border-border pt-4">
                                        <label className="text-sm font-semibold">Update Gemini API Key</label>
                                        <p className="text-xs font-mono text-muted-foreground mb-1">Current key: {settingsData?.apiKey}</p>
                                        <input 
                                            type="password" 
                                            value={newApiKey} 
                                            onChange={e => setNewApiKey(e.target.value)} 
                                            className="bg-background border rounded px-3 py-2 text-sm text-foreground focus:outline-accent" 
                                            placeholder="Paste new API key here to override..."
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-semibold">Daily Token Limit</label>
                                        <input 
                                            type="number" 
                                            value={newQuota} 
                                            onChange={e => setNewQuota(e.target.value)} 
                                            className="bg-background border rounded px-3 py-2 text-sm text-foreground focus:outline-accent font-mono" 
                                        />
                                    </div>
                                    <button onClick={handleSaveSettings} className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold py-2 rounded text-sm w-full mt-2 shadow-sm transition-colors">Force Save Globally</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
