"use client";

import { X, Activity, AlertOctagon } from "lucide-react";
import { type ScreeningResult, QUANT_THRESHOLDS } from "@/lib/blueprint";
import clsx from "clsx";

interface StockDetailModalProps {
    result: ScreeningResult;
    onClose: () => void;
}

export function StockDetailModal({ result, onClose }: StockDetailModalProps) {
    const { candidate, reasons, flags, score } = result;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-card border-b border-border">
                    <div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                                <h2 className="text-3xl font-bold">{candidate.symbol}</h2>
                                <span className="text-xl text-muted-foreground font-light px-2 border-l border-border">{candidate.name}</span>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-primary/80 font-medium mt-1">
                                <span>{candidate.sector}</span>
                                <span className="text-muted-foreground">•</span>
                                <span>{result.industry || "Industry"}</span>
                            </div>

                            <p className="text-xs text-muted-foreground mt-2 max-w-2xl leading-relaxed">
                                {result.description || "No company description available."}
                            </p>
                        </div>

                        <div className="flex items-center gap-4 mt-4">
                            {/* External Links */}
                            <div className="flex items-center gap-2">
                                <a
                                    href={`https://www.tradingview.com/symbols/${candidate.symbol}/`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#131722] hover:bg-[#2a2e39] text-white transition-all shadow-sm border border-[#2a2e39]"
                                    title="Open Company Overview in TradingView"
                                >
                                    <img src="https://www.google.com/s2/favicons?domain=tradingview.com&sz=32" alt="TV" className="w-4 h-4 rounded-sm" />
                                    <span className="text-xs font-bold hidden sm:inline">TradingView</span>
                                </a>
                                <a
                                    href={`https://finance.yahoo.com/quote/${candidate.symbol}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#720e9e]/10 hover:bg-[#720e9e]/20 text-[#720e9e] transition-all shadow-sm border border-[#720e9e]/20"
                                    title="Open in Yahoo Finance"
                                >
                                    <img src="https://www.google.com/s2/favicons?domain=yahoo.com&sz=32" alt="YF" className="w-4 h-4 rounded-sm" />
                                    <span className="text-xs font-bold hidden sm:inline">Yahoo Finance</span>
                                </a>
                            </div>
                            <div className={clsx("px-3 py-1 rounded-full text-xs font-bold tracking-wide", result.passed ? "bg-success/20 text-success" : "bg-muted text-muted-foreground")}>
                                {result.passed ? "GEM CANDIDATE" : "WATCHLIST"}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary transition-colors self-start">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Column: Analysis */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* Score & Synthesis */}
                        <div className="flex items-center gap-6 p-6 bg-secondary/30 rounded-xl border border-border/50">
                            <div className="relative flex items-center justify-center h-24 w-24 shrink-0">
                                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                                    <path className="text-secondary" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                                    <path className={clsx(score > 80 ? "text-success" : score > 50 ? "text-warning" : "text-danger")} strokeDasharray={`${score}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold">
                                    {score}
                                </div>
                            </div>
                            <div>
                                <h4 className="text-lg font-semibold mb-1">Blueprint Analysis</h4>
                                <p className={clsx("text-sm font-medium", result.passed ? "text-success" : "text-danger")}>
                                    {result.passed
                                        ? "This asset meets all core quantitative thresholds for a potential 100-bagger."
                                        : "This asset missed the strict 'Gem' criteria (e.g. Sector-specific margins or P/S limits), but is still strong enough to appear in your filtered grid."}
                                </p>
                            </div>
                        </div>

                        {/* Phase 1: Quant Metrics */}
                        <div>
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Activity className="h-5 w-5 text-primary" /> Phase 1: The Engine Room
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <DetailRow label="Revenue Growth" value={`${candidate.revenueGrowth}%`} target={`> ${QUANT_THRESHOLDS.MIN_REVENUE_GROWTH}%`} pass={candidate.revenueGrowth >= QUANT_THRESHOLDS.MIN_REVENUE_GROWTH} />
                                <DetailRow label="ROIC" value={`${candidate.roic}%`} target={`> ${QUANT_THRESHOLDS.MIN_ROIC}%`} pass={candidate.roic >= QUANT_THRESHOLDS.MIN_ROIC} />
                                <DetailRow label="Gross Margin" value={`${candidate.grossMargin}%`} target={`> 30% / 50%`} pass={candidate.grossMargin >= 30} />
                                <DetailRow label="Market Cap" value={`$${(candidate.marketCap / 1e9).toFixed(2)}B`} target={`< $2B`} pass={candidate.marketCap <= QUANT_THRESHOLDS.MAX_MARKET_CAP} warning={candidate.marketCap > QUANT_THRESHOLDS.MAX_MARKET_CAP} />
                                <DetailRow label="PEG Ratio" value={candidate.pegRatio} target={`< ${QUANT_THRESHOLDS.MAX_PEG}`} pass={candidate.pegRatio <= QUANT_THRESHOLDS.MAX_PEG} />
                                <DetailRow label="Insider Ownership" value={`${candidate.insiderOwnership.toFixed(1)}%`} target={`> ${QUANT_THRESHOLDS.MIN_INSIDER_OWNERSHIP}%`} pass={candidate.insiderOwnership >= QUANT_THRESHOLDS.MIN_INSIDER_OWNERSHIP} />
                            </div>
                        </div>

                        {/* Phase 2: Kill List */}
                        <div>
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-danger">
                                <AlertOctagon className="h-5 w-5" /> Phase 2: The Kill List
                            </h3>
                            <div className="bg-danger/5 border border-danger/20 rounded-xl p-4">
                                {flags.length === 0 ? (
                                    <div className="flex items-center gap-2 text-success">
                                        <span className="text-lg">✓</span> No fatal flaws detected.
                                    </div>
                                ) : (
                                    <ul className="space-y-2">
                                        {flags.map((flag, i) => (
                                            <li key={i} className="flex items-center gap-2 text-danger font-medium">
                                                <X className="h-4 w-4" /> {flag}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {/* Always show Z-Score context */}
                                <div className="mt-4 pt-4 border-t border-danger/10 text-sm flex justify-between">
                                    <span>Altman Z-Score: <span className="font-mono font-bold">{candidate.zScore}</span></span>
                                    <span className="text-muted-foreground">(Target: &gt; 1.8)</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Right Column: Benchmarks */}
                    <div className="space-y-6">
                        <div className="bg-secondary/20 p-6 rounded-xl border border-border">
                            <h3 className="text-lg font-bold mb-4">Historical Benchmarks</h3>
                            <p className="text-xs text-muted-foreground mb-4">Comparing {candidate.symbol} to key "Day Before" snapshots of legendary compounders.</p>

                            <div className="space-y-4">
                                <BenchmarkRow name="Monster (2004)" metric="Gross Margin" value="46%" current={`${candidate.grossMargin}%`} pass={candidate.grossMargin >= 46} />
                                <BenchmarkRow name="Amazon (2002)" metric="Rev Growth" value="20%+" current={`${candidate.revenueGrowth}%`} pass={candidate.revenueGrowth >= 20} />
                                <BenchmarkRow name="Domino's (2010)" metric="P/E" value="10x" current={`${candidate.peRatio}x`} pass={candidate.peRatio <= 15} />
                            </div>
                        </div>

                        <div className="bg-card p-6 rounded-xl border border-border">
                            <h3 className="text-lg font-bold mb-2">Verdict</h3>
                            <ul className="space-y-2 text-sm">
                                {reasons.length === 0 && flags.length === 0 ? (
                                    <li className="text-success">Strong candidate for deep dive.</li>
                                ) : (
                                    reasons.map((r, i) => <li key={i} className="text-muted-foreground">• {r}</li>)
                                )}
                            </ul>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

function DetailRow({ label, value, target, pass, warning }: { label: string, value: string | number, target: string, pass: boolean, warning?: boolean }) {
    return (
        <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg">
            <div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="font-mono font-semibold">{value}</div>
            </div>
            <div className="text-right">
                <div className="text-[10px] opacity-70">Target: {target}</div>
                <div className={clsx("text-xs font-bold", pass ? "text-success" : warning ? "text-warning" : "text-danger")}>
                    {pass ? "PASS" : warning ? "WATCH" : "FAIL"}
                </div>
            </div>
        </div>
    )
}

function BenchmarkRow({ name, metric, value, current, pass }: { name: string, metric: string, value: string, current: string, pass: boolean }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <div>
                <div className="font-semibold">{name}</div>
                <div className="text-xs text-muted-foreground">{metric}: {value}</div>
            </div>
            <div className={clsx("px-2 py-1 rounded text-xs font-mono", pass ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground")}>
                {current}
            </div>
        </div>
    )
}
