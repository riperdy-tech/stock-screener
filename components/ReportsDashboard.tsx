"use client";

import { useState, useEffect } from "react";
import { Search, Sparkles, Calendar, DollarSign, Activity, ChevronRight, RefreshCw, ArrowLeft, Download, FileText, Bot } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from 'react-markdown';
import clsx from "clsx";

export function ReportsDashboard() {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedReport, setSelectedReport] = useState<any>(null);

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

    const filteredReports = reports.filter(r => 
        r.ticker.toLowerCase().includes(search.toLowerCase())
    );

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
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* List Sidebar */}
                <div className="w-full md:w-80 border-r border-white/5 overflow-y-auto no-scrollbar bg-[#0d1117]/50">
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
                            {filteredReports.map((report) => (
                                <button
                                    key={report.id || report.ticker + report.created_at}
                                    onClick={() => setSelectedReport(report)}
                                    className={clsx(
                                        "w-full text-left p-4 border-b border-white/5 transition-all hover:bg-white/5 flex items-center justify-between group",
                                        selectedReport?.id === report.id ? "bg-accent/10 border-r-2 border-r-accent" : ""
                                    )}
                                >
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-black tracking-tighter text-foreground group-hover:text-accent transition-colors">
                                                {report.ticker}
                                            </span>
                                            {report.status === 'pending' && (
                                                <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase animate-pulse">Thinking</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                                            <Calendar className="h-3 w-3" />
                                            {new Date(report.created_at).toLocaleDateString()}
                                            <span className="opacity-30">|</span>
                                            <DollarSign className="h-3 w-3" />
                                            {report.cost || '0.00'}
                                        </div>
                                    </div>
                                    <ChevronRight className={clsx("h-4 w-4 text-muted-foreground transition-transform", selectedReport?.id === report.id ? "translate-x-1 text-accent" : "")} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Report Content Viewer */}
                <main className="flex-1 bg-[#0a0c10] overflow-y-auto no-scrollbar relative">
                    {selectedReport ? (
                        <div className="p-6 md:p-12 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h2 className="text-4xl font-black tracking-tighter text-foreground mb-2 flex items-center gap-4">
                                        {selectedReport.ticker}
                                        <span className="text-sm font-normal bg-accent/10 text-accent px-3 py-1 rounded-full tracking-normal">
                                            Deepseek V4.0 Pro
                                        </span>
                                    </h2>
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> {new Date(selectedReport.created_at).toLocaleString()}</span>
                                        <span className="flex items-center gap-1.5"><DollarSign className="h-4 w-4" /> Cost: ${selectedReport.cost}</span>
                                        <span className="flex items-center gap-1.5"><Activity className="h-4 w-4" /> {selectedReport.usage?.total_tokens || 0} Tokens</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => downloadReport(selectedReport)}
                                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/10"
                                >
                                    <Download className="h-4 w-4" /> DOWNLOAD .TXT
                                </button>
                            </div>

                            {selectedReport.status === 'pending' ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
                                    <div className="relative">
                                        <RefreshCw className="h-12 w-12 text-accent animate-spin" />
                                        <Bot className="h-6 w-6 absolute top-3 left-3 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-2">Deepseek is currently thinking...</h3>
                                        <p className="text-muted-foreground text-sm max-w-sm">
                                            The analysis for {selectedReport.ticker} is being processed in the cloud. This usually takes 2-4 minutes.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="prose prose-invert prose-blue max-w-none font-sans">
                                    <div className="bg-slate-950/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 md:p-10 shadow-2xl shadow-black/50 whitespace-pre-wrap break-words text-slate-100 text-base sm:text-lg leading-relaxed">
                                        <ReactMarkdown 
                                            components={{
                                                h1: ({node, ...props}) => <h1 className="text-3xl font-black mt-10 mb-6 text-foreground tracking-tight border-b border-white/10 pb-4" {...props} />,
                                                h2: ({node, ...props}) => <h2 className="text-2xl font-bold mt-8 mb-4 text-blue-400" {...props} />,
                                                h3: ({node, ...props}) => <h3 className="text-xl font-bold mt-6 mb-3 text-slate-100" {...props} />,
                                                p: ({node, ...props}) => <p className="mb-6 text-slate-300 leading-relaxed font-medium" {...props} />,
                                                li: ({node, ...props}) => <li className="mb-2 text-slate-300 font-medium" {...props} />,
                                                code: ({node, ...props}) => <code className="bg-blue-500/10 px-1.5 py-0.5 rounded text-blue-300 font-mono text-sm" {...props} />
                                            }}
                                        >
                                            {selectedReport.content
                                                .replace(/^```(markdown|json|text)?/i, '')
                                                .replace(/```$/, '')
                                                .replace(/\\n/g, '\n')
                                                .replace(/\\t/g, '\t')
                                                .trim()}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
                            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6 border border-white/5">
                                <FileText className="h-10 w-10 opacity-20" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground/50 mb-2">Select a Report to View</h3>
                            <p className="text-sm max-w-xs opacity-40">
                                All your AI investment analyses are stored securely in the cloud. Select one from the left to start reading.
                            </p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
