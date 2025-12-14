"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal, X, RefreshCw } from "lucide-react";

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

        const fetchLogs = async () => {
            try {
                // Add timestamp to prevent caching
                const res = await fetch(`/data/scan.log?t=${Date.now()}`);
                if (res.ok) {
                    const text = await res.text();
                    setLogs(text);
                }
            } catch (e) {
                console.error("Failed to fetch logs");
            }
        };

        fetchLogs(); // Initial
        const interval = setInterval(fetchLogs, 1000); // Poll every second

        return () => clearInterval(interval);
    }, [isOpen]);

    useEffect(() => {
        if (autoScroll && endRef.current) {
            endRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, autoScroll]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-4xl bg-[#0c0c0c] border border-gray-800 rounded-lg shadow-2xl flex flex-col h-[80vh] font-mono text-sm">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#111]">
                    <div className="flex items-center gap-2 text-green-500">
                        <Terminal className="h-4 w-4" />
                        <span className="font-bold">System Logs</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-white">
                            <input
                                type="checkbox"
                                checked={autoScroll}
                                onChange={(e) => setAutoScroll(e.target.checked)}
                                className="rounded border-gray-700 bg-gray-900"
                            />
                            Auto-scroll
                        </label>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Log Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-1 text-gray-300">
                    {logs ? (
                        <pre className="whitespace-pre-wrap leading-relaxed">{logs}</pre>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-2">
                            <RefreshCw className="h-6 w-6 animate-spin" />
                            <p>Waiting for log stream...</p>
                        </div>
                    )}
                    <div ref={endRef} />
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-gray-800 bg-[#111] text-xs text-gray-500 flex justify-between">
                    <span>Source: public/data/scan.log</span>
                    <span>Updating in real-time...</span>
                </div>
            </div>
        </div>
    );
}
