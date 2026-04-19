"use client";

import { ScreeningResult } from "@/lib/blueprint";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import clsx from "clsx";

interface StockCardProps {
    result: ScreeningResult;
    onClick: () => void;
    index?: number;
    lastUpdated?: string | null;
    market?: 'US' | 'India' | 'Korea';
}

import { useLanguage } from "./LanguageContext";
import { formatKoreanWon } from "@/lib/data-service";

export function StockCard({ result, onClick, index = 0, lastUpdated, market = 'US' }: StockCardProps) {
    const { t } = useLanguage();
    if (!result || !result.candidate) return null;
    const { candidate } = result;
    const roic = candidate.roic.toFixed(1);
    const rev = candidate.revenueGrowth.toFixed(1);

    return (
        <div
            onClick={onClick}
            style={{ animationDelay: `${index * 50}ms` }}
            className="group relative bg-card cursor-pointer transition-all duration-500 hover:shadow-2xl hover:-translate-y-1.5 z-0 overflow-hidden rounded-xl animate-in fade-in zoom-in-95 fill-mode-backwards"
        >
            {/* Animated Hover Gradient Background glow */}
            <div className="absolute inset-[-50%] bg-gradient-to-br from-primary/40 via-accent/20 to-primary/40 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl z-0 pointer-events-none group-hover:animate-[spin_4s_linear_infinite]"></div>
            
            <div className="relative z-10 bg-card/80 backdrop-blur-xl h-full rounded-xl p-4 border border-border/80 group-hover:border-primary/40 transition-colors shadow-inner">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h3 className="text-xl font-bold group-hover:text-primary transition-colors tracking-tight truncate max-w-[150px]">
                                {market === 'Korea' 
                                    ? (candidate.name === candidate.symbol ? candidate.symbol.split('.')[0] : candidate.name) 
                                    : candidate.symbol.replace(/\.(NS|BO)$/, '')}
                            </h3>
                            {/* Scan Status Dot */}
                            <div className={clsx(
                                "w-2 h-2 rounded-full shrink-0 transition-colors",
                                result.passed ? "bg-success shadow-[0_0_10px_var(--success)]" :
                                    result.score > 80 ? "bg-warning shadow-[0_0_10px_rgba(237,137,54,0.8)]" :
                                        "bg-danger/50"
                            )}
                                title={result.passed ? "Gem Candidate" : result.score > 80 ? "High Potential" : "Weak Match"}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[120px]" title={candidate.name}>
                            {market === 'Korea' ? candidate.symbol : candidate.name}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-base font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                            {market === 'India' ? '₹' : market === 'Korea' ? '₩' : '$'}{candidate.price.toLocaleString(undefined, { 
                                minimumFractionDigits: market === 'Korea' ? 0 : 2,
                                maximumFractionDigits: market === 'Korea' ? 0 : 2
                            })}
                        </div>
                        <div className={clsx("text-xs font-semibold flex items-center justify-end gap-0.5 mt-0.5", candidate.revenueGrowth >= 0 ? 'text-success' : 'text-danger')}>
                            {candidate.revenueGrowth >= 0 ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}
                            {t('growth')}: {Math.abs(Number(rev))}%
                        </div>
                    </div>
                </div>

            <div className="grid grid-cols-2 gap-2 text-xs mt-3 pt-3 border-t border-border/50">
                <div>
                    <span className="text-muted-foreground block mb-0.5">{t('roic')}</span>
                    <span className={clsx("font-mono font-bold", candidate.roic > 15 ? 'text-success' : candidate.roic > 0 ? 'text-success/70' : 'text-foreground')}>
                        {Math.abs(candidate.roic) > 0 ? `${roic}%` : '-'}
                    </span>
                </div>
                <div className="text-right">
                    <span className="text-muted-foreground block mb-0.5">{t('mcap')}</span>
                    <span className="font-mono font-bold">
                        {market === 'India' 
                            ? `${(candidate.marketCap / 10_000_000).toLocaleString(undefined, {maximumFractionDigits: 0})} Cr.` 
                            : market === 'Korea'
                                ? formatKoreanWon(candidate.marketCap, 2)
                                : `$${(candidate.marketCap / 1_000_000_000).toFixed(1)}B`
                        }
                    </span>
                </div>
            </div>
            
            {lastUpdated && (
                <div className="text-xs text-muted-foreground font-mono font-medium text-right mt-2 pt-2 border-t border-border/20 tracking-tight">
                    Last updated {lastUpdated}
                </div>
            )}


            
            </div>
        </div>
    );
}
