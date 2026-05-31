"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Search, Shield, TrendingUp, RotateCcw, BarChart3 } from "lucide-react";
import clsx from "clsx";
import { ScreeningResult } from "@/lib/blueprint";
import { fetchStocks, Market } from "@/lib/data-service";
import {
    evaluateYoutubeStrategy,
    formatStrategyNumber,
    matchesYoutubeStrategyFilter,
    YoutubeStrategyEvaluation,
    YoutubeStrategyFilter,
} from "@/lib/youtube-strategy";

interface StrategyRow {
    result: ScreeningResult;
    evaluation: YoutubeStrategyEvaluation;
}

const STRATEGY_FILTERS: Array<{ value: YoutubeStrategyFilter; label: string; description: string }> = [
    { value: "any", label: "Any Video Signal", description: "Show stocks passing at least one strategy" },
    { value: "earningsMomentum", label: "Earnings Momentum", description: "Large-cap blue chips with rising quarterly EPS" },
    { value: "deepValueReversal", label: "Deep Value Reversal", description: "Undervalued stocks with monthly double-bottom confirmation" },
    { value: "turnaroundSeed", label: "Turnaround Seed", description: "Negative EPS, falling price, improving forward EPS" },
    { value: "turnaroundScaleIn", label: "Turnaround Scale-In", description: "Actual EPS has flipped from negative to positive" },
];

function adaptToScreeningResult(item: any): ScreeningResult {
    return {
        candidate: {
            ...item,
            symbol: item.symbol,
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
        } as any,
        metrics: {
            revenueGrowth: item.revenueGrowth,
            grossMargin: item.grossMargin,
            roic: item.roic,
            float: item.floatShares,
            operatingCashFlow: item.ocf,
            ocf: item.ocf,
            capex: item.capex,
        } as any,
        passed: item._status === "Pass",
        score: item._score,
        reasons: item._reasons || [],
        failCodes: item._failCodes || [],
        flags: [],
        financialData: item._financialData,
        description: item.description,
        industry: item.industry,
        Last_Updated: item.lastUpdated,
    };
}

function formatMarketCap(value: number): string {
    if (!value) return "N/A";
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
}

