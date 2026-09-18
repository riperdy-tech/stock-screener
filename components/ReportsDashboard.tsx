"use client";

import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { Search, Sparkles, Calendar, DollarSign, Activity, ChevronRight, RefreshCw, ArrowLeft, Download, FileText, Bot } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from 'react-markdown';
import clsx from "clsx";

// ─── Robust Markdown Normalizer ───────────────────────────
// DeepSeek produces wildly inconsistent formatting across stocks.
// This pre-processor enforces a clean, unified structure for TOC and rendering.
function normalizeContent(raw: string): string {
    if (!raw) return '';
    const lines = raw.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // 1. Strip unicode box-drawing border lines entirely
        if (/^[═╔╗╚╝║╠╣╦╩╬]{3,}$/.test(trimmed)) continue;
        
        // 2. Convert horizontal rule lines to markdown ---
        if (/^[─━]{3,}$/.test(trimmed)) {
            result.push('---');
            continue;
        }
        
        // 3. Convert "■ SECTION X. TITLE" → "## SECTION X. TITLE"
        const sectionMatch = trimmed.match(/^■\s*(SECTION|LAYER)\s+(\d[\d.]*[A-Za-z]?)\.?\s*(.*)/i);
        if (sectionMatch) {
            result.push(`## ${sectionMatch[1].toUpperCase()} ${sectionMatch[2]}. ${sectionMatch[3]}`.trim());
            continue;
        }
        
        // 4. Convert "■ INTEGRATED INVESTMENT ANALYSIS ENGINE v2.0 ■" → "# TITLE"
        const titleMatch = trimmed.match(/^■\s*(INTEGRATED INVESTMENT ANALYSIS ENGINE[^■]*)\s*■?$/i);
        if (titleMatch) {
            result.push(`# ${titleMatch[1].trim()}`);
            continue;
        }
        
        // 5. Convert "■ Some Other Title ■" → "## Some Other Title"
        const genericHeader = trimmed.match(/^■\s+(.+?)\s*■?$/);
        if (genericHeader && trimmed.replace(/■/g, '').trim().length > 10) {
            result.push(`## ${genericHeader[1].trim()}`);
            continue;
        }
        
        // 6. Convert h3-h6 to bold text
        const hMatch = trimmed.match(/^(#{3,6})\s+(.+)/);
        if (hMatch) {
            result.push(`**${hMatch[2]}**`);
            continue;
        }
        
        // 7. Convert old-style "SECTION X. TITLE" (without ## or ■) to "## SECTION X. TITLE"
        const oldSection = trimmed.match(/^SECTION\s+(\d[\d.]*[A-Za-z]?)\.?\s+(.*)/i);
        if (oldSection) {
            result.push(`## SECTION ${oldSection[1]}. ${oldSection[2]}`);
            continue;
        }
        
        // 8. Ensure markdown tables have blank line before them (ReactMarkdown needs this)
        if (trimmed.startsWith('|') && result.length > 0 && result[result.length - 1] !== '') {
            result.push('');
        }
        
        result.push(line);
    }
    
    return result.join('\n');
}

// Safely extract text from React children (handles strings, arrays, nested elements)
function reactNodeToText(node: any): string {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(reactNodeToText).join('');
    if (node && typeof node === 'object' && 'props' in node) {
        return reactNodeToText(node.props.children);
    }
    return '';
}

// Simple metadata normalizer — prefers stored metadata column, 
// falls back to [DATA_BLOCK] extraction, then text scraping for legacy reports
// Note: worker stores nested { verdict: { conviction, action, upside_pct, ... }, classification: { archetype }, valuation: { valuation_status } }
const getMeta = (report: any): any => {
    // If worker already saved structured metadata, use it directly
    if (report.metadata && typeof report.metadata === 'object' && Object.keys(report.metadata).length > 0) {
        const m = report.metadata;
        // Handle nested v3.0 schema
        const verdict = m.verdict || {};
        const classification = m.classification || {};
        const valuation = m.valuation || {};
        return {
            conviction: parseFloat(verdict.conviction) || parseFloat(m.conviction) || 0,
            upside: parseFloat(verdict.upside_pct) || parseFloat(verdict.upside) || parseFloat(m.upside_pct) || parseFloat(m.upside) || 0,
            action: (verdict.action || m.action || '').toUpperCase(),
            archetype: classification.archetype || m.archetype || '',
            valuation_status: valuation.valuation_status || m.valuation_status || '',
        };
    }
    
    const content = report.content || '';
    
    // Fallback 1: try [DATA_BLOCK] JSON extraction (handles nested v3.0 schema)
    try {
        const match = content.match(/\[DATA_BLOCK\]\s*(\{[\s\S]*?\})\s*$/);
        if (match && match[1]) {
            const parsed = JSON.parse(match[1].trim());
            const verdict = parsed.verdict || {};
            const classification = parsed.classification || {};
            const valuation = parsed.valuation || {};
            return {
                conviction: parseFloat(verdict.conviction) || parseFloat(parsed.conviction) || 0,
                upside: parseFloat(String(verdict.upside_pct || verdict.upside || parsed.upside_pct || parsed.upside || '0').replace('%', '')) || 0,
                action: (verdict.action || parsed.action || '').toUpperCase(),
                archetype: classification.archetype || parsed.archetype || '',
                valuation_status: valuation.valuation_status || parsed.valuation_status || '',
            };
        }
    } catch {}
    
    // Fallback 2: scrape from report text (legacy reports without [DATA_BLOCK])
    let conviction = 0;
    let upside = 0;
    let action = '';
    let archetype = '';
    let valuation_status = '';
    
    // Action: "Action: ACCUMULATE" or "Action: BUY"
    const actionMatch = content.match(/Action\s*:\s*(BUY|ACCUMULATE|HOLD|SELL)/i);
    if (actionMatch) action = actionMatch[1].toUpperCase();
    
    // Conviction: "Conviction 10.5" or "final Conviction X.X"
    const convMatch = content.match(/Conviction\s+(\d+\.?\d*)/i);
    if (convMatch) conviction = parseFloat(convMatch[1]) || 0;
    
    // Upside: "15–22% upside" or "XX% upside" or "XX–YY% upside"
    const upsideRange = content.match(/(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)%\s*upside/i);
    if (upsideRange) {
        upside = parseFloat(upsideRange[2]) || 0; // take upper end of range
    } else {
        const upsideSingle = content.match(/(\d+(?:\.\d+)?)%\s*upside/i);
        if (upsideSingle) upside = parseFloat(upsideSingle[1]) || 0;
    }
    
    // Valuation Status: "Valuation Status: FAIR TO UNDERVALUED"
    const valMatch = content.match(/Valuation\s+Status\s*:\s*(.+?)(?:\n|$)/i);
    if (valMatch) {
        const raw = valMatch[1].trim().toUpperCase();
        if (raw.includes('UNDERVALUED') && raw.includes('FAIR')) valuation_status = 'FAIR_TO_UNDERVALUED';
        else if (raw.includes('UNDERVALUED')) valuation_status = 'UNDERVALUED';
        else if (raw.includes('FAIR')) valuation_status = 'FAIR';
        else if (raw.includes('OVERVALUED')) valuation_status = 'OVERVALUED';
    }
    
    // Archetype: "Product-Platform Hybrid" in subtitle line after ticker
    const archMatch = content.match(/\|\s*(Stable Incumbent|Quality Compounder|Cyclical|Product-Platform Hybrid|Option-Led\s*\/?\s*High-Beta|Regulatory)\s*\|/i);
    if (archMatch) archetype = archMatch[1].trim();
    
    return { conviction, upside, action, archetype, valuation_status };
};

export function ReportsDashboard() {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [filterAction, setFilterAction] = useState("ALL");
    const [filterConviction, setFilterConviction] = useState(0);
    const [filterArchetype, setFilterArchetype] = useState("ALL");
    const [filterValuation, setFilterValuation] = useState("ALL");

    useEffect(() => {
        fetchReports();
    }, []);

    // Global background poll — detects status changes (pending→completed) even when no report selected
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const { data } = await supabase
                    .from('ai_reports')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (data) {
                    setReports(data);
                    // Also sync selectedReport if its status changed externally
                    setSelectedReport((prev: any) => {
                        if (!prev) return prev;
                        const updated = data.find((r: any) => r.id === prev.id);
                        return updated || prev;
                    });
                }
            } catch {}
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    // Faster 5s poll when actively viewing a pending report
    useEffect(() => {
        if (!selectedReport || selectedReport.status !== 'pending') return;
        const interval = setInterval(async () => {
            const { data } = await supabase
                .from('ai_reports')
                .select('*')
                .eq('id', selectedReport.id)
                .single();
            if (data && data.status !== 'pending') {
                // Update the report in the list and selected report
                setReports(prev => prev.map(r => r.id === data.id ? data : r));
                setSelectedReport(data);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [selectedReport?.id, selectedReport?.status]);

    const handleSelectReport = async (report: any) => {
        setSelectedReport(report);
        if (report.is_depth && !report.content) {
            try {
                const res = await fetch(`/data/depth_reports/${encodeURIComponent(report.ticker.toUpperCase())}.json?t=${Date.now()}`);
                if (res.ok) {
                    const bundle = await res.json();
                    const prose = bundle.samples?.[0]?.report || (bundle.verdict ? `# ${bundle.ticker} Underwriting Contract\n\nStance: ${bundle.verdict.direction}\nMedian Intrinsic Value: $${bundle.verdict.median_iv}\nMargin of Safety: ${bundle.verdict.mos_vs_median_pct}%\n` : 'No report content available.');
                    setSelectedReport({ ...report, content: prose });
                }
            } catch (err) {
                console.error("Error loading depth report:", err);
            }
        }
    };

    const fetchReports = async () => {
        setLoading(true);
        try {
            const [supabaseRes, depthRes] = await Promise.allSettled([
                supabase.from('ai_reports').select('*').order('created_at', { ascending: false }),
                fetch(`/data/depth_overlay.json?t=${Date.now()}`).then((r) => r.ok ? r.json() : null)
            ]);

            const sbData = supabaseRes.status === 'fulfilled' && supabaseRes.value?.data ? supabaseRes.value.data : [];
            const depthData = depthRes.status === 'fulfilled' ? depthRes.value : null;

            const depthReports: any[] = [];
            if (depthData && depthData.tickers) {
                for (const [ticker, d] of Object.entries(depthData.tickers as Record<string, any>)) {
                    depthReports.push({
                        id: `depth-${ticker}`,
                        ticker: ticker,
                        status: 'completed',
                        created_at: d.date ? `${d.date}T12:00:00Z` : depthData.generated_at,
                        is_depth: true,
                        metadata: {
                            verdict: {
                                conviction: d.conviction_score || 10,
                                action: d.direction === 'undervalued' ? 'BUY' : d.direction === 'overvalued' ? 'AVOID' : 'HOLD',
                                upside_pct: d.mos_vs_median_pct || 0
                            },
                            classification: {
                                archetype: d.business_quality_moat ? `Moat ★${Number(d.business_quality_moat).toFixed(1)}/5` : 'Charter v3.1 Contract'
                            },
                            valuation: {
                                valuation_status: d.direction ? d.direction.toUpperCase() : 'UNDERVALUED'
                            }
                        }
                    });
                }
            }

            // Depth reports newest first, then cloud records
            setReports([...depthReports, ...sbData]);
        } catch (err) {
            console.error("Error fetching reports:", err);
        } finally {
            setLoading(false);
        }
    };

    const [activeHeading, setActiveHeading] = useState<string | null>(null);
    const [mobileTocOpen, setMobileTocOpen] = useState(false);
    
    // Build TOC headings with stable counter-based IDs (shared between TOC + ReactMarkdown)
    const reportHeadings = useMemo(() => {
        if (!selectedReport?.content) return [];
        // Must use the SAME preprocessing as the render below
        const raw = (selectedReport.content || "")
            .replace(/^```(markdown|json|text)?/i, '')
            .replace(/```$/, '')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .trim();
        const normalized = normalizeContent(raw);
        const lines = normalized.split('\n');
        const headings: { id: string; title: string; level: number }[] = [];
        let counter = 0;
        lines.forEach((line) => {
            const trimmed = line.trim();
            const h1Match = trimmed.match(/^#\s+(.+)/);
            const h2Match = trimmed.match(/^##\s+(.+)/);
            if (h1Match) {
                headings.push({ id: `section-${counter++}`, title: h1Match[1].trim(), level: 1 });
            } else if (h2Match) {
                headings.push({ id: `section-${counter++}`, title: h2Match[1].trim(), level: 2 });
            }
        });
        return headings;
    }, [selectedReport?.content]);

    // Scroll to a heading by ID
    const scrollToHeading = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setMobileTocOpen(false);
        }
    };

    // Track active section on scroll — use stable section-* IDs
    useEffect(() => {
        if (!selectedReport || reportHeadings.length === 0) return;

        const timer = setTimeout(() => {
            const observer = new IntersectionObserver(
                (entries) => {
                    for (const entry of entries) {
                        if (entry.isIntersecting) {
                            setActiveHeading(entry.target.id);
                            break; // first visible heading wins
                        }
                    }
                },
                { rootMargin: '-10% 0% -70% 0%', threshold: 0 }
            );

            reportHeadings.forEach((h) => {
                const el = document.getElementById(h.id);
                if (el) observer.observe(el);
            });

            return () => observer.disconnect();
        }, 600);

        return () => clearTimeout(timer);
    }, [selectedReport, reportHeadings]);

    const filteredReports = reports.filter((r: any) => {
        const matchesSearch = r.ticker.toLowerCase().includes(search.toLowerCase());
        const meta = getMeta(r);
        const matchesAction = filterAction === "ALL" || meta.action === filterAction;
        const matchesArchetype = filterArchetype === "ALL" || meta.archetype === filterArchetype;
        const matchesValuation = filterValuation === "ALL" || meta.valuation_status === filterValuation;
        const matchesConviction = meta.conviction >= filterConviction;
        return matchesSearch && matchesAction && matchesArchetype && matchesValuation && matchesConviction;
    });

    const reportStats = useMemo(() => {
        const completed = reports.filter((report: any) => report.status !== 'pending').length;
        const pending = reports.length - completed;
        const convictions = filteredReports.map((report: any) => getMeta(report).conviction).filter((value: number) => value > 0);
        const avgConviction = convictions.length
            ? convictions.reduce((sum: number, value: number) => sum + value, 0) / convictions.length
            : 0;
        return {
            total: reports.length,
            filtered: filteredReports.length,
            pending,
            avgConviction,
        };
    }, [reports, filteredReports]);
    const activeReportFilters = [
        search.trim() ? `Search: ${search.trim()}` : null,
        filterAction !== "ALL" ? `Action: ${filterAction}` : null,
        filterValuation !== "ALL" ? `Valuation: ${filterValuation.replace(/_/g, ' ')}` : null,
        filterArchetype !== "ALL" ? `Archetype: ${filterArchetype}` : null,
        filterConviction > 0 ? `Conviction >= ${filterConviction.toFixed(1)}` : null,
    ].filter((item): item is string => Boolean(item));
    const resetReportFilters = () => {
        setSearch("");
        setFilterAction("ALL");
        setFilterValuation("ALL");
        setFilterArchetype("ALL");
        setFilterConviction(0);
    };

    const downloadReport = (report: any) => {
        const element = document.createElement("a");
        const file = new Blob([report.content], {type: 'text/plain'});
        element.href = URL.createObjectURL(file);
        element.download = `Deepseek_Analysis_${report.ticker}_${new Date(report.created_at).toLocaleDateString()}.txt`;
        document.body.appendChild(element);
        element.click();
    };

    return (
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-page">
            {/* Header */}
            <header className="flex shrink-0 flex-col gap-3 border-b border-white/5 bg-surface px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/" className="p-2 text-ink-2 transition-colors hover:bg-white/5 hover:text-ink" aria-label="Back to screener">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div>
                        <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-ink">
                            <Sparkles className="h-5 w-5 text-accent" />
                            AI RESEARCH REPOSITORY
                        </h1>
                        <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                            Cloud-Stored Deepseek V4.0 Pro Analyses
                        </p>
                    </div>
                </div>

                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
                    <button 
                        onClick={fetchReports}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 border border-white/10 bg-white/5 px-3 py-2 text-sm font-extrabold text-ink-2 transition-all hover:bg-white/10 hover:text-accent active:scale-95 disabled:opacity-60"
                        title="Force Sync Cloud Data"
                        aria-label="Sync cloud reports"
                    >
                        <RefreshCw className={clsx("h-5 w-5", loading && "animate-spin text-accent")} />
                        <span>{loading ? "Syncing" : "Sync"}</span>
                    </button>
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-2" />
                        <input 
                            type="text" 
                            placeholder="Search tickers..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm transition-all focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                    </div>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
                {/* List Sidebar - Hidden on mobile if report selected */}
                <div className={clsx(
                    "w-full border-r border-white/5 bg-surface/50 transition-all md:w-[24rem] flex flex-col",
                    selectedReport && "hidden md:flex"
                )}>
                    {/* Filter Bar */}
                    <div className="space-y-2.5 border-b border-white/5 bg-surface p-3">
                        <div className="grid grid-cols-2 gap-2">
                            <select 
                                value={filterAction} 
                                onChange={(e) => setFilterAction(e.target.value)}
                                className="border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-accent focus:outline-none"
                            >
                                <option value="ALL">ALL ACTIONS</option>
                                <option value="BUY">BUY</option>
                                <option value="ACCUMULATE">ACCUMULATE</option>
                                <option value="HOLD">HOLD</option>
                                <option value="SELL">SELL</option>
                            </select>
                            <select 
                                value={filterValuation} 
                                onChange={(e) => setFilterValuation(e.target.value)}
                                className="border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-pos focus:outline-none"
                            >
                                <option value="ALL">ALL VALUATIONS</option>
                                <option value="UNDERVALUED">UNDERVALUED</option>
                                <option value="FAIR_TO_UNDERVALUED">FAIR/UNDER</option>
                                <option value="FAIR">FAIR</option>
                                <option value="OVERVALUED">OVERVALUED</option>
                            </select>
                            <select 
                                value={filterArchetype} 
                                onChange={(e) => setFilterArchetype(e.target.value)}
                                className="col-span-2 border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-ink-2 focus:outline-none"
                            >
                                <option value="ALL">ALL ARCHETYPES</option>
                                <option value="Stable Incumbent">STABLE</option>
                                <option value="Quality Compounder">COMPOUNDER</option>
                                <option value="Cyclical">CYCLICAL</option>
                                <option value="Product-Platform Hybrid">HYBRID</option>
                                <option value="Option-Led / High-Beta">HIGH-BETA</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-3 px-1">
                            <span className="whitespace-nowrap text-xs font-extrabold uppercase text-ink-2">Min Conviction: {filterConviction}</span>
                            <input 
                                type="range" min="0" max="15" step="0.5" 
                                value={filterConviction} 
                                onChange={(e) => setFilterConviction(parseFloat(e.target.value))}
                                className="flex-1 h-1 bg-white/10 appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                        <div className="border border-white/10 bg-white/[0.03] px-3.5 py-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="text-xs font-extrabold uppercase tracking-wider text-ink-2">Active filters</span>
                                <button
                                    type="button"
                                    onClick={resetReportFilters}
                                    disabled={activeReportFilters.length === 0}
                                    className="border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-extrabold text-ink-2 transition-colors hover:bg-white/10 hover:text-ink-2 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                    Reset
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {activeReportFilters.length > 0 ? activeReportFilters.map((filter) => (
                                    <span key={filter} className="border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
                                        {filter}
                                    </span>
                                )) : (
                                    <span className="text-xs font-semibold text-ink-2">Showing all cloud reports.</span>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <ResearchStat label="Shown" value={reportStats.filtered.toLocaleString()} sub={`${reportStats.total.toLocaleString()} total`} />
                            <ResearchStat label="Pending" value={reportStats.pending.toLocaleString()} sub="Cloud queue" />
                            <ResearchStat label="Avg Conviction" value={reportStats.avgConviction.toFixed(1)} sub="Filtered set" />
                            <ResearchStat label="Reader" value={selectedReport ? selectedReport.ticker : "None"} sub="Active report" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex min-h-80 flex-col justify-center gap-4 p-6 text-ink-2">
                                <div className="border border-accent/40 bg-accent/10] p-5">
                                    <div className="flex items-start gap-3">
                                        <div className="border border-accent/40 bg-accent/10 p-3 text-accent">
                                            <RefreshCw className="h-6 w-6 animate-spin" />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-extrabold tracking-tight text-ink">Fetching cloud reports</h3>
                                            <p className="mt-1 text-base font-semibold leading-relaxed text-ink-2">
                                                Loading Deepseek analyses, metadata, and queue status.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <ReportLoadingTile />
                                    <ReportLoadingTile />
                                    <ReportLoadingTile />
                                    <ReportLoadingTile />
                                </div>
                            </div>
                        ) : filteredReports.length === 0 ? (
                            <div className="flex min-h-80 flex-col items-center justify-center gap-5 p-8 text-center text-ink-2">
                                <div className="border border-accent/40 bg-accent/10] p-4 text-accent">
                                    <FileText className="h-8 w-8" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-extrabold tracking-tight text-ink">No reports match this view</h3>
                                    <p className="mt-2 max-w-sm text-base leading-relaxed">
                                        Try widening the repository filters or syncing the cloud records again.
                                    </p>
                                </div>
                                <div className="grid w-full max-w-sm grid-cols-2 gap-2">
                                    <EmptyReportStat label="Action" value={filterAction} />
                                    <EmptyReportStat label="Valuation" value={filterValuation} />
                                    <EmptyReportStat label="Archetype" value={filterArchetype} />
                                    <EmptyReportStat label="Min Conviction" value={filterConviction.toFixed(1)} />
                                </div>
                                {activeReportFilters.length > 0 && (
                                    <div className="flex max-w-sm flex-wrap justify-center gap-2">
                                        {activeReportFilters.map((filter) => (
                                            <span key={filter} className="border border-accent/40 bg-accent/10 px-3 py-1.5 text-base font-extrabold text-accent">
                                                {filter}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="flex flex-wrap justify-center gap-2">
                                    <button
                                        onClick={resetReportFilters}
                                        className="border border-rule-14 bg-white/5 px-4 py-2.5 text-base font-extrabold text-ink-2 transition-colors hover:bg-white/5 hover:text-ink"
                                    >
                                        Reset filters
                                    </button>
                                    <button
                                        onClick={fetchReports}
                                        className="flex items-center gap-2 border border-accent/40 bg-accent/10 px-4 py-2.5 text-base font-extrabold text-accent transition-colors hover:bg-accent/10"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        Sync reports
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {filteredReports.map((report: any) => {
                                    const meta = getMeta(report);
                                    
                                    const upside = meta.upside;
                                    const isPositive = upside > 0;
                                    const createdAt = new Date(report.created_at);

                                    return (
                                        <button
                                            key={report.id}
                                            onClick={() => handleSelectReport(report)}
                                            className={clsx(
                                                "group relative flex w-full cursor-pointer flex-col gap-3 border-b border-white/5 p-3.5 text-left transition-all hover:bg-white/[0.045] active:bg-white/10",
                                                selectedReport?.id === report.id ? "bg-accent/10 " : ""
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-lg font-extrabold tracking-tight text-ink transition-colors group-hover:text-accent">
                                                            {report.ticker}
                                                        </span>
                                                        {report.status === 'pending' && (
                                                            <span className="border border-warn/40 bg-warn/10 px-2 py-1 text-xs font-extrabold uppercase tracking-tight text-warn">
                                                                Pending
                                                            </span>
                                                        )}
                                                        {meta.valuation_status && (
                                                            <span className={clsx(
                                                                " border px-2 py-1 text-xs font-extrabold uppercase tracking-tight",
                                                                meta.valuation_status.includes('UNDERVALUED') ? "border-pos/40 bg-pos/10 text-pos" :
                                                                meta.valuation_status === 'OVERVALUED' ? "border-neg/40 bg-neg/10 text-neg" :
                                                                "border-white/10 bg-white/5 text-ink-2"
                                                            )}>
                                                                {meta.valuation_status.replace(/_/g, ' ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="mt-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-tight text-ink-2">
                                                        <Calendar className="h-4 w-4 text-accent opacity-70" />
                                                        {createdAt.toLocaleDateString()}
                                                        <span className="font-normal text-ink-3">@</span>
                                                        <span className="text-accent">{createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </div>

                                                <div className="grid shrink-0 grid-cols-2 gap-2 text-right">
                                                    <div className="border border-accent/40 bg-accent/10 px-3 py-2">
                                                        <div className="font-mono text-base font-extrabold leading-none text-accent">
                                                            {meta.conviction ? meta.conviction.toFixed(1) : '0.0'}
                                                        </div>
                                                        <span className="mt-1 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-2 opacity-70">Conv</span>
                                                    </div>
                                                    <div className={clsx(
                                                        " border px-3 py-2 ",
                                                        isPositive ? "border-pos/40 bg-pos/10 text-pos" : "border-neg/40 bg-neg/10 text-neg"
                                                    )}>
                                                        <div className="font-mono text-lg font-extrabold leading-none">
                                                            {isPositive ? '+' : ''}{upside.toFixed(1)}%
                                                        </div>
                                                        <span className="mt-1 block text-base font-extrabold uppercase tracking-[0.12em] text-ink-2 opacity-70">Alpha</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                <div className="border border-white/10 bg-white/[0.03] px-3.5 py-3">
                                                    <div className="text-base font-extrabold uppercase tracking-wider text-ink-2">Action</div>
                                                    <div className="mt-1 truncate text-lg font-extrabold text-ink-2" title={meta.action || 'ACTION N/A'}>
                                                        {meta.action || 'ACTION N/A'}
                                                    </div>
                                                </div>
                                                {meta.archetype && (
                                                    <div className="border border-white/10 bg-white/[0.03] px-3.5 py-3">
                                                        <div className="text-base font-extrabold uppercase tracking-wider text-ink-2">Archetype</div>
                                                        <div className="mt-1 truncate text-lg font-extrabold text-ink-2" title={meta.archetype}>
                                                            {meta.archetype}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-3 text-base font-bold text-ink-2">
                                                <span className="truncate">
                                                    {selectedReport?.id === report.id ? "Reading this report" : "Open report reader"}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5 border border-accent/40 bg-accent/10 px-3 py-1.5 text-accent opacity-80 transition-all group-hover:border-accent/40 group-hover:bg-accent/10 group-hover:opacity-100">
                                                    View <ChevronRight className="h-4 w-4" />
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <main
                    id="main-scroll-panel"
                    className={clsx(
                        "flex-1 bg-page overflow-y-auto no-scrollbar relative transition-all",
                        !selectedReport && "hidden md:flex"
                    )}
                >
                    {selectedReport ? (
                        <div className="flex h-full">
                            {/* Table of Contents Sidebar (Desktop) */}
                            <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-white/5 bg-page p-4 lg:block">
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-accent">
                                            <span className="w-4 h-[1px] bg-accent/10"></span>
                                            Contents
                                        </h3>
                                        <nav className="space-y-0.5">
                                            {reportHeadings.length === 0 ? (
                                                <p className="text-base text-ink-2 uppercase px-2">No sections detected</p>
                                            ) : (
                                                reportHeadings.map((h) => (
                                                    <button
                                                        key={h.id}
                                                        onClick={() => scrollToHeading(h.id)}
                                                        className={clsx(
                                                            "group flex w-full items-start gap-2.5  px-2.5 py-2 text-left transition-all duration-200",
                                                            activeHeading === h.id ? "bg-accent/10" : "hover:bg-white/[0.04]",
                                                            h.level === 2 && "pl-7"
                                                        )}
                                                    >
                                                        <span className={clsx(
                                                            "shrink-0 w-1.5 h-1.5  mt-[7px] transition-all duration-300",
                                                            activeHeading === h.id ? "bg-blue-400 " : "bg-white/15 group-hover:bg-accent/10"
                                                        )}></span>
                                                        <span className={clsx(
                                                            "line-clamp-2 text-xs leading-snug transition-colors duration-200",
                                                            h.level === 1 ? "font-bold uppercase tracking-wide" : "font-medium opacity-70",
                                                            activeHeading === h.id ? "text-accent" : "text-ink-2 group-hover:text-ink-2"
                                                        )}>
                                                            {h.title}
                                                        </span>
                                                    </button>
                                                ))
                                            )}
                                        </nav>
                                    </div>

                                    <div className="pt-5 border-t border-white/5">
                                        <button
                                            onClick={() => downloadReport(selectedReport)}
                                            className="w-full flex items-center justify-between group bg-accent/10 hover:bg-accent/10 border border-accent/40 px-4 py-3 transition-all"
                                        >
                                            <span className="text-base font-extrabold text-accent uppercase tracking-widest">Download .TXT</span>
                                            <Download className="h-4 w-4 text-accent group-hover:translate-y-0.5 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            </aside>

                            {/* Report Content */}
                            <div className="mx-auto max-w-4xl flex-1 p-4 animate-in fade-in slide-in-from-bottom-8 duration-700 md:p-8 lg:p-10">
                                {(() => {
                                    const meta = getMeta(selectedReport);
                                    
                                    return (
                                        <article className="relative">
                                            {/* Mobile Back Button */}
                                            <button 
                                                onClick={() => setSelectedReport(null)}
                                                className="mb-4 flex w-fit items-center gap-2 bg-accent/10 px-3 py-2 text-xs font-bold tracking-[0.16em] text-accent transition-all active:scale-95 md:hidden"
                                            >
                                                <ArrowLeft className="h-3.5 w-3.5" /> RETURN TO LIST
                                            </button>

                                            {/* Mobile TOC (collapsible) */}
                                            {reportHeadings.length > 0 && (
                                                <div className="mb-5 overflow-hidden border border-white/10 bg-surface lg:hidden">
                                                    <button
                                                        onClick={() => setMobileTocOpen(!mobileTocOpen)}
                                                        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
                                                    >
                                                        <span className="text-base font-extrabold text-accent uppercase tracking-[0.14em]">
                                                            Table of Contents ({reportHeadings.length} sections)
                                                        </span>
                                                        <ChevronRight className={clsx("h-4 w-4 text-accent transition-transform duration-200", mobileTocOpen && "rotate-90")} />
                                                    </button>
                                                    {mobileTocOpen && (
                                                        <nav className="border-t border-white/5 px-5 py-3 space-y-0.5 max-h-72 overflow-y-auto">
                                                            {reportHeadings.map((h) => (
                                                                <button
                                                                    key={h.id}
                                                                    onClick={() => scrollToHeading(h.id)}
                                                                    className={clsx(
                                                                        "block w-full text-left py-2.5 text-base transition-colors",
                                                                        h.level === 1 ? "font-bold text-ink-2" : "font-medium text-ink-3 pl-4",
                                                                        "hover:text-accent active:text-accent"
                                                                    )}
                                                                >
                                                                    {h.title}
                                                                </button>
                                                            ))}
                                                        </nav>
                                                    )}
                                                </div>
                                            )}

                                            {/* Header Section */}
                                            <header className="mb-7 border-b border-white/10 pb-7">
                                                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                                                    <div>
                                                        <div className="mb-2 flex items-center gap-2">
                                                            <span className="border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-extrabold uppercase tracking-widest text-accent">
                                                                {meta.archetype || 'Asset Research'}
                                                            </span>
                                                            <span className="w-1 h-1 bg-white/20"></span>
                                                            <span className="text-xs font-bold uppercase tracking-widest text-ink-2">
                                                                {new Date(selectedReport.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                                            </span>
                                                        </div>
                                                        <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
                                                            {selectedReport.ticker}
                                                        </h1>
                                                        <p className="max-w-2xl text-sm font-medium leading-relaxed text-ink-2">
                                                            Comprehensive investment analysis powered by Deepseek V4.0 Pro engine.
                                                        </p>
                                                    </div>

                                                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3">
                                                        <div className="min-w-[92px] border border-white/5 bg-white/[0.02] p-3">
                                                            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-widest text-ink-2 opacity-60">Conviction</div>
                                                            <div className="text-2xl font-extrabold tracking-tight text-accent">{meta.conviction || '0'}</div>
                                                        </div>
                                                        <div className="min-w-[92px] border border-white/5 bg-white/[0.02] p-3">
                                                            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-widest text-ink-2 opacity-60">Upside</div>
                                                            <div className={clsx(
                                                                "text-2xl font-extrabold tracking-tight",
                                                                (parseFloat(meta.upside || 0)) > 0 ? "text-pos" : "text-neg"
                                                            )}>
                                                                {meta.upside || '0.0'}%
                                                            </div>
                                                        </div>
                                                        <div className="hidden min-w-[92px] border border-white/5 bg-white/[0.02] p-3 sm:block">
                                                            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-widest text-ink-2 opacity-60">Rating</div>
                                                            <div className="text-lg font-extrabold uppercase tracking-tight text-ink">{meta.action || 'HOLD'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </header>

                                            {/* Report Content */}
                                            {selectedReport.status === 'pending' ? (
                                                <div className="flex flex-col items-center justify-center gap-5 border border-white/5 bg-white/[0.02] py-20 text-center">
                                                    <div className="relative">
                                                        <div className="absolute inset-0 bg-accent/10 blur-3xl animate-pulse"></div>
                                                        <RefreshCw className="h-16 w-16 text-accent animate-spin relative z-10" />
                                                        <Bot className="h-8 w-8 absolute top-4 left-4 text-ink relative z-10" />
                                                    </div>
                                                    <div>
                                                        <h3 className="mb-2 text-2xl font-extrabold text-ink">AI Engine Processing...</h3>
                                                        <p className="max-w-sm text-sm font-medium text-ink-2">
                                                            Generating high-fidelity research for {selectedReport.ticker}. 
                                                            This typically takes 2-4 minutes.
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="report-prose">
                                                    <ReactMarkdown 
                                                        components={{
                                                            h1: ({node, ...props}: any) => {
                                                                const idx = reportHeadings.findIndex(h => h.title === reactNodeToText(props.children));
                                                                const id = idx >= 0 ? reportHeadings[idx].id : undefined;
                                                                return <h1 id={id} className="mt-12 mb-4 border-b border-white/10 pb-3 text-2xl font-extrabold uppercase tracking-tight text-ink md:text-3xl" {...props} />;
                                                            },
                                                            h2: ({node, ...props}: any) => {
                                                                const idx = reportHeadings.findIndex(h => h.title === reactNodeToText(props.children));
                                                                const id = idx >= 0 ? reportHeadings[idx].id : undefined;
                                                                return <h2 id={id} className="mt-9 mb-3 text-lg font-extrabold uppercase tracking-wide text-accent md:text-xl" {...props} />;
                                                            },
                                                            h3: ({node, ...props}: any) => <h3 className="mt-6 mb-2.5 text-lg font-extrabold tracking-tight text-ink" {...props} />,
                                                            p: ({node, ...props}: any) => <p className="mb-4 text-sm font-medium leading-7 text-ink-2 sm:text-base" {...props} />,
                                                            strong: ({node, ...props}: any) => <strong className="font-extrabold text-ink" {...props} />,
                                                            em: ({node, ...props}: any) => <em className="italic text-accent" {...props} />,
                                                            hr: ({node, ...props}: any) => <hr className="my-10 border-white/10" {...props} />,
                                                            ul: ({node, ...props}: any) => <ul className="space-y-2 mb-6 list-none pl-0" {...props} />,
                                                            ol: ({node, ...props}: any) => <ol className="space-y-2 mb-6 list-decimal pl-6 text-ink-2" {...props} />,
                                                            li: ({node, ...props}: any) => (
                                                                <li className="flex items-start gap-2.5 text-sm font-medium leading-7 text-ink-2 sm:text-base">
                                                                    <span className="w-1.5 h-1.5 bg-accent/10 mt-[9px] shrink-0"></span>
                                                                    <span>{props.children}</span>
                                                                </li>
                                                            ),
                                                            blockquote: ({node, ...props}: any) => (
                                                                <blockquote className="mb-5 -xl border-l-[3px] border-accent/40 bg-accent/10 px-4 py-3 text-sm italic text-ink-2 sm:text-base" {...props} />
                                                            ),
                                                            code: ({node, className, ...props}: any) => {
                                                                const isInline = !className;
                                                                if (isInline) {
                                                                    return <code className="bg-page/60 px-1.5 py-0.5 text-accent font-mono text-base" {...props} />;
                                                                }
                                                                return <code className="block bg-page/60 p-5 text-accent font-mono text-base leading-7 overflow-x-auto mb-6" {...props} />;
                                                            },
                                                            pre: ({node, ...props}: any) => (
                                                                <pre className="bg-page/40 border border-white/5 p-5 overflow-x-auto mb-6 text-base leading-7" {...props} />
                                                            ),
                                                            table: ({node, ...props}: any) => (
                                                                <div className="overflow-x-auto mb-8 border border-white/10">
                                                                    <table className="w-full text-base border-collapse" {...props} />
                                                                </div>
                                                            ),
                                                            thead: ({node, ...props}: any) => <thead className="bg-white/[0.03]" {...props} />,
                                                            tbody: ({node, ...props}: any) => <tbody className="divide-y divide-white/5" {...props} />,
                                                            th: ({node, ...props}: any) => <th className="px-4 py-3 text-left text-base font-extrabold text-accent uppercase tracking-wider border-b border-white/10" {...props} />,
                                                            td: ({node, ...props}: any) => <td className="px-4 py-3 text-ink-2 font-medium border-b border-white/5 leading-7" {...props} />,
                                                        }}
                                                    >
                                                        {normalizeContent(
                                                            (selectedReport.content || "")
                                                                .replace(/^```(markdown|json|text)?/i, '')
                                                                .replace(/```$/, '')
                                                                .replace(/\\n/g, '\n')
                                                                .replace(/\\t/g, '\t')
                                                                .trim()
                                                        )}
                                                    </ReactMarkdown>

                                                    {/* Footer stats */}
                                                    <footer className="mt-24 border-t border-white/5 pt-12">
                                                        <div className="mb-4 text-base font-extrabold uppercase tracking-[0.16em] text-ink-2">
                                                            Report Metadata
                                                        </div>
                                                        <div className="grid gap-3 sm:grid-cols-3">
                                                            <ReportFooterStat icon={<DollarSign className="h-4 w-4" />} label="Compute Cost" value={`$${selectedReport.cost || '0.00'}`} />
                                                            <ReportFooterStat icon={<Activity className="h-4 w-4" />} label="Token Density" value={`${selectedReport.usage?.total_tokens || 0} units`} />
                                                            <ReportFooterStat icon={<Calendar className="h-4 w-4" />} label="Processed At" value={new Date(selectedReport.created_at).toISOString()} />
                                                        </div>
                                                    </footer>
                                                </div>
                                            )}
                                        </article>
                                    );
                                })()}
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center p-6 text-center text-ink-2">
                            <div className="w-full max-w-2xl border border-white/10 bg-white/[0.03] p-8">
                                <div className="mx-auto flex h-20 w-20 items-center justify-center border border-accent/40 bg-accent/10] text-accent">
                                    <FileText className="h-9 w-9" />
                                </div>
                                <h3 className="mt-6 text-3xl font-extrabold tracking-tight text-ink">Select a Research Report</h3>
                                <p className="mx-auto mt-3 max-w-lg text-base font-medium leading-relaxed text-ink-2">
                                    Choose a ticker from the repository list to open the full Deepseek analysis, section navigation, conviction stats, and downloadable report.
                                </p>
                                <div className="mt-6 grid grid-cols-2 gap-3">
                                    <ResearchStat label="Total" value={reportStats.total.toLocaleString()} sub="Cloud reports" />
                                    <ResearchStat label="Shown" value={reportStats.filtered.toLocaleString()} sub="After filters" />
                                    <ResearchStat label="Pending" value={reportStats.pending.toLocaleString()} sub="Cloud queue" />
                                    <ResearchStat label="Avg Conviction" value={reportStats.avgConviction.toFixed(1)} sub="Filtered set" />
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function ResearchStat({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <div className="border border-white/10 bg-white/[0.03] p-3">
            <div className="text-base font-extrabold uppercase tracking-wider text-ink-2">{label}</div>
            <div className="mt-1 truncate font-mono text-xl font-extrabold text-ink" title={value}>{value}</div>
            <div className="mt-1 truncate text-base font-semibold text-ink-2" title={sub}>{sub}</div>
        </div>
    );
}

function ReportFooterStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-base font-extrabold uppercase tracking-wider text-ink-2">
                {icon}
                {label}
            </div>
            <div className="mt-2 break-words font-mono text-base font-extrabold leading-relaxed text-ink-2" title={value}>
                {value}
            </div>
        </div>
    );
}

function EmptyReportStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div className="text-base font-extrabold uppercase tracking-wider text-ink-2">{label}</div>
            <div className="mt-1 truncate font-mono text-base font-extrabold text-ink-2" title={value}>{value}</div>
        </div>
    );
}

function ReportLoadingTile() {
    return (
        <div className="border border-white/10 bg-white/[0.03] p-4">
            <div className="h-4 w-20 animate-pulse bg-white/10" />
            <div className="mt-3 h-7 w-14 animate-pulse bg-white/15" />
            <div className="mt-3 h-4 w-28 animate-pulse bg-white/10" />
        </div>
    );
}
