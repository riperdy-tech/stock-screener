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

function isBaselineParadigmEvent(event: ParadigmHistoryEvent) {
    return Boolean(
        event.is_baseline ||
        (
            event.from_band == null &&
            event.from_signal == null &&
            event.from_rank == null &&
            event.summary?.startsWith("Initial Paradigm")
        )
    );
}

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
    const latestParadigmEvent = paradigmHistory.find(event => !isBaselineParadigmEvent(event));

    return (
        <div
            onClick={onClick}
            style={{ animationDelay: `${index * 30}ms` }}
            className="group relative h-full cursor-pointer overflow-hidden border border-rule-10 bg-surface transition-all duration-300 animate-in fade-in zoom-in-95 fill-mode-backwards hover:-translate-y-0.5 hover:border-accent/40 hover:"
        >
            <div className="flex h-full flex-col p-3.5 sm:p-4">
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span
                                className={clsx(
                                    "h-2.5 w-2.5 shrink-0 ",
                                    result.passed ? "bg-success " :
                                        result.score > 80 ? "bg-warning " :
                                            "bg-danger/60"
                                )}
                                title={result.passed ? "Gem Candidate" : result.score > 80 ? "High Potential" : "Reviewing"}
                            />
                            <h3 className="truncate text-lg font-extrabold tracking-tight transition-colors group-hover:text-accent">
                                {ticker}
                            </h3>
                        </div>
                        <p className="mt-0.5 truncate text-sm font-semibold text-ink-2">
                            {companyName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink-2/80">
                            {candidate.sector || t('unknownSector')} / {candidate.industry || result.industry || t('unknownIndustry')}
                        </p>
                    </div>

                    <div className="w-full shrink-0 border border-rule-10 bg-white/5 p-2.5 text-left sm:min-w-[7.5rem] sm:w-auto sm:text-right">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink-2">{t('price')}</div>
                        <div className="mt-1 truncate font-mono text-lg font-extrabold leading-none text-ink sm:text-xl" title={priceLabel}>
                            {priceLabel}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 border-t border-rule-10 pt-2">
                            <span className="text-xs font-bold text-ink-2">{t('mcap')}</span>
                            <span className="truncate font-mono text-xs font-extrabold text-ink" title={marketCapLabel}>{marketCapLabel}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-ink-2">{t('growth')}</span>
                            <span className={clsx("flex items-center justify-end gap-1 font-mono text-xs font-extrabold", revenueGrowth >= 0 ? 'text-pos' : 'text-neg')}>
                                {revenueGrowth >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                                {Math.abs(revenueGrowth).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>

                <div className="mt-3 border border-rule-24 bg-white/5] p-2.5">
                    {hasParadigm ? (
                        <div className="flex items-start gap-2">
                            <div className="mt-0.5 border border-rule-24 bg-white/5 p-2 text-ink-2">
                                <Layers3 className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className={clsx(
                                        " px-2.5 py-1 text-xs font-extrabold uppercase",
                                        paradigmBand === 'high' && "bg-pos/10 text-pos",
                                        paradigmBand === 'mid' && "bg-accent/10 text-accent",
                                        paradigmBand === 'watch' && "bg-warn/10 text-warn",
                                        paradigmBand === 'skip' && "bg-gray-500/20 text-ink-2",
                                        paradigmBand === 'no_data' && "bg-white/5 text-ink-2",
                                    )}>
                                        Paradigm {paradigmLabel}
                                    </span>
                                    {paradigm?.pdm_signal != null && (
                                        <span className="font-mono text-xs font-bold text-accent/90">Sig {Math.round(paradigm.pdm_signal)}</span>
                                    )}
                                </div>
                                <div className="mt-1 truncate font-mono text-xs text-ink-2" title={paradigm?.pdm_themes?.join(', ')}>
                                    {paradigm?.pdm_theme_primary || paradigm?.pdm_themes?.[0]}
                                    {paradigm?.pdm_themes && paradigm.pdm_themes.length > 1 ? ` +${paradigm.pdm_themes.length - 1}` : ''}
                                </div>
                                {latestParadigmEvent && (
                                    <div className="mt-1 truncate text-[11px] font-bold text-ink-2" title={formatParadigmHistoryEvent(latestParadigmEvent)}>
                                        {formatParadigmHistoryEvent(latestParadigmEvent)}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-ink-2">
                            <Layers3 className="h-4 w-4 text-ink-2" />
                            {t('paradigmNoTag')}
                        </div>
                    )}
                </div>

                <div className="mt-2.5 border border-rule-10 bg-white/5 p-2.5">
                    <ActiveLensPanel result={result} screenMode={screenMode} youtubeEvaluation={youtubeEvaluation} />
                </div>

                <div className="mt-2.5 border-t border-rule-10 pt-2.5">
                    <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-2">{t('otherSignals')}</div>
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
                            <span className="border border-neg/40 bg-neg/10 px-2.5 py-1 text-xs font-extrabold text-neg">Macro</span>
                        )}
                        {paradigm?.pdm_flags?.includes('accelerating') && (
                            <span className="border border-pos/40 bg-pos/10 px-2.5 py-1 text-xs font-extrabold text-pos">Accel</span>
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
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-pos">
                        <ShieldCheck className="h-4 w-4" /> {t('strategyReverseTitle')}
                    </div>
                    <span className="font-mono text-sm font-extrabold text-ink">{reverse.rev_composite != null ? Math.round(reverse.rev_composite) : 'n/a'}</span>
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
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink-2">
                        <Layers3 className="h-4 w-4" /> {t('strategyParadigmTitle')}
                    </div>
                    <span className="font-mono text-sm font-extrabold text-ink">{paradigm.pdm_signal != null ? Math.round(paradigm.pdm_signal) : 'n/a'}</span>
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
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-neg">
                        <Youtube className="h-4 w-4" /> {t('strategyYoutubeTitle')}
                    </div>
                    <span className="truncate text-right text-sm font-extrabold text-ink" title={youtubeEvaluation.matchedStrategies.join(', ')}>
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
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-accent">
                    <Telescope className="h-4 w-4" /> {t('strategy100Title')}
                </div>
                <span className="font-mono text-sm font-extrabold text-ink">{Math.round(result.score)}</span>
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
        <div className="min-w-0 bg-page px-2.5 py-1.5">
            <div className="truncate text-[11px] font-bold uppercase tracking-wide text-ink-2">{label}</div>
            <div className="mt-0.5 truncate font-mono text-xs font-extrabold text-ink" title={String(value)}>{value}</div>
        </div>
    );
}

function EmptyLens({ icon, label, detail }: { icon: ReactNode; label: string; detail: string }) {
    return (
        <div className="border border-rule-10 bg-white/5 p-2.5">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink-2">
                {icon}
                <span>{label}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-2/75">{detail}</p>
        </div>
    );
}

function SignalChip({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'success' | 'warning' | 'primary' | 'muted' }) {
    return (
        <span className={clsx(
            "inline-flex items-center gap-1.5  border px-2.5 py-1 text-xs font-extrabold",
            tone === 'success' && "border-pos/40 bg-pos/10 text-pos",
            tone === 'warning' && "border-warn/40 bg-warn/10 text-warn",
            tone === 'primary' && "border-accent/40 bg-accent/10 text-accent",
            tone === 'muted' && "border-rule-10 bg-white/5 text-ink-2",
        )}>
            {icon}
            {label} {value}
        </span>
    );
}
