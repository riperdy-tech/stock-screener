import { X, Activity, Sparkles, Layers3, ShieldCheck, Telescope, Youtube } from "lucide-react";
import { type ScreeningResult, QUANT_THRESHOLDS } from "@/lib/blueprint";
import { useLanguage } from "@/components/LanguageContext";
import ReactMarkdown from "react-markdown";
import { useEffect, useState, type ReactNode } from "react";
import { Market, formatKoreanWon, formatTaiwanNTD } from "@/lib/data-service";
import { supabase } from "@/lib/supabase";
import clsx from "clsx";
import { YoutubeStrategyEvaluation, formatStrategyNumber } from "@/lib/youtube-strategy";

interface StockDetailModalProps {
    result: ScreeningResult;
    onClose: () => void;
    onAskGemini?: (ticker: string) => void;
    market?: Market;
    youtubeEvaluation?: YoutubeStrategyEvaluation;
}

export function StockDetailModal({ result, onClose, onAskGemini, market = 'US', youtubeEvaluation }: StockDetailModalProps) {
    const { t } = useLanguage();
    const { candidate, reasons, flags, score } = result;

    const [savedReport, setSavedReport] = useState<any>(null);
    const [reportHistory, setReportHistory] = useState<any[]>([]);
    const [showReports, setShowReports] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const checkReport = async () => {
            const basePath = '';
            let fileReport: any = null;
            let dbReport: any = null;

            // 1. Check Static File (Local/Pushed)
            try {
                const res = await fetch(`${basePath}/data/reports/${candidate.symbol}.json?t=${new Date().getTime()}`);
                if (res.ok) fileReport = await res.json();
            } catch (e) {}

            // 2. Check Supabase Database (Live/Cloud)
            try {
                const { data, error } = await supabase
                    .from('ai_reports')
                    .select('*')
                    .eq('ticker', candidate.symbol)
                    .order('created_at', { ascending: false });
                
                if (data && data.length > 0 && !error) {
                    setReportHistory(data);
                    const latestDb = {
                        ...data[0],
                        timestamp: data[0].created_at
                    };
                    dbReport = latestDb;
                }
            } catch (e) {}

            // 3. Compare and Choose the Latest
            if (isMounted) {
                let latest = null;
                if (fileReport && dbReport) {
                    // Show whichever is newer
                    const fileTime = new Date(fileReport.timestamp).getTime();
                    const dbTime = new Date(dbReport.timestamp).getTime();
                    latest = dbTime > fileTime ? dbReport : fileReport;
                } else {
                    latest = dbReport || fileReport;
                }

                if (latest) {
                    setSavedReport((prev: any) => {
                        if (!prev || prev.timestamp !== latest.timestamp) {
                            return latest;
                        }
                        return prev;
                    });
                }
            }
        };
        
        checkReport();
        const interval = setInterval(checkReport, 5000); // Check every 5 seconds

    return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [candidate.symbol]);


    const downloadDsResult = () => {
        if (!savedReport) return;
        const text = `Date: ${savedReport.timestamp}\nCost: $${savedReport.cost}\n\n${savedReport.content}`;
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${candidate.symbol}_deepseek_report.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const copyDsResult = () => {
        if (!savedReport) return;
        navigator.clipboard.writeText(savedReport.content);
        alert("Copied!");
    };

    const reverse = result.reverse;
    const paradigm = result.paradigm;
    const paradigmBand = paradigm?.pdm_band
        ? { high: "STRONG", mid: "SOLID", watch: "WATCH", skip: "PASS", no_data: "NO DATA" }[paradigm.pdm_band] || paradigm.pdm_band
        : "No tag";
    const youtubePrimary = youtubeEvaluation?.matchedStrategies[0] || "No match";
    const sectionLinks = [
        { id: "quant", label: "Quant" },
        { id: "reports", label: "Reports" },
        ...(paradigm && (paradigm.pdm_themes?.length > 0 || paradigm.pdm_signal != null) ? [{ id: "paradigm", label: "Paradigm" }] : []),
        ...(youtubeEvaluation && youtubeEvaluation.matchedStrategies.length > 0 ? [{ id: "youtube", label: "YouTube" }] : []),
        ...(reverse && reverse.rev_band && reverse.rev_band !== 'Excluded' ? [{ id: "reverse", label: "Reverse" }] : []),
        ...(savedReport ? [{ id: "ai-report", label: "AI Report" }] : []),
    ];

    const scrollToSection = (id: string) => {
        document.getElementById(`scorecard-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-6xl max-h-[92vh] overflow-y-auto bg-card border border-border rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-4 sm:p-6 bg-card/95 backdrop-blur-xl border-b border-border">
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl sm:text-4xl font-black truncate">
                                    {market === 'Korea' ? candidate.name : market === 'Taiwan' ? candidate.name : candidate.symbol.replace(/\.(NS|BO)$/, '')}
                                </h2>
                                <span className="text-base sm:text-2xl text-muted-foreground font-medium px-2 border-l border-border truncate">
                                    {market === 'Korea' ? candidate.symbol.split('.')[0] : market === 'Taiwan' ? candidate.symbol : candidate.name}
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-base sm:text-lg text-primary/80 font-medium mt-1">
                                <span>{candidate.sector}</span>
                                <span className="text-muted-foreground">/</span>
                                <span>{result.industry || t('industry')}</span>
                                {candidate.lastUpdated && (
                                    <>
                                        <span className="text-muted-foreground">/</span>
                                        <span className="text-muted-foreground font-mono text-base" title="Last Updated">
                                            Updated {candidate.lastUpdated}
                                        </span>
                                    </>
                                )}
                            </div>

                            <div className="mt-2 group">
                                <p className={clsx(
                                    "text-base text-muted-foreground leading-relaxed transition-all duration-300",
                                    !isExpanded && (result.description || "").length > 120 ? "line-clamp-2" : ""
                                )}>
                                    {result.description || t('noDesc')}
                                </p>
                                {(result.description || "").length > 120 && (
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="text-base font-bold text-primary hover:text-primary/80 mt-1 uppercase tracking-wider"
                                    >
                                        {isExpanded ? "Show Less" : "Read More"}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                            {/* External Links */}
                            <div className="flex flex-wrap items-center gap-2">
                                <a
                                    href={`https://www.tradingview.com/symbols/${candidate.symbol}/`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 rounded-md border border-[#2a2e39] bg-[#131722] px-4 py-2.5 text-white shadow-sm transition-all hover:bg-[#2a2e39]"
                                    title={t('openTV')}
                                >
                                    <img src="https://www.google.com/s2/favicons?domain=tradingview.com&sz=32" alt="TV" className="h-5 w-5 rounded-sm" />
                                    <span className="text-base font-bold">TradingView</span>
                                </a>
                                <button
                                    onClick={() => onAskGemini && onAskGemini(candidate.symbol)}
                                    className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 px-4 py-2.5 text-blue-600 shadow-sm transition-all hover:from-blue-500/20 hover:to-purple-500/20 dark:text-blue-400"
                                    title="Ask AI about this stock"
                                >
                                    <Sparkles className="h-5 w-5" />
                                    <span className="text-base font-bold">Generate AI Prompt</span>
                                </button>
                            </div>
                            <div className={clsx("w-fit rounded-full px-4 py-2 text-base font-bold tracking-wide", result.passed ? "bg-success/20 text-success" : "bg-muted text-muted-foreground")}>
                                {result.passed ? "GEM CANDIDATE" : "REVIEWING"}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary transition-colors self-start">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-4 sm:p-6 lg:p-8 space-y-8">

                        {/* Score & Synthesis */}
                        <div className="flex flex-col gap-5 rounded-xl border border-border/50 bg-secondary/25 p-5 sm:flex-row sm:items-center sm:p-6">
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
                                <h4 className="text-xl font-black mb-1">{t('blueprintAnalysis')}</h4>
                                <div className={clsx("text-base font-medium", result.passed ? "text-success" : "text-danger")}>
                                    {result.passed
                                        ? t('verdictPass')
                                        : (
                                        <div className="mt-2 text-foreground">
                                            <span className="font-bold text-danger">Missed Criteria:</span>
                                            <ul className="list-disc pl-5 mt-2 text-base text-foreground/80 font-normal space-y-1.5">
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

                        <nav className="sticky top-[112px] z-10 -mx-1 overflow-x-auto border-y border-border/60 bg-card/90 px-1 py-2 backdrop-blur-xl">
                            <div className="flex min-w-max gap-2">
                                {sectionLinks.map((section) => (
                                    <button
                                        key={section.id}
                                        type="button"
                                        onClick={() => scrollToSection(section.id)}
                                        className="rounded-md border border-border/60 bg-secondary/30 px-3.5 py-2 text-base font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                                    >
                                        {section.label}
                                    </button>
                                ))}
                            </div>
                        </nav>

                        {/* Phase 1: Quant Metrics */}
                        <div id="scorecard-quant" className="scroll-mt-36 rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm">
                            <h3 className="text-2xl font-black mb-4 flex items-center gap-2">
                                <Activity className="h-5 w-5 text-primary" /> {t('phase1')}
                            </h3>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <DetailRow label={t('revGrowth')} value={market !== 'US' && candidate.revenueGrowth === 0 ? 'N/A' : `${Number(candidate.revenueGrowth).toFixed(1)}%`} target={`> ${QUANT_THRESHOLDS.MIN_REVENUE_GROWTH}%`} pass={market !== 'US' && candidate.revenueGrowth === 0 ? true : candidate.revenueGrowth >= QUANT_THRESHOLDS.MIN_REVENUE_GROWTH} />
                                <DetailRow label={t('roic')} value={market !== 'US' && candidate.roic === 0 ? 'N/A' : `${Number(candidate.roic).toFixed(1)}%`} target={`> ${QUANT_THRESHOLDS.MIN_ROIC}%`} pass={market !== 'US' && candidate.roic === 0 ? true : candidate.roic >= QUANT_THRESHOLDS.MIN_ROIC} />
                                <DetailRow label={t('grossMargin')} value={market !== 'US' && candidate.grossMargin === 0 ? 'N/A' : `${Number(candidate.grossMargin).toFixed(1)}%`} target={`> 30% / 50%`} pass={market !== 'US' && candidate.grossMargin === 0 ? true : candidate.grossMargin >= 30} />
                                <DetailRow 
                                    label={t('mcap')} 
                                    value={market === 'Korea' 
                                        ? `${(candidate.marketCap / 1_000_000_000).toFixed(1)}B KRW`
                                        : market === 'Taiwan'
                                                ? formatTaiwanNTD(candidate.marketCap, 2)
                                                : `$${(candidate.marketCap / 1e9).toFixed(1)}B`
                                    } 
                                    target={market === 'Korea' ? '< 2.8T KRW' : market === 'Taiwan' ? '< 640B TWD' : '< $2B'}
                                    pass={market === 'Korea' ? (candidate.marketCap / 1_000_000_000) <= 2800 : market === 'Taiwan' ? (candidate.marketCap / 100_000_000) <= 640 : candidate.marketCap <= QUANT_THRESHOLDS.MAX_MARKET_CAP} 
                                    warning={market === 'Korea' ? (candidate.marketCap / 1_000_000_000) > 2800 : market === 'Taiwan' ? (candidate.marketCap / 100_000_000) > 640 : candidate.marketCap > QUANT_THRESHOLDS.MAX_MARKET_CAP} 
                                />
                                <DetailRow label={t('pegRatio')} value={market !== 'US' && candidate.pegRatio === 0 ? 'N/A' : `${Number(candidate.pegRatio).toFixed(1)}x`} target={`< ${QUANT_THRESHOLDS.MAX_PEG}`} pass={market !== 'US' && candidate.pegRatio === 0 ? true : candidate.pegRatio <= QUANT_THRESHOLDS.MAX_PEG} />
                                <DetailRow label={t('insiderOwn')} value={market !== 'US' && candidate.insiderOwnership === 0 ? 'N/A' : `${Number(candidate.insiderOwnership).toFixed(1)}%`} target={`> ${QUANT_THRESHOLDS.MIN_INSIDER_OWNERSHIP}%`} pass={market !== 'US' && candidate.insiderOwnership === 0 ? true : candidate.insiderOwnership >= QUANT_THRESHOLDS.MIN_INSIDER_OWNERSHIP} />
                            </div>
                        </div>

                                                {/* REPORTS Action Section - Made prominent and sticky-friendly */}
                        <div id="scorecard-reports" className="scroll-mt-36 rounded-xl border border-border/60 bg-card/60 p-5 shadow-sm">
                            <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
                            <button 
                                onClick={() => setShowReports(!showReports)}
                                className={clsx(
                                    "flex w-full items-center justify-center gap-2 rounded-xl border-2 px-8 py-3.5 text-base font-black shadow-lg transition-all active:scale-95 sm:w-auto",
                                    showReports 
                                        ? "bg-primary text-primary-foreground border-primary" 
                                        : "bg-gradient-to-r from-secondary to-secondary/80 hover:from-secondary/80 hover:to-secondary text-foreground border-border/50"
                                )}
                            >
                                <Activity className="h-5 w-5" />
                                {showReports ? "CLOSE ANALYSIS" : "VIEW REPORTS"}
                            </button>
                            <div className="flex flex-col items-center sm:items-start">
                                <span className="text-base font-bold uppercase tracking-widest text-muted-foreground">
                                    Analysis History
                                </span>
                                <span className="font-mono text-lg font-bold text-primary">
                                    {reportHistory.length} Cloud Records Found
                                </span>
                            </div>
                            </div>
                        </div>

                        {showReports && (
                            <div className="bg-secondary/20 rounded-xl border border-border p-4 animate-in slide-in-from-top-2 duration-300">
                                <h3 className="text-base font-bold uppercase tracking-wider mb-3 text-muted-foreground flex items-center gap-2">
                                    <Sparkles className="h-4 w-4" /> AI Research History
                                </h3>
                                <div className="space-y-3">
                                    {reportHistory.length === 0 ? (
                                        <div className="text-base text-muted-foreground p-4 text-center border border-dashed border-border rounded-lg">
                                            No AI reports found for this stock yet.
                                        </div>
                                    ) : reportHistory.map((report, idx) => (
                                        <div 
                                            key={report.created_at} 
                                            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-base font-bold">Deepseek V4-Pro Analysis</span>
                                                <span className="text-base text-muted-foreground font-mono">
                                                    {new Date(report.created_at).toLocaleString()} | Cost: ${report.cost || '0.00'}
                                                </span>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    setSavedReport({...report, timestamp: report.created_at});
                                                    setShowReports(false);
                                                }}
                                                className="w-full rounded bg-primary/10 px-3.5 py-2.5 text-base font-bold text-primary group-hover:underline sm:w-auto"
                                            >
                                                OPEN REPORT
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* WS1: Paradigm Dimension Breakdown */}
                        {result.paradigm && (result.paradigm.pdm_themes?.length > 0 || result.paradigm.pdm_signal != null) && (
                            <div id="scorecard-paradigm" className="scroll-mt-36 rounded-xl border border-purple-500/25 bg-purple-500/[0.04] p-5 shadow-sm">
                                <h3 className="text-2xl font-black mb-4 flex items-center gap-2 text-purple-400">
                                    <Activity className="h-5 w-5" /> Paradigm Dimension (Secular Themes)
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                    <ReverseStat label="Signal" value={result.paradigm.pdm_signal != null ? result.paradigm.pdm_signal : 'n/a'} />
                                    <ReverseStat label="Band" value={result.paradigm.pdm_band || 'n/a'} band={result.paradigm.pdm_band} />
                                    <ReverseStat label="Primary Theme" value={result.paradigm.pdm_theme_primary || 'n/a'} />
                                    <ReverseStat label="Rank" value={result.paradigm.pdm_rank != null ? `#${result.paradigm.pdm_rank}` : 'n/a'} />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                    <ReverseStat label="Membership" value={result.paradigm.pdm_membership_score != null ? result.paradigm.pdm_membership_score : 'n/a'} />
                                    <ReverseStat label="Momentum" value={result.paradigm.pdm_momentum_score != null ? result.paradigm.pdm_momentum_score : 'n/a'} />
                                    <ReverseStat label="Economics Gate" value={result.paradigm.pdm_economics_gate != null ? result.paradigm.pdm_economics_gate : 'n/a'} />
                                    <ReverseStat label="Confidence" value={result.paradigm.pdm_confidence != null ? result.paradigm.pdm_confidence : 'n/a'} />
                                </div>
                                {result.paradigm.pdm_themes && result.paradigm.pdm_themes.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        <span className="text-base font-bold text-muted-foreground mr-1">Themes:</span>
                                        {result.paradigm.pdm_themes.map((theme: string) => (
                                            <span key={theme} className="text-base font-mono px-3 py-1.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                                {theme}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {result.paradigm.pdm_flags && result.paradigm.pdm_flags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        <span className="text-base font-bold text-muted-foreground mr-1">Flags:</span>
                                        {result.paradigm.pdm_flags.map((flag: string) => {
                                            const isMacro = flag.startsWith('macro_');
                                            const isAccel = flag === 'accelerating' || flag === 'regime_shift_up';
                                            const isDecel = flag === 'decelerating' || flag === 'regime_shift_down';
                                            return (
                                                <span key={flag} className={clsx(
                                                    "text-base font-mono px-3 py-1.5 rounded border",
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
                                )}
                                {result.paradigm.pdm_pro && (
                                    <div className="text-base text-emerald-400/80 mb-1 flex items-start gap-1">
                                        <span className="font-bold shrink-0">Pro:</span> {result.paradigm.pdm_pro}
                                    </div>
                                )}
                                {result.paradigm.pdm_con && (
                                    <div className="text-base text-amber-400/80 flex items-start gap-1">
                                        <span className="font-bold shrink-0">Con:</span> {result.paradigm.pdm_con}
                                    </div>
                                )}
                            </div>
                        )}

                        {youtubeEvaluation && youtubeEvaluation.matchedStrategies.length > 0 && (
                            <div id="scorecard-youtube" className="scroll-mt-36 rounded-xl border border-red-500/25 bg-red-500/[0.04] p-5 shadow-sm">
                                <h3 className="text-2xl font-black mb-4 flex items-center gap-2 text-red-300">
                                    <Activity className="h-5 w-5" /> YouTube Strategy Lens
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                    <ReverseStat label="Primary Match" value={youtubeEvaluation.matchedStrategies[0]} />
                                    <ReverseStat label="Matches" value={youtubeEvaluation.matchedStrategies.length} />
                                    <ReverseStat label="Risk Tier" value={youtubeEvaluation.riskTier === 'standard' ? 'Standard' : 'Tiny'} />
                                    <ReverseStat label="Position Cap" value={youtubeEvaluation.maxPositionSize} />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <ReverseStat label="EPS TTM" value={formatStrategyNumber(youtubeEvaluation.epsTtm)} />
                                    <ReverseStat label="Forward EPS" value={formatStrategyNumber(youtubeEvaluation.forwardEpsEstimate)} />
                                    <ReverseStat label="P/B" value={formatStrategyNumber(youtubeEvaluation.priceToBook)} />
                                    <ReverseStat label="Current P/E" value={formatStrategyNumber(youtubeEvaluation.currentPe)} />
                                </div>
                            </div>
                        )}

                        {/* Phase 9: Reverse Engine Breakdown */}
                        {result.reverse && result.reverse.rev_band && result.reverse.rev_band !== 'Excluded' && (
                            <div id="scorecard-reverse" className="scroll-mt-36 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-5 shadow-sm">
                                <h3 className="text-2xl font-black mb-4 flex items-center gap-2 text-emerald-400">
                                    <Activity className="h-5 w-5" /> Reverse Engine (v1.2)
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                    <ReverseStat label="Composite" value={result.reverse.rev_composite != null ? Math.round(result.reverse.rev_composite) : 'n/a'} />
                                    <ReverseStat label="Band" value={result.reverse.rev_band || 'n/a'} band={result.reverse.rev_band} />
                                    <ReverseStat label="Archetype" value={result.reverse.rev_archetype || 'n/a'}
                                        sub={result.reverse.rev_archetype_secondary ? `to ${result.reverse.rev_archetype_secondary}` : undefined} />
                                    <ReverseStat label="Rank" value={result.reverse.rev_rank != null ? `#${result.reverse.rev_rank}` : 'n/a'} />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                    <ReverseStat label="Quality" value={result.reverse.rev_quality != null ? result.reverse.rev_quality : 'n/a'} />
                                    <ReverseStat label="MoS" value={result.reverse.rev_mos != null ? Math.round(result.reverse.rev_mos) : 'n/a'} />
                                    <ReverseStat label="Survivability" value={result.reverse.rev_survivability != null ? result.reverse.rev_survivability : 'n/a'} />
                                    <ReverseStat label="Data Quality" value={result.reverse.rev_data_quality != null ? `${result.reverse.rev_data_quality}/5` : 'n/a'} />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                    <ReverseStat label="CAGR Proxy" value={result.reverse.rev_cagr_proxy != null ? `${result.reverse.rev_cagr_proxy.toFixed(1)}%` : 'n/a'} />
                                    <ReverseStat label="Drawdown Proxy" value={result.reverse.rev_drawdown_proxy != null ? `${(result.reverse.rev_drawdown_proxy * 100).toFixed(1)}%` : 'n/a'} />
                                    <ReverseStat label="Efficiency" value={result.reverse.rev_efficiency != null ? `${result.reverse.rev_efficiency.toFixed(2)}x` : 'n/a'} />
                                    <ReverseStat label="Impairment Prob" value={result.reverse.rev_impairment_prob != null ? `${(result.reverse.rev_impairment_prob * 100).toFixed(0)}%` : 'n/a'}
                                        warn={result.reverse.rev_impairment_prob != null && result.reverse.rev_impairment_prob > 0.20} />
                                </div>
                                {result.reverse.rev_flags && (
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        {result.reverse.rev_flags.split(',').filter(f => f).map((flag: string) => (
                                            <span key={flag} className="text-base font-mono px-3 py-1.5 rounded bg-secondary/50 text-muted-foreground border border-border/30">
                                                {flag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {result.reverse.rev_pro && (
                                    <div className="text-base text-emerald-400/80 mb-1 flex items-start gap-1">
                                        <span className="font-bold shrink-0">Pro:</span> {result.reverse.rev_pro}
                                    </div>
                                )}
                                {result.reverse.rev_con && (
                                    <div className="text-base text-amber-400/80 flex items-start gap-1">
                                        <span className="font-bold shrink-0">Con:</span> {result.reverse.rev_con}
                                    </div>
                                )}
                                {result.reverse.rev_nominated && (
                                    <div className="mt-3 px-3.5 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-base font-black text-amber-400 flex items-center gap-2">
                                        NOMINATED - queued for v3.2 deep-dive analysis
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Deepseek AI Report */}
                        {savedReport && (
                            <div id="scorecard-ai-report" className="scroll-mt-36 rounded-xl border border-blue-500/25 bg-blue-500/[0.04] p-5 shadow-sm">
                                <h3 className="text-2xl font-black mb-4 flex items-center gap-2 text-blue-400">
                                    <Sparkles className="h-5 w-5" /> AI Valuation Report (Deepseek V4.0 Pro)
                                </h3>
                                <div className="bg-[#1a1f2e] border border-blue-500/30 rounded-xl overflow-hidden flex flex-col shadow-inner">
                                    <div className="flex shrink-0 flex-col gap-3 border-b border-blue-500/20 bg-blue-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="text-base leading-relaxed text-muted-foreground">
                                            Generated on: {new Date(savedReport.timestamp).toLocaleString()} | Cost: ${savedReport.cost} | Tokens: {savedReport.usage?.total_tokens}
                                        </span>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button onClick={downloadDsResult} className="flex items-center gap-1 rounded-md border border-border bg-secondary px-3.5 py-2.5 text-base font-semibold shadow-sm transition-colors hover:bg-secondary/80">Download .txt</button>
                                            <button onClick={copyDsResult} className="flex items-center gap-1 rounded-md bg-[#4d6bfe] px-3.5 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#3b54d1]">Copy Result</button>
                                        </div>
                                    </div>
                                    <div className="p-5 overflow-y-auto max-h-[600px] custom-scrollbar">
                                        <div className="prose prose-invert prose-lg max-w-none text-foreground/90 leading-relaxed prose-headings:text-foreground prose-p:text-base prose-p:leading-8 prose-li:text-base prose-li:leading-8 prose-a:text-blue-400">
                                            <ReactMarkdown>
                                                {savedReport.content}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                </div>
            </div>
        </div>
    );
}

function ReverseStat({ label, value, sub, band, warn }: { label: string; value: string | number; sub?: string; band?: string | null; warn?: boolean }) {
    return (
        <div className="rounded-lg border border-border/50 bg-secondary/20 p-4">
            <div className="text-base font-bold text-muted-foreground uppercase tracking-wider">{label}</div>
            <div className={clsx(
                "mt-1.5 font-mono text-xl font-black leading-tight",
                band === 'High' && "text-emerald-400",
                band === 'Solid' && "text-blue-400",
                band === 'Watchlist' && "text-amber-400",
                band === 'Monitor' && "text-gray-400",
                warn && "text-amber-400",
            )}>{value}</div>
            {sub && <div className="text-base text-muted-foreground/70 mt-1">{sub}</div>}
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
        <div className={clsx("rounded-lg border p-5", toneClass)}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-base font-black uppercase tracking-wider">
                    {icon}
                    {label}
                </div>
                <div className="font-mono text-2xl font-black text-foreground">{value}</div>
            </div>
            <div className="mt-2 truncate text-base font-semibold text-muted-foreground" title={detail}>
                {detail}
            </div>
        </div>
    );
}

function DetailRow({ label, value, target, pass, warning }: { label: string, value: string | number, target: string, pass: boolean, warning?: boolean }) {
    const { t } = useLanguage();

    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-secondary/20 p-4">
            <div>
                <div className="text-base font-semibold text-muted-foreground">{label}</div>
                <div className="mt-0.5 font-mono text-xl font-black">{value}</div>
            </div>
            <div className="text-right">
                <div className="text-base opacity-70">{t('target')}: {target}</div>
                <div className={clsx("text-base font-bold", pass ? "text-success" : warning ? "text-warning" : "text-danger")}>
                    {pass ? t('pass') : warning ? t('watch') : t('fail')}
                </div>
            </div>
        </div>
    )
}
