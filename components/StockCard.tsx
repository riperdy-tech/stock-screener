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

                {lastUpdated && (
                    <div className="text-[10px] text-muted-foreground/60 font-mono mt-3 pt-2 border-t border-border/10 flex justify-between items-center">
                        <span className="uppercase tracking-tighter text-[9px]">{candidate.sector}</span>
                        <span>{lastUpdated}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
