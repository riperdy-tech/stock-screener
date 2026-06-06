"use client";

import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from "react";
import { StockDetailModal } from "./StockDetailModal";
import { StockCard } from "./StockCard";
import { fetchStocks, fetchReverseScores, fetchParadigmScores, fetchParadigmHistory, Market } from "@/lib/data-service";
import { buildPrompt } from "@/lib/prompt-builder";
import { ParadigmHistoryEvent, ParadigmResult, ReverseResult, ScreeningResult } from "@/lib/blueprint";
import { FilterSidebar, FilterState, STRICT_FILTERS, DEFAULT_FILTERS, ZERO_BASE_FILTERS, ReverseFilterState, DEFAULT_REVERSE_FILTERS, ParadigmFilterState, DEFAULT_PARADIGM_FILTERS, PARADIGM_BAND_LABELS } from "./FilterSidebar";
import { evaluateYoutubeStrategy, matchesYoutubeStrategyFilter, YoutubeStrategyEvaluation, YoutubeStrategyFilter } from "@/lib/youtube-strategy";
import { supabase } from "@/lib/supabase";
import { LanguageToggle } from "./LanguageToggle";
import { LogConsole } from "./LogConsole";
import { Sparkles, RefreshCw, X, Search, Filter, Copy, Check, Terminal, HelpCircle, Telescope, ShieldCheck, Layers3, Youtube, LayoutGrid, Table2, History } from 'lucide-react';
import { useLanguage } from "./LanguageContext";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import clsx from "clsx";

type ScreenMode = '100bagger' | 'reverse' | 'paradigm' | 'youtube';
type StrategyId = ScreenMode;
type ResultView = 'cards' | 'table';

const STRATEGY_META: Record<StrategyId, {
    accent: string;
    icon: typeof Sparkles;
}> = {
    '100bagger': {
        accent: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
        icon: Telescope,
    },
    reverse: {
        accent: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
        icon: ShieldCheck,
    },
    paradigm: {
        accent: 'text-purple-300 border-purple-500/40 bg-purple-500/10',
        icon: Layers3,
    },
    youtube: {
        accent: 'text-red-300 border-red-500/40 bg-red-500/10',
        icon: Youtube,
    },
};

function adaptRowsToScreeningResults(
    rawData: any[],
    reverseScores: Record<string, ReverseResult> = {},
    paradigmScores: Record<string, ParadigmResult> = {}
): ScreeningResult[] {
    return rawData.map(item => {
        // The item is the flat CSV row parsed by data-service.
        const sym = item.symbol || '';
        return {
            candidate: {
                ...item,
                symbol: sym,
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
                floatShares: item.floatShares,
                epsTtm: item.epsTtm,
                previousEpsTtm: item.previousEpsTtm,
                forwardEpsEstimate: item.forwardEpsEstimate,
                priceToBook: item.priceToBook,
                fiveYearAveragePe: item.fiveYearAveragePe,
                monthlyMa20: item.monthlyMa20,
                monthlyCloses: item.monthlyCloses,
                quarterlyEps: item.quarterlyEps,
                consecutiveGrowth: item.consecutiveGrowth,
                epsYoyGrowth: item.epsYoyGrowth,
                revenueYoyGrowth: item.revenueYoyGrowth,
            },
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
            industry: item.industry,
            reverse: reverseScores[sym] || undefined,
            paradigm: paradigmScores[sym] || undefined,
        };
    }) as unknown as ScreeningResult[];
}

function adaptStockJsonRowsToScreeningResults(
    rawData: any[],
    reverseScores: Record<string, ReverseResult> = {}
): ScreeningResult[] {
    return rawData.map(item => {
        const metrics = item.metrics || {};
        const sym = item.symbol || '';
        return {
            candidate: {
                ...item,
                symbol: sym,
                name: item.name,
                description: item.description,
                price: item.price,
                marketCap: item.marketCap,
                sector: item.sector,
                industry: item.industry,

                revenueGrowth: metrics.revenueGrowth,
                grossMargin: metrics.grossMargin,
                roic: metrics.roic,
                pegRatio: metrics.pegRatio,
                priceToSales: metrics.psRatio || 0,
                insiderOwnership: metrics.insiderOwnership,
                zScore: metrics.zScore,
                peRatio: item.peRatio,
                floatShares: metrics.float,
                epsTtm: metrics.epsTtm,
                previousEpsTtm: metrics.previousEpsTtm,
                forwardEpsEstimate: metrics.forwardEpsEstimate,
                priceToBook: metrics.priceToBook,
                fiveYearAveragePe: metrics.fiveYearAveragePe,
                monthlyMa20: metrics.monthlyMa20,
                monthlyCloses: metrics.monthlyCloses,
                quarterlyEps: metrics.quarterlyEps,
                consecutiveGrowth: metrics.consecutiveGrowth,
                epsYoyGrowth: metrics.epsYoyGrowth,
                revenueYoyGrowth: metrics.revenueYoyGrowth,
            },
            metrics: {
                ...metrics,
                psRatio: metrics.psRatio,
                pegRatio: metrics.pegRatio,
                float: metrics.float,
                ocf: metrics.ocf,
                capex: metrics.capex
            },
            passed: item.status === "Pass",
            score: item.score,
            reasons: item.reasons || [],
            failCodes: item.failCodes || [],
            flags: [],
            financialData: {
                Calculated_Metrics: {
                    EPS_TTM: metrics.epsTtm,
                    Forward_EPS_Estimate: metrics.forwardEpsEstimate,
                    Price_to_Book: metrics.priceToBook,
                    PE_5Y_Avg: metrics.fiveYearAveragePe,
                    Monthly_MA_20: metrics.monthlyMa20,
                    EPS_YoY_Growth: metrics.epsYoyGrowth,
                    Prior_Year_TTM_EPS: metrics.previousEpsTtm,
                    Revenue_YoY_Growth: metrics.revenueYoyGrowth,
                    Consecutive_YoY_EPS_Growth: metrics.consecutiveGrowth,
                },
                Monthly_Closes: metrics.monthlyCloses,
                Quarterly_EPS: metrics.quarterlyEps,
            },
            description: item.description,
            industry: item.industry,
            reverse: reverseScores[sym] || undefined,
            paradigm: item.paradigm || undefined,
        };
    }) as unknown as ScreeningResult[];
}

