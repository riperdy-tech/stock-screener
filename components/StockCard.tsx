"use client";

import { ParadigmHistoryEvent, ScreeningResult } from "@/lib/blueprint";
import { YoutubeStrategyEvaluation, formatStrategyNumber } from "@/lib/youtube-strategy";
import { ArrowDownRight, ArrowUpRight, Layers3, ShieldCheck, Telescope, Youtube } from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { useLanguage } from "./LanguageContext";

type ScreenMode = '100bagger' | 'reverse' | 'paradigm' | 'youtube';

interface StockCardProps {
    result: ScreeningResult;
    onClick: () => void;
    index?: number;
    lastUpdated?: string | null;
    market?: 'US' | 'India' | 'Korea' | 'Taiwan';
    screenMode?: ScreenMode;
    youtubeEvaluation?: YoutubeStrategyEvaluation;
    paradigmHistory?: ParadigmHistoryEvent[];
}

const paradigmBandLabel: Record<string, string> = {
    high: "STRONG",
    mid: "SOLID",
    watch: "WATCH",
    skip: "PASS",
    no_data: "NO DATA",
};

export function StockCard({ result, onClick, index = 0, market = 'US', screenMode = '100bagger', youtubeEvaluation, paradigmHistory = [] }: StockCardProps) {
    const { t } = useLanguage();
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
    const latestParadigmEvent = paradigmHistory[0];

    return (
        <div
            onClick={onClick}
            style={{ animationDelay: `${index * 30}ms` }}
            className="group relative h-full cursor-pointer overflow-hidden rounded-lg border border-border/80 bg-card/95 shadow-inner transition-all duration-300 animate-in fade-in zoom-in-95 fill-mode-backwards hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl"
        >
            <div className="flex h-full flex-col p-3.5 sm:p-4">
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
                            <h3 className="truncate text-lg font-black tracking-tight transition-colors group-hover:text-primary">
                                {ticker}
                            </h3>
                        </div>
                        <p className="mt-0.5 truncate text-sm font-semibold text-muted-foreground">
                            {companyName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                            {candidate.sector || t('unknownSector')} / {candidate.industry || result.industry || t('unknownIndustry')}
                        </p>
                    </div>

                    <div className="w-full shrink-0 rounded-lg border border-border/60 bg-secondary/20 p-2.5 text-left sm:min-w-[7.5rem] sm:w-auto sm:text-right">
                        <div className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{t('price')}</div>
                        <div className="mt-1 truncate font-mono text-lg font-black leading-none text-foreground sm:text-xl" title={priceLabel}>
                            {priceLabel}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/50 pt-2">
                            <span className="text-xs font-bold text-muted-foreground">{t('mcap')}</span>
                            <span className="truncate font-mono text-xs font-black text-foreground" title={marketCapLabel}>{marketCapLabel}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-muted-foreground">{t('growth')}</span>
                            <span className={clsx("flex items-center justify-end gap-1 font-mono text-xs font-black", revenueGrowth >= 0 ? 'text-success' : 'text-danger')}>
                                {revenueGrowth >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                                {Math.abs(revenueGrowth).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>

                <div className="mt-3 rounded-lg border border-purple-500/20 bg-purple-500/[0.04] p-2.5">
                    {hasParadigm ? (
                        <div className="flex items-start gap-2">
                            <div className="mt-0.5 rounded-md border border-purple-500/30 bg-purple-500/10 p-2 text-purple-300">
                                <Layers3 className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className={clsx(
                                        "rounded px-2.5 py-1 text-xs font-black uppercase",
                                        paradigmBand === 'high' && "bg-emerald-500/20 text-emerald-400",
                                        paradigmBand === 'mid' && "bg-blue-500/20 text-blue-400",
                                        paradigmBand === 'watch' && "bg-amber-500/20 text-amber-400",
                                        paradigmBand === 'skip' && "bg-gray-500/20 text-gray-400",
                                        paradigmBand === 'no_data' && "bg-muted/20 text-muted-foreground",
                                    )}>
                                        Paradigm {paradigmLabel}
                                    </span>
                                    {paradigm?.pdm_signal != null && (
                                        <span className="font-mono text-xs font-bold text-primary/90">Sig {Math.round(paradigm.pdm_signal)}</span>
                                    )}
                                </div>
                                <div className="mt-1 truncate font-mono text-xs text-purple-300" title={paradigm?.pdm_themes?.join(', ')}>
                                    {paradigm?.pdm_theme_primary || paradigm?.pdm_themes?.[0]}
                                    {paradigm?.pdm_themes && paradigm.pdm_themes.length > 1 ? ` +${paradigm.pdm_themes.length - 1}` : ''}
                                </div>
                                {latestParadigmEvent && (
                                    <div className="mt-1 truncate text-[11px] font-bold text-muted-foreground" title={formatParadigmHistoryEvent(latestParadigmEvent)}>
                                        {formatParadigmHistoryEvent(latestParadigmEvent)}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Layers3 className="h-4 w-4 text-purple-300/60" />
                            {t('paradigmNoTag')}
                        </div>
                    )}
                </div>

                <div className="mt-2.5 rounded-lg border border-border/70 bg-secondary/15 p-2.5">
                    <ActiveLensPanel result={result} screenMode={screenMode} youtubeEvaluation={youtubeEvaluation} />
                </div>

                <div className="mt-2.5 border-t border-border/60 pt-2.5">
                    <div className="mb-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground">{t('otherSignals')}</div>
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
                            <span className="rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-black text-red-400">Macro</span>
                        )}
                        {paradigm?.pdm_flags?.includes('accelerating') && (
                            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-400">Accel</span>
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

function formatParadigmHistoryEvent(event: ParadigmHistoryEvent) {
    if (event.event_type === 'band_change') {
        return `${formatParadigmBand(event.from_band)} -> ${formatParadigmBand(event.to_band)}`;
    }
    if (event.event_type === 'theme_change') {
        return `Theme -> ${event.to_theme_primary || 'none'}`;
    }
    return `Signal ${event.from_signal ?? 'n/a'} -> ${event.to_signal ?? 'n/a'}`;
}

function formatParadigmBand(band: string | null) {
    if (!band) return 'NONE';
    return paradigmBandLabel[band] || band.toUpperCase();
}

function ActiveLensPanel({ result, screenMode, youtubeEvaluation }: { result: ScreeningResult; screenMode: ScreenMode; youtubeEvaluation?: YoutubeStrategyEvaluation }) {
    const { t } = useLanguage();

    if (screenMode === 'reverse') {
        const reverse = result.reverse;
        if (!reverse || !reverse.rev_band || reverse.rev_band === 'Excluded') {
            return <EmptyLens icon={<ShieldCheck className="h-4 w-4" />} label={t('noReverseScore')} detail={t('reverseNoScoreDetail')} />;
        }
        return (
            <div>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-400">
                        <ShieldCheck className="h-4 w-4" /> {t('strategyReverseTitle')}
                    </div>
                    <span className="font-mono text-sm font-black text-foreground">{reverse.rev_composite != null ? Math.round(reverse.rev_composite) : 'n/a'}</span>
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
            return <EmptyLens icon={<Layers3 className="h-4 w-4" />} label={t('noSecularTheme')} detail={t('noSecularThemeDetail')} />;
        }
        return (
            <div>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-300">
                        <Layers3 className="h-4 w-4" /> {t('strategyParadigmTitle')}
                    </div>
                    <span className="font-mono text-sm font-black text-foreground">{paradigm.pdm_signal != null ? Math.round(paradigm.pdm_signal) : 'n/a'}</span>
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
            return <EmptyLens icon={<Youtube className="h-4 w-4" />} label={t('noYoutubeMatch')} detail={t('noYoutubeMatchDetail')} />;
        }
        const extraMatches = youtubeEvaluation.matchedStrategies.length - 1;
        return (
            <div>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-300">
                        <Youtube className="h-4 w-4" /> {t('strategyYoutubeTitle')}
                    </div>
                    <span className="truncate text-right text-sm font-black text-foreground" title={youtubeEvaluation.matchedStrategies.join(', ')}>
                        {youtubeEvaluation.matchedStrategies[0]}{extraMatches > 0 ? ` +${extraMatches}` : ''}
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
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-400">
                    <Telescope className="h-4 w-4" /> {t('strategy100Title')}
                </div>
                <span className="font-mono text-sm font-black text-foreground">{Math.round(result.score)}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
                <MiniMetric label={t('status')} value={result.passed ? t('pass') : t('review')} />
                <MiniMetric label="ROIC" value={`${Number(result.candidate.roic || 0).toFixed(0)}%`} />
                <MiniMetric label="P/S" value={`${Number(result.candidate.priceToSales || 0).toFixed(1)}x`} />
            </div>
        </div>
    );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="min-w-0 rounded-md bg-background/40 px-2.5 py-1.5">
            <div className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-0.5 truncate font-mono text-xs font-black text-foreground" title={String(value)}>{value}</div>
        </div>
    );
}

function EmptyLens({ icon, label, detail }: { icon: ReactNode; label: string; detail: string }) {
    return (
        <div className="rounded-lg border border-border/60 bg-secondary/15 p-2.5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                {icon}
                <span>{label}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/75">{detail}</p>
        </div>
    );
}

function SignalChip({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'success' | 'warning' | 'primary' | 'muted' }) {
    return (
        <span className={clsx(
            "inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-black",
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
