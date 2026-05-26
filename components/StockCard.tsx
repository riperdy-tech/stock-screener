"use client";

import { ScreeningResult } from "@/lib/blueprint";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import clsx from "clsx";

interface StockCardProps {
    result: ScreeningResult;
    onClick: () => void;
    index?: number;
    lastUpdated?: string | null;
    market?: 'US' | 'India' | 'Korea' | 'Taiwan';
}

import { useLanguage } from "./LanguageContext";
import { formatKoreanWon, formatTaiwanNTD } from "@/lib/data-service";

export function StockCard({ result, onClick, index = 0, lastUpdated, market = 'US' }: StockCardProps) {
    const { t } = useLanguage();
    if (!result || !result.candidate) return null;
    const { candidate } = result;
    const rev = candidate.revenueGrowth.toFixed(1);

    // Get a clean display name and ticker
    const ticker = market === 'US' ? candidate.symbol.split('.')[0] : candidate.symbol;
    const companyName = candidate.name || candidate.symbol;

    return (
        <div
            onClick={onClick}
            style={{ animationDelay: `${index * 30}ms` }}
            className="group relative bg-card cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 z-0 overflow-hidden rounded-xl animate-in fade-in zoom-in-95 fill-mode-backwards"
        >
            <div className="relative z-10 bg-card/80 backdrop-blur-xl h-full rounded-xl p-3 sm:p-4 border border-border/80 group-hover:border-primary/40 transition-colors shadow-inner">
                <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-3 mb-1">
                             {/* Scan Status Dot - Made BIGGER */}
                             <div className={clsx(
                                "w-3 h-3 rounded-full shrink-0 transition-all duration-500",
                                result.passed ? "bg-success shadow-[0_0_12px_var(--success)]" :
                                    result.score > 80 ? "bg-warning shadow-[0_0_12px_rgba(237,137,54,0.9)]" :
                                        "bg-danger/60"
                            )}
                                title={result.passed ? "Gem Candidate" : result.score > 80 ? "High Potential" : "Reviewing"}
                            />
                            <h3 className="text-lg font-black group-hover:text-primary transition-colors tracking-tighter truncate">
                                {ticker}
                            </h3>
                        </div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground truncate font-medium uppercase tracking-tight">
                            {companyName}
                        </p>
                    </div>
                    
                    <div className="text-right shrink-0">
                        <div className="font-mono text-sm sm:text-base font-bold text-foreground leading-none mb-1">
                            {market === 'Korea' ? '₩' : market === 'Taiwan' ? 'NT$' : '$'}{candidate.price.toLocaleString('en-US', { 
                                minimumFractionDigits: (market === 'Korea' || market === 'Taiwan') ? 0 : 2,
                                maximumFractionDigits: (market === 'Korea' || market === 'Taiwan') ? 0 : 2
                            })}
                        </div>
                        <div className={clsx("text-[10px] sm:text-xs font-bold flex items-center justify-end gap-0.5", candidate.revenueGrowth >= 0 ? 'text-success' : 'text-danger')}>
                            {candidate.revenueGrowth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(Number(rev))}%
                        </div>
                    </div>
                </div>

                {/* Phase 9: Reverse Engine Badges */}
                {result.reverse && result.reverse.rev_band && result.reverse.rev_band !== 'Excluded' && (
                    <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-primary/10 flex-wrap">
                        <span className={clsx(
                            "text-[10px] font-black px-1.5 py-0.5 rounded",
                            result.reverse.rev_band === 'High' && "bg-emerald-500/20 text-emerald-400",
                            result.reverse.rev_band === 'Solid' && "bg-blue-500/20 text-blue-400",
                            result.reverse.rev_band === 'Watchlist' && "bg-amber-500/20 text-amber-400",
                            result.reverse.rev_band === 'Monitor' && "bg-gray-500/20 text-gray-400",
                            result.reverse.rev_band === 'Reject-tier' && "bg-muted/20 text-muted-foreground",
                        )}>
                            {result.reverse.rev_band}
                        </span>
                        {result.reverse.rev_archetype && (
                            <span className="text-[10px] font-mono bg-secondary/50 px-1 rounded" title="Archetype">
                                {result.reverse.rev_archetype}
                            </span>
                        )}
                        {result.reverse.rev_composite != null && (
                            <span className="text-[10px] font-mono text-primary/80" title="Composite">
                                {Math.round(result.reverse.rev_composite)}
                            </span>
                        )}
                        {result.reverse.rev_nominated && (
                            <span className="text-[10px] font-black text-amber-400" title="Nominated for deep-dive">
                                ★
                            </span>
                        )}
                        {result.reverse.rev_efficiency != null && (
                            <span className="text-[10px] text-muted-foreground/60 font-mono" title="CAGR/|DD| efficiency">
                                {result.reverse.rev_efficiency.toFixed(1)}x
                            </span>
                        )}
                    </div>
                )}

                {/* WS1: Paradigm Dimension Badges (theme-tagged stocks only) */}
                {result.paradigm && result.paradigm.pdm_themes && result.paradigm.pdm_themes.length > 0 && (() => {
                    const band = result.paradigm.pdm_band;
                    const bandLabel = band === 'high' ? 'STRONG'
                        : band === 'mid' ? 'SOLID'
                        : band === 'watch' ? 'WATCH'
                        : band === 'skip' ? 'PASS'
                        : 'NO DATA';
                    const bandTitle = `Paradigm conviction tier (${band}) - signal ${result.paradigm.pdm_signal ?? 'n/a'}/100. STRONG = all 3 pillars converge; SOLID = mid; WATCH = weak signal worth tracking; PASS = gate or momentum kills it.`;
                    return (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-purple-500/10 flex-wrap">
                        <span className={clsx(
                            "text-[10px] font-black px-1.5 py-0.5 rounded uppercase",
                            band === 'high' && "bg-emerald-500/20 text-emerald-400",
                            band === 'mid' && "bg-blue-500/20 text-blue-400",
                            band === 'watch' && "bg-amber-500/20 text-amber-400",
                            band === 'skip' && "bg-gray-500/20 text-gray-400",
                            band === 'no_data' && "bg-muted/20 text-muted-foreground",
                        )} title={bandTitle}>
                            Paradigm {bandLabel}
                        </span>
                        {result.paradigm.pdm_theme_primary && (
                            <span className="text-[10px] font-mono bg-purple-500/15 text-purple-300 px-1 rounded" title="Primary secular theme this stock is tagged with">
                                {result.paradigm.pdm_theme_primary}
                            </span>
                        )}
                        {result.paradigm.pdm_signal != null && (
                            <span className="text-[10px] font-mono text-primary/80" title="3-factor signal: membership x momentum x economics gate (0-100)">
                                Sig {result.paradigm.pdm_signal}
                            </span>
                        )}
                        {result.paradigm.pdm_themes.length > 1 && (
                            <span className="text-[10px] font-mono text-purple-400" title={`Tagged in ${result.paradigm.pdm_themes.length} themes: ${result.paradigm.pdm_themes.join(', ')}`}>
                                +{result.paradigm.pdm_themes.length - 1} theme{result.paradigm.pdm_themes.length - 1 > 1 ? 's' : ''}
                            </span>
                        )}
                        {result.paradigm.pdm_flags && result.paradigm.pdm_flags.some((f: string) => f.startsWith('macro_')) && (
                            <span className="text-[10px] font-black text-red-400" title={`Macro warning active: ${result.paradigm.pdm_flags.filter((f: string) => f.startsWith('macro_')).join(', ')}. Investor caution suggested.`}>
                                ⚠ Macro
                            </span>
                        )}
                        {result.paradigm.pdm_flags && result.paradigm.pdm_flags.includes('accelerating') && (
                            <span className="text-[10px] font-black text-emerald-400" title="Δ-percentile-rank momentum accelerating: stock's rank is improving fast vs the universe">
                                ↑ Accel
                            </span>
                        )}
                        {result.paradigm.pdm_flags && result.paradigm.pdm_flags.includes('decelerating') && (
                            <span className="text-[10px] font-black text-red-400" title="Δ-percentile-rank momentum decelerating: stock's rank is falling fast vs the universe">
                                ↓ Decel
                            </span>
                        )}
                    </div>
                    );
                })()}
            </div>
        </div>
    );
}
