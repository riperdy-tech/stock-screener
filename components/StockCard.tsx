"use client";

import { ScreeningResult } from "@/lib/blueprint";
import { YoutubeStrategyEvaluation, formatStrategyNumber } from "@/lib/youtube-strategy";
import { ArrowDownRight, ArrowUpRight, Layers3, ShieldCheck, Telescope, Youtube } from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";

type ScreenMode = '100bagger' | 'reverse' | 'paradigm' | 'youtube';

interface StockCardProps {
    result: ScreeningResult;
    onClick: () => void;
    index?: number;
    lastUpdated?: string | null;
    market?: 'US' | 'India' | 'Korea' | 'Taiwan';
    screenMode?: ScreenMode;
    youtubeEvaluation?: YoutubeStrategyEvaluation;
}

const paradigmBandLabel: Record<string, string> = {
    high: "STRONG",
    mid: "SOLID",
    watch: "WATCH",
    skip: "PASS",
    no_data: "NO DATA",
};

export function StockCard({ result, onClick, index = 0, market = 'US', screenMode = '100bagger', youtubeEvaluation }: StockCardProps) {
    if (!result || !result.candidate) return null;

    const { candidate } = result;
    const ticker = market === 'US' ? candidate.symbol.split('.')[0] : candidate.symbol;
    const companyName = candidate.name || candidate.symbol;
    const pricePrefix = market === 'Korea' ? 'KRW ' : market === 'Taiwan' ? 'NT$' : '$';
    const priceLabel = `${pricePrefix}${Number(candidate.price || 0).toLocaleString('en-US', {
        minimumFractionDigits: (market === 'Korea' || market === 'Taiwan') ? 0 : 2,
        maximumFractionDigits: (market === 'Korea' || market === 'Taiwan') ? 0 : 2
    })}`;
    const revenueGrowth = Number(candidate.revenueGrowth || 0);
    const marketCapLabel = formatCardMarketCap(Number(candidate.marketCap || 0), market);
    const paradigm = result.paradigm;
    const reverse = result.reverse;
    const hasParadigm = !!(paradigm?.pdm_themes && paradigm.pdm_themes.length > 0);
    const paradigmBand = paradigm?.pdm_band || 'no_data';
    const paradigmLabel = paradigmBandLabel[paradigmBand] || 'NO DATA';
    const hasReverse = !!(reverse && reverse.rev_band && reverse.rev_band !== 'Excluded');
    const hasYoutube = !!(youtubeEvaluation && youtubeEvaluation.matchedStrategies.length > 0);

    return (
        <div
            onClick={onClick}
            style={{ animationDelay: `${index * 30}ms` }}
            className="group relative h-full cursor-pointer overflow-hidden rounded-lg border border-border/80 bg-card/95 shadow-inner transition-all duration-300 animate-in fade-in zoom-in-95 fill-mode-backwards hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl"
        >
            <div className="flex h-full flex-col p-4 sm:p-5">
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span
                                className={clsx(
                                    "h-2.5 w-2.5 shrink-0 rounded-full",
                                    result.passed ? "bg-success shadow-[0_0_10px_var(--success)]" :
                                        result.score > 80 ? "bg-warning shadow-[0_0_10px_rgba(237,137,54,0.85)]" :
                                            "bg-danger/60"
                                )}
                                title={result.passed ? "Gem Candidate" : result.score > 80 ? "High Potential" : "Reviewing"}
                            />
                            <h3 className="truncate text-xl font-black tracking-tight transition-colors group-hover:text-primary">
                                {ticker}
                            </h3>
                        </div>
                        <p className="mt-1 truncate text-base font-semibold text-muted-foreground">
                            {companyName}
                        </p>
                        <p className="mt-1 truncate text-base text-muted-foreground/80">
                            {candidate.sector || "Unknown sector"} / {candidate.industry || result.industry || "Unknown industry"}
                        </p>
                    </div>

                    <div className="w-full shrink-0 rounded-lg border border-border/60 bg-secondary/20 p-3 text-left sm:min-w-[8.5rem] sm:w-auto sm:text-right">
                        <div className="text-base font-black uppercase tracking-wider text-muted-foreground">Price</div>
                        <div className="mt-1 truncate font-mono text-xl font-black leading-none text-foreground sm:text-2xl" title={priceLabel}>
                            {priceLabel}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/50 pt-2">
                            <span className="text-base font-bold text-muted-foreground">MCap</span>
                            <span className="truncate font-mono text-base font-black text-foreground" title={marketCapLabel}>{marketCapLabel}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="text-base font-bold text-muted-foreground">Rev</span>
                            <span className={clsx("flex items-center justify-end gap-1 font-mono text-base font-black", revenueGrowth >= 0 ? 'text-success' : 'text-danger')}>
                                {revenueGrowth >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                                {Math.abs(revenueGrowth).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>

                <div className="mt-4 rounded-lg border border-purple-500/20 bg-purple-500/[0.04] p-3">
                    {hasParadigm ? (
                        <div className="flex items-start gap-2">
                            <div className="mt-0.5 rounded-md border border-purple-500/30 bg-purple-500/10 p-2 text-purple-300">
                                <Layers3 className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className={clsx(
                                        "rounded px-3 py-1.5 text-base font-black uppercase",
                                        paradigmBand === 'high' && "bg-emerald-500/20 text-emerald-400",
                                        paradigmBand === 'mid' && "bg-blue-500/20 text-blue-400",
                                        paradigmBand === 'watch' && "bg-amber-500/20 text-amber-400",
                                        paradigmBand === 'skip' && "bg-gray-500/20 text-gray-400",
                                        paradigmBand === 'no_data' && "bg-muted/20 text-muted-foreground",
                                    )}>
                                        Paradigm {paradigmLabel}
                                    </span>
                                    {paradigm?.pdm_signal != null && (
                                        <span className="font-mono text-base font-bold text-primary/90">Sig {Math.round(paradigm.pdm_signal)}</span>
                                    )}
                                </div>
                                <div className="mt-1.5 truncate font-mono text-base text-purple-300" title={paradigm?.pdm_themes?.join(', ')}>
                                    {paradigm?.pdm_theme_primary || paradigm?.pdm_themes?.[0]}
                                    {paradigm?.pdm_themes && paradigm.pdm_themes.length > 1 ? ` +${paradigm.pdm_themes.length - 1}` : ''}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-base text-muted-foreground">
                            <Layers3 className="h-4 w-4 text-purple-300/60" />
                            No Paradigm theme tag
                        </div>
                    )}
                </div>

                <div className="mt-3 rounded-lg border border-border/70 bg-secondary/15 p-3">
                    <ActiveLensPanel result={result} screenMode={screenMode} youtubeEvaluation={youtubeEvaluation} />
                </div>

                <div className="mt-3 border-t border-border/60 pt-3">
                    <div className="mb-2 text-base font-black uppercase tracking-wider text-muted-foreground">Other signals</div>
                    <div className="flex flex-wrap gap-1.5">
                        <SignalChip
                            icon={<Telescope className="h-4 w-4" />}
                            label="100B"
                            value={`${Math.round(result.score)}`}
                            tone={result.passed ? "success" : result.score > 80 ? "warning" : "muted"}
                        />
                        {hasReverse && (
                            <SignalChip
                                icon={<ShieldCheck className="h-4 w-4" />}
                                label="REV"
                                value={reverse?.rev_composite != null ? `${Math.round(reverse.rev_composite)}` : reverse?.rev_band || "n/a"}
                                tone={reverse?.rev_band === 'High' ? "success" : reverse?.rev_band === 'Solid' ? "primary" : "muted"}
                            />
                        )}
                        {hasParadigm && (
                            <SignalChip
                                icon={<Layers3 className="h-4 w-4" />}
                                label="PDM"
                                value={paradigm?.pdm_signal != null ? `${Math.round(paradigm.pdm_signal)}` : paradigmLabel}
                                tone={paradigmBand === 'high' ? "success" : paradigmBand === 'mid' ? "primary" : paradigmBand === 'watch' ? "warning" : "muted"}
                            />
                        )}
                        {hasYoutube && (
                            <SignalChip
                                icon={<Youtube className="h-4 w-4" />}
                                label="YT"
                                value={`${youtubeEvaluation.matchedStrategies.length}`}
                                tone={youtubeEvaluation.riskTier === 'standard' ? "primary" : "warning"}
                            />
                        )}
                        {paradigm?.pdm_flags?.some((f: string) => f.startsWith('macro_')) && (
                            <span className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-base font-black text-red-400">Macro</span>
                        )}
                        {paradigm?.pdm_flags?.includes('accelerating') && (
                            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-base font-black text-emerald-400">Accel</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatCardMarketCap(value: number, market: 'US' | 'India' | 'Korea' | 'Taiwan') {
    if (!value || !Number.isFinite(value)) return 'MCap n/a';
    if (market === 'Korea') return `${(value / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B KRW`;
    if (market === 'Taiwan') return `NT$${(value / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`;
    if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`;
    return `$${(value / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
}

function ActiveLensPanel({ result, screenMode, youtubeEvaluation }: { result: ScreeningResult; screenMode: ScreenMode; youtubeEvaluation?: YoutubeStrategyEvaluation }) {
    if (screenMode === 'reverse') {
        const reverse = result.reverse;
        if (!reverse || !reverse.rev_band || reverse.rev_band === 'Excluded') {
            return <EmptyLens icon={<ShieldCheck className="h-4 w-4" />} label="No Reverse score" detail="Outside the current reverse-engine scoring set." />;
        }
        return (
            <div>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-base font-black uppercase tracking-wider text-emerald-400">
                        <ShieldCheck className="h-4 w-4" /> Reverse Engine
                    </div>
                    <span className="font-mono text-base font-black text-foreground">{reverse.rev_composite != null ? Math.round(reverse.rev_composite) : 'n/a'}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    <MiniMetric label="Band" value={reverse.rev_band || 'n/a'} />
                    <MiniMetric label="Arch" value={reverse.rev_archetype || 'n/a'} />
                    <MiniMetric label="Rank" value={reverse.rev_rank != null ? `#${reverse.rev_rank}` : 'n/a'} />
                </div>
            </div>
        );
    }

    if (screenMode === 'paradigm') {
        const paradigm = result.paradigm;
        if (!paradigm?.pdm_themes?.length) {
            return <EmptyLens icon={<Layers3 className="h-4 w-4" />} label="No secular-theme match" detail="No paradigm theme has enough evidence yet." />;
        }
        return (
            <div>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-base font-black uppercase tracking-wider text-purple-300">
                        <Layers3 className="h-4 w-4" /> Paradigm Lens
                    </div>
                    <span className="font-mono text-base font-black text-foreground">{paradigm.pdm_signal != null ? Math.round(paradigm.pdm_signal) : 'n/a'}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    <MiniMetric label="Member" value={paradigm.pdm_membership_score ?? 'n/a'} />
                    <MiniMetric label="Momentum" value={paradigm.pdm_momentum_score ?? 'n/a'} />
                    <MiniMetric label="Gate" value={paradigm.pdm_economics_gate ?? 'n/a'} />
                </div>
            </div>
        );
    }

    if (screenMode === 'youtube') {
        if (!youtubeEvaluation || youtubeEvaluation.matchedStrategies.length === 0) {
            return <EmptyLens icon={<Youtube className="h-4 w-4" />} label="No YouTube strategy match" detail="EPS, value, or turnaround triggers are not active." />;
        }
        return (
            <div>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-base font-black uppercase tracking-wider text-red-300">
                        <Youtube className="h-4 w-4" /> YouTube Strategy
                    </div>
                    <span className="truncate text-right text-base font-black text-foreground" title={youtubeEvaluation.matchedStrategies.join(', ')}>
                        {youtubeEvaluation.matchedStrategies[0]}
                    </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MiniMetric label="EPS" value={formatStrategyNumber(youtubeEvaluation.epsTtm)} />
                    <MiniMetric label="Fwd EPS" value={formatStrategyNumber(youtubeEvaluation.forwardEpsEstimate)} />
                    <MiniMetric label="P/B" value={formatStrategyNumber(youtubeEvaluation.priceToBook)} />
                    <MiniMetric label="Risk" value={youtubeEvaluation.riskTier === 'standard' ? 'Std' : 'Tiny'} />
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-base font-black uppercase tracking-wider text-sky-400">
                    <Telescope className="h-4 w-4" /> 100-Bagger
                </div>
                <span className="font-mono text-base font-black text-foreground">{Math.round(result.score)}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
                <MiniMetric label="Status" value={result.passed ? 'Pass' : 'Review'} />
                <MiniMetric label="ROIC" value={`${Number(result.candidate.roic || 0).toFixed(0)}%`} />
                <MiniMetric label="P/S" value={`${Number(result.candidate.priceToSales || 0).toFixed(1)}x`} />
            </div>
        </div>
    );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="min-w-0 rounded-md bg-background/40 px-3 py-2">
            <div className="truncate text-base font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-0.5 truncate font-mono text-base font-black text-foreground" title={String(value)}>{value}</div>
        </div>
    );
}

function EmptyLens({ icon, label, detail }: { icon: ReactNode; label: string; detail: string }) {
    return (
        <div className="rounded-lg border border-border/60 bg-secondary/15 p-3">
            <div className="flex items-center gap-2 text-base font-black uppercase tracking-wider text-muted-foreground">
                {icon}
                <span>{label}</span>
            </div>
            <p className="mt-1 text-base leading-relaxed text-muted-foreground/75">{detail}</p>
        </div>
    );
}

function SignalChip({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'success' | 'warning' | 'primary' | 'muted' }) {
    return (
        <span className={clsx(
            "inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-base font-black",
            tone === 'success' && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
            tone === 'warning' && "border-amber-500/30 bg-amber-500/10 text-amber-400",
            tone === 'primary' && "border-blue-500/30 bg-blue-500/10 text-blue-400",
            tone === 'muted' && "border-border/60 bg-secondary/30 text-muted-foreground",
        )}>
            {icon}
            {label} {value}
        </span>
    );
}