export function ScreenerDashboard() {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);

    const [rawResults, setRawResults] = useState<ScreeningResult[]>([]);
    const [paradigmHistoryEvents, setParadigmHistoryEvents] = useState<ParadigmHistoryEvent[]>([]);
    const [youtubeResults, setYoutubeResults] = useState<ScreeningResult[]>([]);
    const [youtubeLoading, setYoutubeLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState<FilterState>(STRICT_FILTERS); // Restore Filter State
    const [selectedStock, setSelectedStock] = useState<ScreeningResult | null>(null);
    const [lastUpdatedFile, setLastUpdatedFile] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLogOpen, setIsLogOpen] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [selectedMarket, setSelectedMarket] = useState<Market>('US');
    
    // Phase 10: Screen mode (mutually exclusive)
    const [screenMode, setScreenMode] = useState<ScreenMode>('100bagger');
    const [reverseFilters, setReverseFilters] = useState<ReverseFilterState>(DEFAULT_REVERSE_FILTERS);
    const [paradigmFilters, setParadigmFilters] = useState<ParadigmFilterState>(DEFAULT_PARADIGM_FILTERS);
    const [youtubeFilters, setYoutubeFilters] = useState<YoutubeStrategyFilter[]>(["any"]);
    const [strictPassOnly, setStrictPassOnly] = useState(false);
    const [resultView, setResultView] = useState<ResultView>('cards');
    
    // Maintain a ref to current rawResults for the setInterval closure
    const rawResultsRef = useRef<ScreeningResult[]>([]);
    useEffect(() => { rawResultsRef.current = rawResults; }, [rawResults]);

    // AI Review State
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [selectedAiTicker, setSelectedAiTicker] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState<string | null>(null);
    

    const [copied, setCopied] = useState(false);
    const [dsCopied, setDsCopied] = useState(false);
    

    const copyToClipboard = (text: string) => {
        if (text) {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };
    
    // Deepseek states
    const [dsPassword, setDsPassword] = useState("");
    const [showDsPassword, setShowDsPassword] = useState(false);
    const [dsLoading, setDsLoading] = useState(false);
    const [dsResult, setDsResult] = useState<any>(null);
    const [dsError, setDsError] = useState("");
    
    const [backgroundDsTask, setBackgroundDsTask] = useState<{ticker: string, status: 'running' | 'completed' | 'error' | 'success', message?: string} | null>(null);

    // Phase 11d: Batch deep-dive state
    const [batchN, setBatchN] = useState(25);
    const [showBatchConfirm, setShowBatchConfirm] = useState(false);
    const [batchId, setBatchId] = useState<string | null>(null);
    const [batchProgress, setBatchProgress] = useState<{ completed: number; failed: number; total: number; tickers?: { ticker: string; status: string }[] } | null>(null);
    const [batchDispatching, setBatchDispatching] = useState(false);
    const [showBatchPassword, setShowBatchPassword] = useState(false);
    const [batchStatus, setBatchStatus] = useState<string | null>(null); // user-visible feedback
    const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());

    const toggleYoutubeFilter = (filter: YoutubeStrategyFilter) => {
        setYoutubeFilters(prev => {
            if (filter === "any") return ["any"];

            const selected = prev.filter(value => value !== "any");
            if (selected.includes(filter)) {
                const next = selected.filter(value => value !== filter);
                return next.length > 0 ? next : ["any"];
            }

            return [...selected, filter];
        });
    };

    const matchesSelectedYoutubeFilters = useCallback((evaluation: YoutubeStrategyEvaluation) => {
        if (youtubeFilters.includes("any")) {
            return matchesYoutubeStrategyFilter(evaluation, "any");
        }

        return youtubeFilters.every(filter => matchesYoutubeStrategyFilter(evaluation, filter));
    }, [youtubeFilters]);

    const dismissBatchPanel = (id: string | null = batchId) => {
        if (id) {
            try {
                const dismissed = JSON.parse(localStorage.getItem('dismissedBatchIds') || '[]');
                const next = Array.isArray(dismissed) ? Array.from(new Set([...dismissed, id])).slice(-50) : [id];
                localStorage.setItem('dismissedBatchIds', JSON.stringify(next));
            } catch { /* ignore */ }
        }
        setBatchProgress(null);
        setBatchId(null);
        setBatchStatus(null);
    };
    
    const handleDeepseekRun = async () => {
        if (!dsPassword) { setDsError("Please enter password"); return; }
        setDsLoading(true); setDsError("");
        setBackgroundDsTask({ ticker: selectedAiTicker || "Unknown", status: 'running' });
        try {
            console.log("Starting analysis for:", selectedAiTicker);
            const res = await fetch("/api/analysis", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    password: dsPassword,
                    ticker: selectedAiTicker,
                    prompt: aiResult
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server error: ${res.status}`);

            if (data.status === 'queued') {
                // Background worker started
                setDsLoading(false);
                setDsPassword("");
                setShowDsPassword(false);
                setBackgroundDsTask({ 
                    ticker: selectedAiTicker || "Unknown", 
                    status: 'running', 
                    message: `Deepseek V4.0 Pro is thinking for ${selectedAiTicker}... This may take 2-3 minutes.` 
                });
                return;
            }

            const dsResultData = data;
            setDsResult(dsResultData);
            setDsLoading(false);
            setDsPassword("");
            setShowDsPassword(false);
            
            // Background task update
            setBackgroundDsTask({ ticker: selectedAiTicker || "Unknown", status: 'success' });
            
        } catch (e: any) {
            console.error("Analysis Error:", e);
            setDsError(`Connection Error: ${e.message}. (Check if your internet or ad-blocker is blocking the request)`);
            setDsLoading(false);
            setBackgroundDsTask({ ticker: selectedAiTicker || "Unknown", status: 'error', message: e.message });
        } finally {
            setDsLoading(false);
        }
    };
    
    const downloadDsResult = () => {
        if (!dsResult) return;
        const text = `Date: ${dsResult.timestamp}\nCost: $${dsResult.cost}\n\n${dsResult.content}`;
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedAiTicker}_deepseek_report.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const copyDsResult = () => {
        if (!dsResult) return;
        navigator.clipboard.writeText(dsResult.content);
        setDsCopied(true);
        setTimeout(() => setDsCopied(false), 2000);
    };

    // Phase 11d: Batch deep-dive dispatch
    const handleBatchDispatch = async () => {
        if (!dsPassword) { setBatchStatus("Enter password first"); return; }
        setShowBatchConfirm(false);
        setBatchDispatching(true);
        setBatchStatus("Dispatching...");

        const topN = selectedTickers.size > 0
            ? Array.from(selectedTickers)
            : filteredResults
                .filter(r => r.reverse && r.reverse.rev_band && r.reverse.rev_band !== 'Excluded')
                .slice(0, batchN)
                .map(r => r.candidate.symbol);

        if (topN.length === 0) {
            setBatchDispatching(false);
            setBatchStatus("No stocks selected.");
            return;
        }

        try {
            const res = await fetch("/api/analysis/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tickers: topN, password: dsPassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server error: ${res.status}`);
            setBatchId(data.batch_id);
            setBatchProgress({ completed: 0, failed: 0, total: data.queued });
            const msg = `Dispatched ${data.queued} analyses${data.skipped ? ` (${data.skipped} skipped - already analyzed)` : ''} - waiting for workers...`;
            setBatchStatus(msg);
            setDsPassword("");
        } catch (e: any) {
            console.error("Batch dispatch error:", e);
            setBatchStatus(`Error: ${e.message}`);
        } finally {
            setBatchDispatching(false);
        }
    };

    // Phase 11d: Batch progress polling
    useEffect(() => {
        if (!batchId) return;
        const poll = async () => {
            try {
                const { data, error } = await supabase
                    .from('ai_reports')
                    .select('ticker, status')
                    .eq('batch_id', batchId);
                if (error) return;
                const completed = data.filter((r: any) => r.status === 'completed').length;
                const failed = data.filter((r: any) => r.status === 'error').length;
                setBatchProgress({ completed, failed, total: data.length, tickers: data });
            } catch (e) { /* silent */ }
        };
        poll();
        const interval = setInterval(poll, 5000);
        return () => clearInterval(interval);
    }, [batchId]);

    // Auto-hide batch panel 8s after completion
    useEffect(() => {
        if (!batchId || !batchProgress) return;
        const done = batchProgress.completed + batchProgress.failed >= batchProgress.total;
        if (!done) return;
        const t = setTimeout(() => {
            dismissBatchPanel(batchId);
        }, 8000);
        return () => clearTimeout(t);
    }, [batchId, batchProgress]);


    const handleAiReview = async (result: ScreeningResult) => {
        const ticker = result.candidate.symbol;
        setSelectedAiTicker(ticker);
        setAiModalOpen(true);
        setAiLoading(true);
        setAiResult(null);
        setCopied(false);
        setDsCopied(false);
        setDsResult(null);
        setDsError("");
        setShowDsPassword(false);
        
        try {
            const prompt = await buildPrompt(ticker, result);
            setAiResult(prompt);
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
        loadYoutubeData();
    }, []);

    // Save filters to localStorage whenever they change
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('screener_filters', JSON.stringify(filters));
        }
    }, [filters]);

    useEffect(() => {
        if (screenMode === 'youtube' && selectedMarket !== 'US') {
            setSelectedMarket('US');
        }
    }, [screenMode, selectedMarket]);

    // Re-load data when market changes
    useEffect(() => {
        // Reset filters when switching away from US (since strict filters usually don't apply)
        if (selectedMarket !== 'US') {
            setFilters(ZERO_BASE_FILTERS);
            setSearch("");
        }
        loadData(false, selectedMarket);
    }, [selectedMarket]);

    async function loadData(silent = false, market: Market) {
        if (!silent) setLoading(true);
        try {
            const { data: rawData, lastUpdated: updateDate } = await fetchStocks(market);
            
            if (updateDate) setLastUpdatedFile(updateDate);

            // Phase 9: Load reverse screening engine results
            const reverseScores = market === 'US' ? await fetchReverseScores() : {};
            // WS1: Load paradigm dimension results
            const paradigmScores = market === 'US' ? await fetchParadigmScores() : {};
            const paradigmHistory = market === 'US' ? await fetchParadigmHistory() : { events: [] };

            setRawResults(adaptRowsToScreeningResults(rawData as any[], reverseScores, paradigmScores));
            setParadigmHistoryEvents(paradigmHistory.events);
        } catch (err) {
            console.error("Failed to load or adapt data:", err);
            setRawResults([]);
            setParadigmHistoryEvents([]);
        }
        setLoading(false);
    }

    async function loadYoutubeData() {
        setYoutubeLoading(true);
        try {
            const { data: rawData } = await fetchStocks('US');
            const [reverseScores, paradigmScores] = await Promise.all([
                fetchReverseScores().catch(() => ({})),
                fetchParadigmScores().catch(() => ({})),
            ]);
            setYoutubeResults(adaptRowsToScreeningResults(rawData as any[], reverseScores, paradigmScores));
        } catch (err) {
            console.error("Failed to load YouTube strategy universe:", err);
            setYoutubeResults([]);
        } finally {
            setYoutubeLoading(false);
        }
    }

    const youtubeSourceResults = youtubeResults.length > 0
        ? youtubeResults
        : selectedMarket === 'US'
            ? rawResults
            : [];
    const isYoutubeUniverseLoading = screenMode === 'youtube' && youtubeSourceResults.length === 0 && youtubeLoading;

    const youtubeEvaluations = useMemo(() => {
        const map = new Map<string, YoutubeStrategyEvaluation>();
        youtubeSourceResults.forEach(result => {
            map.set(result.candidate.symbol, evaluateYoutubeStrategy(result));
        });
        return map;
    }, [youtubeSourceResults]);

    // Filtering Logic
    const filteredResults = useMemo(() => {
        // WS1-T6+: Paradigm mode — exclusive paradigm filters
        if (screenMode === 'paradigm') {
            return rawResults.filter(r => {
                const p = r.paradigm;
                // Exclude stocks without paradigm or with no theme tagging
                if (!p || !p.pdm_themes || p.pdm_themes.length === 0) return false;

                // Band filter
                if (paradigmFilters.bands.length > 0 && p.pdm_band) {
                    if (!paradigmFilters.bands.includes(p.pdm_band)) return false;
                }

                // Theme filter (any-match: stock passes if it shares any selected theme)
                if (paradigmFilters.themes.length > 0) {
                    const overlap = p.pdm_themes.some((t: string) => paradigmFilters.themes.includes(t));
                    if (!overlap) return false;
                }

                // Industry substring filter
                if (paradigmFilters.industryQuery.trim()) {
                    const q = paradigmFilters.industryQuery.trim().toLowerCase();
                    const ind = (r.candidate.industry || '').toLowerCase();
                    if (!ind.includes(q)) return false;
                }

                // Score thresholds
                if (paradigmFilters.minSignal > 0 && (p.pdm_signal == null || p.pdm_signal < paradigmFilters.minSignal)) return false;
                if (paradigmFilters.minMembership > 0 && (p.pdm_membership_score == null || p.pdm_membership_score < paradigmFilters.minMembership)) return false;
                if (paradigmFilters.minMomentum > 0 && (p.pdm_momentum_score == null || p.pdm_momentum_score < paradigmFilters.minMomentum)) return false;
                if (paradigmFilters.minGate > 0 && (p.pdm_economics_gate == null || p.pdm_economics_gate < paradigmFilters.minGate)) return false;

                // Flag filters
                const flags = p.pdm_flags || [];
                if (paradigmFilters.acceleratingOnly && !flags.includes('accelerating')) return false;
                if (paradigmFilters.bridgedOnly && !flags.includes('gate_bridged_forward')) return false;
                if (paradigmFilters.multiThemeOnly && p.pdm_themes.length < 2) return false;
                if (paradigmFilters.macroWarningOnly && !flags.some((f: string) => f.startsWith('macro_'))) return false;

                // Search match (symbol/name)
                const c = r.candidate;
                const searchMatch = !search ||
                    c.symbol.toLowerCase().includes(search.toLowerCase()) ||
                    c.name.toLowerCase().includes(search.toLowerCase());
                if (!searchMatch) return false;

                return true;
            }).sort((a, b) => {
                // Sort by pdm_signal descending (best opportunities first)
                const sigA = a.paradigm?.pdm_signal ?? 0;
                const sigB = b.paradigm?.pdm_signal ?? 0;
                return sigB - sigA;
            });
        }

        // Phase 10: Reverse Engine mode — exclusive reverse filters
        if (screenMode === 'reverse') {
            return rawResults.filter(r => {
                const rev = r.reverse;
                // Exclude stocks without reverse data or excluded/rejected bands
                if (!rev || !rev.rev_band || rev.rev_band === 'Excluded') return false;

                // Archetype filter
                if (reverseFilters.archetypes.length > 0 && rev.rev_archetype) {
                    if (!reverseFilters.archetypes.includes(rev.rev_archetype)) return false;
                }

                // Band filter
                if (reverseFilters.bands.length > 0 && rev.rev_band) {
                    if (!reverseFilters.bands.includes(rev.rev_band)) return false;
                }

                // Min composite
                if (reverseFilters.minComposite > 0 && (rev.rev_composite == null || rev.rev_composite < reverseFilters.minComposite)) return false;

                // Min MoS
                if (reverseFilters.minMoS > 0 && (rev.rev_mos == null || rev.rev_mos < reverseFilters.minMoS)) return false;

                // Min survivability
                if (reverseFilters.minSurvivability > 0 && (rev.rev_survivability == null || rev.rev_survivability < reverseFilters.minSurvivability)) return false;

                // Nominated only
                if (reverseFilters.nominatedOnly && !rev.rev_nominated) return false;

                // Search match (symbol/name)
                const c = r.candidate;
                const searchMatch = !search ||
                    c.symbol.toLowerCase().includes(search.toLowerCase()) ||
                    c.name.toLowerCase().includes(search.toLowerCase());
                if (!searchMatch) return false;

                return true;
            }).sort((a, b) => {
                // Sort by rev_composite descending
                const compA = a.reverse?.rev_composite ?? 0;
                const compB = b.reverse?.rev_composite ?? 0;
                return compB - compA;
            });
        }

        if (screenMode === 'youtube') {
            return youtubeSourceResults.filter(r => {
                const evaluation = youtubeEvaluations.get(r.candidate.symbol);
                if (!evaluation || !matchesSelectedYoutubeFilters(evaluation)) return false;

                const c = r.candidate;
                const searchMatch = !search ||
                    c.symbol.toLowerCase().includes(search.toLowerCase()) ||
                    c.name.toLowerCase().includes(search.toLowerCase());
                return searchMatch;
            }).sort((a, b) => {
                const aEval = youtubeEvaluations.get(a.candidate.symbol);
                const bEval = youtubeEvaluations.get(b.candidate.symbol);
                const aMatches = aEval?.matchedStrategies.length ?? 0;
                const bMatches = bEval?.matchedStrategies.length ?? 0;
                if (aMatches !== bMatches) return bMatches - aMatches;
                const aSeed = aEval?.turnaroundSeed.passed ? 1 : 0;
                const bSeed = bEval?.turnaroundSeed.passed ? 1 : 0;
                if (aSeed !== bSeed) return aSeed - bSeed;
                return (b.score || 0) - (a.score || 0);
            });
        }

        // 100-Bagger mode — existing behavior unchanged
        return rawResults.filter(r => {
            const c = r.candidate;
            if (strictPassOnly && !r.passed) return false;

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
    }, [rawResults, youtubeSourceResults, search, filters, selectedMarket, screenMode, reverseFilters, paradigmFilters, youtubeEvaluations, matchesSelectedYoutubeFilters, strictPassOnly]);


    // Pagination Logic
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    useEffect(() => {
        setCurrentPage(1);
    }, [search, filters, screenMode, reverseFilters, paradigmFilters, youtubeFilters, selectedMarket, strictPassOnly]);

    const filteredCount = filteredResults.length;
    const youtubeTotals = useMemo(() => {
        const evaluations = Array.from(youtubeEvaluations.values());
        return {
            any: evaluations.filter(e => e.matchedStrategies.length > 0).length,
            earningsMomentum: evaluations.filter(e => e.earningsMomentum.passed).length,
            deepValueReversal: evaluations.filter(e => e.deepValueReversal.passed).length,
            turnaroundSeed: evaluations.filter(e => e.turnaroundSeed.passed).length,
            turnaroundScaleIn: evaluations.filter(e => e.turnaroundScaleIn.passed).length,
        };
    }, [youtubeEvaluations]);
    const strategyCounts = useMemo(() => ({
        '100bagger': rawResults.filter(r => r.passed).length,
        reverse: rawResults.filter(r => r.reverse && r.reverse.rev_band && r.reverse.rev_band !== 'Excluded').length,
        paradigm: rawResults.filter(r => r.paradigm?.pdm_themes && r.paradigm.pdm_themes.length > 0).length,
        youtube: youtubeTotals.any,
    }), [rawResults, youtubeTotals]);
    const isBaseUniverseLoading = loading && rawResults.length === 0;
    const isYoutubeCountLoading = youtubeLoading && youtubeSourceResults.length === 0;
    const formatCount = (value: number, isLoading = isBaseUniverseLoading) => isLoading ? t('loading') : value.toLocaleString();
    const reverseBandCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        rawResults.forEach(r => {
            const band = r.reverse?.rev_band;
            if (band && band !== 'Excluded' && band !== 'Reject') counts[band] = (counts[band] || 0) + 1;
        });
        return counts;
    }, [rawResults]);
    const paradigmBandCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        rawResults.forEach(r => {
            const band = r.paradigm?.pdm_band;
            if (band) counts[band] = (counts[band] || 0) + 1;
        });
        return counts;
    }, [rawResults]);
    const paradigmHistoryBySymbol = useMemo(() => {
        const bySymbol = new Map<string, ParadigmHistoryEvent[]>();
        paradigmHistoryEvents.forEach(event => {
            const events = bySymbol.get(event.symbol) || [];
            if (events.length < 5) events.push(event);
            bySymbol.set(event.symbol, events);
        });
        return bySymbol;
    }, [paradigmHistoryEvents]);
    const recentParadigmEvents = useMemo(() => paradigmHistoryEvents.slice(0, 6), [paradigmHistoryEvents]);
    const strategyMeta = useMemo(() => ({
        '100bagger': {
            ...STRATEGY_META['100bagger'],
            title: t('strategy100Title'),
            eyebrow: t('strategy100Eyebrow'),
            description: t('strategy100Description'),
            metricLabel: t('strategy100Metric'),
        },
        reverse: {
            ...STRATEGY_META.reverse,
            title: t('strategyReverseTitle'),
            eyebrow: t('strategyReverseEyebrow'),
            description: t('strategyReverseDescription'),
            metricLabel: t('strategyReverseMetric'),
        },
        paradigm: {
            ...STRATEGY_META.paradigm,
            title: t('strategyParadigmTitle'),
            eyebrow: t('strategyParadigmEyebrow'),
            description: t('strategyParadigmDescription'),
            metricLabel: t('strategyParadigmMetric'),
        },
        youtube: {
            ...STRATEGY_META.youtube,
            title: t('strategyYoutubeTitle'),
            eyebrow: t('strategyYoutubeEyebrow'),
            description: t('strategyYoutubeDescription'),
            metricLabel: t('strategyYoutubeMetric'),
        },
    }), [t]);
    const youtubeFilterMeta = useMemo(() => [
        { value: "any" as const, label: t('youtubeAny'), description: t('youtubeAnyDesc') },
        { value: "earningsMomentum" as const, label: t('youtubeEarnings'), description: t('youtubeEarningsDesc') },
        { value: "deepValueReversal" as const, label: t('youtubeDeepValue'), description: t('youtubeDeepValueDesc') },
        { value: "turnaroundSeed" as const, label: t('youtubeSeed'), description: t('youtubeSeedDesc') },
        { value: "turnaroundScaleIn" as const, label: t('youtubeScaleIn'), description: t('youtubeScaleInDesc') },
    ], [t]);
    const activeStrategy = strategyMeta[screenMode];
    const activeMetric = screenMode === 'reverse'
        ? t('metricComposite')
        : screenMode === 'paradigm'
            ? t('metricParadigmSignal')
            : screenMode === 'youtube'
                ? t('metricVideoSignal')
                : t('metric100Score');
    const activeSummary = screenMode === 'reverse'
        ? t('summaryReverse')
        : screenMode === 'paradigm'
            ? t('summaryParadigm')
            : screenMode === 'youtube'
                ? t('summaryYoutube')
                : t('summary100');

    const handleStrategySwitch = (id: StrategyId) => {
        setScreenMode(id);
        setSelectedTickers(new Set());

        if (id === 'youtube') {
            setYoutubeFilters(["any"]);
            setSearch("");
            if (selectedMarket !== 'US') {
                setSelectedMarket('US');
            }
            if (youtubeResults.length === 0 && !youtubeLoading) {
                loadYoutubeData();
            }
        }
    };

    const activeFilterChips = useMemo(() => {
        const searchChip = search.trim() ? [`Search: ${search.trim()}`] : [];

        if (screenMode === 'reverse') {
            return [
                ...searchChip,
                ...reverseFilters.bands.map(band => `Band: ${band}`),
                ...reverseFilters.archetypes.map(arch => `Archetype ${arch}`),
                reverseFilters.minComposite > 0 ? `Composite >= ${reverseFilters.minComposite}` : null,
                reverseFilters.minMoS > 0 ? `MoS >= ${reverseFilters.minMoS}` : null,
                reverseFilters.minSurvivability > 0 ? `Survivability >= ${reverseFilters.minSurvivability}` : null,
                reverseFilters.nominatedOnly ? 'Nominated only' : null,
            ].filter((chip): chip is string => Boolean(chip));
        }

        if (screenMode === 'paradigm') {
            return [
                ...searchChip,
                ...paradigmFilters.bands.map(band => `Band: ${PARADIGM_BAND_LABELS[band] || band}`),
                ...paradigmFilters.themes.map(theme => `Theme: ${theme}`),
                paradigmFilters.industryQuery.trim() ? `Industry: ${paradigmFilters.industryQuery.trim()}` : null,
                paradigmFilters.minSignal > 0 ? `Signal >= ${paradigmFilters.minSignal}` : null,
                paradigmFilters.minMembership > 0 ? `Membership >= ${paradigmFilters.minMembership}` : null,
                paradigmFilters.minMomentum > 0 ? `Momentum >= ${paradigmFilters.minMomentum}` : null,
                paradigmFilters.minGate > 0 ? `Gate >= ${paradigmFilters.minGate}` : null,
                paradigmFilters.acceleratingOnly ? 'Accelerating' : null,
                paradigmFilters.macroWarningOnly ? 'Macro warning' : null,
                paradigmFilters.bridgedOnly ? 'Forward EPS bridge' : null,
                paradigmFilters.multiThemeOnly ? 'Multi-theme' : null,
            ].filter((chip): chip is string => Boolean(chip));
        }

        if (screenMode === 'youtube') {
            if (youtubeFilters.includes("any")) return [...searchChip, t('youtubeAny')];
            const labels = youtubeFilters
                .map(filter => youtubeFilterMeta.find(item => item.value === filter)?.label)
                .filter((label): label is string => Boolean(label));
            return [...searchChip, `YT overlap: ${labels.join(' + ')}`];
        }

        return [
            ...searchChip,
            strictPassOnly ? t('strictPass') : null,
            `Market cap >= ${filters.minMarketCap}${selectedMarket === 'US' ? 'M' : selectedMarket === 'Korea' ? 'B KRW' : '00M TWD'}`,
            filters.maxPrice < 1000 ? `Price <= ${selectedMarket === 'US' ? '$' : ''}${filters.maxPrice}` : null,
            filters.minRevenueGrowth > -50 ? `Growth >= ${filters.minRevenueGrowth}%` : null,
            filters.minGrossMargin > -50 ? `Gross margin >= ${filters.minGrossMargin}%` : null,
            filters.minROIC > -50 ? `ROIC >= ${filters.minROIC}%` : null,
            filters.maxPS < 50 ? `P/S <= ${filters.maxPS}` : null,
            filters.maxPEG < 10 ? `PEG <= ${filters.maxPEG}` : null,
            filters.minInsiderOwnership > 0 ? `Insider >= ${filters.minInsiderOwnership}%` : null,
            filters.maxFloat < 5000 ? `Float <= ${filters.maxFloat}M` : null,
        ].filter((chip): chip is string => Boolean(chip));
    }, [screenMode, reverseFilters, paradigmFilters, youtubeFilters, youtubeFilterMeta, filters, selectedMarket, search, t, strictPassOnly]);
    const visibleFilterChips = activeFilterChips.slice(0, 8);
    const hiddenFilterChipCount = Math.max(activeFilterChips.length - visibleFilterChips.length, 0);
    const resetActiveFilters = () => {
        setSearch("");
        if (screenMode === 'reverse') {
            setReverseFilters(DEFAULT_REVERSE_FILTERS);
        } else if (screenMode === 'paradigm') {
            setParadigmFilters(DEFAULT_PARADIGM_FILTERS);
        } else if (screenMode === 'youtube') {
            setYoutubeFilters(["any"]);
        } else {
            setStrictPassOnly(false);
            setFilters(ZERO_BASE_FILTERS);
        }
    };
    const totalPages = Math.ceil(filteredCount / ITEMS_PER_PAGE);
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
                totalResults={filteredCount}
                screenMode={screenMode}
                reverseFilters={reverseFilters}
                setReverseFilters={setReverseFilters}
                paradigmFilters={paradigmFilters}
                setParadigmFilters={setParadigmFilters}
                youtubeFilters={youtubeFilters}
                onYoutubeFilterToggle={toggleYoutubeFilter}
                batchN={batchN}
                onBatchNChange={setBatchN}
                batchDispatching={batchDispatching}
                batchStatus={batchStatus}
                onDeepDiveClick={() => {
                    if (!dsPassword) { setShowBatchPassword(true); return; }
                    setShowBatchConfirm(true);
                }}
                selectedCount={selectedTickers.size}
            />

            {/* 2. Main Content Area */}
            <main className="relative flex min-w-0 flex-1 flex-col overflow-x-hidden">
                {/* Header */}
                <header className="sticky top-0 z-30 flex flex-shrink-0 flex-col gap-2 border-b border-border/50 bg-card/70 px-3 py-3 shadow-sm backdrop-blur-xl md:flex-row md:flex-wrap md:px-5">
                    <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex items-center gap-2 md:gap-4">
                            <h1 className="max-w-[min(54vw,20rem)] truncate text-xl font-black text-foreground sm:max-w-none md:text-2xl">
                                {t('appTitle')}
                            </h1>
                            <button 
                                onClick={() => setShowHelp(true)}
                                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                                title={t('howScoringWorks')}
                                aria-label={t('openScoringGuide')}
                            >
                                <HelpCircle className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="relative hidden w-full max-w-sm md:block">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder={t('searchPlaceholder')}
                                className="w-full rounded-md border border-border/50 bg-secondary/45 py-2 pl-9 pr-3 text-sm transition-all focus:bg-secondary focus:outline-none focus:ring-1 focus:ring-primary"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        
                        <div className="flex md:hidden items-center gap-2 shrink-0">
                             <Link href="/reports" className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground active:scale-95">
                                <Sparkles className="h-4 w-4" />
                                {t('recentReports')}
                             </Link>
                             <button onClick={() => setIsSidebarOpen(true)} className="rounded-full border border-border/50 bg-secondary p-2 text-secondary-foreground transition-colors hover:bg-secondary/80" aria-label="Open filters">
                                <Filter className="h-4 w-4" />
                            </button>
                        </div>
                        
                        <Link href="/reports" className="hidden shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground active:scale-95 md:flex">
                           <Sparkles className="h-3.5 w-3.5" /> {t('recentReports')}
                        </Link>
                    </div>

                    <div className="flex w-full max-w-full flex-1 overflow-x-auto rounded-md border border-border/50 bg-secondary/45 p-0.5 shadow-inner no-scrollbar md:min-w-0 md:w-auto">
                        {(['US', 'Korea', 'Taiwan'] as Market[]).map((m) => (
                            <button
                                key={m}
                                onClick={() => setSelectedMarket(m)}
                                className={clsx(
                                    "flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-1.5 text-sm font-bold transition-all duration-200",
                                    selectedMarket === m 
                                                ? "bg-primary text-primary-foreground shadow"
                                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                                )}
                            >                                <span className="font-black">{m}</span>
                                <span className="hidden 2xl:inline">
                                    {m === 'US' ? t('usStocks') : m === 'Korea' ? t('koreaStocks') : t('taiwanStocks')}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                            <button 
                                onClick={() => setIsLogOpen(true)} 
                                className="flex items-center gap-1.5 rounded-md border border-border/50 bg-secondary/45 px-3 py-2 text-xs font-bold text-foreground/80 shadow-sm backdrop-blur-md transition-all duration-300 hover:bg-secondary hover:text-foreground active:scale-95"
                                aria-label="Open system logs"
                            >
                                <div className="relative">
                                    <Terminal className="h-4 w-4" />
                                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_var(--success)]"></span>
                                </div>
                                <span className="hidden sm:inline tracking-tight">{t('systemLogs')}</span>
                            </button>
                            {/* Language Toggle */}
                            <LanguageToggle />
                        </div>

                        <div className="relative w-full md:hidden">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder={t('searchPlaceholder')}
                                className="w-full rounded-md border border-border/50 bg-secondary/50 py-2 pl-9 pr-3 text-sm transition-all focus:bg-secondary focus:outline-none focus:ring-1 focus:ring-primary"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </header>

                {/* Content with Scroll */}
                    <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 scroll-smooth">
                    <section className="mb-4">
                        <div className="mb-2 flex flex-col gap-1 xl:flex-row xl:items-end xl:justify-between">
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">{t('investingLens')}</div>
                                <h2 className="text-xl font-black tracking-tight text-foreground md:text-2xl">{t('strategyBoard')}</h2>
                            </div>
                            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                                {t('strategyBoardDesc')}
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 pb-1 sm:grid-cols-2 xl:grid-cols-4">
                            {(Object.keys(strategyMeta) as StrategyId[]).map((id) => {
                                const meta = strategyMeta[id];
                                const Icon = meta.icon;
                                const isActive = id === screenMode;
                                const count = strategyCounts[id];
                                const countLabel = formatCount(count, id === 'youtube' ? isYoutubeCountLoading : isBaseUniverseLoading);
                                const content = (
                                    <div className={clsx(
                                        "h-full rounded-lg border p-3 text-left transition-all",
                                        isActive
                                            ? "border-primary/70 bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]"
                                            : "border-border/70 bg-card/70 hover:border-primary/40 hover:bg-secondary/30"
                                    )}>
                                        <div className="flex items-center gap-3">
                                            <div className={clsx("shrink-0 rounded-md border p-2", meta.accent)}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-xs font-black uppercase tracking-wider text-muted-foreground">{meta.eyebrow}</div>
                                                <div className="truncate text-base font-black text-foreground">{meta.title}</div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="font-mono text-base font-black text-foreground">{countLabel}</div>
                                                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{meta.metricLabel}</div>
                                            </div>
                                        </div>
                                    </div>
                                );

                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => handleStrategySwitch(id)}
                                        className="block text-left"
                                    >
                                        {content}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-5">
                            {screenMode === 'youtube' && youtubeFilterMeta.map(item => (
                                <SubCard
                                    key={item.value}
                                    label={item.label}
                                    value={formatCount(youtubeTotals[item.value], isYoutubeCountLoading)}
                                    detail={item.description}
                                    active={youtubeFilters.includes(item.value)}
                                    tone="red"
                                    onClick={() => toggleYoutubeFilter(item.value)}
                                />
                            ))}
                            {screenMode === 'reverse' && ['High', 'Solid', 'Watchlist', 'Monitor', 'Reject-tier'].map(band => (
                                <SubCard
                                    key={band}
                                    label={band}
                                    value={formatCount(reverseBandCounts[band] || 0)}
                                    detail={band === 'High' ? 'Composite >= 70' : band === 'Solid' ? 'Composite 55-70' : band === 'Watchlist' ? 'Composite 40-55' : band === 'Monitor' ? 'Composite 25-40' : 'Below monitor band'}
                                    active={reverseFilters.bands.includes(band)}
                                    tone="emerald"
                                    onClick={() => {
                                        const bands = reverseFilters.bands.includes(band)
                                            ? reverseFilters.bands.filter(b => b !== band)
                                            : [...reverseFilters.bands, band];
                                        setReverseFilters({ ...reverseFilters, bands });
                                    }}
                                />
                            ))}
                            {screenMode === 'paradigm' && [
                                { id: 'high', label: 'STRONG' },
                                { id: 'mid', label: 'SOLID' },
                                { id: 'watch', label: 'WATCH' },
                                { id: 'skip', label: 'PASS' },
                                { id: 'no_data', label: 'NO DATA' },
                            ].map(item => (
                                <SubCard
                                    key={item.id}
                                    label={item.label}
                                    value={formatCount(paradigmBandCounts[item.id] || 0)}
                                    detail="Paradigm conviction tier"
                                    active={paradigmFilters.bands.includes(item.id)}
                                    tone="purple"
                                    onClick={() => {
                                        const bands = paradigmFilters.bands.includes(item.id)
                                            ? paradigmFilters.bands.filter(b => b !== item.id)
                                            : [...paradigmFilters.bands, item.id];
                                        setParadigmFilters({ ...paradigmFilters, bands });
                                    }}
                                />
                            ))}
                            {screenMode === '100bagger' && [
                                { label: t('strictPass'), value: formatCount(strategyCounts['100bagger']), detail: t('strictPassDesc'), active: strictPassOnly, onClick: () => setStrictPassOnly(value => !value) },
                                { label: t('minGrowth'), value: `${filters.minRevenueGrowth}%`, detail: t('minGrowthDesc') },
                                { label: t('maxPriceShort'), value: selectedMarket === 'US' ? `$${filters.maxPrice}` : String(filters.maxPrice), detail: t('maxPriceDesc') },
                                { label: t('minRoicShort'), value: `${filters.minROIC}%`, detail: t('minRoicDesc') },
                                { label: t('maxFloatShort'), value: `${filters.maxFloat}M`, detail: t('maxFloatDesc') },
                            ].map(item => (
                                <SubCard
                                    key={item.label}
                                    label={item.label}
                                    value={item.value}
                                    detail={item.detail}
                                    active={Boolean(item.active)}
                                    tone="sky"
                                    onClick={item.onClick}
                                />
                            ))}
                        </div>
                    </section>                    {/* Phase 11d: Batch Progress Bar */}
                    {screenMode === 'reverse' && batchId && (
                        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 animate-in fade-in">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <Sparkles className={clsx("mt-1 h-5 w-5", batchProgress && batchProgress.completed + batchProgress.failed >= batchProgress.total ? "text-emerald-400" : "text-emerald-400 animate-pulse")} />
                                    <div>
                                        <span className="text-lg font-black text-emerald-400">Batch Deep-Dive</span>
                                        <span className="mt-1 block text-base text-muted-foreground sm:ml-3 sm:inline">
                                            {batchProgress
                                                ? `${batchProgress.completed} of ${batchProgress.total} complete${batchProgress.failed > 0 ? ` (${batchProgress.failed} failed)` : ''}`
                                                : `Waiting for workers...`}
                                        </span>
                                    </div>
                                </div>
                                <button onClick={() => dismissBatchPanel()} className="w-fit rounded-lg border border-border/60 px-3.5 py-2 text-base font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Dismiss</button>
                            </div>
                            {batchProgress && (
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                    <BatchMiniStat label="Done" value={batchProgress.completed} />
                                    <BatchMiniStat label="Failed" value={batchProgress.failed} />
                                    <BatchMiniStat label="Total" value={batchProgress.total} />
                                </div>
                            )}
                            {batchProgress && (
                                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary/50">
                                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                                        style={{ width: `${((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100}%` }} />
                                </div>
                            )}
                            {batchProgress?.tickers && (
                                <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                                    {batchProgress.tickers.map((t: any) => (
                                        <span key={t.ticker} className={clsx(
                                            "rounded-md px-2.5 py-1.5 font-mono text-base font-bold",
                                            t.status === 'completed' ? "bg-emerald-500/20 text-emerald-400" :
                                            t.status === 'error' ? "bg-red-500/20 text-red-400" :
                                            "bg-secondary/40 text-muted-foreground"
                                        )}>                                            {t.ticker}{t.status === 'completed' ? ' done' : t.status === 'error' ? ' error' : ' pending'}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {batchProgress && batchProgress.completed + batchProgress.failed >= batchProgress.total && (
                                <p className="mt-3 text-base font-bold text-emerald-400">All done! Open any stock card to view its report.</p>
                            )}
                        </div>
                    )}
                    <div className="mb-4 rounded-lg border border-border/70 bg-card/70 p-4 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={clsx("rounded-md border px-2.5 py-1 text-xs font-black uppercase tracking-wider", activeStrategy.accent)}>
                                        {activeStrategy.eyebrow}
                                    </span>
                                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{selectedMarket} {t('selectedMarket')}</span>
                                </div>
                                <h2 className="mt-1.5 text-2xl font-black tracking-tight">{activeStrategy.title}</h2>
                                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{activeSummary}</p>
                                {visibleFilterChips.length > 0 && (
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        {visibleFilterChips.map((chip) => (
                                            <span key={chip} className="rounded-full border border-border/70 bg-secondary/40 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                                                {chip}
                                            </span>
                                        ))}
                                        {hiddenFilterChipCount > 0 && (
                                            <span className="rounded-full border border-border/70 bg-secondary/40 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                                                +{hiddenFilterChipCount} {t('more')}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={resetActiveFilters}
                                            className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-black text-primary transition-colors hover:bg-primary/15"
                                        >
                                            {t('resetFiltersShort')}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex w-full flex-col gap-2 lg:max-w-[360px]">
                                <div className="grid grid-cols-3 gap-2">
                                    <SummaryMetric label={t('showingRange')} value={`${filteredCount > 0 ? startIndex + 1 : 0}-${Math.min(startIndex + ITEMS_PER_PAGE, filteredCount)}`} />
                                    <SummaryMetric label={t('results')} value={filteredCount.toLocaleString()} />
                                    <SummaryMetric label={t('sortedBy')} value={activeMetric} />
                                </div>
                                <div className="grid grid-cols-2 rounded-lg border border-border/70 bg-secondary/30 p-1 shadow-inner">
                                    <button
                                        type="button"
                                        onClick={() => setResultView('cards')}
                                        className={clsx(
                                            "flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-black transition-colors",
                                            resultView === 'cards' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                        )}
                                        aria-pressed={resultView === 'cards'}
                                    >
                                        <LayoutGrid className="h-4 w-4" />
                                        {t('cards')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setResultView('table')}
                                        className={clsx(
                                            "flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-black transition-colors",
                                            resultView === 'table' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                        )}
                                        aria-pressed={resultView === 'table'}
                                    >
                                        <Table2 className="h-4 w-4" />
                                        {t('table')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {(loading && rawResults.length === 0) || isYoutubeUniverseLoading ? (
                        <LoadingResultsState title={t('initEngine')} strategy={activeStrategy.title} view={resultView} />
                    ) : filteredCount === 0 ? (
                        <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-muted-foreground">
                            <span className={clsx("rounded-md border px-3 py-1.5 text-base font-black uppercase tracking-wider", activeStrategy.accent)}>
                                {activeStrategy.title}
                            </span>
                            <p className="mt-4 text-2xl font-black text-foreground">{t('noMatchingStocks')}</p>
                            <p className="mt-2 max-w-xl text-base leading-relaxed">{t('noStocks')}</p>
                            <div className="mt-5 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
                                <EmptyStateStat label={t('selectedMarket')} value={selectedMarket} />
                                <EmptyStateStat label={t('activeFilters')} value={visibleFilterChips.length + hiddenFilterChipCount} />
                                <EmptyStateStat label={t('view')} value={resultView === 'table' ? t('table') : t('cards')} />
                            </div>
                            {visibleFilterChips.length > 0 && (
                                <div className="mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
                                    {visibleFilterChips.map((chip) => (
                                        <span key={chip} className="rounded-md border border-border/60 bg-secondary/35 px-3 py-1.5 text-base font-black text-muted-foreground">
                                            {chip}
                                        </span>
                                    ))}
                                    {hiddenFilterChipCount > 0 && (
                                        <span className="rounded-md border border-border/60 bg-secondary/25 px-3 py-1.5 text-base font-black text-muted-foreground">
                                            +{hiddenFilterChipCount} {t('more')}
                                        </span>
                                    )}
                                </div>
                            )}
                            <button onClick={resetActiveFilters} className="mt-5 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-base font-black text-primary transition-colors hover:bg-primary/15">{t('resetFilters')}</button>
                        </div>
                    ) : (
                        <>
                            {screenMode === 'paradigm' && (
                                <div className="mb-4 rounded-lg border border-purple-500/20 bg-purple-500/[0.04] p-3">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-300">
                                            <History className="h-4 w-4" />
                                            Paradigm History
                                        </div>
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                            {paradigmHistoryEvents.length.toLocaleString()} changes
                                        </span>
                                    </div>
                                    {recentParadigmEvents.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                                            {recentParadigmEvents.map(event => (
                                                <button
                                                    key={`${event.run_id}-${event.symbol}-${event.summary}`}
                                                    type="button"
                                                    onClick={() => {
                                                        const match = rawResults.find(result => result.candidate.symbol === event.symbol);
                                                        if (match) setSelectedStock(match);
                                                    }}
                                                    className="min-w-0 rounded-md border border-border/60 bg-background/35 px-3 py-2 text-left transition-colors hover:border-purple-400/40 hover:bg-purple-500/10"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-mono text-sm font-black text-foreground">{event.symbol}</span>
                                                        <span className={clsx(
                                                            "rounded px-2 py-0.5 text-[10px] font-black uppercase",
                                                            event.direction === 'upgrade' && "bg-emerald-500/15 text-emerald-300",
                                                            event.direction === 'downgrade' && "bg-red-500/15 text-red-300",
                                                            event.direction === 'changed' && "bg-purple-500/15 text-purple-300",
                                                        )}>
                                                            {event.direction}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 truncate text-xs font-semibold text-muted-foreground" title={event.summary}>
                                                        {event.summary}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-md border border-border/50 bg-background/30 px-3 py-2 text-sm font-semibold text-muted-foreground">
                                            Baseline is active. No Paradigm upgrades, downgrades, or theme changes have been recorded since tracking started.
                                        </div>
                                    )}
                                </div>
                            )}
                            {resultView === 'cards' ? (
                                <div className="grid grid-cols-1 gap-4 mb-8 lg:grid-cols-2 2xl:grid-cols-3">
                                    {currentData.map((result, i) => (
                                        <div key={result.candidate.symbol} className="relative group/card">
                                            {/* Selection checkbox - reverse mode only */}
                                            {screenMode === 'reverse' && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const sym = result.candidate.symbol;
                                                        setSelectedTickers(prev => {
                                                            const next = new Set(prev);
                                                            next.has(sym) ? next.delete(sym) : next.add(sym);
                                                            return next;
                                                        });
                                                    }}
                                                    className={clsx(
                                                        "absolute top-2 right-2 z-20 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all",
                                                        selectedTickers.has(result.candidate.symbol)
                                                            ? "bg-emerald-500 border-emerald-500 text-white"
                                                            : "bg-background/60 border-border/50 hover:border-emerald-400"
                                                    )}
                                                    aria-label={`${selectedTickers.has(result.candidate.symbol) ? 'Deselect' : 'Select'} ${result.candidate.symbol}`}
                                                >
                                                    {selectedTickers.has(result.candidate.symbol) && (
                                                        <Check className="h-3.5 w-3.5" />
                                                    )}
                                                </button>
                                            )}
                                            <StockCard
                                                result={result}
                                                onClick={() => setSelectedStock(result)}
                                                index={i}
                                                lastUpdated={result.Last_Updated || lastUpdatedFile}
                                                market={selectedMarket}
                                                screenMode={screenMode}
                                                youtubeEvaluation={youtubeEvaluations.get(result.candidate.symbol)}
                                                paradigmHistory={paradigmHistoryBySymbol.get(result.candidate.symbol)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <ResultsTable
                                    results={currentData}
                                    market={selectedMarket}
                                    screenMode={screenMode}
                                    youtubeEvaluations={youtubeEvaluations}
                                    selectedTickers={selectedTickers}
                                    onToggleSelected={(symbol) => {
                                        setSelectedTickers(prev => {
                                            const next = new Set(prev);
                                            next.has(symbol) ? next.delete(symbol) : next.add(symbol);
                                            return next;
                                        });
                                    }}
                                    onOpen={setSelectedStock}
                                />
                            )}

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="pb-8">
                                    <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-xl border border-border/70 bg-card/75 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                                        <div className="text-center sm:text-left">
                                            <div className="text-base font-black uppercase tracking-wider text-muted-foreground">{t('page')} {currentPage} {t('of')} {totalPages}</div>
                                            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                                                <span className="rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 font-mono text-lg font-black text-primary">
                                                    {filteredCount > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredCount)}
                                                </span>
                                                <span className="text-base font-bold text-muted-foreground">{t('of')} {filteredCount.toLocaleString()} {t('results')}</span>
                                                <span className="rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1.5 text-base font-black text-muted-foreground">
                                                    {ITEMS_PER_PAGE} / {t('perPage')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-center gap-2">
                                            <button
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                                className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-base font-black transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45"
                                            >
                                                {t('previous')}
                                            </button>

                                            {getPageNumbers().map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => setCurrentPage(p)}
                                                    className={clsx(
                                                        "flex h-11 min-w-11 items-center justify-center rounded-lg px-3 text-base font-black transition-colors",
                                                        currentPage === p
                                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                                            : 'border border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary hover:text-foreground'
                                                    )}
                                                >
                                                    {p}
                                                </button>
                                            ))}

                                            <button
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                                className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-base font-black transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45"
                                            >
                                                {t('next')}
                                            </button>
                                        </div>
                                    </div>
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
                    youtubeEvaluation={youtubeEvaluations.get(selectedStock.candidate.symbol)}
                    paradigmHistory={paradigmHistoryBySymbol.get(selectedStock.candidate.symbol)}
                />
            )}

            {/* AI Modal Overlay */}
            {aiModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-3">
                    <div className="flex h-[94vh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-2xl sm:h-[90vh] sm:max-w-[92vw] sm:rounded-xl lg:max-w-5xl">
                        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-secondary/30 p-3 sm:p-4">
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Research handoff</p>
                                <h3 className="mt-0.5 text-xl font-black tracking-tight text-foreground sm:text-2xl">
                                    Prompt Exporter: {selectedAiTicker}
                                </h3>
                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                    Copy the prepared prompt, open a model, or run the protected Deepseek workflow.
                                </p>
                            </div>
                            <button onClick={() => setAiModalOpen(false)} className="text-muted-foreground hover:text-foreground shrink-0 ml-2" aria-label="Close AI prompt modal">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
                            {aiLoading ? (
                                <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-4">
                                    <RefreshCw className="h-8 w-8 animate-spin text-accent" />
                                    <p className="text-base font-medium text-center">Injecting latest real-time statements and building prompt...</p>
                                </div>
                            ) : aiResult ? (
                                <div className="flex min-h-0 flex-1 flex-col gap-3">
                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                                        <PromptStat label="Ticker" value={selectedAiTicker || "Unknown"} sub="Active scorecard" />
                                        <PromptStat label="Prompt" value={`${aiResult.length.toLocaleString()} chars`} sub="Ready to copy" />
                                        <PromptStat label="Output" value={dsResult ? "Report ready" : "Manual or cloud"} sub={dsResult ? "Deepseek result loaded" : "Choose a model below"} />
                                    </div>
                                    <div className="grid min-h-[260px] flex-1 grid-cols-1 gap-3 sm:min-h-[300px]">
                                        {/* Prompt Box */}
                                        <div className="relative flex-1 bg-[#0d121c] border border-border rounded-xl overflow-hidden flex flex-col shadow-inner">
                                            <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-secondary/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">INTEGRATED INVESTMENT ANALYSIS ENGINE v2.0</span>
                                                    <p className="mt-0.5 text-sm text-muted-foreground">Prepared analysis packet for valuation, scenarios, risks, and final verdict.</p>
                                                </div>
                                                <button
                                                    onClick={() => copyToClipboard(aiResult!)}
                                                    className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-black text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
                                                >
                                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                    {copied ? 'COPIED!' : 'COPY PROMPT'}
                                                </button>
                                            </div>
                                            <textarea
                                                readOnly
                                                value={aiResult || ""}
                                                className="h-full w-full flex-1 resize-none overflow-y-auto bg-transparent p-3 font-mono text-xs leading-6 text-foreground/90 focus:outline-none focus:ring-0 sm:text-sm"
                                            />
                                        </div>
                                        
                                        {/* Deepseek Result Box */}
                                        {dsResult && (
                                            <div className="relative flex-1 bg-[#1a1f2e] border border-blue-500/30 rounded-xl overflow-hidden flex flex-col shadow-inner">
                                                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-blue-500/20 bg-blue-500/10 px-3 py-2.5">
                                                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-400">QUANT REPORT</span>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex flex-col">
                                                            <h1 className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-base font-black tracking-tight text-transparent">
                                                                QUANT <span className="text-blue-500">PRO</span>
                                                            </h1>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Global Terminal</span>
                                                                <div className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button onClick={downloadDsResult} className="flex items-center gap-1 rounded bg-secondary px-3 py-2 text-sm font-bold hover:bg-secondary/80">Download .txt</button>
                                                    <button onClick={copyDsResult} className="flex items-center gap-1 rounded bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
                                                        {dsCopied ? "Copied" : "Copy Result"}
                                                    </button>
                                                </div>
                                                <div className="flex-1 overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-md sm:p-5">
                                                    <div className="prose prose-invert prose-blue max-w-none break-words whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-100">
                                                        <ReactMarkdown>
                                                            {dsResult.content
                                                                .replace(/^```(markdown|json|text)?/i, '')
                                                                .replace(/```$/, '')
                                                                .replace(/\\n/g, '\n')
                                                                .replace(/\\t/g, '\t')
                                                                .trim()}
                                                        </ReactMarkdown>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="shrink-0 rounded-lg border border-border/60 bg-secondary/20 p-3">
                                        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                                            <div>
                                                <div className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Choose output path</div>
                                                <div className="mt-0.5 text-sm font-semibold text-foreground">Open a manual model, or run the protected Deepseek workflow.</div>
                                            </div>
                                            <div className="text-xs font-bold text-muted-foreground">Prompt is ready to export</div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                            <a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer" className="flex min-h-16 items-center gap-2.5 rounded-lg border border-white/10 bg-[#1A73E8]/90 px-3 py-2.5 text-white shadow-md transition-all hover:bg-[#1557B0] active:scale-95">
                                            <img src="https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64" alt="Gemini" className="h-7 w-7 shrink-0 rounded-md bg-white p-1 shadow-sm" />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-black tracking-tight">Gemini</span>
                                                <span className="mt-0.5 block text-xs font-bold text-white/80">Open manual chat</span>
                                            </span>
                                            </a>
                                            <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer" className="flex min-h-16 items-center gap-2.5 rounded-lg border border-white/10 bg-[#D97757]/90 px-3 py-2.5 text-white shadow-md transition-all hover:bg-[#C26547] active:scale-95">
                                            <img src="https://www.google.com/s2/favicons?domain=claude.ai&sz=64" alt="Claude" className="h-7 w-7 shrink-0 rounded-md bg-white p-1 shadow-sm" />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-black tracking-tight">Claude</span>
                                                <span className="mt-0.5 block text-xs font-bold text-white/80">Open manual chat</span>
                                            </span>
                                            </a>
                                            <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" className="flex min-h-16 items-center gap-2.5 rounded-lg border border-white/10 bg-[#10A37F]/90 px-3 py-2.5 text-white shadow-md transition-all hover:bg-[#0E906F] active:scale-95">
                                            <img src="https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64" alt="ChatGPT" className="h-7 w-7 shrink-0 rounded-md bg-white p-1 shadow-sm" />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-black tracking-tight">ChatGPT</span>
                                                <span className="mt-0.5 block text-xs font-bold text-white/80">Open manual chat</span>
                                            </span>
                                            </a>
                                            {showDsPassword ? (
                                                <div className="flex min-h-16 flex-col justify-center gap-2 rounded-lg border border-[#4d6bfe]/40 bg-[#4d6bfe]/20 px-3 py-2.5">
                                                    <div>
                                                        <div className="text-xs font-black uppercase tracking-wider text-blue-200">Protected run</div>
                                                        <div className="mt-0.5 text-xs font-semibold text-white/75">Enter the workflow password to generate and save a report.</div>
                                                    </div>
                                                    <input type="password" placeholder="Password" value={dsPassword} onChange={(e)=>setDsPassword(e.target.value)} className="w-full rounded-md border border-white/15 bg-background px-3 py-2 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-[#4d6bfe]/50" />
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button onClick={() => setShowDsPassword(false)} disabled={dsLoading} className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50">
                                                            Cancel
                                                        </button>
                                                        <button onClick={handleDeepseekRun} disabled={dsLoading} className="rounded-md bg-[#4d6bfe] px-3 py-2 text-sm font-black text-white transition-colors hover:bg-[#3b54d1] disabled:opacity-60">
                                                            {dsLoading ? "Running..." : "Run Deepseek"}
                                                        </button>
                                                    </div>
                                                    {dsError && <span className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-bold text-danger">{dsError}</span>}
                                                </div>
                                            ) : (
                                                <button onClick={() => setShowDsPassword(true)} className="flex min-h-16 items-center gap-2.5 rounded-lg border border-white/10 bg-[#4d6bfe]/90 px-3 py-2.5 text-left text-white shadow-md transition-all hover:bg-[#3b54d1] active:scale-95">
                                                <img src="https://www.google.com/s2/favicons?domain=deepseek.com&sz=64" alt="Deepseek" className="h-7 w-7 shrink-0 rounded-md bg-white p-1 shadow-sm" />
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-black tracking-tight">Deepseek V4.0 Pro</span>
                                                    <span className="mt-0.5 block text-xs font-bold text-white/80">Run protected workflow</span>
                                                </span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* Phase 11d: Batch Password Prompt */}
            {showBatchPassword && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-md animate-in zoom-in-95 rounded-2xl border border-border/70 bg-card p-6 shadow-2xl">
                        <div className="flex items-start gap-3">
                            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-emerald-400">
                                <Sparkles className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-base font-black uppercase tracking-wider text-emerald-400">
                                        Step 1 of 2
                                    </span>
                                </div>
                                <h3 className="text-2xl font-black tracking-tight">Protected Deep-Dive</h3>
                                <p className="mt-1 text-base leading-relaxed text-muted-foreground">Enter the dispatch password before queuing v3.2 analyses.</p>
                            </div>
                        </div>
                        <div className="my-5 grid grid-cols-2 gap-3">
                            <DialogStat label="Selection" value={selectedTickers.size > 0 ? selectedTickers.size : batchN} />
                            <DialogStat label="Source" value={selectedTickers.size > 0 ? "Selected" : "Top ranked"} />
                        </div>
                        <input
                            type="password"
                            placeholder="Password"
                            value={dsPassword}
                            onChange={(e) => setDsPassword(e.target.value)}
                            className="mb-4 w-full rounded-lg border border-border bg-secondary/40 px-3.5 py-3 text-base focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            onKeyDown={(e) => { if (e.key === 'Enter' && dsPassword) { setShowBatchPassword(false); setShowBatchConfirm(true); } }}
                        />
                        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-base font-semibold leading-relaxed text-emerald-300">
                            Nothing is dispatched yet. The next screen shows the final queue count before workers start.
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowBatchPassword(false)} className="flex-1 rounded-lg border border-border bg-muted px-3.5 py-3 text-base font-bold text-muted-foreground transition-colors hover:bg-secondary">Cancel</button>
                            <button
                                onClick={() => { setShowBatchPassword(false); setShowBatchConfirm(true); }}
                                disabled={!dsPassword}
                                className="flex-1 rounded-lg bg-emerald-600 px-3.5 py-3 text-base font-black text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                            >Continue</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Phase 11d: Batch Confirm Dialog */}
            {showBatchConfirm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-lg animate-in zoom-in-95 rounded-2xl border border-border/70 bg-card p-6 shadow-2xl">
                        <div className="flex items-start gap-3">
                            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-emerald-400">
                                <Sparkles className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-base font-black uppercase tracking-wider text-emerald-400">
                                        Step 2 of 2
                                    </span>
                                    <span className="rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1 text-base font-black uppercase tracking-wider text-muted-foreground">
                                        Final review
                                    </span>
                                </div>
                                <h3 className="text-2xl font-black tracking-tight">Dispatch Deep-Dive Batch?</h3>
                                <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                            {selectedTickers.size > 0
                                ? <>This will dispatch <span className="font-bold text-foreground">{selectedTickers.size} selected</span> stock(s) for v3.2 deep-dive analysis via GitHub Actions. Each takes ~2-3 minutes.</>
                                : <>This will dispatch the top <span className="font-bold text-foreground">{batchN}</span> stocks for v3.2 deep-dive analysis via GitHub Actions. Each takes ~2-3 minutes.</>
                            }
                                </p>
                            </div>
                        </div>
                        <div className="my-5 grid grid-cols-3 gap-3">
                            <DialogStat label="Queued" value={selectedTickers.size > 0 ? selectedTickers.size : batchN} />
                            <DialogStat label="Runtime" value="2-3m each" />
                            <DialogStat label="Runner" value="GitHub" />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowBatchConfirm(false)}
                                className="flex-1 rounded-lg border border-border bg-muted px-3.5 py-3 text-base font-bold text-muted-foreground transition-colors hover:bg-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBatchDispatch}
                                className="flex-1 rounded-lg bg-emerald-600 px-3.5 py-3 text-base font-black text-white transition-colors hover:bg-emerald-500"
                            >
                                Dispatch {selectedTickers.size > 0 ? selectedTickers.size : batchN}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Phase 11d: Batch Progress Panel */}
            {batchId && screenMode !== 'reverse' && (
                <div className="fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-[420px] flex-col gap-3 rounded-xl border border-emerald-500/30 bg-[#1a1f2e] p-5 shadow-2xl animate-in slide-in-from-bottom-5 sm:bottom-6 sm:right-6">
                    <div className="flex justify-between items-start gap-4">
                        <div className="flex items-start gap-3">
                            <Sparkles className={clsx("h-5 w-5 mt-0.5", batchProgress && batchProgress.completed + batchProgress.failed >= batchProgress.total ? "text-emerald-400" : "text-emerald-400 animate-pulse")} />
                            <div className="flex flex-col flex-1">
                                <span className="font-bold text-lg text-foreground">Batch Deep-Dive</span>
                                <span className="text-base text-muted-foreground mt-1">
                                    {batchProgress
                                        ? (() => {
                                            const ok = batchProgress.completed;
                                            const fail = batchProgress.failed;
                                            const done = ok + fail;
                                            const total = batchProgress.total;
                                            if (done < total) return `${done} of ${total} done${fail > 0 ? ` (${fail} failed so far)` : ''}`;
                                            if (fail === 0) return `All ${total} succeeded`;
                                            if (ok === 0) return `All ${total} failed`;
                                            return `${ok} succeeded, ${fail} failed (${total} total)`;
                                          })()
                                        : `Waiting for workers... (${batchStatus || ''})`}
                                </span>
                                {batchProgress && (
                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                        <BatchMiniStat label="Done" value={batchProgress.completed} />
                                        <BatchMiniStat label="Failed" value={batchProgress.failed} />
                                        <BatchMiniStat label="Total" value={batchProgress.total} />
                                    </div>
                                )}
                                {batchProgress && (
                                    <div className="w-full h-2 bg-secondary/50 rounded-full mt-2 overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                            style={{ width: `${((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100}%` }} />
                                    </div>
                                )}
                                {batchProgress && batchProgress.completed + batchProgress.failed >= batchProgress.total && (
                                    <span className="text-base text-emerald-400 mt-1.5 font-bold">
                                        {batchProgress.completed > 0 ? 'Open any stock card to view its report.' : 'No reports generated.'}{' '}Auto-closing in 8s.
                                    </span>
                                )}
                            </div>
                        </div>
                        <button onClick={() => dismissBatchPanel()} className="text-muted-foreground hover:text-foreground shrink-0" title="Dismiss" aria-label="Dismiss batch progress">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Deepseek Task Alert */}
            {backgroundDsTask && (
                <div className="fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-[420px] flex-col gap-3 rounded-xl border border-blue-500/30 bg-[#1a1f2e] p-5 shadow-2xl animate-in slide-in-from-bottom-5 sm:bottom-6 sm:right-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <Sparkles className={clsx("h-5 w-5 mt-0.5", backgroundDsTask.status === 'running' ? "text-blue-400 animate-pulse" : backgroundDsTask.status === 'error' ? "text-danger" : "text-success")} />
                            <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className={clsx(
                                        "rounded-md border px-2.5 py-1 text-base font-black uppercase tracking-wider",
                                        backgroundDsTask.status === 'running' && "border-blue-500/30 bg-blue-500/10 text-blue-400",
                                        backgroundDsTask.status === 'error' && "border-red-500/30 bg-red-500/10 text-red-400",
                                        backgroundDsTask.status !== 'running' && backgroundDsTask.status !== 'error' && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                                    )}>
                                        {backgroundDsTask.status === 'running' ? 'Running' : backgroundDsTask.status === 'error' ? 'Error' : 'Complete'}
                                    </span>
                                    <span className="rounded-md border border-border/60 bg-secondary/35 px-2.5 py-1 font-mono text-base font-black text-foreground">
                                        {backgroundDsTask.ticker}
                                    </span>
                                </div>
                                <span className="block truncate text-lg font-bold text-foreground" title={backgroundDsTask.ticker}>
                                    {backgroundDsTask.status === 'running' ? `Analyzing ${backgroundDsTask.ticker}...` : backgroundDsTask.status === 'error' ? `Error analyzing ${backgroundDsTask.ticker}` : `Analysis Complete: ${backgroundDsTask.ticker}`}
                                </span>
                                <span className="mt-1 block text-base leading-relaxed text-muted-foreground">
                                    {backgroundDsTask.status === 'running' ? 'Deepseek V4.0 Pro is generating report.' : backgroundDsTask.status === 'error' ? backgroundDsTask.message : 'Report saved to scorecard!'}
                                </span>
                            </div>
                        </div>
                        <button onClick={() => setBackgroundDsTask(null)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss analysis status">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Help Modal */}
            {showHelp && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
                    <div className="bg-card border border-border/50 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[84vh] overflow-y-auto p-6 md:p-8" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-5">
                            <div>
                                <p className="text-base font-black uppercase tracking-[0.18em] text-muted-foreground">{t('scoringGuide')}</p>
                                <h2 className="mt-1 text-2xl font-black tracking-tight text-foreground">{t('scoringGuideTitle')}</h2>
                                <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted-foreground">
                                    {t('scoringGuideBody')}
                                </p>
                            </div>
                            <button onClick={() => setShowHelp(false)} className="rounded-full border border-border/60 p-2.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label={t('closeScoringGuide')}>
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="mt-6 rounded-xl border border-primary/20 bg-primary/[0.04] p-5">
                            <div className="mb-3 text-base font-black uppercase tracking-[0.18em] text-primary">{t('recommendedWorkflow')}</div>
                            <div className="grid gap-3 md:grid-cols-3">
                                <WorkflowStep label="1" title={t('workflowMarketTitle')} text={t('workflowMarketText')} />
                                <WorkflowStep label="2" title={t('workflowLensTitle')} text={t('workflowLensText')} />
                                <WorkflowStep label="3" title={t('workflowScorecardTitle')} text={t('workflowScorecardText')} />
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            <HelpCard
                                index="01"
                                title={t('helpCardsTitle')}
                                body={t('helpCardsBody')}
                            />
                            <HelpCard
                                index="02"
                                title={t('helpReverseTitle')}
                                body={t('helpReverseBody')}
                            />
                            <HelpCard
                                index="03"
                                title={t('helpParadigmTitle')}
                                body={t('helpParadigmBody')}
                            />
                            <HelpCard
                                index="04"
                                title={t('helpYoutubeTitle')}
                                body={t('helpYoutubeBody')}
                            />
                        </div>

                        <div className="mt-6 rounded-xl border border-border/70 bg-secondary/20 p-5">
                            <h3 className="text-lg font-black text-foreground">{t('reverseStagesTitle')}</h3>
                            <div className="mt-4 grid gap-3 text-base leading-relaxed text-muted-foreground md:grid-cols-2">
                                <StageLine label="0-1" text={t('reverseStage01')} />
                                <StageLine label="2" text={t('reverseStage2')} />
                                <StageLine label="3-5" text={t('reverseStage35')} />
                                <StageLine label="6-7" text={t('reverseStage67')} />
                                <StageLine label="8" text={t('reverseStage8')} />
                                <StageLine label="9" text={t('reverseStage9')} />
                            </div>
                        </div>

                        <div className="mt-6 rounded-xl border border-purple-500/25 bg-purple-500/[0.05] p-5">
                            <h3 className="text-lg font-black text-purple-200">{t('paradigmSignalTitle')}</h3>
                            <div className="mt-3 grid gap-3 text-base leading-relaxed text-muted-foreground md:grid-cols-3">
                                <HelpPillar title={t('paradigmMembershipTitle')} text={t('paradigmMembershipText')} />
                                <HelpPillar title={t('paradigmMomentumTitle')} text={t('paradigmMomentumText')} />
                                <HelpPillar title={t('paradigmEconomicsTitle')} text={t('paradigmEconomicsText')} />
                            </div>
                        </div>

                        <div className="mt-6 rounded-xl border border-border/70 bg-card/70 p-5 text-base leading-relaxed text-muted-foreground">
                            <h3 className="text-lg font-black text-foreground">{t('honestLimitationsTitle')}</h3>
                            <p className="mt-2">
                                {t('honestLimitationsText')}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <LogConsole isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} />
        </div>
    );
}

function HelpCard({ index, title, body }: { index: string; title: string; body: string }) {
    return (
        <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 font-mono text-base font-black text-primary">
                    {index}
                </span>
                <div>
                    <h3 className="text-lg font-black text-foreground">{title}</h3>
                    <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">{body}</p>
                </div>
            </div>
        </div>
    );
}

function WorkflowStep({ label, title, text }: { label: string; title: string; text: string }) {
    return (
        <div className="rounded-lg border border-primary/15 bg-background/35 p-4">
            <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/25 bg-primary/10 font-mono text-base font-black text-primary">
                    {label}
                </span>
                <h3 className="text-lg font-black text-foreground">{title}</h3>
            </div>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{text}</p>
        </div>
    );
}

function StageLine({ label, text }: { label: string; text: string }) {
    return (
        <div className="flex gap-3 rounded-lg border border-border/50 bg-background/30 p-3">
            <span className="flex h-10 min-w-10 items-center justify-center rounded-md bg-primary/15 font-mono text-base font-black text-primary">
                {label}
            </span>
            <p>{text}</p>
        </div>
    );
}

function HelpPillar({ title, text }: { title: string; text: string }) {
    return (
        <div className="rounded-lg border border-purple-500/20 bg-background/30 p-3">
            <h4 className="font-black text-purple-200">{title}</h4>
            <p className="mt-1">{text}</p>
        </div>
    );
}

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
            <div className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-0.5 truncate font-mono text-base font-black text-foreground" title={String(value)}>{value}</div>
        </div>
    );
}

function EmptyStateStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-border/60 bg-secondary/20 px-4 py-3">
            <div className="text-base font-black uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 truncate font-mono text-xl font-black text-foreground" title={String(value)}>{value}</div>
        </div>
    );
}

function DialogStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-border/60 bg-secondary/20 px-3.5 py-3">
            <div className="text-base font-black uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 truncate font-mono text-lg font-black text-foreground" title={String(value)}>{value}</div>
        </div>
    );
}

function BatchMiniStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.055] px-3 py-2">
            <div className="text-base font-black uppercase tracking-wider text-emerald-300/80">{label}</div>
            <div className="mt-0.5 font-mono text-lg font-black text-emerald-300">{value}</div>
        </div>
    );
}

function LoadingResultsState({ title, strategy, view }: { title: string; strategy: string; view: ResultView }) {
    return (
        <div className="rounded-xl border border-border/70 bg-card/60 p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">
                        <RefreshCw className="h-6 w-6 animate-spin" />
                    </div>
                    <div>
                        <p className="text-xl font-black text-foreground">{title}</p>
                        <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                            Loading {strategy} data, overlays, and {view === 'table' ? 'table rows' : 'stock cards'}.
                        </p>
                    </div>
                </div>
                <span className="w-fit rounded-md border border-border/60 bg-secondary/30 px-3 py-1.5 text-base font-black uppercase tracking-wider text-muted-foreground">
                    Preparing view
                </span>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((item) => (
                    <div key={item} className="rounded-lg border border-border/60 bg-secondary/15 p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-3">
                                <div className="h-6 w-24 animate-pulse rounded bg-secondary" />
                                <div className="h-4 w-44 animate-pulse rounded bg-secondary/70" />
                            </div>
                            <div className="h-8 w-16 animate-pulse rounded bg-secondary/70" />
                        </div>
                        <div className="mt-5 h-16 animate-pulse rounded-lg bg-secondary/50" />
                        <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="h-12 animate-pulse rounded bg-secondary/45" />
                            <div className="h-12 animate-pulse rounded bg-secondary/45" />
                            <div className="h-12 animate-pulse rounded bg-secondary/45" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PromptStat({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
            <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-0.5 truncate font-mono text-base font-black text-foreground" title={value}>{value}</div>
            <div className="mt-0.5 truncate text-xs font-semibold text-muted-foreground" title={sub}>{sub}</div>
        </div>
    );
}

function ResultsTable({
    results,
    market,
    screenMode,
    youtubeEvaluations,
    selectedTickers,
    onToggleSelected,
    onOpen,
}: {
    results: ScreeningResult[];
    market: Market;
    screenMode: ScreenMode;
    youtubeEvaluations: Map<string, YoutubeStrategyEvaluation>;
    selectedTickers: Set<string>;
    onToggleSelected: (symbol: string) => void;
    onOpen: (result: ScreeningResult) => void;
}) {
    const pricePrefix = market === 'Korea' ? 'KRW ' : market === 'Taiwan' ? 'NT$' : '$';
    const lensMeta = getTableLensMeta(screenMode);

    return (
        <div className="mb-8 overflow-hidden rounded-lg border border-border/70 bg-card/80 shadow-sm">
            <div className="flex flex-col gap-1 border-b border-border/60 bg-secondary/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-black text-foreground">Scan Table</h3>
                    <p className="text-base text-muted-foreground">Dense view for comparing the current page by {lensMeta.label}.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <TableBadge tone={lensMeta.tone}>{lensMeta.label}</TableBadge>
                    <span className="text-base font-bold uppercase tracking-wider text-muted-foreground">
                        Click any row for the full scorecard
                    </span>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1240px] border-collapse text-left">
                    <thead className="sticky top-0 z-[1] bg-card/95 backdrop-blur">
                        <tr className="border-b border-border/70">
                            {screenMode === 'reverse' && <TableHead className="w-14">Pick</TableHead>}
                            <TableHead>Stock</TableHead>
                            <TableHead>Sector / Industry</TableHead>
                            <TableHead>Paradigm</TableHead>
                            <TableHead>{screenMode === 'reverse' ? 'Reverse' : screenMode === 'paradigm' ? 'Paradigm Lens' : screenMode === 'youtube' ? 'YouTube' : '100-Bagger'}</TableHead>
                            <TableHead>Other Signals</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                            <TableHead className="text-right">Market Cap</TableHead>
                            <TableHead className="text-right">Growth</TableHead>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((result) => {
                            const c = result.candidate as any;
                            const symbol = c.symbol || '';
                            const ticker = market === 'US' ? symbol.split('.')[0] : symbol;
                            const paradigm = result.paradigm;
                            const reverse = result.reverse;
                            const youtube = youtubeEvaluations.get(symbol);
                            const hasYoutube = !!(youtube && youtube.matchedStrategies.length > 0);
                            const activeMetric = getActiveTableMetric(result, screenMode, youtube);
                            const price = Number(c.price || 0).toLocaleString('en-US', {
                                minimumFractionDigits: market === 'US' ? 2 : 0,
                                maximumFractionDigits: market === 'US' ? 2 : 0,
                            });
                            const marketCap = formatTableMarketCap(Number(c.marketCap || 0), market);
                            const growth = Number(c.revenueGrowth || 0);

                            return (
                                <tr
                                    key={symbol}
                                    onClick={() => onOpen(result)}
                                    className="group/row cursor-pointer border-b border-border/40 transition-colors odd:bg-background/10 hover:bg-primary/[0.06]"
                                >
                                    {screenMode === 'reverse' && (
                                        <td className="px-4 py-3 align-middle">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onToggleSelected(symbol);
                                                }}
                                                className={clsx(
                                                    "flex h-8 w-8 items-center justify-center rounded-md border-2 transition-all",
                                                    selectedTickers.has(symbol)
                                                        ? "border-emerald-500 bg-emerald-500 text-white"
                                                        : "border-border/70 bg-background/60 hover:border-emerald-400"
                                                )}
                                                aria-label={`${selectedTickers.has(symbol) ? 'Deselect' : 'Select'} ${symbol}`}
                                            >
                                                {selectedTickers.has(symbol) && <Check className="h-4 w-4" />}
                                            </button>
                                        </td>
                                    )}
                                    <td className="px-4 py-4 align-middle">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-secondary/40 font-mono text-lg font-black text-primary transition-colors group-hover/row:border-primary/50 group-hover/row:bg-primary/10">
                                                {ticker.slice(0, 2)}
                                            </span>
                                            <div className="min-w-0">
                                                <span className="block font-mono text-xl font-black text-foreground">{ticker}</span>
                                                <span className="block max-w-[220px] truncate text-base font-semibold text-muted-foreground" title={c.name}>{c.name || symbol}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                        <div className="max-w-[260px] truncate text-base font-semibold text-muted-foreground" title={`${c.sector || 'Unknown'} / ${c.industry || result.industry || 'Unknown'}`}>
                                            {c.sector || 'Unknown'} / {c.industry || result.industry || 'Unknown'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                        {paradigm?.pdm_themes?.length ? (
                                            <div className="flex min-w-0 flex-col gap-1">
                                                <TableBadge tone={paradigm.pdm_band === 'high' ? 'success' : paradigm.pdm_band === 'mid' ? 'primary' : paradigm.pdm_band === 'watch' ? 'warning' : 'muted'}>
                                                    {paradigm.pdm_band?.toUpperCase() || 'THEME'}
                                                </TableBadge>
                                                <span className="max-w-[220px] truncate text-base font-mono text-purple-300" title={paradigm.pdm_themes.join(', ')}>
                                                    {paradigm.pdm_theme_primary || paradigm.pdm_themes[0]}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-base text-muted-foreground">No theme</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                        <div className="flex min-w-[160px] flex-col gap-1">
                                            <TableBadge tone={lensMeta.tone}>{lensMeta.shortLabel}</TableBadge>
                                            <span className="font-mono text-xl font-black text-foreground">{activeMetric.value}</span>
                                            <span className="text-base font-bold text-muted-foreground">{activeMetric.label}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                        <div className="flex min-w-[230px] flex-wrap gap-1.5">
                                            <TableBadge tone={result.passed ? 'success' : result.score > 80 ? 'warning' : 'muted'}>100B {Math.round(result.score || 0)}</TableBadge>
                                            {reverse?.rev_band && reverse.rev_band !== 'Excluded' && (
                                                <TableBadge tone={reverse.rev_band === 'High' ? 'success' : reverse.rev_band === 'Solid' ? 'primary' : 'muted'}>
                                                    REV {reverse.rev_composite != null ? Math.round(reverse.rev_composite) : reverse.rev_band}
                                                </TableBadge>
                                            )}
                                            {hasYoutube && (
                                                <TableBadge tone={youtube.riskTier === 'standard' ? 'primary' : 'warning'}>YT {youtube.matchedStrategies.length}</TableBadge>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-right align-middle font-mono text-lg font-black text-foreground">
                                        {pricePrefix}{price}
                                    </td>
                                    <td className="px-4 py-4 text-right align-middle font-mono text-base font-black text-foreground/85">
                                        {marketCap}
                                    </td>
                                    <td className="px-4 py-4 text-right align-middle">
                                        <span className={clsx(
                                            "inline-flex items-center justify-end rounded-md border px-2.5 py-1.5 font-mono text-base font-black",
                                            growth >= 0
                                                ? "border-emerald-500/30 bg-emerald-500/10 text-success"
                                                : "border-red-500/30 bg-red-500/10 text-danger"
                                        )}>
                                            {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function formatTableMarketCap(value: number, market: Market) {
    if (!value || !Number.isFinite(value)) return 'n/a';
    if (market === 'Korea') return `${(value / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B KRW`;
    if (market === 'Taiwan') return `NT$${(value / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`;
    if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`;
    return `$${(value / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
}

function getActiveTableMetric(result: ScreeningResult, screenMode: ScreenMode, youtube?: YoutubeStrategyEvaluation): { label: string; value: string } {
    if (screenMode === 'reverse') {
        return {
            label: result.reverse?.rev_band || 'Reverse',
            value: result.reverse?.rev_composite != null ? String(Math.round(result.reverse.rev_composite)) : 'n/a',
        };
    }
    if (screenMode === 'paradigm') {
        return {
            label: result.paradigm?.pdm_theme_primary || result.paradigm?.pdm_band || 'Paradigm',
            value: result.paradigm?.pdm_signal != null ? String(Math.round(result.paradigm.pdm_signal)) : 'n/a',
        };
    }
    if (screenMode === 'youtube') {
        return {
            label: youtube?.matchedStrategies[0] || 'Video signal',
            value: youtube?.matchedStrategies.length ? String(youtube.matchedStrategies.length) : 'n/a',
        };
    }
    return {
        label: result.passed ? 'Pass' : 'Review',
        value: String(Math.round(result.score || 0)),
    };
}

function getTableLensMeta(screenMode: ScreenMode): { label: string; shortLabel: string; tone: 'success' | 'warning' | 'primary' | 'muted' } {
    if (screenMode === 'reverse') return { label: 'Reverse Engine', shortLabel: 'REV', tone: 'success' };
    if (screenMode === 'paradigm') return { label: 'Paradigm Lens', shortLabel: 'PDM', tone: 'primary' };
    if (screenMode === 'youtube') return { label: 'YouTube Strategy', shortLabel: 'YT', tone: 'warning' };
    return { label: '100-Bagger', shortLabel: '100B', tone: 'primary' };
}

function TableHead({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <th className={clsx("px-4 py-3 text-base font-black uppercase tracking-wider text-muted-foreground", className)}>
            {children}
        </th>
    );
}

function TableBadge({ children, tone }: { children: ReactNode; tone: 'success' | 'warning' | 'primary' | 'muted' }) {
    return (
        <span className={clsx(
            "inline-flex w-fit items-center rounded-md border px-2.5 py-1.5 text-base font-black leading-none",
            tone === 'success' && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
            tone === 'warning' && "border-amber-500/30 bg-amber-500/10 text-amber-400",
            tone === 'primary' && "border-blue-500/30 bg-blue-500/10 text-blue-400",
            tone === 'muted' && "border-border/60 bg-secondary/30 text-muted-foreground",
        )}>
            {children}
        </span>
    );
}

function SubCard({ label, value, detail, active, tone, onClick }: { label: string; value: string | number; detail: string; active: boolean; tone: 'sky' | 'emerald' | 'purple' | 'red'; onClick?: () => void }) {
    const toneClass = {
        sky: active ? "border-sky-500/60 bg-sky-500/15 text-sky-300" : "hover:border-sky-500/40",
        emerald: active ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300" : "hover:border-emerald-500/40",
        purple: active ? "border-purple-500/60 bg-purple-500/15 text-purple-300" : "hover:border-purple-500/40",
        red: active ? "border-red-500/60 bg-red-500/15 text-red-300" : "hover:border-red-500/40",
    }[tone];

    const content = (
        <>
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</span>
                <span className="font-mono text-base font-black text-foreground">{value}</span>
            </div>
            <p className="mt-1 truncate text-xs leading-snug text-muted-foreground" title={detail}>{detail}</p>
            {onClick && (
                <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-1.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                    <span>{active ? 'Applied' : 'Click to filter'}</span>
                    <span className={clsx(
                        "h-2.5 w-2.5 rounded-full",
                        active ? "bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.75)]" : "bg-muted-foreground/40"
                    )} />
                </div>
            )}
        </>
    );

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={clsx("min-w-0 rounded-md border border-border/70 bg-card/60 px-3 py-2 text-left transition-all", toneClass)}
            >
                {content}
            </button>
        );
    }

    return (
        <div className={clsx("min-w-0 rounded-md border border-border/70 bg-card/60 px-3 py-2", toneClass)}>
            {content}
        </div>
    );
}
