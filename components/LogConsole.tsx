"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Terminal, X, RefreshCw, Radio, FileText } from "lucide-react";

interface LogConsoleProps {
    isOpen: boolean;
    onClose: () => void;
}

export function LogConsole({ isOpen, onClose }: LogConsoleProps) {
    const [logs, setLogs] = useState<string>("");
    const [autoScroll, setAutoScroll] = useState(true);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        let supabaseClient: any;
        let channel: any;

        const setupLogStream = async () => {
            // 1. Fetch initial baseline from static file
            try {
                const basePath = process.env.NODE_ENV === 'production' ? '/stock-screener' : '';
                const res = await fetch(`${basePath}/data/scan.log?t=${Date.now()}`);
                if (res.ok) {
                    const text = await res.text();
                    setLogs(text);
                }
            } catch (e) {
                console.error("Failed to fetch initial logs");
            }

            // 2. Subscribe to Supabase for live updates
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            
            if (supabaseUrl && supabaseKey) {
                try {
                    const { createClient } = await import('@supabase/supabase-js');
                    supabaseClient = createClient(supabaseUrl, supabaseKey);
                    
                    // 2.1 Fetch recent logs from Supabase that might not be in the static file yet
                    const { data: recentLogs } = await supabaseClient
                        .from('scan_logs')
                        .select('message')
                        .order('id', { ascending: false })
                        .limit(50);
                    
                    if (recentLogs && recentLogs.length > 0) {
                        const recentText = [...recentLogs].reverse().map((l: any) => l.message).join('\n');
                        setLogs((prev) => prev + '\n\n--- [LIVE LOGS RESUMED] ---\n' + recentText);
                    }

                    channel = supabaseClient
                        .channel('log-stream')
                        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scan_logs' }, (payload: any) => {
                            setLogs((prev) => prev + '\n' + payload.new.message);
                        })
                        .subscribe();
                } catch (e) {
                    console.error("Supabase stream failed", e);
                }
            }
        };

        setupLogStream();

        return () => {
            if (supabaseClient && channel) {
                supabaseClient.removeChannel(channel);
            }
        };
    }, [isOpen]);

    useEffect(() => {
        if (autoScroll && endRef.current) {
            endRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, autoScroll]);

    if (!isOpen) return null;

    const logLines = logs ? logs.split('\n') : [];
    const lineCount = logLines.filter((line) => line.trim()).length;
    const supabaseConnected = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="flex h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-800 bg-[#0c0c0c] text-base shadow-2xl">

                {/* Header */}
                <div className="flex flex-col gap-4 border-b border-gray-800 bg-[#111] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3 text-green-500">
                        <div className="rounded-lg border border-green-500/25 bg-green-500/10 p-2">
                            <Terminal className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-tight text-white">System Logs</h2>
                            <p className="mt-1 text-base font-medium leading-relaxed text-gray-400">Scanner runtime stream, static log baseline, and cloud sync status.</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-800 bg-white/[0.03] px-3.5 py-2.5 text-base text-gray-300 hover:text-white">
                            <input
                                type="checkbox"
                                checked={autoScroll}
                                onChange={(e) => setAutoScroll(e.target.checked)}
                                className="h-5 w-5 rounded border-gray-700 bg-gray-900"
                            />
                            Auto-scroll
                        </label>
                        <button onClick={onClose} className="rounded-lg border border-gray-800 bg-white/[0.03] p-2.5 text-gray-500 transition-colors hover:text-white" aria-label="Close system logs">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 border-b border-gray-800 bg-[#0f0f0f] px-5 py-4 sm:grid-cols-3">
                    <LogStat icon={<FileText className="h-4 w-4" />} label="Static Source" value="scan.log" sub="public/data baseline" />
                    <LogStat icon={<Radio className="h-4 w-4" />} label="Live Stream" value={supabaseConnected ? "Connected" : "Unavailable"} sub={supabaseConnected ? "Supabase channel ready" : "Missing public keys"} tone={supabaseConnected ? "success" : "danger"} />
                    <LogStat icon={<Terminal className="h-4 w-4" />} label="Lines Loaded" value={lineCount.toLocaleString()} sub={logs ? "Non-empty log lines" : "Waiting for data"} />
                </div>

                {/* Log Content */}
                <div className="flex-1 space-y-1 overflow-y-auto bg-[#070707] p-5 font-mono text-gray-300">
                    {logs ? (
                        <div className="space-y-1 text-base leading-8">
                            {logLines.map((line, index) => (
                                <LogLine key={`${index}-${line}`} line={line} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center space-y-3 text-center text-gray-500">
                            <RefreshCw className="h-6 w-6 animate-spin" />
                            <p className="text-lg font-bold text-gray-400">Waiting for log stream...</p>
                            <p className="max-w-sm text-base leading-relaxed">Logs will appear here once the static scan file or live Supabase channel responds.</p>
                        </div>
                    )}
                    <div ref={endRef} />
                </div>

                {/* Footer */}
                <div className="flex flex-col gap-3 border-t border-gray-800 bg-[#111] px-5 py-4 text-base text-gray-500 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                        <span>Source: public/data/scan.log</span>
                        <div className="flex items-center gap-2 rounded-full border border-gray-800 bg-white/[0.03] px-3 py-1.5">
                            <div className={`h-2.5 w-2.5 rounded-full ${supabaseConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className={supabaseConnected ? 'text-gray-400' : 'text-red-400'}>
                                {supabaseConnected ? 'Supabase Connected' : 'Supabase Disconnected (Keys Missing)'}
                            </span>
                        </div>
                    </div>
                    <span>Updating in real-time...</span>
                </div>
            </div>
        </div>
    );
}

function LogStat({ icon, label, value, sub, tone = "neutral" }: { icon: ReactNode; label: string; value: string; sub: string; tone?: "neutral" | "success" | "danger" }) {
    return (
        <div className="rounded-lg border border-gray-800 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-base font-black uppercase tracking-wider text-gray-500">
                {icon}
                {label}
            </div>
            <div className={`mt-2 truncate font-mono text-xl font-black ${tone === "success" ? "text-green-400" : tone === "danger" ? "text-red-400" : "text-white"}`} title={value}>
                {value}
            </div>
            <div className="mt-1 truncate text-base font-medium text-gray-500" title={sub}>{sub}</div>
        </div>
    );
}

function LogLine({ line }: { line: string }) {
    const normalized = line.toLowerCase();
    const tone = normalized.includes("error") || normalized.includes("failed") || normalized.includes("exception")
        ? "danger"
        : normalized.includes("warn") || normalized.includes("skipped")
            ? "warning"
            : normalized.includes("success") || normalized.includes("completed") || normalized.includes("done")
                ? "success"
                : line.includes("---")
                    ? "marker"
                    : "neutral";

    if (!line.trim()) {
        return <div className="h-3" aria-hidden="true" />;
    }

    return (
        <div className={`rounded-md border px-3 py-1.5 ${logLineToneClass(tone)}`}>
            <span className="whitespace-pre-wrap break-words">{line}</span>
        </div>
    );
}

function logLineToneClass(tone: "neutral" | "success" | "danger" | "warning" | "marker") {
    if (tone === "success") return "border-green-500/20 bg-green-500/[0.06] text-green-300";
    if (tone === "danger") return "border-red-500/25 bg-red-500/[0.08] text-red-300";
    if (tone === "warning") return "border-amber-500/25 bg-amber-500/[0.08] text-amber-300";
    if (tone === "marker") return "border-blue-500/20 bg-blue-500/[0.08] text-blue-300";
    return "border-transparent bg-transparent text-gray-300";
}