function formatPrice(value: number): string {
    return `$${Number(value || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function StrategyBadge({ label }: { label: string }) {
    const styles: Record<string, string> = {
        "Earnings Momentum": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        "Deep Value + Technical Reversal": "bg-blue-500/15 text-blue-400 border-blue-500/30",
        "Turnaround Seed": "bg-amber-500/15 text-amber-400 border-amber-500/30",
        "Turnaround Scale-In": "bg-purple-500/15 text-purple-400 border-purple-500/30",
    };
    return (
        <span className={clsx("rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-tight", styles[label] || "bg-secondary text-muted-foreground border-border")}>
            {label}
        </span>
    );
}

function MetricPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-secondary/40 border border-border/50 px-3 py-2">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{label}</div>
            <div className="text-sm font-mono font-bold text-foreground">{value}</div>
        </div>
    );
}

export function YoutubeStrategyDashboard() {
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [strategyFilter, setStrategyFilter] = useState<YoutubeStrategyFilter>("any");
    const [rows, setRows] = useState<StrategyRow[]>([]);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const { data, lastUpdated: updated } = await fetchStocks('US');
        const adapted = (data as any[]).map(adaptToScreeningResult);
        const evaluated = adapted.map((result) => ({
            result,
            evaluation: evaluateYoutubeStrategy(result),
        }));
        setRows(evaluated);
        setLastUpdated(updated);
        setLoading(false);
    }

    const filteredRows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return rows
            .filter((row) => matchesYoutubeStrategyFilter(row.evaluation, strategyFilter))
            .filter((row) => {
                if (!needle) return true;
                const c = row.result.candidate;
                return c.symbol.toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle);
            })
            .sort((a, b) => {
                const aSeed = a.evaluation.turnaroundSeed.passed ? 1 : 0;
                const bSeed = b.evaluation.turnaroundSeed.passed ? 1 : 0;
                if (aSeed !== bSeed) return aSeed - bSeed;
                return b.evaluation.matchedStrategies.length - a.evaluation.matchedStrategies.length;
            });
    }, [rows, search, strategyFilter]);

    const totals = useMemo(() => ({
        any: rows.filter((row) => row.evaluation.matchedStrategies.length > 0).length,
        earningsMomentum: rows.filter((row) => row.evaluation.earningsMomentum.passed).length,
        deepValueReversal: rows.filter((row) => row.evaluation.deepValueReversal.passed).length,
        turnaroundSeed: rows.filter((row) => row.evaluation.turnaroundSeed.passed).length,
        turnaroundScaleIn: rows.filter((row) => row.evaluation.turnaroundScaleIn.passed).length,
    }), [rows]);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-30 border-b border-border/60 bg-card/80 backdrop-blur-xl px-4 md:px-6 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                        <Link href="/" className="mt-1 rounded-lg border border-border bg-secondary/40 p-2 hover:bg-secondary transition-colors" title="Back to main screener">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                                <BarChart3 className="h-6 w-6 text-primary" /> YouTube Strategy Filter
                            </h1>
                            <p className="text-sm text-muted-foreground max-w-3xl">
                                Implements the video summary as three independent strategies with the universal EPS-based position-size rule.
                                Negative EPS names are capped at tiny risk sizes before any signal is considered.
                            </p>
                            {lastUpdated && <p className="text-xs text-muted-foreground mt-1 font-mono">Data last updated: {lastUpdated}</p>}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => loadData()}
                            className="px-3 py-2 rounded-lg text-xs font-black border border-border bg-secondary/40 hover:bg-secondary flex items-center gap-2"
                        >
                            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} /> Refresh
                        </button>
                    </div>
                </div>
            </header>

            <main className="p-4 md:p-6 space-y-6">
                <section className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                    {STRATEGY_FILTERS.map((filter) => (
                        <button
                            key={filter.value}
                            onClick={() => setStrategyFilter(filter.value)}
                            className={clsx(
                                "rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5",
                                strategyFilter === filter.value ? "bg-primary/10 border-primary shadow-lg" : "bg-card border-border/70 hover:border-primary/40"
                            )}
                        >
                            <div className="flex justify-between items-start gap-2">
                                <div className="text-sm font-black">{filter.label}</div>
                                <div className="text-xs font-mono text-primary font-bold">{totals[filter.value]}</div>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 leading-snug">{filter.description}</div>
                        </button>
                    ))}
                </section>

                <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-border/70 bg-card p-4 flex items-start gap-3">
                        <TrendingUp className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-sm font-black">Filter 1: Earnings Momentum</h3>
                            <p className="text-xs text-muted-foreground">Large-cap blue chips require positive EPS and four consecutive quarters of EPS increases.</p>
                        </div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card p-4 flex items-start gap-3">
                        <RotateCcw className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-sm font-black">Filter 2: Deep Value Reversal</h3>
                            <p className="text-xs text-muted-foreground">Requires P/B &lt; 1 or P/E below 5-year average, plus monthly double bottom and price above 20-month MA.</p>
                        </div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card p-4 flex items-start gap-3">
                        <Shield className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-sm font-black">Filter 3: Turnaround Seed</h3>
                            <p className="text-xs text-muted-foreground">Negative EPS names can only get a 0.01% seed until actual EPS flips positive.</p>
                        </div>
                    </div>
                </section>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-black">Matching Stocks</h2>
                        <p className="text-sm text-muted-foreground">Showing {filteredRows.length} / {rows.length} assets for {STRATEGY_FILTERS.find((f) => f.value === strategyFilter)?.label}</p>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search ticker or company"
                            className="w-full rounded-lg border border-border bg-secondary/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="h-64 rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground gap-3">
                        <RefreshCw className="h-7 w-7 animate-spin" />
                        <p>Evaluating YouTube strategy filters...</p>
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="h-64 rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground gap-2 text-center px-6">
                        <p className="text-lg">No matching stocks found.</p>
                        <p className="text-sm max-w-2xl">This can happen if the current CSV does not include enough EPS, P/B, 5-year P/E, monthly close, or forward EPS fields for the selected strategy.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {filteredRows.map(({ result, evaluation }) => {
                            const c = result.candidate as any;
                            return (
                                <article key={c.symbol} className="rounded-xl border border-border/70 bg-card p-4 shadow-sm hover:border-primary/40 transition-colors">
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-xl font-black tracking-tight">{c.symbol.split(".")[0]}</h3>
                                                <span className="text-xs text-muted-foreground truncate">{c.name}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1 uppercase font-bold tracking-tight">{c.sector} • {c.industry || result.industry || "Unknown"}</p>
                                        </div>
                                        <div className="text-left sm:text-right shrink-0">
                                            <div className="font-mono text-lg font-black">{formatPrice(c.price)}</div>
                                            <div className="text-xs text-muted-foreground">{formatMarketCap(c.marketCap)}</div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {evaluation.matchedStrategies.map((label) => <StrategyBadge key={label} label={label} />)}
                                        <span className={clsx(
                                            "rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-tight",
                                            evaluation.riskTier === "standard" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-red-500/10 text-red-400 border-red-500/25"
                                        )}>
                                            {evaluation.maxPositionSize}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                                        <MetricPill label="EPS TTM" value={formatStrategyNumber(evaluation.epsTtm)} />
                                        <MetricPill label="Forward EPS" value={formatStrategyNumber(evaluation.forwardEpsEstimate)} />
                                        <MetricPill label="P/B" value={formatStrategyNumber(evaluation.priceToBook)} />
                                        <MetricPill label="P/E vs 5Y" value={`${formatStrategyNumber(evaluation.currentPe)} / ${formatStrategyNumber(evaluation.fiveYearAveragePe)}`} />
                                        <MetricPill label="20M MA" value={formatStrategyNumber(evaluation.monthlyMa20)} />
                                        <MetricPill label="Double Bottom" value={evaluation.hasDoubleBottom ? "Yes" : "No"} />
                                        <MetricPill label="3M Declines" value={evaluation.hasConsecutiveMonthlyDeclines ? "Yes" : "No"} />
                                        <MetricPill label="Score" value={String(result.score || 0)} />
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
