import { X, Activity, Sparkles, Layers3, ShieldCheck, Telescope, Youtube, History } from "lucide-react";
import { type ParadigmHistoryEvent, type ScreeningResult, QUANT_THRESHOLDS } from "@/lib/blueprint";
import { useLanguage } from "@/components/LanguageContext";
import { Rs2AnalysisPanel } from "./Rs2AnalysisPanel";
import { useState, type ReactNode } from "react";
import { Market, formatKoreanWon, formatTaiwanNTD } from "@/lib/data-service";
import clsx from "clsx";
import { YoutubeStrategyEvaluation, formatStrategyNumber } from "@/lib/youtube-strategy";

interface StockDetailModalProps {
    result: ScreeningResult;
    onClose: () => void;
    onAskGemini?: (ticker: string) => void;
    market?: Market;
    youtubeEvaluation?: YoutubeStrategyEvaluation;
    paradigmHistory?: ParadigmHistoryEvent[];
}

export function StockDetailModal({ result, onClose, onAskGemini, market = 'US', youtubeEvaluation, paradigmHistory = [] }: StockDetailModalProps) {
    const { t } = useLanguage();
    const { candidate, reasons, flags, score } = result;

    const [isExpanded, setIsExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<string>("rs2");

    // Password gate for Generate AI Prompt (same protection as the Deepseek flow).
    const [showAskPw, setShowAskPw] = useState(false);
    const [askPassword, setAskPassword] = useState("");
    const [askError, setAskError] = useState("");

    const handleGeneratePrompt = () => {
        if (askPassword !== "RSYS") { setAskError("Incorrect password"); return; }
        setShowAskPw(false);
        setAskPassword("");
        setAskError("");
        onAskGemini && onAskGemini(candidate.symbol);
    };

    const reverse = result.reverse;
    const paradigm = result.paradigm;
    const paradigmBand = paradigm?.pdm_band
        ? { high: "STRONG", mid: "SOLID", watch: "WATCH", skip: "PASS", no_data: "NO DATA" }[paradigm.pdm_band] || paradigm.pdm_band
        : "No tag";
    const paradigmBaselineEvent = paradigmHistory.find(isBaselineParadigmEvent);
    const paradigmRealHistory = paradigmHistory.filter(event => !isBaselineParadigmEvent(event));
    const youtubePrimary = youtubeEvaluation?.matchedStrategies[0] || "No match";
    const displayTicker = market === 'Korea' ? candidate.symbol.split('.')[0] : market === 'Taiwan' ? candidate.symbol : candidate.symbol.replace(/\.(NS|BO)$/, '');
    const displayName = market === 'Korea' || market === 'Taiwan' ? candidate.name : candidate.name || candidate.symbol;
    const marketCapDisplay = market === 'Korea'
        ? `${(candidate.marketCap / 1_000_000_000).toFixed(1)}B KRW`
        : market === 'Taiwan'
            ? formatTaiwanNTD(candidate.marketCap, 2)
            : `$${(candidate.marketCap / 1_000_000_000).toFixed(1)}B`;
    const priceDisplay = market === 'Korea'
        ? formatKoreanWon(candidate.price, 0)
        : market === 'Taiwan'
            ? formatTaiwanNTD(candidate.price, 2)
            : `$${Number(candidate.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const sectionLinks = [
        { id: "rs2", label: "RS2 Analysis" },
        { id: "quant", label: "Quant" },
        ...(paradigm && (paradigm.pdm_themes?.length > 0 || paradigm.pdm_signal != null) ? [{ id: "paradigm", label: "Paradigm" }] : []),
        ...(youtubeEvaluation && youtubeEvaluation.matchedStrategies.length > 0 ? [{ id: "youtube", label: "YouTube" }] : []),
        ...(reverse && reverse.rev_band && reverse.rev_band !== 'Excluded' ? [{ id: "reverse", label: "Reverse" }] : []),
    ];
    const quantRows = [
        {
            label: t('revGrowth'),
            value: market !== 'US' && candidate.revenueGrowth === 0 ? 'N/A' : `${Number(candidate.revenueGrowth).toFixed(1)}%`,
            target: `> ${QUANT_THRESHOLDS.MIN_REVENUE_GROWTH}%`,
            pass: market !== 'US' && candidate.revenueGrowth === 0 ? true : candidate.revenueGrowth >= QUANT_THRESHOLDS.MIN_REVENUE_GROWTH,
        },
        {
            label: t('roic'),
            value: market !== 'US' && candidate.roic === 0 ? 'N/A' : `${Number(candidate.roic).toFixed(1)}%`,
            target: `> ${QUANT_THRESHOLDS.MIN_ROIC}%`,
            pass: market !== 'US' && candidate.roic === 0 ? true : candidate.roic >= QUANT_THRESHOLDS.MIN_ROIC,
        },
        {
            label: t('grossMargin'),
            value: market !== 'US' && candidate.grossMargin === 0 ? 'N/A' : `${Number(candidate.grossMargin).toFixed(1)}%`,
            target: '> 30% / 50%',
            pass: market !== 'US' && candidate.grossMargin === 0 ? true : candidate.grossMargin >= 30,
        },
        {
            label: t('mcap'),
            value: market === 'Korea'
                ? `${(candidate.marketCap / 1_000_000_000).toFixed(1)}B KRW`
                : market === 'Taiwan'
                    ? formatTaiwanNTD(candidate.marketCap, 2)
                    : `$${(candidate.marketCap / 1e9).toFixed(1)}B`,
            target: market === 'Korea' ? '< 2.8T KRW' : market === 'Taiwan' ? '< 640B TWD' : '< $2B',
            pass: market === 'Korea'
                ? (candidate.marketCap / 1_000_000_000) <= 2800
                : market === 'Taiwan'
                    ? (candidate.marketCap / 100_000_000) <= 640
                    : candidate.marketCap <= QUANT_THRESHOLDS.MAX_MARKET_CAP,
            warning: market === 'Korea'
                ? (candidate.marketCap / 1_000_000_000) > 2800
                : market === 'Taiwan'
                    ? (candidate.marketCap / 100_000_000) > 640
                    : candidate.marketCap > QUANT_THRESHOLDS.MAX_MARKET_CAP,
        },
        {
            label: t('pegRatio'),
            value: market !== 'US' && candidate.pegRatio === 0 ? 'N/A' : `${Number(candidate.pegRatio).toFixed(1)}x`,
            target: `< ${QUANT_THRESHOLDS.MAX_PEG}`,
            pass: market !== 'US' && candidate.pegRatio === 0 ? true : candidate.pegRatio <= QUANT_THRESHOLDS.MAX_PEG,
        },
        {
            label: t('insiderOwn'),
            value: market !== 'US' && candidate.insiderOwnership === 0 ? 'N/A' : `${Number(candidate.insiderOwnership).toFixed(1)}%`,
            target: `> ${QUANT_THRESHOLDS.MIN_INSIDER_OWNERSHIP}%`,
            pass: market !== 'US' && candidate.insiderOwnership === 0 ? true : candidate.insiderOwnership >= QUANT_THRESHOLDS.MIN_INSIDER_OWNERSHIP,
        },
    ];
    const quantPassCount = quantRows.filter(row => row.pass).length;
    const quantWatchCount = quantRows.filter(row => !row.pass && row.warning).length;
    const quantFailCount = quantRows.length - quantPassCount - quantWatchCount;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-6xl max-h-[92vh] overflow-y-auto bg-card border border-border rounded-lg shadow-xl animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-3 sm:p-4 bg-card/95 backdrop-blur-xl border-b border-border">
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-col gap-1">
                            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                                <h2 className="truncate text-2xl font-black tracking-tight sm:text-2xl">
                                    {displayTicker}
                                </h2>
                                <span className="truncate text-sm font-semibold text-muted-foreground sm:border-l sm:border-border sm:px-2 sm:text-lg">
                                    {displayName}
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-sm text-primary/80 font-medium mt-1">
                                <span>{candidate.sector}</span>
                                <span className="text-muted-foreground">/</span>
                                <span>{result.industry || t('industry')}</span>
                                {candidate.lastUpdated && (
                                    <>
                                        <span className="text-muted-foreground">/</span>
                                        <span className="text-muted-foreground font-mono text-xs" title="Last Updated">
                                            Updated {candidate.lastUpdated}
                                        </span>
                                    </>
                                )}
                            </div>

                            <div className="mt-2 group">
                                <p className={clsx(
                                    "text-sm text-muted-foreground leading-relaxed transition-all duration-300",
                                    !isExpanded && (result.description || "").length > 120 ? "line-clamp-2" : ""
                                )}>
                                    {result.description || t('noDesc')}
                                </p>
                                {(result.description || "").length > 120 && (
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="text-xs font-bold text-primary hover:text-primary/80 mt-1 uppercase tracking-wider"
                                    >
                                        {isExpanded ? "Show Less" : "Read More"}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-2 rounded-md border border-border/60 bg-background/80 p-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Primary Actions</div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <a
                                        href={`https://www.tradingview.com/symbols/${candidate.symbol}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 rounded-md border border-[#2a2e39] bg-[#131722] px-3 py-2 text-white shadow-sm transition-all hover:bg-[#2a2e39]"
                                        title={t('openTV')}
                                    >
                                        <img src="https://www.google.com/s2/favicons?domain=tradingview.com&sz=32" alt="TV" className="h-4 w-4 rounded-sm" />
                                        <span className="text-sm font-bold">TradingView</span>
                                    </a>
                                    {showAskPw ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="password"
                                                placeholder="Password"
                                                value={askPassword}
                                                onChange={(e) => { setAskPassword(e.target.value); setAskError(""); }}
                                                onKeyDown={(e) => e.key === 'Enter' && handleGeneratePrompt()}
                                                autoFocus
                                                className="w-32 rounded-md border border-white/15 bg-background px-2 py-2 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                            />
                                            <button
                                                onClick={handleGeneratePrompt}
                                                className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-2 text-sm font-black text-emerald-950 transition-colors hover:bg-emerald-400"
                                            >
                                                <Sparkles className="h-4 w-4" /> Generate
                                            </button>
                                            <button
                                                onClick={() => { setShowAskPw(false); setAskPassword(""); setAskError(""); }}
                                                className="rounded-md border border-white/15 bg-white/5 px-2 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-white/10"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setShowAskPw(true)}
                                            className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 px-3 py-2 text-blue-600 shadow-sm transition-all hover:from-blue-500/20 hover:to-purple-500/20 dark:text-blue-400"
                                            title="Ask AI about this stock (password required)"
                                        >
                                            <Sparkles className="h-4 w-4" />
                                            <span className="text-sm font-bold">Generate AI Prompt</span>
                                        </button>
                                    )}
                                    {askError && <span className="text-xs font-bold text-red-400">{askError}</span>}
                                </div>
                            </div>
                            <div className={clsx("w-fit rounded-full px-3 py-1.5 text-xs font-black tracking-wide", result.passed ? "bg-success/20 text-success" : "bg-muted text-muted-foreground")}>
                                {result.passed ? "GEM CANDIDATE" : "REVIEWING"}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary transition-colors self-start" aria-label="Close stock scorecard">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-3 sm:p-4 lg:p-5 space-y-4">
                        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                            <QuoteMetric label="Price" value={priceDisplay} sub={selectedMarketLabel(market)} />
                            <QuoteMetric label="Market Cap" value={marketCapDisplay} sub={candidate.sector || "Unknown sector"} />
                            <QuoteMetric
                                label="Revenue Growth"
                                value={market !== 'US' && candidate.revenueGrowth === 0 ? "N/A" : `${Number(candidate.revenueGrowth || 0).toFixed(1)}%`}
                                sub="YoY screen input"
                                tone={Number(candidate.revenueGrowth || 0) >= 0 ? "positive" : "negative"}
                            />
                            <QuoteMetric
                                label="ROIC"
                                value={market !== 'US' && candidate.roic === 0 ? "N/A" : `${Number(candidate.roic || 0).toFixed(1)}%`}
                                sub="Capital efficiency"
                                tone={Number(candidate.roic || 0) >= QUANT_THRESHOLDS.MIN_ROIC ? "positive" : "muted"}
                            />
                        </div>

                        {/* Score & Synthesis */}
                        <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-secondary/25 p-3 sm:flex-row sm:items-center sm:p-4">
                            <div className="relative flex items-center justify-center h-16 w-16 shrink-0">
                                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                                    <path className="text-secondary" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                                    <path className={clsx(score > 80 ? "text-success" : score > 50 ? "text-warning" : "text-danger")} strokeDasharray={`${score}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center text-lg font-bold">
                                    {score}
                                </div>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <h4 className="text-base font-black">{t('blueprintAnalysis')}</h4>
                                    <span className={clsx(
                                        "w-fit rounded-md border px-2.5 py-1 text-xs font-black uppercase tracking-wider",
                                        result.passed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"
                                    )}>
                                        {result.passed ? "Gem candidate" : "Review required"}
                                    </span>
                                </div>
                                {result.passed ? (
                                    <p className="mt-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-sm font-semibold leading-relaxed text-emerald-300">
                                        {t('verdictPass')}
                                    </p>
                                ) : (
                                    <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-foreground">
                                        <div className="text-xs font-black uppercase tracking-wider text-red-400">Missed Criteria</div>
                                        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm font-normal text-foreground/80">
                                                {(result.failCodes && result.failCodes.length > 0) ? result.failCodes.map(code => {
                                                    const failReasonMap: Record<string, string> = {
                                                        FAIL_MCAP: market === 'Korea' 
                                                            ? "Market Cap outside 70B - 2.8T KRW range"
                                                                : market === 'Taiwan'
                                                                    ? "Market Cap outside 1.6B - 640B NTD range"
                                                                    : "Market Cap outside $50M - $2B range",
                                                        FAIL_PRICE: market === 'Korea' || market === 'Taiwan'
                                                                ? "Share Price too high" 
                                                                : "Share Price >= $25",
                                                        FAIL_GROWTH: "Revenue Growth < 20%",
                                                        FAIL_GM: "Gross margin below sector targets",
                                                        FAIL_GM_TREND: "Gross Margin declining vs 3-year avg",
                                                        FAIL_ROIC: "ROIC < 15%",
                                                        FAIL_PS: "Price/Sales ratio too high",
                                                        FAIL_PEG: "PEG ratio > 1.5",
                                                        FAIL_FLOAT: "Floating shares too high for small-cap play",
                                                        FAIL_INSIDER: "Insider Ownership < 15%"
                                                    };
                                                    return <li key={code}>{failReasonMap[code] || code}</li>;
                                                }) : (
                                                    <li>Failed strict Gem criteria.</li>
                                                )}
                                            </ul>
                                        </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <SignalOverviewCard
                                icon={<Layers3 className="h-4 w-4" />}
                                label="Paradigm"
                                value={paradigm?.pdm_signal != null ? Math.round(paradigm.pdm_signal) : "n/a"}
                                detail={paradigm?.pdm_theme_primary || paradigmBand}
                                tone="purple"
                            />
                            <SignalOverviewCard
                                icon={<ShieldCheck className="h-4 w-4" />}
                                label="Reverse"
                                value={reverse?.rev_composite != null ? Math.round(reverse.rev_composite) : "n/a"}
                                detail={reverse?.rev_band || "No score"}
                                tone="emerald"
                            />
                            <SignalOverviewCard
                                icon={<Telescope className="h-4 w-4" />}
                                label="100-Bagger"
                                value={Math.round(score)}
                                detail={result.passed ? "Pass" : "Review"}
                                tone="sky"
                            />
                            <SignalOverviewCard
                                icon={<Youtube className="h-4 w-4" />}
                                label="YouTube"
                                value={youtubeEvaluation?.matchedStrategies.length || 0}
                                detail={youtubePrimary}
                                tone="red"
                            />
                        </div>

                        <nav aria-label="Sections" className="sticky top-[168px] z-10 -mx-1 overflow-x-auto border-y border-border/60 bg-card/95 px-1 py-2.5 backdrop-blur-xl sm:top-[142px] lg:top-[128px]">
                            <div className="flex min-w-max gap-2">
                                {sectionLinks.map((section) => {
                                    const isActive = activeTab === section.id;
                                    return (
                                        <button
                                            key={section.id}
                                            type="button"
                                            onClick={() => setActiveTab(section.id)}
                                            className={clsx(
                                                "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-black transition-colors",
                                                isActive
                                                    ? "border-primary/60 bg-primary/15 text-primary"
                                                    : "border-border/60 bg-secondary/35 text-muted-foreground hover:border-primary/40 hover:bg-secondary/70 hover:text-foreground"
                                            )}
                                        >
                                            <span>{section.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </nav>

                        {/* RS2 local-LLM research + outcomes (primary analysis surface) */}
                        <div className={clsx("rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm sm:p-4", activeTab !== "rs2" && "hidden")}>
                            <Rs2AnalysisPanel symbol={candidate.symbol} displayTicker={displayTicker} />
                        </div>

                        {/* Phase 1: Quant Metrics */}
                        <div id="scorecard-quant" className={clsx("scroll-mt-28 rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm sm:p-4", activeTab !== "quant" && "hidden")}>
                            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <SectionHeading
                                    icon={<Activity className="h-4 w-4 text-primary" />}
                                    title={t('phase1')}
                                    body="Strict 100-bagger gates are shown as scan rows so the pass, watch, and fail states are easier to compare."
                                />
                                <div className="grid grid-cols-3 gap-2 sm:min-w-[16rem]">
                                    <StatusCount label="Pass" value={quantPassCount} tone="positive" />
                                    <StatusCount label="Watch" value={quantWatchCount} tone="warning" />
                                    <StatusCount label="Fail" value={quantFailCount} tone="negative" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {quantRows.map(row => (
                                    <DetailRow
                                        key={row.label}
                                        label={row.label}
                                        value={row.value}
                                        target={row.target}
                                        pass={row.pass}
                                        warning={row.warning}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* WS1: Paradigm Dimension Breakdown */}
                        {result.paradigm && (result.paradigm.pdm_themes?.length > 0 || result.paradigm.pdm_signal != null) && (
                            <div id="scorecard-paradigm" className={clsx("scroll-mt-28 rounded-lg border border-purple-500/25 bg-purple-500/[0.04] p-3 shadow-sm sm:p-4", activeTab !== "paradigm" && "hidden")}>
                                <div className="mb-3">
                                    <SectionHeading
                                        icon={<Layers3 className="h-4 w-4 text-purple-400" />}
                                        title="Paradigm Dimension"
                                        body="Secular-theme fit, momentum, and economics are shown first because they explain the stock's larger market setup."
                                    />
                                </div>
                                <MetricGroupLabel label="Theme rank" />
                                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <ReverseStat label="Signal" value={result.paradigm.pdm_signal != null ? result.paradigm.pdm_signal : 'n/a'} />
                                    <ReverseStat label="Band" value={result.paradigm.pdm_band || 'n/a'} band={result.paradigm.pdm_band} />
                                    <ReverseStat label="Primary Theme" value={result.paradigm.pdm_theme_primary || 'n/a'} />
                                    <ReverseStat label="Rank" value={result.paradigm.pdm_rank != null ? `#${result.paradigm.pdm_rank}` : 'n/a'} />
                                </div>
                                <MetricGroupLabel label="Signal drivers" />
                                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <ReverseStat label="Membership" value={result.paradigm.pdm_membership_score != null ? result.paradigm.pdm_membership_score : 'n/a'} />
                                    <ReverseStat label="Momentum" value={result.paradigm.pdm_momentum_score != null ? result.paradigm.pdm_momentum_score : 'n/a'} />
                                    <ReverseStat label="Economics Gate" value={result.paradigm.pdm_economics_gate != null ? result.paradigm.pdm_economics_gate : 'n/a'} />
                                    <ReverseStat label="Confidence" value={result.paradigm.pdm_confidence != null ? result.paradigm.pdm_confidence : 'n/a'} />
                                </div>
                                {paradigmBaselineEvent && (
                                    <div className="mb-3 rounded-md border border-purple-500/20 bg-background/25 p-3">
                                        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                                            <History className="h-4 w-4 text-purple-300" />
                                            Current baseline
                                        </div>
                                        <div className="flex flex-col gap-1 rounded-md border border-border/40 bg-secondary/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                            <span className="text-sm font-bold text-foreground">
                                                Entered Paradigm snapshot as {formatParadigmBand(paradigmBaselineEvent.to_band)}.
                                            </span>
                                            <span className="font-mono text-xs font-bold text-muted-foreground">{paradigmBaselineEvent.snapshot_date}</span>
                                        </div>
                                    </div>
                                )}
                                {paradigmRealHistory.length > 0 && (
                                    <div className="mb-3 rounded-md border border-purple-500/20 bg-background/25 p-3">
                                        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                                            <History className="h-4 w-4 text-purple-300" />
                                            Recent changes
                                        </div>
                                        <div className="space-y-2">
                                            {paradigmRealHistory.slice(0, 4).map(event => (
                                                <div key={`${event.run_id}-${event.summary}`} className="flex flex-col gap-1 rounded-md border border-border/40 bg-secondary/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                                    <span className="text-sm font-bold text-foreground">{formatParadigmHistoryEvent(event)}</span>
                                                    <span className="font-mono text-xs font-bold text-muted-foreground">{event.snapshot_date}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {result.paradigm.pdm_themes && result.paradigm.pdm_themes.length > 0 && (
                                    <div className="mb-3 rounded-md border border-purple-500/20 bg-background/25 p-3">
                                        <div className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">Matched themes</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {result.paradigm.pdm_themes.map((theme: string) => (
                                                <span key={theme} className="text-xs font-mono px-2 py-1 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                                    {theme}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {result.paradigm.pdm_flags && result.paradigm.pdm_flags.length > 0 && (
                                    <div className="mb-3 rounded-md border border-border/50 bg-background/25 p-3">
                                        <div className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">Advisory flags</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {result.paradigm.pdm_flags.map((flag: string) => {
                                                const isMacro = flag.startsWith('macro_');
                                                const isAccel = flag === 'accelerating' || flag === 'regime_shift_up';
                                                const isDecel = flag === 'decelerating' || flag === 'regime_shift_down';
                                                return (
                                                    <span key={flag} className={clsx(
                                                        "text-xs font-mono px-2 py-1 rounded border",
                                                        isMacro && "bg-red-500/15 text-red-400 border-red-500/40",
                                                        isAccel && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                                                        isDecel && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                                                        !isMacro && !isAccel && !isDecel && "bg-secondary/50 text-muted-foreground border-border/30",
                                                    )}>
                                                        {flag}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {result.paradigm.pdm_pro && (
                                    <InsightNote tone="positive" label="Pro" text={result.paradigm.pdm_pro} />
                                )}
                                {result.paradigm.pdm_con && (
                                    <InsightNote tone="caution" label="Con" text={result.paradigm.pdm_con} />
                                )}
                            </div>
                        )}

                        {youtubeEvaluation && youtubeEvaluation.matchedStrategies.length > 0 && (
                            <div id="scorecard-youtube" className={clsx("scroll-mt-28 rounded-lg border border-red-500/25 bg-red-500/[0.04] p-3 shadow-sm sm:p-4", activeTab !== "youtube" && "hidden")}>
                                <div className="mb-3">
                                    <SectionHeading
                                        icon={<Youtube className="h-4 w-4 text-red-300" />}
                                        title="YouTube Strategy Lens"
                                        body="Video-playbook matches, EPS state, valuation setup, and position-size guardrail in one compact view."
                                    />
                                </div>
                                <MetricGroupLabel label="Matched playbook" />
                                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <ReverseStat label="Primary Match" value={youtubeEvaluation.matchedStrategies[0]} />
                                    <ReverseStat label="Matches" value={youtubeEvaluation.matchedStrategies.length} />
                                    <ReverseStat label="Risk Tier" value={youtubeEvaluation.riskTier === 'standard' ? 'Standard' : 'Tiny'} />
                                    <ReverseStat label="Position Cap" value={youtubeEvaluation.maxPositionSize} />
                                </div>
                                <MetricGroupLabel label="Evidence inputs" />
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <ReverseStat label="EPS TTM" value={formatStrategyNumber(youtubeEvaluation.epsTtm)} />
                                    <ReverseStat label="Forward EPS" value={formatStrategyNumber(youtubeEvaluation.forwardEpsEstimate)} />
                                    <ReverseStat label="P/B" value={formatStrategyNumber(youtubeEvaluation.priceToBook)} />
                                    <ReverseStat label="Current P/E" value={formatStrategyNumber(youtubeEvaluation.currentPe)} />
                                </div>
                            </div>
                        )}

                        {/* Phase 9: Reverse Engine Breakdown */}
                        {result.reverse && result.reverse.rev_band && result.reverse.rev_band !== 'Excluded' && (
                            <div id="scorecard-reverse" className={clsx("scroll-mt-28 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3 shadow-sm sm:p-4", activeTab !== "reverse" && "hidden")}>
                                <div className="mb-3">
                                    <SectionHeading
                                        icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />}
                                        title="Reverse Engine"
                                        body="Composite ranking, archetype route, valuation margin, survivability, and impairment risk for the reverse-screening lens."
                                    />
                                </div>
                                <MetricGroupLabel label="Ranking" />
                                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <ReverseStat label="Composite" value={result.reverse.rev_composite != null ? Math.round(result.reverse.rev_composite) : 'n/a'} />
                                    <ReverseStat label="Band" value={result.reverse.rev_band || 'n/a'} band={result.reverse.rev_band} />
                                    <ReverseStat label="Archetype" value={result.reverse.rev_archetype || 'n/a'}
                                        sub={result.reverse.rev_archetype_secondary ? `to ${result.reverse.rev_archetype_secondary}` : undefined} />
                                    <ReverseStat label="Rank" value={result.reverse.rev_rank != null ? `#${result.reverse.rev_rank}` : 'n/a'} />
                                </div>
                                <MetricGroupLabel label="Score drivers" />
                                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <ReverseStat label="Quality" value={result.reverse.rev_quality != null ? result.reverse.rev_quality : 'n/a'} />
                                    <ReverseStat label="MoS" value={result.reverse.rev_mos != null ? Math.round(result.reverse.rev_mos) : 'n/a'} />
                                    <ReverseStat label="Survivability" value={result.reverse.rev_survivability != null ? result.reverse.rev_survivability : 'n/a'} />
                                    <ReverseStat label="Data Quality" value={result.reverse.rev_data_quality != null ? `${result.reverse.rev_data_quality}/5` : 'n/a'} />
                                </div>
                                <MetricGroupLabel label="Forward risk" />
                                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <ReverseStat label="CAGR Proxy" value={result.reverse.rev_cagr_proxy != null ? `${result.reverse.rev_cagr_proxy.toFixed(1)}%` : 'n/a'} />
                                    <ReverseStat label="Drawdown Proxy" value={result.reverse.rev_drawdown_proxy != null ? `${(result.reverse.rev_drawdown_proxy * 100).toFixed(1)}%` : 'n/a'} />
                                    <ReverseStat label="Efficiency" value={result.reverse.rev_efficiency != null ? `${result.reverse.rev_efficiency.toFixed(2)}x` : 'n/a'} />
                                    <ReverseStat label="Impairment Prob" value={result.reverse.rev_impairment_prob != null ? `${(result.reverse.rev_impairment_prob * 100).toFixed(0)}%` : 'n/a'}
                                        warn={result.reverse.rev_impairment_prob != null && result.reverse.rev_impairment_prob > 0.20} />
                                </div>
                                {result.reverse.rev_flags && (
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        {result.reverse.rev_flags.split(',').filter(f => f).map((flag: string) => (
                                            <span key={flag} className="text-xs font-mono px-2 py-1 rounded bg-secondary/50 text-muted-foreground border border-border/30">
                                                {flag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {result.reverse.rev_pro && (
                                    <InsightNote tone="positive" label="Pro" text={result.reverse.rev_pro} />
                                )}
                                {result.reverse.rev_con && (
                                    <InsightNote tone="caution" label="Con" text={result.reverse.rev_con} />
                                )}
                                {result.reverse.rev_nominated && (
                                    <div className="mt-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-md text-sm font-black text-amber-400 flex items-center gap-2">
                                        NOMINATED - queued for v3.2 deep-dive analysis
                                    </div>
                                )}
                            </div>
                        )}

                </div>
            </div>
        </div>
    );
}

function ReverseStat({ label, value, sub, band, warn }: { label: string; value: string | number; sub?: string; band?: string | null; warn?: boolean }) {
    return (
        <div className="min-w-0 rounded-lg border border-border/50 bg-secondary/20 p-3">
            <div className="truncate text-sm font-bold text-muted-foreground uppercase tracking-wider">{label}</div>
            <div className={clsx(
                "mt-1.5 break-words font-mono text-sm font-black leading-tight",
                band === 'High' && "text-emerald-400",
                band === 'Solid' && "text-blue-400",
                band === 'Watchlist' && "text-amber-400",
                band === 'Monitor' && "text-gray-400",
                warn && "text-amber-400",
            )} title={String(value)}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground/70 mt-1">{sub}</div>}
        </div>
    );
}

function MetricGroupLabel({ label }: { label: string }) {
    return (
        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            {label}
        </div>
    );
}

function InsightNote({ tone, label, text }: { tone: "positive" | "caution"; label: string; text: string }) {
    return (
        <div className={clsx(
            "mt-2 rounded-md border px-3 py-2 text-sm leading-relaxed",
            tone === "positive" && "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300",
            tone === "caution" && "border-amber-500/25 bg-amber-500/[0.06] text-amber-300",
        )}>
            <div className="text-xs font-black uppercase tracking-wider">{label}</div>
            <p className="mt-1 text-foreground/85">{text}</p>
        </div>
    );
}

function SectionHeading({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
    return (
        <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-lg font-black tracking-tight">
                {icon}
                {title}
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {body}
            </p>
        </div>
    );
}

function StatusCount({ label, value, tone }: { label: string; value: number; tone: "positive" | "warning" | "negative" }) {
    return (
        <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5 text-center">
            <div className={clsx(
                "font-mono text-lg font-black leading-none",
                tone === "positive" && "text-emerald-400",
                tone === "warning" && "text-amber-400",
                tone === "negative" && "text-red-400",
            )}>
                {value}
            </div>
            <div className="mt-1 text-xs font-black uppercase tracking-wider text-muted-foreground">
                {label}
            </div>
        </div>
    );
}

function SignalOverviewCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string | number; detail: string; tone: "purple" | "emerald" | "sky" | "red" }) {
    const toneClass = {
        purple: "border-purple-500/30 bg-purple-500/[0.06] text-purple-300",
        emerald: "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300",
        sky: "border-sky-500/30 bg-sky-500/[0.06] text-sky-300",
        red: "border-red-500/30 bg-red-500/[0.06] text-red-300",
    }[tone];

    return (
        <div className={clsx("rounded-md border p-3", toneClass)}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
                    {icon}
                    {label}
                </div>
                <div className="font-mono text-lg font-black text-foreground">{value}</div>
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-muted-foreground" title={detail}>
                {detail}
            </div>
        </div>
    );
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

function formatParadigmHistoryEvent(event: ParadigmHistoryEvent) {
    if (event.event_type === 'band_change') {
        return `Band ${formatParadigmBand(event.from_band)} -> ${formatParadigmBand(event.to_band)}`;
    }
    if (event.event_type === 'theme_change') {
        return `Theme ${event.from_theme_primary || 'none'} -> ${event.to_theme_primary || 'none'}`;
    }
    return `Signal ${event.from_signal ?? 'n/a'} -> ${event.to_signal ?? 'n/a'}`;
}

function formatParadigmBand(band: string | null) {
    if (!band) return 'NONE';
    return paradigmBandLabel[band] || band.toUpperCase();
}

function selectedMarketLabel(market: Market) {
    if (market === 'Korea') return 'Korea market';
    if (market === 'Taiwan') return 'Taiwan market';
    return 'US market';
}

function QuoteMetric({ label, value, sub, tone = "muted" }: { label: string; value: string; sub: string; tone?: "positive" | "negative" | "muted" }) {
    return (
        <div className="min-w-0 rounded-lg border border-border/60 bg-secondary/20 p-3 shadow-sm">
            <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={clsx(
                "mt-2 truncate font-mono text-lg font-black leading-none sm:text-2xl",
                tone === "positive" && "text-emerald-400",
                tone === "negative" && "text-red-400",
                tone === "muted" && "text-foreground",
            )} title={value}>
                {value}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-muted-foreground" title={sub}>{sub}</div>
        </div>
    );
}

function DetailRow({ label, value, target, pass, warning }: { label: string, value: string | number, target: string, pass: boolean, warning?: boolean }) {
    const { t } = useLanguage();
    const statusLabel = pass ? t('pass') : warning ? t('watch') : t('fail');

    return (
        <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-secondary/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <div className="text-sm font-semibold text-muted-foreground">{label}</div>
                <div className="mt-0.5 truncate font-mono text-sm font-black" title={String(value)}>{value}</div>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                <div className="rounded-md border border-border/60 bg-background/35 px-3 py-1.5 text-sm font-bold text-muted-foreground">
                    {t('target')}: {target}
                </div>
                <div className={clsx(
                    "rounded-md border px-2.5 py-1 text-xs font-black uppercase tracking-wider",
                    pass && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                    warning && !pass && "border-amber-500/30 bg-amber-500/10 text-amber-400",
                    !pass && !warning && "border-red-500/30 bg-red-500/10 text-red-400",
                )}>
                    {statusLabel}
                </div>
            </div>
        </div>
    )
}
