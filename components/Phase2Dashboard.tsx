"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Search, ExternalLink, RefreshCw, Box } from "lucide-react";
import Link from "next/link";

// Helper to parse CSV manually on the frontend
function parseCSV(text: string) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };

    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
        const values = line.split(',');
        let row: Record<string, string> = {};
        headers.forEach((h, i) => {
            row[h] = values[i] ? values[i].trim() : '';
        });
        return row;
    });

    return { headers, rows };
}

export function Phase2Dashboard() {
    const [data, setData] = useState<{ headers: string[], rows: any[] }>({ headers: [], rows: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Read from public data folder directly (GitHub Pages static friendly)
            const isProd = process.env.NODE_ENV === 'production';
            const basePath = isProd ? '/stock-screener' : '';
            const res = await fetch(`${basePath}/data/gdr_survivors_for_tradingview.csv?t=${new Date().getTime()}`);
            
            if (!res.ok) {
                throw new Error('CSV file not found. Please run the Python Phase 1 script first.');
            }
            const text = await res.text();
            const parsed = parseCSV(text);
            setData(parsed);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Filter down to the "Elite" Cohort
    const eliteRows = data.rows.filter(row => 
        row['Anti-Empire Builder'] === 'True' &&
        row['Margin Erosion Danger'] === 'False' &&
        row['Operating Leverage'] === 'True'
    );

    const formatMetric = (val: string, isPercent: boolean = false) => {
        if (!val || val === 'NaN') return '-';
        const num = parseFloat(val);
        if (isNaN(num)) return val;
        if (isPercent) return (num * 100).toFixed(1) + '%';
        return num.toFixed(2);
    };

    const StatusBadge = ({ value }: { value: string }) => {
        if (!value || value === '-') return <span className="text-muted-foreground">-</span>;
        
        const testVal = value.toLowerCase().trim();
        // Pass / True / BUY variants
        if (testVal.includes('pass') || testVal === 'buy' || testVal === 'true') {
            return <span className="px-2 py-1 bg-success/20 text-success border border-success/30 rounded text-xs font-bold uppercase">{value}</span>;
        }
        
        // Fail / False / SELL / PASS variants
        if (testVal.includes('fail') || testVal === 'sell' || testVal === 'false' || testVal === 'reject' || testVal === 'pass (discard)') {
            return <span className="px-2 py-1 bg-danger/20 text-danger border border-danger/30 rounded text-xs font-bold uppercase">{value}</span>;
        }

        // Neutral
        return <span className="px-2 py-1 bg-secondary text-secondary-foreground border border-border rounded text-xs font-bold uppercase">{value}</span>;
    }

    return (
        <div className="flex-1 overflow-y-auto p-6 bg-background text-foreground animate-in fade-in duration-500">
            <header className="mb-8 border-b border-border pb-4 flex justify-between items-end">
                <div>
                    <div className="mb-2">
                        <Link href="/" className="text-sm text-primary hover:underline font-medium flex items-center gap-2">
                           ← Back to Phase 1 (Screener)
                        </Link>
                    </div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                        Phase 2: Automated Validation View
                    </h1>
                    <p className="text-muted-foreground flex items-center gap-2">
                        Read-only presentation mapping the direct outputs of the Hybrid Python Engine.
                        <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs">Fully Automated</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    {/* Sync button removed per user request (Auto-syncs on load) */}
                </div>
            </header>

            {/* INSTRUCTIONS PANEL */}
            <div className="bg-card border border-border rounded-xl p-6 mb-8 shadow-sm">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Box className="h-5 w-5 text-accent" />
                    How Phase 2 Works
                </h2>
                <div className="text-sm text-card-foreground">
                    <p className="mb-4 text-muted-foreground">
                        This dashboard completely bypasses manual TradingView chart checks by surfacing the deep-dive metrics generated directly by the Python script's TTM and historical data parsers. All interactions are intentionally read-only.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <div className="p-5 bg-secondary/30 border border-border/50 rounded-lg">
                            <strong className="text-primary block text-base mb-2">1. The Profitability Inflection (8-Qtr Margin)</strong>
                            <p className="text-xs text-muted-foreground mb-2">
                                <span className="text-foreground font-semibold">What it does:</span> The Python algorithm parses trailing historical data to compare current Operating Margins strictly against the margins from exactly two years ago.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                <span className="text-foreground font-semibold">Why it matters:</span> Unprofitable or distressed companies can often appear mathematically "cheap," but we require proof that their core business operations are structurally healing. A positive margin trajectory separates a genuine "turnaround" from a dangerous value trap.
                            </p>
                        </div>
                        
                        <div className="p-5 bg-secondary/30 border border-border/50 rounded-lg">
                            <strong className="text-primary block text-base mb-2">2. ROIC Velocity (The Upward Slope)</strong>
                            <p className="text-xs text-muted-foreground mb-2">
                                <span className="text-foreground font-semibold">What it does:</span> Instead of just looking at the absolute Return on Invested Capital (ROIC) number, the algorithm traces the curvature and momentum of capital efficiency quarter-over-quarter.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                <span className="text-foreground font-semibold">Why it matters:</span> Absolute ROIC can be misleadingly static. It is the <em>velocity</em> (the acceleration) of capital efficiency that signals impending massive stock multiple expansion. We want to catch the exact moment a company gets better at allocating its cash.
                            </p>
                        </div>
                        
                        <div className="p-5 bg-secondary/30 border border-border/50 rounded-lg">
                            <strong className="text-primary block text-base mb-2">3. The Cyclical Check (Macro Pessimism)</strong>
                            <p className="text-xs text-muted-foreground mb-2">
                                <span className="text-foreground font-semibold">What it does:</span> Protects you from commodity stocks by scanning industry tags (Hardware, Energy, Shipping) and enforcing specific cycle-timing checks.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                <span className="text-foreground font-semibold">Why it matters:</span> Cyclical companies defy normal logic: they look the "cheapest" (lowest P/E ratios) right at the absolute top of the market cycle before the crash. To survive cyclicals, you must only buy them when sentiment and margins are completely devastated (maximum pessimism).
                            </p>
                        </div>
                        
                        <div className="p-5 bg-secondary/30 border border-border/50 rounded-lg">
                            <strong className="text-primary block text-base mb-2">4. Insider Buying (The Qualitative Catalyst)</strong>
                            <p className="text-xs text-muted-foreground mb-2">
                                <span className="text-foreground font-semibold">What it does:</span> Queries corporate transaction filings to locate recent out-of-pocket, open-market stock purchases made by C-suite executives and board directors.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                <span className="text-foreground font-semibold">Why it matters:</span> Management can spin a very compelling story on a quarterly earnings call, but they cannot legally lie with their own wallets. Strong, sustained insider buying confirms that the people with the deepest internal visibility believe the company is severely undervalued.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* DATA TABLE */}
            {error ? (
                <div className="bg-destructive/10 text-destructive p-4 rounded-md border border-destructive/20">
                    {error}
                </div>
            ) : loading ? (
                <div className="py-20 flex justify-center text-muted-foreground">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                </div>
            ) : eliteRows.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-xl">
                    <p className="text-lg mb-2">No Elite Survivors Found.</p>
                    <p className="text-sm">Run the `<code className="text-primary">py -u scripts/fetch_phase1_screener.py</code>` script to generate new data.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-secondary text-secondary-foreground text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-4 py-3 min-w-[200px]">Asset Profile</th>
                                <th className="px-4 py-3 min-w-[250px] border-r border-border">Phase 1 Quantitative Context</th>
                                <th className="px-4 py-3 min-w-[140px]">1. 8-Qtr Margin</th>
                                <th className="px-4 py-3 min-w-[140px]">2. ROIC Velocity</th>
                                <th className="px-4 py-3 min-w-[140px]">3. Cyclical Check</th>
                                <th className="px-4 py-3 min-w-[140px]">4. Insider Buying</th>
                                <th className="px-4 py-3 min-w-[120px] border-l border-border bg-primary/10 text-primary">Script Decision</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-card">
                            {eliteRows.map(row => (
                                <tr key={row.Ticker} className="hover:bg-secondary/50 transition-colors group">
                                    <td className="px-4 py-4 align-top">
                                        <div className="font-bold text-lg flex items-center gap-2 mb-1">
                                            {row.Ticker}
                                            <a href={`https://www.tradingview.com/chart/?symbol=${row.Ticker}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                                                <ExternalLink className="h-4 w-4" />
                                            </a>
                                        </div>
                                        <div className="text-xs text-muted-foreground mb-1 font-medium">{row.Name}</div>
                                        <div className="text-xs text-muted-foreground opacity-70">{row.Sector}</div>
                                        <div className="text-xs text-muted-foreground opacity-70 truncate w-[180px]" title={row.Industry}>{row.Industry}</div>
                                        
                                        <div className="mt-3 text-sm font-semibold text-accent">
                                            ${formatMetric(row.Price)}
                                        </div>
                                    </td>
                                    
                                    {/* PHASE 1 CONTEXT PANEL */}
                                    <td className="px-4 py-4 align-top border-r border-border bg-secondary/20">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                            <div><span className="text-muted-foreground">FCF Yield:</span> <span className="font-mono float-right block">{formatMetric(row['FCF Yield'], true)}</span></div>
                                            <div><span className="text-muted-foreground">B/M Ratio:</span> <span className="font-mono float-right block">{formatMetric(row['Book-to-Market Ratio'])}</span></div>
                                            <div><span className="text-muted-foreground">Rev Growth:</span> <span className="font-mono float-right block">{formatMetric(row['Rev Growth'], true)}</span></div>
                                            <div><span className="text-muted-foreground">G. Margin:</span> <span className="font-mono float-right block">{formatMetric(row['Gross Margin'], true)}</span></div>
                                            <div><span className="text-muted-foreground">ROIC:</span> <span className="font-mono float-right block text-green-500">{formatMetric(row['ROIC'], true)}</span></div>
                                            <div><span className="text-muted-foreground">Insider:</span> <span className="font-mono float-right block">{formatMetric(row['Insider Own'], true)}</span></div>
                                            <div><span className="text-muted-foreground">PEG:</span> <span className="font-mono float-right block text-orange-400">{formatMetric(row['PEG'])}</span></div>
                                            <div><span className="text-muted-foreground">Z-Score:</span> <span className="font-mono float-right block">{formatMetric(row['Z-Score'])}</span></div>
                                        </div>
                                    </td>
                                    
                                    {/* PHASE 2 AUTOMATED CHECKS */}
                                    <td className="px-4 py-4 align-middle">
                                        <div className="flex"><StatusBadge value={row['8-Quarter Margin']} /></div>
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                        <div className="flex"><StatusBadge value={row['ROIC Velocity']} /></div>
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                        <div className="flex"><StatusBadge value={row['Cyclical Check']} /></div>
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                        <div className="flex"><StatusBadge value={row['Insider Buying']} /></div>
                                    </td>
                                    <td className="px-4 py-4 align-middle border-l border-border bg-primary/5">
                                        <div className="flex"><StatusBadge value={row['Phase 2 Decision']} /></div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
