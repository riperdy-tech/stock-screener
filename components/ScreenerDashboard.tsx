"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { StockDetailModal } from "./StockDetailModal";
import { StockCard } from "./StockCard";
import { fetchStocks, fetchReverseScores, fetchParadigmScores, Market } from "@/lib/data-service";
import { buildPrompt } from "@/lib/prompt-builder";
import { ScreeningResult } from "@/lib/blueprint";
import { FilterSidebar, FilterState, STRICT_FILTERS, DEFAULT_FILTERS, ZERO_BASE_FILTERS, ReverseFilterState, DEFAULT_REVERSE_FILTERS, ParadigmFilterState, DEFAULT_PARADIGM_FILTERS } from "./FilterSidebar";
import { evaluateYoutubeStrategy, matchesYoutubeStrategyFilter, YoutubeStrategyEvaluation, YoutubeStrategyFilter } from "@/lib/youtube-strategy";
import { supabase } from "@/lib/supabase";
import { LanguageToggle } from "./LanguageToggle";
import { LogConsole } from "./LogConsole";
import { Sparkles, RefreshCw, X, Search, Filter, Copy, Check, Terminal, HelpCircle, Telescope, ShieldCheck, Layers3, Youtube } from 'lucide-react';
import { useLanguage } from "./LanguageContext";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import clsx from "clsx";

type ScreenMode = '100bagger' | 'reverse' | 'paradigm' | 'youtube';
type StrategyId = ScreenMode;

const STRATEGY_META: Record<StrategyId, {
    title: string;
    eyebrow: string;
    description: string;
    metricLabel: string;
    accent: string;
    icon: typeof Sparkles;
}> = {
    '100bagger': {
        title: '100-Bagger',
        eyebrow: 'Growth filter',
        description: 'Small-cap growth candidates screened against strict quantitative gates.',
        metricLabel: 'strict matches',
        accent: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
        icon: Telescope,
    },
    reverse: {
        title: 'Reverse Engine',
        eyebrow: 'Quality + value',
        description: 'Ranks stocks by quality, margin of safety, survivability, and full composite.',
        metricLabel: 'ranked names',
        accent: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
        icon: ShieldCheck,
    },
    paradigm: {
        title: 'Paradigm',
        eyebrow: 'Secular themes',
        description: 'Finds real participants in multi-year shifts like AI, GLP-1, energy, and security.',
        metricLabel: 'theme-tagged',
        accent: 'text-purple-300 border-purple-500/40 bg-purple-500/10',
        icon: Layers3,
    },
    youtube: {
        title: 'YouTube Strategy',
        eyebrow: 'Video playbook',
        description: 'Earnings momentum, deep-value reversal, and turnaround filters from the video strategy.',
        metricLabel: 'video signals',
        accent: 'text-red-300 border-red-500/40 bg-red-500/10',
        icon: Youtube,
    },
};

const YOUTUBE_FILTER_META: Array<{ value: YoutubeStrategyFilter; label: string; description: string }> = [
    { value: "any", label: "Any Video Signal", description: "Any stock matching at least one video playbook." },
    { value: "earningsMomentum", label: "Earnings Momentum", description: "Large-cap EPS and revenue momentum." },
    { value: "deepValueReversal", label: "Deep Value Reversal", description: "Cheap valuation plus monthly reversal evidence." },
    { value: "turnaroundSeed", label: "Turnaround Seed", description: "Negative EPS with improving forward EPS." },
    { value: "turnaroundScaleIn", label: "Turnaround Scale-In", description: "Reported EPS flipped back above zero." },
];

