"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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

    const fetchReports = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('ai_reports')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setReports(data || []);
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

    const downloadReport = (report: any) => {
        const element = document.createElement("a");
        const file = new Blob([report.content], {type: 'text/plain'});
        element.href = URL.createObjectURL(file);
        element.download = `Deepseek_Analysis_${report.ticker}_${new Date(report.created_at).toLocaleDateString()}.txt`;
        document.body.appendChild(element);
        element.click();
    };

    return (
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0a0c10]">
            {/* Header */}
            <header className="py-4 px-6 border-b border-white/5 bg-[#0d1117] flex flex-col gap-4 shrink-0 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-5">
                    <Link href="/" className="p-2 hover:bg-white/5 rounded-full transition-colors text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                            <Sparkles className="h-6 w-6 text-accent" />
                            AI RESEARCH REPOSITORY
                        </h1>
                        <p className="text-sm uppercase tracking-widest text-muted-foreground font-bold">
                            Cloud-Stored Deepseek V4.0 Pro Analyses
                        </p>
                    </div>
                </div>

                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
                    <button 
                        onClick={fetchReports}
                        disabled={loading}
                        className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-blue-400 transition-all border border-white/10 active:scale-90"
                        title="Force Sync Cloud Data"
                    >
                        <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin text-blue-500")} />
                    </button>
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <input 
                            type="text" 
                            placeholder="Search tickers..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-base focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                        />
                    </div>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
                {/* List Sidebar - Hidden on mobile if report selected */}
                <div className={clsx(
                    "w-full md:w-[28rem] border-r border-white/5 overflow-y-auto no-scrollbar bg-[#0d1117]/50 transition-all flex flex-col",
                    selectedReport && "hidden md:flex"
                )}>
                    {/* Filter Bar */}
                    <div className="p-4 border-b border-white/5 space-y-3 bg-[#0d1117]">
                        <div className="grid grid-cols-2 gap-2">
                            <select 
                                value={filterAction} 
                                onChange={(e) => setFilterAction(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm font-bold text-blue-400 focus:outline-none"
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
                                className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm font-bold text-green-400 focus:outline-none"
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
                                className="col-span-2 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm font-bold text-muted-foreground focus:outline-none"
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
                            <span className="text-sm font-black text-muted-foreground uppercase whitespace-nowrap">Min Conviction: {filterConviction}</span>
                            <input 
                                type="range" min="0" max="15" step="0.5" 
                                value={filterConviction} 
                                onChange={(e) => setFilterConviction(parseFloat(e.target.value))}
                                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
                                <RefreshCw className="h-6 w-6 animate-spin text-accent" />
                                <span className="text-sm font-bold uppercase tracking-widest">Fetching Cloud...</span>
                            </div>
                        ) : filteredReports.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground italic text-sm">
                                No reports found matching your search.
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
                                            onClick={() => setSelectedReport(report)}
                                            className={clsx(
                                                "w-full text-left p-4 border-b border-white/5 transition-all hover:bg-white/5 flex items-center justify-between gap-4 group relative cursor-pointer active:bg-white/10",
                                                selectedReport?.id === report.id ? "bg-blue-500/10 border-r-4 border-r-blue-500 shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]" : ""
                                            )}
                                        >
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl font-black tracking-tighter text-foreground group-hover:text-blue-400 transition-colors">
                                                        {report.ticker}
                                                    </span>
                                                    {meta.valuation_status && (
                                                        <span className={clsx(
                                                            "text-sm px-2.5 py-1 rounded-md font-black uppercase tracking-tight",
                                                            meta.valuation_status.includes('UNDERVALUED') ? "bg-green-500/20 text-green-400 border border-green-500/20" :
                                                            meta.valuation_status === 'OVERVALUED' ? "bg-red-500/20 text-red-400 border border-red-500/20" :
                                                            "bg-white/5 text-muted-foreground border border-white/10"
                                                        )}>
                                                            {meta.valuation_status.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground font-bold uppercase tracking-tight">
                                                    <Calendar className="h-3.5 w-3.5 opacity-50 text-blue-500" />
                                                    {createdAt.toLocaleDateString()} 
                                                    <span className="text-white/20 font-normal">@</span>
                                                    <span className="text-blue-400/80">{createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-col items-end gap-1">
                                                <div className={clsx(
                                                    "px-2.5 py-1 rounded-lg text-sm font-black tracking-tight shadow-md border",
                                                    isPositive ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"
                                                )}>
                                                    {isPositive ? '+' : ''}{upside.toFixed(1)}%
                                                </div>
                                                <span className="text-sm font-black text-muted-foreground tracking-[0.14em] uppercase opacity-60">ALPHA</span>
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
                        "flex-1 bg-[#0a0c10] overflow-y-auto no-scrollbar relative transition-all",
                        !selectedReport && "hidden md:flex"
                    )}
                >
                    {selectedReport ? (
                        <div className="flex h-full">
                            {/* Table of Contents Sidebar (Desktop) */}
                            <aside className="hidden lg:block w-72 shrink-0 border-r border-white/5 bg-[#0a0c10] p-6 sticky top-0 h-screen overflow-y-auto no-scrollbar">
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-sm font-black text-blue-500 uppercase tracking-[0.16em] mb-5 flex items-center gap-2">
                                            <span className="w-4 h-[1px] bg-blue-500/30"></span>
                                            Contents
                                        </h3>
                                        <nav className="space-y-0.5">
                                            {reportHeadings.length === 0 ? (
                                                <p className="text-sm text-muted-foreground uppercase px-2">No sections detected</p>
                                            ) : (
                                                reportHeadings.map((h) => (
                                                    <button
                                                        key={h.id}
                                                        onClick={() => scrollToHeading(h.id)}
                                                        className={clsx(
                                                            "group flex items-start gap-2.5 w-full text-left py-2 px-2.5 rounded-md transition-all duration-200",
                                                            activeHeading === h.id ? "bg-blue-500/10" : "hover:bg-white/[0.04]",
                                                            h.level === 2 && "pl-7"
                                                        )}
                                                    >
                                                        <span className={clsx(
                                                            "shrink-0 w-1.5 h-1.5 rounded-full mt-[7px] transition-all duration-300",
                                                            activeHeading === h.id ? "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" : "bg-white/15 group-hover:bg-blue-400/50"
                                                        )}></span>
                                                        <span className={clsx(
                                                            "text-sm leading-snug transition-colors duration-200 line-clamp-2",
                                                            h.level === 1 ? "font-bold uppercase tracking-wide" : "font-medium opacity-70",
                                                            activeHeading === h.id ? "text-blue-300" : "text-slate-400 group-hover:text-slate-200"
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
                                            className="w-full flex items-center justify-between group bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg px-4 py-3 transition-all"
                                        >
                                            <span className="text-sm font-black text-blue-400 uppercase tracking-widest">Download .TXT</span>
                                            <Download className="h-3.5 w-3.5 text-blue-400 group-hover:translate-y-0.5 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            </aside>

                            {/* Report Content */}
                            <div className="flex-1 p-4 md:p-16 lg:p-20 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
                                {(() => {
                                    const meta = getMeta(selectedReport);
                                    
                                    return (
                                        <article className="relative">
                                            {/* Mobile Back Button */}
                                            <button 
                                                onClick={() => setSelectedReport(null)}
                                                className="md:hidden flex items-center gap-2 mb-6 text-blue-400 font-bold text-sm bg-blue-500/10 px-4 py-2 rounded-full w-fit active:scale-95 transition-all tracking-[0.16em]"
                                            >
                                                <ArrowLeft className="h-3.5 w-3.5" /> RETURN TO LIST
                                            </button>

                                            {/* Mobile TOC (collapsible) */}
                                            {reportHeadings.length > 0 && (
                                                <div className="lg:hidden mb-8 border border-white/10 rounded-xl bg-[#0d1117] overflow-hidden">
                                                    <button
                                                        onClick={() => setMobileTocOpen(!mobileTocOpen)}
                                                        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
                                                    >
                                                        <span className="text-sm font-black text-blue-400 uppercase tracking-[0.14em]">
                                                            Table of Contents ({reportHeadings.length} sections)
                                                        </span>
                                                        <ChevronRight className={clsx("h-4 w-4 text-blue-400 transition-transform duration-200", mobileTocOpen && "rotate-90")} />
                                                    </button>
                                                    {mobileTocOpen && (
                                                        <nav className="border-t border-white/5 px-5 py-3 space-y-0.5 max-h-72 overflow-y-auto">
                                                            {reportHeadings.map((h) => (
                                                                <button
                                                                    key={h.id}
                                                                    onClick={() => scrollToHeading(h.id)}
                                                                    className={clsx(
                                                                        "block w-full text-left py-2 text-sm transition-colors",
                                                                        h.level === 1 ? "font-bold text-slate-300" : "font-medium text-slate-500 pl-4",
                                                                        "hover:text-blue-400 active:text-blue-300"
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
                                            <header className="mb-12 border-b border-white/10 pb-12">
                                                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-black rounded-md tracking-widest uppercase">
                                                                {meta.archetype || 'Asset Research'}
                                                            </span>
                                                            <span className="w-1 h-1 rounded-full bg-white/20"></span>
                                                            <span className="text-muted-foreground text-sm font-bold uppercase tracking-widest">
                                                                {new Date(selectedReport.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                                            </span>
                                                        </div>
                                                        <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-4">
                                                            {selectedReport.ticker}
                                                        </h1>
                                                        <p className="text-base text-muted-foreground font-medium max-w-2xl leading-relaxed">
                                                            Comprehensive investment analysis powered by Deepseek V4.0 Pro engine.
                                                        </p>
                                                    </div>

                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
                                                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 min-w-[110px]">
                                                            <div className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-2 opacity-60">Conviction</div>
                                                            <div className="text-3xl font-black text-blue-500 tracking-tighter">{meta.conviction || '0'}</div>
                                                        </div>
                                                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 min-w-[110px]">
                                                            <div className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-2 opacity-60">Upside</div>
                                                            <div className={clsx(
                                                                "text-3xl font-black tracking-tighter",
                                                                (parseFloat(meta.upside || 0)) > 0 ? "text-green-400" : "text-red-400"
                                                            )}>
                                                                {meta.upside || '0.0'}%
                                                            </div>
                                                        </div>
                                                        <div className="hidden sm:block bg-white/[0.02] border border-white/5 rounded-xl p-4 min-w-[110px]">
                                                            <div className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-2 opacity-60">Rating</div>
                                                            <div className="text-2xl font-black text-white tracking-tighter uppercase">{meta.action || 'HOLD'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </header>

                                            {/* Report Content */}
                                            {selectedReport.status === 'pending' ? (
                                                <div className="flex flex-col items-center justify-center py-32 gap-8 text-center bg-white/[0.02] border border-white/5 rounded-[40px]">
                                                    <div className="relative">
                                                        <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full animate-pulse"></div>
                                                        <RefreshCw className="h-16 w-16 text-blue-500 animate-spin relative z-10" />
                                                        <Bot className="h-8 w-8 absolute top-4 left-4 text-white relative z-10" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-3xl font-black text-white mb-3">AI Engine Processing...</h3>
                                                        <p className="text-muted-foreground text-lg max-w-sm font-medium">
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
                                                                return <h1 id={id} className="text-3xl md:text-4xl font-black mt-20 mb-6 text-white tracking-tight border-b border-white/10 pb-4 uppercase" {...props} />;
                                                            },
                                                            h2: ({node, ...props}: any) => {
                                                                const idx = reportHeadings.findIndex(h => h.title === reactNodeToText(props.children));
                                                                const id = idx >= 0 ? reportHeadings[idx].id : undefined;
                                                                return <h2 id={id} className="text-xl md:text-2xl font-black mt-14 mb-4 text-blue-400 tracking-wide uppercase" {...props} />;
                                                            },
                                                            h3: ({node, ...props}: any) => <h3 className="text-lg font-bold mt-8 mb-3 text-white tracking-tight" {...props} />,
                                                            p: ({node, ...props}: any) => <p className="text-base md:text-lg leading-[1.8] mb-5 text-slate-300 font-medium" {...props} />,
                                                            strong: ({node, ...props}: any) => <strong className="font-black text-slate-100" {...props} />,
                                                            em: ({node, ...props}: any) => <em className="italic text-blue-300/80" {...props} />,
                                                            hr: ({node, ...props}: any) => <hr className="my-10 border-white/10" {...props} />,
                                                            ul: ({node, ...props}: any) => <ul className="space-y-2 mb-6 list-none pl-0" {...props} />,
                                                            ol: ({node, ...props}: any) => <ol className="space-y-2 mb-6 list-decimal pl-6 text-slate-300" {...props} />,
                                                            li: ({node, ...props}: any) => (
                                                                <li className="flex items-start gap-3 text-base md:text-lg text-slate-400 font-medium leading-[1.75]">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500/40 mt-[9px] shrink-0"></span>
                                                                    <span>{props.children}</span>
                                                                </li>
                                                            ),
                                                            blockquote: ({node, ...props}: any) => (
                                                                <blockquote className="border-l-[3px] border-blue-500/50 bg-blue-500/5 px-5 py-4 rounded-r-xl italic text-base md:text-lg text-slate-200 mb-6" {...props} />
                                                            ),
                                                            code: ({node, className, ...props}: any) => {
                                                                const isInline = !className;
                                                                if (isInline) {
                                                                    return <code className="bg-slate-800/60 px-1.5 py-0.5 rounded text-blue-300 font-mono text-sm md:text-base" {...props} />;
                                                                }
                                                                return <code className="block bg-slate-800/60 p-4 rounded-xl text-blue-200 font-mono text-sm md:text-base overflow-x-auto mb-6" {...props} />;
                                                            },
                                                            pre: ({node, ...props}: any) => (
                                                                <pre className="bg-slate-800/40 border border-white/5 rounded-xl p-4 overflow-x-auto mb-6 text-sm md:text-base" {...props} />
                                                            ),
                                                            table: ({node, ...props}: any) => (
                                                                <div className="overflow-x-auto mb-8 rounded-xl border border-white/10">
                                                                    <table className="w-full text-sm md:text-base border-collapse" {...props} />
                                                                </div>
                                                            ),
                                                            thead: ({node, ...props}: any) => <thead className="bg-white/[0.03]" {...props} />,
                                                            tbody: ({node, ...props}: any) => <tbody className="divide-y divide-white/5" {...props} />,
                                                            th: ({node, ...props}: any) => <th className="px-4 py-3 text-left text-sm font-black text-blue-400 uppercase tracking-wider border-b border-white/10" {...props} />,
                                                            td: ({node, ...props}: any) => <td className="px-4 py-2.5 text-slate-300 font-medium border-b border-white/5" {...props} />,
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
                                                    <footer className="mt-24 pt-12 border-t border-white/5 flex flex-wrap gap-8 text-sm font-black text-muted-foreground uppercase tracking-[0.16em]">
                                                        <div className="flex items-center gap-2"><DollarSign className="h-3 w-3" /> Compute Cost: ${selectedReport.cost || '0.00'}</div>
                                                        <div className="flex items-center gap-2"><Activity className="h-3 w-3" /> Token Density: {selectedReport.usage?.total_tokens || 0} units</div>
                                                        <div className="flex items-center gap-2"><Calendar className="h-3 w-3" /> Processed At: {new Date(selectedReport.created_at).toISOString()}</div>
                                                    </footer>
                                                </div>
                                            )}
                                        </article>
                                    );
                                })()}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
                            <div className="w-24 h-24 bg-white/5 rounded-[32px] flex items-center justify-center mb-8 border border-white/5 shadow-2xl">
                                <FileText className="h-10 w-10 opacity-20" />
                            </div>
                            <h3 className="text-2xl font-black text-white/50 mb-3 tracking-tight">Select Analysis Report</h3>
                            <p className="text-base max-w-sm opacity-30 font-medium">
                                Secure cloud repository for automated equity research. 
                                Choose a ticker to visualize high-fidelity investment signals.
                            </p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
