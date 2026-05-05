"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Sparkles, Calendar, DollarSign, Activity, ChevronRight, RefreshCw, ArrowLeft, Download, FileText, Bot } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from 'react-markdown';
import clsx from "clsx";

// Simple metadata normalizer — prefers stored metadata column, 
// falls back to [DATA_BLOCK] extraction, then text scraping for legacy reports
const getMeta = (report: any): any => {
    // If worker already saved structured metadata, use it directly
    if (report.metadata && typeof report.metadata === 'object' && Object.keys(report.metadata).length > 0) {
        return {
            conviction: parseFloat(report.metadata.conviction) || 0,
            upside: parseFloat(report.metadata.upside) || 0,
            action: (report.metadata.action || '').toUpperCase(),
            archetype: report.metadata.archetype || '',
            valuation_status: report.metadata.valuation_status || '',
        };
    }
    
    const content = report.content || '';
    
    // Fallback 1: try [DATA_BLOCK] JSON extraction
    try {
        const match = content.match(/\[DATA_BLOCK\]\s*(\{[\s\S]*?\})\s*$/);
        if (match && match[1]) {
            const parsed = JSON.parse(match[1].trim());
            return {
                conviction: parseFloat(parsed.conviction) || 0,
                upside: parseFloat(String(parsed.upside || '0').replace('%', '')) || 0,
                action: (parsed.action || '').toUpperCase(),
                archetype: parsed.archetype || '',
                valuation_status: parsed.valuation_status || '',
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

    // Track active section on scroll
    useEffect(() => {
        if (!selectedReport) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry: IntersectionObserverEntry) => {
                    if (entry.isIntersecting) {
                        setActiveHeading(entry.target.id);
                    }
                });
            },
            { 
                root: document.getElementById('main-scroll-panel'),
                rootMargin: '-10% 0% -80% 0%', // Trigger when heading is near top
                threshold: 0 
            }
        );

        // Observer headings after they render
        const timer = setTimeout(() => {
            const headings = document.querySelectorAll('article h1, article h2');
            headings.forEach((h: Element) => observer.observe(h));
        }, 500);

        return () => {
            observer.disconnect();
            clearTimeout(timer);
        };
    }, [selectedReport]);

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
            <header className="py-4 px-6 border-b border-white/5 bg-[#0d1117] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                    <Link href="/" className="p-2 hover:bg-white/5 rounded-full transition-colors text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-accent" />
                            AI RESEARCH REPOSITORY
                        </h1>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                            Cloud-Stored Deepseek V4.0 Pro Analyses
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button 
                        onClick={fetchReports}
                        disabled={loading}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-blue-400 transition-all border border-white/10 active:scale-90"
                        title="Force Sync Cloud Data"
                    >
                        <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin text-blue-500")} />
                    </button>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input 
                            type="text" 
                            placeholder="Search tickers..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                        />
                    </div>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
                {/* List Sidebar - Hidden on mobile if report selected */}
                <div className={clsx(
                    "w-full md:w-96 border-r border-white/5 overflow-y-auto no-scrollbar bg-[#0d1117]/50 transition-all flex flex-col",
                    selectedReport && "hidden md:flex"
                )}>
                    {/* Filter Bar */}
                    <div className="p-4 border-b border-white/5 space-y-3 bg-[#0d1117]">
                        <div className="grid grid-cols-2 gap-2">
                            <select 
                                value={filterAction} 
                                onChange={(e) => setFilterAction(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-blue-400 focus:outline-none"
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
                                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-green-400 focus:outline-none"
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
                                className="col-span-2 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-muted-foreground focus:outline-none"
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
                            <span className="text-[10px] font-black text-muted-foreground uppercase whitespace-nowrap">Min Conviction: {filterConviction}</span>
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
                                <span className="text-xs font-bold uppercase tracking-widest">Fetching Cloud...</span>
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
                                                "w-full text-left p-4 border-b border-white/5 transition-all hover:bg-white/5 flex items-center justify-between group relative cursor-pointer active:bg-white/10",
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
                                                            "text-[8px] px-1.5 py-0.5 rounded-sm font-black uppercase tracking-wider",
                                                            meta.valuation_status.includes('UNDERVALUED') ? "bg-green-500/20 text-green-400 border border-green-500/20" :
                                                            meta.valuation_status === 'OVERVALUED' ? "bg-red-500/20 text-red-400 border border-red-500/20" :
                                                            "bg-white/5 text-muted-foreground border border-white/10"
                                                        )}>
                                                            {meta.valuation_status.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-black uppercase tracking-tight">
                                                    <Calendar className="h-3.5 w-3.5 opacity-50 text-blue-500" />
                                                    {createdAt.toLocaleDateString()} 
                                                    <span className="text-white/20 font-normal">@</span>
                                                    <span className="text-blue-400/80">{createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-col items-end gap-1">
                                                <div className={clsx(
                                                    "px-2 py-1 rounded-lg text-xs font-black tracking-tighter shadow-md border",
                                                    isPositive ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"
                                                )}>
                                                    {isPositive ? '+' : ''}{upside.toFixed(1)}%
                                                </div>
                                                <span className="text-[8px] font-black text-muted-foreground tracking-[0.2em] uppercase opacity-40">ALPHA</span>
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
                            {/* Table of Contents Sidebar (Professional Sticky) */}
                            <aside className="hidden xl:block w-72 shrink-0 border-r border-white/5 bg-[#0a0c10] p-8 sticky top-0 h-screen overflow-y-auto no-scrollbar">
                                <div className="space-y-8">
                                    <div>
                                        <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                            <span className="w-4 h-[1px] bg-blue-500/30"></span>
                                            Report Structure
                                        </h3>
                                        <div className="space-y-1">
                                            {(() => {
                                                const rawLines = (selectedReport.content || "").split('\n');
                                                const headings: {id: string, title: string, level: number}[] = [];
                                                
                                                rawLines.forEach((line: string, idx: number) => {
                                                    const trimmed = line.trim();
                                                    if (trimmed.startsWith('#')) {
                                                        const level = trimmed.match(/^#+/)?.[0].length || 1;
                                                        const title = trimmed.replace(/^#+\s*/, '').trim();
                                                        headings.push({ id: `h-${idx}`, title, level });
                                                    } else if (trimmed.toUpperCase().startsWith('SECTION')) {
                                                        headings.push({ id: `h-${idx}`, title: trimmed, level: 1 });
                                                    }
                                                });

                                                if (headings.length === 0) {
                                                    return <p className="text-[10px] text-muted-foreground uppercase">No sections detected</p>;
                                                }

                                                return headings.map((h: any) => (
                                                    <button 
                                                        key={h.id}
                                                        onClick={() => {
                                                            const mainPanel = document.getElementById('main-scroll-panel');
                                                            const target = document.getElementById(h.id);
                                                            console.log("Navigating to:", h.id, target);
                                                            if (target && mainPanel) {
                                                                const panelTop = mainPanel.getBoundingClientRect().top;
                                                                const targetTop = target.getBoundingClientRect().top;
                                                                mainPanel.scrollBy({ top: targetTop - panelTop - 32, behavior: 'smooth' });
                                                            }
                                                        }}
                                                        className={clsx(
                                                            "group flex items-start gap-3 w-full text-left py-2.5 px-3 rounded-lg transition-all duration-300 relative",
                                                            activeHeading === h.id ? "bg-blue-500/10" : "hover:bg-white/[0.03]",
                                                            h.level === 1 ? "text-[11px] font-black" : "text-[10px] font-bold pl-6 opacity-60 hover:opacity-100"
                                                        )}
                                                    >
                                                        {activeHeading === h.id && (
                                                            <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-full" />
                                                        )}
                                                        <span className={clsx(
                                                            "shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 transition-all duration-500",
                                                            activeHeading === h.id ? "bg-blue-500 scale-125 shadow-[0_0_10px_rgba(59,130,246,0.5)]" : "bg-blue-500/20 group-hover:bg-blue-500/50"
                                                        )}></span>
                                                        <span className={clsx(
                                                            "uppercase tracking-wider leading-tight transition-colors duration-300",
                                                            activeHeading === h.id ? "text-white" : "text-muted-foreground group-hover:text-white"
                                                        )}>
                                                            {h.title}
                                                        </span>
                                                    </button>
                                                ));
                                            })()}
                                        </div>
                                    </div>

                                    {/* Action Shortcuts */}
                                    <div className="pt-8 border-t border-white/5">
                                        <button 
                                            onClick={() => downloadReport(selectedReport)}
                                            className="w-full flex items-center justify-between group bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl p-4 transition-all"
                                        >
                                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Download .TXT</span>
                                            <Download className="h-4 w-4 text-blue-400 group-hover:translate-y-0.5 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            </aside>

                            {/* Report Content */}
                            <div className="flex-1 p-6 md:p-16 lg:p-20 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
                                {(() => {
                                    const meta = getMeta(selectedReport);
                                    
                                    // PRE-PARSE HEADINGS for stability
                                    const rawLines = (selectedReport.content || "").split('\n');
                                    const headings: {id: string, title: string, level: number}[] = [];
                                    
                                    rawLines.forEach((line: string, idx: number) => {
                                        const trimmed = line.trim();
                                        // Match # Markdown OR "SECTION X" lines
                                        if (trimmed.startsWith('#')) {
                                            const level = trimmed.match(/^#+/)?.[0].length || 1;
                                            const title = trimmed.replace(/^#+\s*/, '').trim();
                                            headings.push({ id: `h-${idx}`, title, level });
                                        } else if (trimmed.toUpperCase().startsWith('SECTION')) {
                                            headings.push({ id: `h-${idx}`, title: trimmed, level: 1 });
                                        }
                                    });

                                    return (
                                        <article className="relative">
                                            {/* Mobile Back Button */}
                                            <button 
                                                onClick={() => setSelectedReport(null)}
                                                className="md:hidden flex items-center gap-2 mb-12 text-blue-400 font-bold text-[10px] bg-blue-500/10 px-5 py-2.5 rounded-full w-fit active:scale-95 transition-all tracking-[0.2em]"
                                            >
                                                <ArrowLeft className="h-3.5 w-3.5" /> RETURN TO LIST
                                            </button>

                                            {/* Header Section */}
                                            <header className="mb-16 border-b border-white/10 pb-16">
                                                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black rounded-md tracking-widest uppercase">
                                                                {meta.archetype || 'Asset Research'}
                                                            </span>
                                                            <span className="w-1 h-1 rounded-full bg-white/20"></span>
                                                            <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                                                                {new Date(selectedReport.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                                            </span>
                                                        </div>
                                                        <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white mb-6">
                                                            {selectedReport.ticker}
                                                        </h1>
                                                        <p className="text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
                                                            Comprehensive investment analysis powered by Deepseek V4.0 Pro engine.
                                                        </p>
                                                    </div>

                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 shrink-0">
                                                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 min-w-[140px]">
                                                            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 opacity-50">Conviction</div>
                                                            <div className="text-4xl font-black text-blue-500 tracking-tighter">{meta.conviction || '0'}</div>
                                                        </div>
                                                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 min-w-[140px]">
                                                            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 opacity-50">Upside</div>
                                                            <div className={clsx(
                                                                "text-4xl font-black tracking-tighter",
                                                                (parseFloat(meta.upside || 0)) > 0 ? "text-green-400" : "text-red-400"
                                                            )}>
                                                                {meta.upside || '0.0'}%
                                                            </div>
                                                        </div>
                                                        <div className="hidden sm:block bg-white/[0.02] border border-white/5 rounded-2xl p-6 min-w-[140px]">
                                                            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 opacity-50">Rating</div>
                                                            <div className="text-4xl font-black text-white tracking-tighter uppercase">{meta.action || 'HOLD'}</div>
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
                                                <div className="prose prose-invert prose-blue max-w-none">
                                                    <ReactMarkdown 
                                                        components={{
                                                            h1: ({node, ...props}) => {
                                                                const title = String(props.children || "");
                                                                const h = headings.find(h => h.title === title);
                                                                return <h1 id={h?.id} className="text-4xl font-black mt-24 mb-8 text-white tracking-tight border-b border-white/10 pb-6 uppercase" {...props} />;
                                                            },
                                                            h2: ({node, ...props}) => {
                                                                const title = String(props.children || "");
                                                                const h = headings.find(h => h.title === title);
                                                                return <h2 id={h?.id} className="text-2xl font-black mt-16 mb-6 text-blue-400 tracking-wide uppercase" {...props} />;
                                                            },
                                                            h3: ({node, ...props}) => <h3 className="text-xl font-bold mt-10 mb-4 text-white tracking-tight" {...props} />,
                                                            p: ({node, ...props}) => {
                                                                const text = String(props.children || "");
                                                                // If it's a SECTION line that isn't a markdown header, give it an ID
                                                                const isSection = text.toUpperCase().startsWith('SECTION');
                                                                const h = isSection ? headings.find(h => h.title === text) : null;
                                                                return <p id={h?.id} className={clsx("text-lg leading-[1.8] mb-8 font-medium", isSection ? "text-blue-500 font-black text-2xl uppercase mt-20" : "text-slate-300")} {...props} />;
                                                            },
                                                            ul: ({node, ...props}) => <ul className="space-y-4 mb-10 list-none pl-0" {...props} />,
                                                            li: ({node, ...props}) => (
                                                                <li className="flex items-start gap-4 text-lg text-slate-400 font-medium leading-[1.8]">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500/40 mt-3 shrink-0"></span>
                                                                    {props.children}
                                                                </li>
                                                            ),
                                                            blockquote: ({node, ...props}) => (
                                                                <blockquote className="border-l-4 border-blue-500/50 bg-blue-500/5 px-8 py-6 rounded-r-3xl italic text-xl text-slate-200 mb-10" {...props} />
                                                            ),
                                                            code: ({node, ...props}) => (
                                                                <code className="bg-slate-800/50 px-2 py-0.5 rounded text-blue-300 font-mono text-base" {...props} />
                                                            )
                                                        }}
                                                    >
                                                        {(selectedReport.content || "")
                                                            .replace(/^```(markdown|json|text)?/i, '')
                                                            .replace(/```$/, '')
                                                            .replace(/\\n/g, '\n')
                                                            .replace(/\\t/g, '\t')
                                                            .trim()}
                                                    </ReactMarkdown>

                                                    {/* Footer stats */}
                                                    <footer className="mt-24 pt-12 border-t border-white/5 flex flex-wrap gap-8 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
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
