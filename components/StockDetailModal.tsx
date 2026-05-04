import { X, Activity, AlertOctagon, Sparkles } from "lucide-react";
import { type ScreeningResult, QUANT_THRESHOLDS } from "@/lib/blueprint";
import { useLanguage } from "@/components/LanguageContext";
import ReactMarkdown from "react-markdown";
import { useEffect, useState } from "react";
import { Market, formatKoreanWon, formatTaiwanNTD } from "@/lib/data-service";
import clsx from "clsx";

interface StockDetailModalProps {
    result: ScreeningResult;
    onClose: () => void;
    onAskGemini?: (ticker: string) => void;
    market?: Market;
}

export function StockDetailModal({ result, onClose, onAskGemini, market = 'US' }: StockDetailModalProps) {
    const { t } = useLanguage();
    const { candidate, reasons, flags, score } = result;

    const [savedReport, setSavedReport] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;
        const checkReport = () => {
            const basePath = process.env.NODE_ENV === 'production' ? '/stock-screener' : '';
            fetch(`${basePath}/data/reports/${candidate.symbol}.json?t=${new Date().getTime()}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error("Not found");
                })
                .then(data => {
                    if (isMounted) {
                        setSavedReport((prev: any) => {
                            if (!prev || prev.timestamp !== data.timestamp) {
                                return data;
                            }
                            return prev;
                        });
                    }
                })
                .catch(() => {
                    // Ignore 404s while polling
                });
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-card border-b border-border">
                    <div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                                <h2 className="text-3xl font-bold">
                                    {market === 'Korea' ? candidate.name : market === 'Taiwan' ? candidate.name : candidate.symbol.replace(/\.(NS|BO)$/, '')}
                                </h2>
                                <span className="text-xl text-muted-foreground font-light px-2 border-l border-border">
                                    {market === 'Korea' ? candidate.symbol.split('.')[0] : market === 'Taiwan' ? candidate.symbol : candidate.name}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-primary/80 font-medium mt-1">
                                <span>{candidate.sector}</span>
                                <span className="text-muted-foreground">•</span>
                                <span>{result.industry || t('industry')}</span>
                                {candidate.lastUpdated && (
                                    <>
                                        <span className="text-muted-foreground">•</span>
                                        <span className="text-muted-foreground font-mono text-xs" title="Last Updated">
                                            ↻ {candidate.lastUpdated}
                                        </span>
                                    </>
                                )}
                            </div>

                            <p className="text-xs text-muted-foreground mt-2 max-w-2xl leading-relaxed">
                                {result.description || t('noDesc')}
                            </p>
                        </div>

                        <div className="flex items-center gap-4 mt-4">
                            {/* External Links */}
                            <div className="flex items-center gap-2">
                                <a
                                    href={`https://www.tradingview.com/symbols/${candidate.symbol}/`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#131722] hover:bg-[#2a2e39] text-white transition-all shadow-sm border border-[#2a2e39]"
                                    title={t('openTV')}
                                >
                                    <img src="https://www.google.com/s2/favicons?domain=tradingview.com&sz=32" alt="TV" className="w-4 h-4 rounded-sm" />
                                    <span className="text-xs font-bold hidden sm:inline">TradingView</span>
                                </a>
                                <button
                                    onClick={() => onAskGemini && onAskGemini(candidate.symbol)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gradient-to-r from-blue-500/10 to-purple-500/10 hover:from-blue-500/20 hover:to-purple-500/20 text-blue-600 dark:text-blue-400 transition-all shadow-sm border border-blue-500/20"
                                    title="Ask AI about this stock"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    <span className="text-xs font-bold hidden sm:inline">Generate AI Prompt</span>
                                </button>
                            </div>
                            <div className={clsx("px-3 py-1 rounded-full text-xs font-bold tracking-wide", result.passed ? "bg-success/20 text-success" : "bg-muted text-muted-foreground")}>
                                {result.passed ? "GEM CANDIDATE" : "REVIEWING"}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary transition-colors self-start">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-6 space-y-8">

                        {/* Score & Synthesis */}
                        <div className="flex items-center gap-6 p-6 bg-secondary/30 rounded-xl border border-border/50">
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
                                <h4 className="text-lg font-semibold mb-1">{t('blueprintAnalysis')}</h4>
                                <p className={clsx("text-sm font-medium", result.passed ? "text-success" : "text-danger")}>
                                    {result.passed
                                        ? t('verdictPass')
                                        : (
                                        <div className="mt-2 text-foreground">
                                            <span className="font-bold text-danger">Missed Criteria:</span>
                                            <ul className="list-disc pl-5 mt-1 text-xs text-foreground/80 font-normal space-y-1">
                                                {(result.failCodes && result.failCodes.length > 0) ? result.failCodes.map(code => {
                                                    const failReasonMap: Record<string, string> = {
                                                        FAIL_MCAP: market === 'India' 
                                                            ? "Market Cap outside 400Cr - 16,000Cr range" 
                                                            : market === 'Korea'
                                                                ? "Market Cap outside 70B - 2.8T KRW range"
                                                                : market === 'Taiwan'
                                                                    ? "Market Cap outside 1.6億 - 640億 NTD range"
                                                                    : "Market Cap outside $50M - $2B range",
                                                        FAIL_PRICE: market === 'India'
                                                            ? "Share Price too high"
                                                            : market === 'Korea' || market === 'Taiwan'
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
                                </p>
                            </div>
                        </div>

                        {/* Phase 1: Quant Metrics */}
                        <div>
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Activity className="h-5 w-5 text-primary" /> {t('phase1')}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <DetailRow label={t('revGrowth')} value={market !== 'US' && candidate.revenueGrowth === 0 ? 'N/A' : `${Number(candidate.revenueGrowth).toFixed(1)}%`} target={`> ${QUANT_THRESHOLDS.MIN_REVENUE_GROWTH}%`} pass={market !== 'US' && candidate.revenueGrowth === 0 ? true : candidate.revenueGrowth >= QUANT_THRESHOLDS.MIN_REVENUE_GROWTH} />
                                <DetailRow label={t('roic')} value={market !== 'US' && candidate.roic === 0 ? 'N/A' : `${Number(candidate.roic).toFixed(1)}%`} target={`> ${QUANT_THRESHOLDS.MIN_ROIC}%`} pass={market !== 'US' && candidate.roic === 0 ? true : candidate.roic >= QUANT_THRESHOLDS.MIN_ROIC} />
                                <DetailRow label={t('grossMargin')} value={market !== 'US' && candidate.grossMargin === 0 ? 'N/A' : `${Number(candidate.grossMargin).toFixed(1)}%`} target={`> 30% / 50%`} pass={market !== 'US' && candidate.grossMargin === 0 ? true : candidate.grossMargin >= 30} />
                                <DetailRow 
                                    label={t('mcap')} 
                                    value={market === 'India' 
                                        ? `${(candidate.marketCap / 10_000_000).toLocaleString('en-US', {maximumFractionDigits: 0})} Cr.` 
                                        : market === 'Korea'
                                            ? formatKoreanWon(candidate.marketCap, 2)
                                            : market === 'Taiwan'
                                                ? formatTaiwanNTD(candidate.marketCap, 2)
                                                : `$${(candidate.marketCap / 1e9).toFixed(1)}B`
                                    } 
                                    target={market === 'India' ? '< 16000Cr' : market === 'Korea' ? '< 2.8조원' : market === 'Taiwan' ? '< 640億元' : '< $2B'} 
                                    pass={market === 'India' ? (candidate.marketCap / 10_000_000) <= 16000 : market === 'Korea' ? (candidate.marketCap / 1_000_000_000) <= 2800 : market === 'Taiwan' ? (candidate.marketCap / 100_000_000) <= 640 : candidate.marketCap <= QUANT_THRESHOLDS.MAX_MARKET_CAP} 
                                    warning={market === 'India' ? (candidate.marketCap / 10_000_000) > 16000 : market === 'Korea' ? (candidate.marketCap / 1_000_000_000) > 2800 : market === 'Taiwan' ? (candidate.marketCap / 100_000_000) > 640 : candidate.marketCap > QUANT_THRESHOLDS.MAX_MARKET_CAP} 
                                />
                                <DetailRow label={t('pegRatio')} value={market !== 'US' && candidate.pegRatio === 0 ? 'N/A' : `${Number(candidate.pegRatio).toFixed(1)}x`} target={`< ${QUANT_THRESHOLDS.MAX_PEG}`} pass={market !== 'US' && candidate.pegRatio === 0 ? true : candidate.pegRatio <= QUANT_THRESHOLDS.MAX_PEG} />
                                <DetailRow label={t('insiderOwn')} value={market !== 'US' && candidate.insiderOwnership === 0 ? 'N/A' : `${Number(candidate.insiderOwnership).toFixed(1)}%`} target={`> ${QUANT_THRESHOLDS.MIN_INSIDER_OWNERSHIP}%`} pass={market !== 'US' && candidate.insiderOwnership === 0 ? true : candidate.insiderOwnership >= QUANT_THRESHOLDS.MIN_INSIDER_OWNERSHIP} />
                            </div>
                        </div>

                                                {/* Phase 2: Kill List */}
                        <div>
                            <h3 className="text-xl font-bold mb-1 flex items-center gap-2 text-danger">
                                <AlertOctagon className="h-5 w-5" /> {t('phase2')}
                            </h3>
                            <p className="text-xs text-muted-foreground mb-4">Disqualifying red flags that override high quant scores. Any flag here means the stock fails the blueprint.</p>
                            <div className="bg-danger/5 border border-danger/20 rounded-xl p-4">
                                {flags.length === 0 ? (
                                    <div className="flex items-center gap-2 text-success">
                                        <span className="text-lg">✓</span> {t('noFatalFlaws')}
                                    </div>
                                ) : (
                                    <ul className="space-y-2">
                                        {flags.map((flag, i) => (
                                            <li key={i} className="flex items-center gap-2 text-danger font-medium">
                                                <X className="h-4 w-4" /> {flag}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {/* Always show Z-Score context */}
                                <div className="mt-4 pt-4 border-t border-danger/10 text-sm flex justify-between">
                                    <span>Altman Z-Score: <span className="font-mono font-bold">{market !== 'US' && candidate.zScore === 0 ? 'N/A' : candidate.zScore}</span></span>
                                    <span className="text-muted-foreground">({t('target')}: &gt; 1.8)</span>
                                </div>
                            </div>
                        </div>

                        {/* Deepseek AI Report */}
                        {savedReport && (
                            <div>
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-blue-400">
                                    <Sparkles className="h-5 w-5" /> AI Valuation Report (Deepseek V4.0 Pro)
                                </h3>
                                <div className="bg-[#1a1f2e] border border-blue-500/30 rounded-xl overflow-hidden flex flex-col shadow-inner">
                                    <div className="bg-blue-500/10 px-4 py-3 border-b border-blue-500/20 flex justify-between items-center shrink-0 flex-wrap gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            Generated on: {new Date(savedReport.timestamp).toLocaleString()} | Cost: ${savedReport.cost} | Tokens: {savedReport.usage?.total_tokens}
                                        </span>
                                        <div className="flex gap-2 items-center">
                                            <button onClick={downloadDsResult} className="flex items-center gap-1 text-xs bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-md shadow-sm border border-border transition-colors font-semibold">Download .txt</button>
                                            <button onClick={copyDsResult} className="flex items-center gap-1 text-xs bg-[#4d6bfe] hover:bg-[#3b54d1] text-white px-3 py-1.5 rounded-md shadow-sm transition-colors font-semibold">Copy Result</button>
                                        </div>
                                    </div>
                                    <div className="p-5 overflow-y-auto max-h-[600px] custom-scrollbar">
                                        <div className="prose prose-invert prose-sm max-w-none text-foreground/90 leading-relaxed prose-headings:text-foreground prose-a:text-blue-400">
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

function DetailRow({ label, value, target, pass, warning }: { label: string, value: string | number, target: string, pass: boolean, warning?: boolean }) {
    const { t } = useLanguage();

    return (
        <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg">
            <div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="font-mono font-semibold">{value}</div>
            </div>
            <div className="text-right">
                <div className="text-[10px] opacity-70">{t('target')}: {target}</div>
                <div className={clsx("text-xs font-bold", pass ? "text-success" : warning ? "text-warning" : "text-danger")}>
                    {pass ? t('pass') : warning ? t('watch') : t('fail')}
                </div>
            </div>
        </div>
    )
}
