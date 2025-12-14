"use client";

import { ScreeningResult } from "@/lib/blueprint";
import clsx from "clsx";

interface StockCardProps {
    result: ScreeningResult;
    onClick: () => void;
}

import { useLanguage } from "./LanguageContext";

export function StockCard({ result, onClick }: StockCardProps) {
    const { t } = useLanguage();
    if (!result || !result.candidate) return null;
    const { candidate } = result;
    const roic = candidate.roic.toFixed(1);
    const rev = candidate.revenueGrowth.toFixed(1);

    return (
        <div
            onClick={onClick}
            className="group bg-card hover:bg-secondary/50 border border-border hover:border-primary/50 rounded-lg p-4 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 relative overflow-hidden"
        >
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h3 className="text-lg font-bold group-hover:text-primary transition-colors">{candidate.symbol}</h3>
                    <p className="text-xs text-muted-foreground truncate max-w-[120px]" title={candidate.name}>{candidate.name}</p>
                </div>
                <div className="text-right">
                    <div className="font-mono font-medium">${candidate.price.toFixed(2)}</div>
                    <div className={clsx("text-xs", candidate.revenueGrowth >= 0 ? 'text-success' : 'text-danger')}>
                        {t('growth')}: {rev}%
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mt-3 pt-3 border-t border-border/50">
                <div className="space-y-1">
                    <div className="text-muted-foreground">{t('roic')}</div>
                    <div className={clsx("font-mono", candidate.roic > 15 && 'text-success font-bold')}>{roic}%</div>
                </div>
                <div className="space-y-1 text-right">
                    <div className="text-muted-foreground">{t('mcap')}</div>
                    <div>${(candidate.marketCap / 1_000_000_000).toFixed(1)}B</div>
                </div>
            </div>

            {/* Scan Status Dot */}
            <div className={clsx(
                "absolute top-2 right-2 w-2 h-2 rounded-full",
                result.passed ? "bg-success shadow-[0_0_8px_rgba(72,187,120,0.6)]" :
                    result.score > 80 ? "bg-warning shadow-[0_0_8px_rgba(237,137,54,0.6)]" :
                        "bg-danger/50"
            )}
                title={result.passed ? "Gem Candidate" : result.score > 80 ? "High Potential (Score > 80)" : "Weak Match"}
            />
        </div>
    );
}