export function ScreenerDashboard() {
    const { t, language, setLanguage } = useLanguage();
    const [loading, setLoading] = useState(true);

    const [rawResults, setRawResults] = useState<ScreeningResult[]>([]);
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
    const [youtubeFilter, setYoutubeFilter] = useState<YoutubeStrategyFilter>("any");
    
    // Maintain a ref to current rawResults for the setInterval closure
    const rawResultsRef = useRef<ScreeningResult[]>([]);
    useEffect(() => { rawResultsRef.current = rawResults; }, [rawResults]);

    // AI Review State
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [selectedAiTicker, setSelectedAiTicker] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState<string | null>(null);
    

    const [copied, setCopied] = useState(false);
    

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
        alert("Copied!");
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
            const msg = `Dispatched ${data.queued} analyses${data.skipped ? ` (${data.skipped} skipped — already analyzed)` : ''} — waiting for workers...`;
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

    async function loadData(silent = false, market: Market) {
        if (!silent) setLoading(true);
        try {
            const { data: rawData, lastUpdated: updateDate } = await fetchStocks(market);
            
            if (updateDate) setLastUpdatedFile(updateDate);

            // Phase 9: Load reverse screening engine results
            const reverseScores = market === 'US' ? await fetchReverseScores() : {};
            // WS1: Load paradigm dimension results
            const paradigmScores = market === 'US' ? await fetchParadigmScores() : {};

            // ADAPTER: Convert CSV Flat Object to ScreeningResult
            const adaptedData = (rawData as any[]).map(item => {
                // The item is now the flat CSV row parsed by data-service
                // metrics are already top-level in 'item' due to data-service mapping
                const sym = item.symbol || '';
                return {
                    candidate: {
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
                    industry: item.industry,
                    reverse: reverseScores[sym] || undefined, // Phase 9: attach reverse data
                    paradigm: paradigmScores[sym] || undefined, // WS1: attach paradigm data
                };
            });

            setRawResults(adaptedData as unknown as ScreeningResult[]);
        } catch (err) {
            console.error("Failed to load or adapt data:", err);
            setRawResults([]);
        }
        setLoading(false);
    }

    const youtubeEvaluations = useMemo(() => {
        const map = new Map<string, YoutubeStrategyEvaluation>();
        rawResults.forEach(result => {
            map.set(result.candidate.symbol, evaluateYoutubeStrategy(result));
        });
        return map;
    }, [rawResults]);

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
            return rawResults.filter(r => {
                const evaluation = youtubeEvaluations.get(r.candidate.symbol);
                if (!evaluation || !matchesYoutubeStrategyFilter(evaluation, youtubeFilter)) return false;

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
    }, [rawResults, search, filters, selectedMarket, screenMode, reverseFilters, paradigmFilters, youtubeEvaluations, youtubeFilter]);


    // Pagination Logic
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    useEffect(() => {
        setCurrentPage(1);
    }, [search, filters, screenMode, reverseFilters, paradigmFilters, youtubeFilter, selectedMarket]);

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
    const activeStrategy = STRATEGY_META[screenMode];
    const activeMetric = screenMode === 'reverse'
        ? 'Composite'
        : screenMode === 'paradigm'
            ? 'Paradigm signal'
            : screenMode === 'youtube'
                ? 'Video signal'
                : '100-bagger score';
    const activeSummary = screenMode === 'reverse'
        ? 'Sorted by Reverse composite, with quality, valuation, survivability, and archetype filters available in the sidebar.'
        : screenMode === 'paradigm'
            ? 'Sorted by Paradigm signal. Cards keep Paradigm first so the theme thesis stays visible even beside other screens.'
            : screenMode === 'youtube'
                ? 'Screened by the video strategy playbooks: earnings momentum, deep-value reversal, and turnaround setups.'
                : 'Screened by strict 100-bagger quantitative filters. Use the sidebar to tune growth, valuation, float, and ownership gates.';
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
                youtubeFilter={youtubeFilter}
                setYoutubeFilter={setYoutubeFilter}
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
            <main className="flex-1 flex flex-col h-screen overflow-hidden relative w-full">
                {/* Header */}
                <header className="py-3 md:h-16 border-b border-border/50 flex flex-col md:flex-row flex-shrink-0 items-start md:items-center justify-between px-4 md:px-6 bg-card/70 backdrop-blur-xl sticky top-0 z-30 shadow-sm gap-3 md:gap-0">
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                        <div className="flex items-center gap-2 md:gap-4">
                            <h1 className="text-lg md:text-xl font-bold text-foreground truncate max-w-[150px] sm:max-w-none">
                                {t('appTitle')}
                            </h1>
                            <button 
                                onClick={() => setShowHelp(true)}
                                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-full transition-colors"
                                title="How scoring works"
                            >
                                <HelpCircle className="h-4 w-4" />
                            </button>
                        </div>
                        
                        <div className="flex md:hidden items-center gap-2 shrink-0">
                             <Link href="/reports" className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-full transition-all text-[11px] font-black active:scale-95">
                                <Sparkles className="h-3.5 w-3.5" />
                                REPORTS
                             </Link>
                             <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-secondary text-secondary-foreground rounded-full hover:bg-secondary/80 transition-colors border border-border/50">
                                <Filter className="h-4 w-4" />
                            </button>
                        </div>
                        
                        <Link href="/reports" className="hidden md:flex text-sm bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 px-6 py-2 rounded-full font-black items-center gap-2 tracking-tighter transition-all active:scale-95 ml-6">
                           <Sparkles className="h-4 w-4" /> RECENT REPORTS
                        </Link>
                    </div>

                    <div className="flex bg-secondary/50 p-1 rounded-lg border border-border/50 shadow-inner scale-90 md:scale-100 overflow-x-auto no-scrollbar max-w-[280px] sm:max-w-none">
                        {(['US', 'Korea', 'Taiwan'] as Market[]).map((m) => (
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
                                <span>{m === 'US' ? '🇺🇸' : m === 'Korea' ? '🇰🇷' : '🇹🇼'}</span>
                                <span className={clsx(selectedMarket === m ? "block" : "hidden sm:block")}>
                                    {m === 'US' ? t('usStocks') : m === 'Korea' ? t('koreaStocks') : t('taiwanStocks')}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                            <button 
                                onClick={() => setIsLogOpen(true)} 
                                className="flex items-center gap-2 px-3.5 py-1.5 bg-secondary/50 hover:bg-secondary text-foreground/80 hover:text-foreground rounded-lg transition-all duration-300 text-xs font-bold border border-border/50 backdrop-blur-md shadow-sm active:scale-95"
                            >
                                <div className="relative">
                                    <Terminal className="h-4 w-4" />
                                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_var(--success)]"></span>
                                </div>
                                <span className="hidden sm:inline tracking-tight">System Logs</span>
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
                    <section className="mb-5">
                        <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Investing lens</div>
                                <h2 className="text-xl font-black tracking-tight text-foreground">Strategy board</h2>
                            </div>
                            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                                Current strategy universe, primary rank metric, and cross-signal coverage at a glance.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 pb-2 lg:grid-cols-2 2xl:grid-cols-4">
                            {(Object.keys(STRATEGY_META) as StrategyId[]).map((id) => {
                                const meta = STRATEGY_META[id];
                                const Icon = meta.icon;
                                const isActive = id === screenMode;
                                const count = strategyCounts[id];
                                const content = (
                                    <div className={clsx(
                                        "h-full min-h-[132px] rounded-lg border p-3 text-left transition-all",
                                        isActive
                                            ? "border-primary/70 bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]"
                                            : "border-border/70 bg-card/70 hover:border-primary/40 hover:bg-secondary/30"
                                    )}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className={clsx("rounded-md border p-2", meta.accent)}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <span className={clsx(
                                                "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                                                isActive ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground"
                                            )}>
                                                {isActive ? 'Active' : 'Switch'}
                                            </span>
                                        </div>
                                        <div className="mt-3">
                                            <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{meta.eyebrow}</div>
                                            <div className="mt-0.5 text-sm font-black text-foreground">{meta.title}</div>
                                            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{meta.description}</p>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2">
                                            <span className="text-[10px] font-bold uppercase text-muted-foreground">{meta.metricLabel}</span>
                                            <span className="font-mono text-sm font-black text-foreground">{count == null ? 'Open' : count.toLocaleString()}</span>
                                        </div>
                                    </div>
                                );

                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => {
                                            setScreenMode(id);
                                            setSelectedTickers(new Set());
                                        }}
                                        className="block text-left"
                                    >
                                        {content}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                            {screenMode === 'youtube' && YOUTUBE_FILTER_META.map(item => (
                                <SubCard
                                    key={item.value}
                                    label={item.label}
                                    value={youtubeTotals[item.value].toLocaleString()}
                                    detail={item.description}
                                    active={youtubeFilter === item.value}
                                    tone="red"
                                    onClick={() => setYoutubeFilter(item.value)}
                                />
                            ))}
                            {screenMode === 'reverse' && ['High', 'Solid', 'Watchlist', 'Monitor', 'Reject-tier'].map(band => (
                                <SubCard
                                    key={band}
                                    label={band}
                                    value={(reverseBandCounts[band] || 0).toLocaleString()}
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
                                    value={(paradigmBandCounts[item.id] || 0).toLocaleString()}
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
                                { label: 'Strict Pass', value: strategyCounts['100bagger'].toLocaleString(), detail: 'Passed current strict status' },
                                { label: 'Min Growth', value: `${filters.minRevenueGrowth}%`, detail: 'Revenue growth floor' },
                                { label: 'Max Price', value: selectedMarket === 'US' ? `$${filters.maxPrice}` : String(filters.maxPrice), detail: 'Current price ceiling' },
                                { label: 'Min ROIC', value: `${filters.minROIC}%`, detail: 'Return on invested capital' },
                                { label: 'Max Float', value: `${filters.maxFloat}M`, detail: 'Float share ceiling' },
                            ].map(item => (
                                <SubCard
                                    key={item.label}
                                    label={item.label}
                                    value={item.value}
                                    detail={item.detail}
                                    active={false}
                                    tone="sky"
                                />
                            ))}
                        </div>
                    </section>

                    {/* Phase 11d: Batch Progress Bar — visible in both modes */}
                    {screenMode === 'reverse' && batchId && (
                        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl animate-in fade-in">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Sparkles className={clsx("h-5 w-5", batchProgress && batchProgress.completed + batchProgress.failed >= batchProgress.total ? "text-emerald-400" : "text-emerald-400 animate-pulse")} />
                                    <div>
                                        <span className="text-sm font-bold text-emerald-400">Batch Deep-Dive</span>
                                        <span className="text-xs text-muted-foreground ml-3">
                                            {batchProgress
                                                ? `${batchProgress.completed} of ${batchProgress.total} complete${batchProgress.failed > 0 ? ` (${batchProgress.failed} failed)` : ''}`
                                                : `Waiting for workers...`}
                                        </span>
                                    </div>
                                </div>
                                <button onClick={() => dismissBatchPanel()} className="text-muted-foreground hover:text-foreground text-xs">Dismiss</button>
                            </div>
                            {batchProgress && (
                                <div className="w-full h-2 bg-secondary/50 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                                        style={{ width: `${((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100}%` }} />
                                </div>
                            )}
                            {batchProgress?.tickers && (
                                <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                    {batchProgress.tickers.map((t: any) => (
                                        <span key={t.ticker} className={clsx(
                                            "text-[10px] px-1.5 py-0.5 rounded font-mono",
                                            t.status === 'completed' ? "bg-emerald-500/20 text-emerald-400" :
                                            t.status === 'error' ? "bg-red-500/20 text-red-400" :
                                            "bg-secondary/40 text-muted-foreground"
                                        )}>
                                            {t.ticker}{t.status === 'completed' ? ' ✓' : t.status === 'error' ? ' ✗' : ' …'}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {batchProgress && batchProgress.completed + batchProgress.failed >= batchProgress.total && (
                                <p className="text-[11px] text-emerald-400 mt-2 font-medium">All done! Open any stock card to view its report.</p>
                            )}
                        </div>
                    )}
                    <div className="mb-6 rounded-lg border border-border/70 bg-card/70 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={clsx("rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-wider", activeStrategy.accent)}>
                                        {activeStrategy.eyebrow}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{selectedMarket} market</span>
                                </div>
                                <h2 className="mt-2 text-2xl font-black tracking-tight">{activeStrategy.title}</h2>
                                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{activeSummary}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
                                <SummaryMetric label="Showing" value={`${filteredCount > 0 ? startIndex + 1 : 0}-${Math.min(startIndex + ITEMS_PER_PAGE, filteredCount)}`} />
                                <SummaryMetric label="Results" value={filteredCount.toLocaleString()} />
                                <SummaryMetric label="Sorted by" value={activeMetric} />
                            </div>
                        </div>
                    </div>

                    {loading && rawResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground animate-pulse">
                            <p>{t('initEngine')}</p>
                        </div>
                    ) : filteredCount === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-dashed border-border rounded-xl">
                            <p className="text-lg">⚠</p>
                            <p>{t('noStocks')}</p>
                            <button onClick={() => setFilters(ZERO_BASE_FILTERS)} className="mt-4 text-primary text-sm hover:underline">{t('resetFilters')}</button>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                                {currentData.map((result, i) => (
                                    <div key={result.candidate.symbol} className="relative group/card">
                                        {/* Selection checkbox — reverse mode only */}
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
                                            >
                                                {selectedTickers.has(result.candidate.symbol) && (
                                                    <span className="text-xs font-bold">✓</span>
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
                                        />
                                    </div>
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
                                    <div className="grid grid-cols-1 gap-4 flex-1 min-h-[350px] sm:min-h-[450px]">
                                        {/* Prompt Box */}
                                        <div className="relative flex-1 bg-[#0d121c] border border-border rounded-xl overflow-hidden flex flex-col shadow-inner">
                                            <div className="bg-secondary/40 px-3 sm:px-5 py-2.5 border-b border-border flex justify-between items-center shrink-0">
                                                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider font-semibold">INTEGRATED INVESTMENT ANALYSIS ENGINE v2.0</span>
                                                <button
                                                    onClick={() => copyToClipboard(aiResult!)}
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
                                        
                                        {/* Deepseek Result Box */}
                                        {dsResult && (
                                            <div className="relative flex-1 bg-[#1a1f2e] border border-blue-500/30 rounded-xl overflow-hidden flex flex-col shadow-inner">
                                                <div className="bg-blue-500/10 px-3 sm:px-5 py-2.5 border-b border-blue-500/20 flex justify-between items-center shrink-0 flex-wrap gap-2">
                                                    <span className="text-xs font-mono text-blue-400 uppercase tracking-wider font-semibold">QUANT REPORT</span>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex flex-col">
                                                            <h1 className="text-xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                                                                QUANT <span className="text-blue-500">PRO</span>
                                                            </h1>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Global Terminal</span>
                                                                <div className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button onClick={downloadDsResult} className="flex items-center gap-1 text-xs bg-secondary hover:bg-secondary/80 px-2 py-1 rounded">Download .txt</button>
                                                    <button onClick={copyDsResult} className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-1 rounded">Copy Result</button>
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-slate-950/40 backdrop-blur-md">
                                                    <div className="prose prose-invert prose-blue max-w-none break-words whitespace-pre-wrap font-sans text-slate-100 leading-relaxed text-base sm:text-lg">
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
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 shrink-0 mt-2">
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
                                        {showDsPassword ? (
                                            <div className="flex flex-col items-center justify-center gap-2 bg-[#4d6bfe]/20 border border-[#4d6bfe]/40 py-2 sm:py-2 rounded-xl px-2">
                                                <input type="password" placeholder="Password" value={dsPassword} onChange={(e)=>setDsPassword(e.target.value)} className="w-full text-xs p-1.5 rounded bg-background border border-border" />
                                                <button onClick={handleDeepseekRun} disabled={dsLoading} className="w-full bg-[#4d6bfe] text-white text-xs py-1.5 rounded font-bold hover:bg-[#3b54d1]">
                                                    {dsLoading ? "Running..." : "Run Deepseek"}
                                                </button>
                                                {dsError && <span className="text-[10px] text-danger">{dsError}</span>}
                                            </div>
                                        ) : (
                                            <button onClick={() => setShowDsPassword(true)} className="flex flex-col items-center justify-center gap-2.5 bg-[#4d6bfe] hover:bg-[#3b54d1] text-white py-4 sm:py-6 rounded-xl font-semibold transition-transform hover:scale-[1.02] active:scale-95 shadow-md">
                                                <img src="https://www.google.com/s2/favicons?domain=deepseek.com&sz=64" alt="Deepseek" className="w-8 h-8 rounded-md shrink-0 shadow-sm bg-white p-1" />
                                                <span className="text-sm font-bold tracking-wide">Deepseek V4.0 Pro</span>
                                            </button>
                                        )}
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
                    <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95">
                        <h3 className="text-lg font-bold mb-2">Enter Password</h3>
                        <p className="text-xs text-muted-foreground mb-3">Required to dispatch deep-dive analyses.</p>
                        <input
                            type="password"
                            placeholder="Password"
                            value={dsPassword}
                            onChange={(e) => setDsPassword(e.target.value)}
                            className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            onKeyDown={(e) => { if (e.key === 'Enter' && dsPassword) { setShowBatchPassword(false); setShowBatchConfirm(true); } }}
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setShowBatchPassword(false)} className="flex-1 px-3 py-2 bg-muted text-muted-foreground text-xs font-bold rounded border border-border">Cancel</button>
                            <button
                                onClick={() => { setShowBatchPassword(false); setShowBatchConfirm(true); }}
                                disabled={!dsPassword}
                                className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded disabled:opacity-50"
                            >Continue</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Phase 11d: Batch Confirm Dialog */}
            {showBatchConfirm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95">
                        <h3 className="text-lg font-bold mb-2">Dispatch Deep-Dive Batch?</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            {selectedTickers.size > 0
                                ? <>This will dispatch <span className="font-bold text-foreground">{selectedTickers.size} selected</span> stock(s) for v3.2 deep-dive analysis via GitHub Actions. Each takes ~2-3 minutes.</>
                                : <>This will dispatch the top <span className="font-bold text-foreground">{batchN}</span> stocks for v3.2 deep-dive analysis via GitHub Actions. Each takes ~2-3 minutes.</>
                            }
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowBatchConfirm(false)}
                                className="flex-1 px-3 py-2 bg-muted text-muted-foreground text-xs font-bold rounded border border-border"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBatchDispatch}
                                className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded"
                            >
                                Dispatch {batchN}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Phase 11d: Batch Progress Panel */}
            {batchId && (
                <div className="fixed bottom-6 right-6 z-[100] bg-[#1a1f2e] border border-emerald-500/30 rounded-xl shadow-2xl p-4 min-w-[300px] flex flex-col gap-3 animate-in slide-in-from-bottom-5">
                    <div className="flex justify-between items-start gap-4">
                        <div className="flex items-start gap-3">
                            <Sparkles className={clsx("h-5 w-5 mt-0.5", batchProgress && batchProgress.completed + batchProgress.failed >= batchProgress.total ? "text-emerald-400" : "text-emerald-400 animate-pulse")} />
                            <div className="flex flex-col flex-1">
                                <span className="font-bold text-sm text-foreground">Batch Deep-Dive</span>
                                <span className="text-xs text-muted-foreground mt-1">
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
                                <div className="w-full h-2 bg-secondary/50 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                        style={{ width: `${((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100}%` }} />
                                </div>
                                )}
                                {batchProgress && batchProgress.completed + batchProgress.failed >= batchProgress.total && (
                                    <span className="text-[10px] text-emerald-400 mt-1.5 font-bold">
                                        {batchProgress.completed > 0 ? 'Open any stock card to view its report.' : 'No reports generated.'}{' '}Auto-closing in 8s.
                                    </span>
                                )}
                            </div>
                        </div>
                        <button onClick={() => dismissBatchPanel()} className="text-muted-foreground hover:text-foreground shrink-0" title="Dismiss">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Deepseek Task Alert */}
            {backgroundDsTask && (
                <div className="fixed bottom-6 right-6 z-[100] bg-[#1a1f2e] border border-blue-500/30 rounded-xl shadow-2xl p-4 min-w-[300px] flex flex-col gap-3 animate-in slide-in-from-bottom-5">
                    <div className="flex justify-between items-start gap-4">
                        <div className="flex items-start gap-3">
                            <Sparkles className={clsx("h-5 w-5 mt-0.5", backgroundDsTask.status === 'running' ? "text-blue-400 animate-pulse" : backgroundDsTask.status === 'error' ? "text-danger" : "text-success")} />
                            <div className="flex flex-col">
                                <span className="font-bold text-sm text-foreground">
                                    {backgroundDsTask.status === 'running' ? `Analyzing ${backgroundDsTask.ticker}...` : backgroundDsTask.status === 'error' ? `Error analyzing ${backgroundDsTask.ticker}` : `Analysis Complete: ${backgroundDsTask.ticker}`}
                                </span>
                                <span className="text-xs text-muted-foreground mt-1">
                                    {backgroundDsTask.status === 'running' ? 'Deepseek V4.0 Pro is generating report.' : backgroundDsTask.status === 'error' ? backgroundDsTask.message : 'Report saved to scorecard!'}
                                </span>
                            </div>
                        </div>
                        <button onClick={() => setBackgroundDsTask(null)} className="text-muted-foreground hover:text-foreground">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Help Modal */}
            {showHelp && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
                    <div className="bg-card border border-border/50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold">How Scoring Works</h2>
                            <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-secondary rounded-full transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="space-y-4 text-sm text-muted-foreground">
                            {/* SCORECARD SYMBOL LEGEND (top) */}
                            <div className="border border-purple-500/30 bg-purple-500/5 rounded-lg p-3">
                                <h3 className="font-bold text-purple-300 mb-2 text-base">Scorecard Symbol Legend</h3>
                                <p className="mb-2 text-xs">Each stock card may show badges from two systems: <b className="text-emerald-400">Reverse Engine</b> (green row) and <b className="text-purple-400">Paradigm</b> (purple row).</p>
                                <div className="grid grid-cols-1 gap-1.5 text-xs">
                                    <p><span className="font-bold text-emerald-400">[High] / [Solid] / [Watchlist] / [Monitor]</span> — Reverse Engine composite band (quality + value + survivability).</p>
                                    <p><span className="font-bold text-emerald-400">[A]…[I]</span> — Archetype letter. <b>★</b> = nominated for deep-dive. <b>1.5x</b> = CAGR/|Drawdown| efficiency.</p>
                                    <p className="pt-1 border-t border-purple-500/20"><span className="font-bold text-purple-300">[Paradigm STRONG]</span> = all 3 pillars converge (membership x momentum x economics gate, signal ≥ 30).</p>
                                    <p><span className="font-bold text-blue-400">[Paradigm SOLID]</span> = mid-conviction (signal 15–29). <span className="font-bold text-amber-400">[Paradigm WATCH]</span> = weak (5–14, track but don't buy). <span className="font-bold text-gray-400">[Paradigm PASS]</span> = gate or momentum kills it (&lt;5).</p>
                                    <p><span className="font-mono bg-purple-500/15 text-purple-300 px-1 rounded">theme_name</span> — primary secular theme this stock is tagged with.</p>
                                    <p><span className="font-mono text-primary/80">Sig 36</span> — three-factor signal score 0–100. <span className="font-mono text-purple-400">+1 theme</span> — tagged in additional themes (hover to see all).</p>
                                    <p><span className="font-black text-emerald-400">↑ Accel</span> — Δ-percentile-rank momentum rising fast vs universe. <span className="font-black text-red-400">↓ Decel</span> — falling fast.</p>
                                    <p><span className="font-black text-red-400">⚠ Macro</span> — macro overlay flag active (e.g., 10Y Treasury &gt; 5%, yield curve inverted, credit stress). Operator caution suggested.</p>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Stage 0–1 — Exclusion & Elimination</h3>
                                <p>Filters out ETFs/funds and stocks below $300M market cap. Hard gates: Altman Z-score &lt; 1.8 (bankruptcy risk), net debt/EBITDA &gt; 4.0×, data quality &lt; 2.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Stage 2 — Archetype Routing</h3>
                                <p>Classifies survivors into 9 archetypes (A–I) based on sector, industry keywords, and financial shape. Determines scoring rubrics and growth ceilings (A=17%, B=28%, C=22%, E=38%…).</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Stage 3 — Quality Score (0–100)</h3>
                                <p>A/B (compounders): ROIC spread over WACC, revenue growth, FCF margin, net debt. C (cyclicals): operating margin. E (early-stage): revenue, cash runway. G/H (financials/REITs): ROIC spread, leverage.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Stage 4 — Margin of Safety (0–100)</h3>
                                <p>Percentile-ranked valuation: FCF yield, EV/EBIT, and anchor multiple (0.4× EV/Sales + 0.4× EV/GP) — each ranked against the universe.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Stage 5 — Survivability (0–100)</h3>
                                <p>Balance-sheet stress test: leverage (net debt/EBITDA), funding (cash runway or self-funding), and max drawdown from ~2yr monthly closes. Maps to impairment probability.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Stage 6 — CAGR Proxy + Base-Rate Ceiling</h3>
                                <p>3-year revenue CAGR (from 5 annual periods) is primary growth. Forward EPS adds a capped secondary nudge (20% weight). If revenue CAGR exceeds the archetype ceiling, flagged HIGH_GROWTH_UNVERIFIED.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Stage 7 — Full Composite (0–100)</h3>
                                <p>Weighted blend: 30% CAGR + 25% MoS + 20% Quality + 15% Survivability + 10% Efficiency. Haircuts for impairment risk, sparse data, low confidence, and extreme growth. Bands: High ≥70, Solid ≥55, Watchlist ≥40, Monitor ≥25.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Stage 8 — Advisory Flags</h3>
                                <p>Metadata only (never change scores): INSIDER_HEAVY, PRICE_EXTENDED, SHORT_INTEREST_EXTREME, CROWDED_LONG, GROWTH_UNVERIFIED.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Stage 9 — Diversified Nomination (Top 25)</h3>
                                <p>Walks the ranked survivor list, capping single archetype ≤40%, single sector ≤35%, single country ≤60%. Result: a diversified top 25 across archetypes, sectors, and countries.</p>
                            </div>

                            {/* PARADIGM DIMENSION — separate scoring lane */}
                            <div className="border-t border-purple-500/30 pt-4 mt-4">
                                <h3 className="font-bold text-purple-300 mb-1 text-base">Paradigm Dimension — Secular Themes</h3>
                                <p className="mb-2">A <b>separate, parallel scoring lane</b> from the Reverse Engine above. The Reverse Engine asks "is this a quality, valued, survivable business?" The Paradigm Dimension asks "is this stock a real participant in a multi-year secular shift (AI compute, GLP-1 drugs, energy transition…) with both market validation AND real economics?"</p>
                                <p className="mb-2 italic">Core formula: <b className="text-purple-300">Paradigm Signal = Theme Membership × Theme Momentum × Economics Gate</b>. All three pillars required; weak link kills the signal. Anti-Nikola by design — narrative-only stocks with no revenue are zeroed out.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Pillar 1 — Theme Membership (Composite ≥ 2 of 3 methods)</h3>
                                <p>For each of 9 themes (ai_compute, physical_ai, glp1_metabolic, cloud_software, energy_transition, cybersecurity, quantum_computing, space_economy, nuclear_renaissance) three independent methods vote: <b>keyword match</b> on name+description, <b>GICS industry whitelist</b> (Yahoo taxonomy), and <b>operator-curated seed ticker list</b> with industry-adjacency propagation. Stock tagged if ≥2 methods agree. Multi-theme allowed (e.g., TSLA → physical_ai + energy_transition).</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Pillar 2 — Theme Momentum (Universe-relative, with acceleration)</h3>
                                <p>From 24 monthly closes, computes percentile-rank composite over 4 lookback windows (1m/3m/6m/12m weighted 0.1/0.2/0.3/0.4) blended 60/40 with a Δ-percentile-rank acceleration component. Symmetric — catches both fast-up (↑ Accel) and fast-down (↓ Decel) regime shifts. Triggers regime_shift_up/down via 10-month MA crossover.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Pillar 3 — Economics Gate (The Nikola Filter)</h3>
                                <p>Multiplicative: <code>(max(0, rev_quality − 25) / 75) × (max(0, rev_survivability − 50) / 50) × 100</code>. Either input below its floor → gate = 0 → signal = 0. Reads the frozen rev_* scores; no double-count. <b>Forward-EPS bridge</b> can lift gate up to 35 when survivability ≥ 25 AND forward EPS trajectory is positive — rescues scale-phase names (AMZN-1999 archetype). <b>Analyst-coverage uplift</b> adds up to +15 from yfinance recommendations + DeepSeek-narrated consensus (strict no-fabrication: confidence &lt; 0.6 collapses to null).</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Macro Overlay (T9)</h3>
                                <p>Pulls 5 FRED series each run (DGS10, T10Y2Y, BAA10Y, NFCI, BAMLH0A0HYM2). Flags fire when thresholds breach: 10Y &gt; 5%, curve inverted, credit stress, financial conditions tightening. Currently <b>flags-only</b> (no automatic signal demotion); appended to every tagged stock's pdm_flags as visible warning. Per brief: macro is overlay, not load-bearing on paradigm scoring until macro engine matures.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Conviction Bands</h3>
                                <p><b className="text-emerald-400">STRONG</b> (signal ≥ 30) — all 3 pillars align. <b className="text-blue-400">SOLID</b> (15–29) — mid-conviction. <b className="text-amber-400">WATCH</b> (5–14) — weak; track but don't buy. <b className="text-gray-400">PASS</b> (&lt;5) — gate or momentum killed it. <b>NO DATA</b> — at least one pillar missing inputs.</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground mb-1">Honest Limitations (per the brief)</h3>
                                <p><b>This is not failsafe.</b> The system buys breakouts not bottoms (requires market validation), the gate is a snapshot of current economics (lags emerging winners by ~1 quarter), and survivor-bias is structural (seed lists picked because we already know the winners). True validation = forward-logging signals now and observing outcomes over 6/12/24 months. Use as a discipline tool, not a predictive oracle.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <LogConsole isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} />
        </div>
    );
}

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 truncate font-mono text-sm font-black text-foreground" title={String(value)}>{value}</div>
        </div>
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
            <div className="flex items-start justify-between gap-2">
                <span className="truncate text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
                <span className="font-mono text-sm font-black text-foreground">{value}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{detail}</p>
        </>
    );

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={clsx("min-w-[150px] rounded-md border border-border/70 bg-card/60 px-3 py-2 text-left transition-all", toneClass)}
            >
                {content}
            </button>
        );
    }

    return (
        <div className={clsx("min-w-[150px] rounded-md border border-border/70 bg-card/60 px-3 py-2", toneClass)}>
            {content}
        </div>
    );
}
