'use client';

// Executive Brochure & Comprehensive Institutional Whitepaper (/overview)
// Deep-dive architectural breakdown, mathematical derivations, SVG flowcharts,
// and copy-pasteable messenger visual formatting.

import React, { useState } from 'react';
import Link from 'next/link';
import { 
    Cpu, Shield, Layers, TrendingUp, CheckCircle, Copy, Check, Printer, 
    Share2, ExternalLink, ArrowRight, Activity, Terminal, Database,
    Calculator, AlertTriangle, FileText, CheckSquare, Search, Gauge
} from 'lucide-react';

export default function OverviewPage() {
    const [copied, setCopied] = useState(false);

    const messengerText = `╔══════════════════════════════════════════════════════════════════════════╗
║  STOCKPEAK & RS2 LOCAL: INSTITUTIONAL EQUITY UNDERWRITING DESK            ║
║  Autonomous Agentic Valuation, Forensic Audits & Execution Ledgers       ║
╚══════════════════════════════════════════════════════════════════════════╝

1. EXECUTIVE ARCHITECTURE OVERVIEW
──────────────────────────────────────────────────────────────────────────
Unlike retail stock screeners that apply static P/E ratios, and unlike commercial
AI wrappers that summarize news headlines, RS2 Local is a fully autonomous,
local-LLM institutional equity analyst running directly on dedicated hardware
(NVIDIA RTX 3090, 81,920-token context, ~47 tokens/sec sustained).

The system solves the two fatal flaws of modern investing:
[1] The "False Value Trap" of Quant Models: Mechanically buying decaying cigar butts
    whose backward-looking earnings appear cheap, while rejecting generational
    infrastructure compounders as "expensive."
[2] Accounting Forensic Tunnel Vision: Penalizing advance customer down-payments
    without recognizing what they secure: multi-decade 30%+ gross margin captive
    installed-base recurring service annuities.


2. THE 4-STAGE VALUE PIPELINE (FLOWCHART)
──────────────────────────────────────────────────────────────────────────

  ┌───────────────────────────────────────────────────────────┐
  │  STAGE 1: DUAL-DOOR QUANT FACTOR PRE-SCREEN               │
  │  2,900+ Global Equities (US, South Korea, Taiwan)         │
  │  • Equal-weighted sector-neutral z-scores                 │
  │  • Forensic Haircuts: Altman Z < 1.81, Sloan Accruals     │
  │  • Output: Top ~3% Shortlist (135 Candidates)            │
  └─────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
  ┌───────────────────────────────────────────────────────────┐
  │  STAGE 2: LIVE FORENSIC INVESTIGATION (SearXNG + SEC)     │
  │  Autonomous Tool-Augmented Research Agent                 │
  │  • 25 live tool calls with 75% Jaccard deduplication      │
  │  • Ingests 10-K/10-Q disclosures, orders, backlog fleet   │
  │  • Anti-poisoning: Purges retail blogs and social spam    │
  └─────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
  ┌───────────────────────────────────────────────────────────┐
  │  STAGE 3: COGNITIVE UNDERWRITING ENGINE (Charter v3.1)    │
  │  NVIDIA RTX 3090 · Qwen3.8-27B (UD-Q5_K_M) · MTP 4 (~47 t/s)│
  │  • Macro Regime: 10Y Rf (4.83%), Cap Rate = 1/(WACC - g)  │
  │  • Installed-Base Annuity: 20-year fleet service annuity  │
  │  • Triad: Bear (Backlog Floor) / Base (DCF) / Bull (Lever)│
  └─────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
  ┌───────────────────────────────────────────────────────────┐
  │  STAGE 4: ADAPTIVE 2-ESCALATE CONSENSUS & LEDGERS         │
  │  Stochastic Multi-Seed Verification                       │
  │  • Seed 1 & Seed 2 run concurrently                       │
  │  • Spread <= 15% ──> Level 0 Early-Stop (~38–44 min)      │
  │  • Spread > 15%  ──> Escalated to Sample 3 (~55–65 min)   │
  │  • Output: Section 12 Machine Contract + Portfolio Ledger │
  └───────────────────────────────────────────────────────────┘


3. UNDERWRITING LOGIC & FINANCIAL MECHANICS
──────────────────────────────────────────────────────────────────────────

■ 1. RULE 6 MULTIPLE REALISM (ANTI-VACUUM PRINCIPLE)
Exit multiples cannot be arbitrarily assumed (e.g. static 20x-28x). They are
strictly derived from net capitalization rates under the prevailing macro regime:
  • Risk-Free Rate: 10Y Treasury Rf = 4.83%
  • Cost of Equity: Ke = Rf + (Beta × ERP)
  • WACC = (E/V × Ke) + (D/V × Kd × (1 - t))
  • Terminal Multiple Anchor = 1 / (WACC - g)
For a business with WACC = 9.4% and terminal growth g = 3.5%, the binding cap
rate is 5.9%, setting the terminal multiple anchor at 17x terminal-year FCF.

■ 2. THE COMPLETE VALUE CYCLE (INSTALLED-BASE ECONOMICS)
In capital goods, aerospace, and medical equipment, initial machine sales lock in
a captive installed base.
  • Initial transactional equipment sale: 10-15% EBITDA margin.
  • 20-year captive aftermarket service/parts annuity: 35%+ EBITDA margin.
  • Working capital down-payments are CREDITED as customer commitment securing
    capacity slots, not penalized as accounting anomalies.

■ 3. CAUSAL STRESS-TESTING (THE CONTRACTED VISIBILITY FLOOR)
The Bear Case models operational de-leverage and margin compression—NEVER an
apocalyptic fictional collapse.
  • Oligopolists with multi-year backlogs (e.g. GEV with $176B backlog = 4.7x
    revenue) possess a Contracted Visibility Floor that bounds downside risk.


4. SECTION 12 INSTITUTIONAL CONTRACT & RISK SIZING
──────────────────────────────────────────────────────────────────────────

Every depth underwriting produces a machine-executable Section 12 contract:

┌─────────────────────────────────────────────────────────────────────────┐
│ SECTION 12 INSTITUTIONAL UNDERWRITING CONTRACT (SAMPLE: GEV)            │
├────────────────────────────────────────┬────────────────────────────────┤
│ QUADRANT 1: CONVICTION & MOAT QUALITY  │ QUADRANT 2: PORTFOLIO SIZING   │
│ • Conviction Score: 11.0 / 15 (Core)   │ • Half-Kelly Limit: 5.5% Cap   │
│ • Economic Moat: ★ 3.6 / 5.0 (Widening)│ • Asymmetric Skew: 1.42x R:R   │
│ • Trait: 55k-unit fleet service annuity│ • Downside Floor: Bounded >$600│
├────────────────────────────────────────┼────────────────────────────────┤
│ QUADRANT 3: CAPITAL TRANCHES           │ QUADRANT 4: THESIS TRIGGERS    │
│ • Tranche 1 (Starter): $900.00 Limit   │ [!] Backlog drops below $150B  │
│ • Tranche 2 (Core):    $750.00 Limit   │ [!] Turbine orders < 15 GW     │
│ • Exit Target:         $1,450.00       │ [!] 2028 EBITDA guide cut < $8B│
└────────────────────────────────────────┴────────────────────────────────┘

■ MATHEMATICAL HALF-KELLY SIZING FORMULA:
  • Payoff Ratio (b) = (Bull IV - Market Price) / (Market Price - Bear IV)
  • Full Kelly: f* = (p × b - q) / b
  • Execution Cap: Allocation = f* / 2 (Half-Kelly to defend against regime shifts)


5. EMPIRICAL VALIDATION: CROSS-ARCHETYPE CASE STUDIES
──────────────────────────────────────────────────────────────────────────

[1] GEV (GE Vernova — Capital Goods / Power Infrastructure):
    • Market Price: $951.04  |  Base IV: $1,100.00 (+15.7% Margin of Safety)
    • Triad: Bear $600.00  |  Base $1,100.00  |  Bull $1,450.00  (Skew: 1.42x)
    • Finding: AI credited $176B backlog and 55,000-turbine fleet recurring
      service annuity. AI Promoted from Watchlist to Core Buy. Kelly: 5.5%.

[2] CAT (Caterpillar — Cyclical Heavy Machinery):
    • Market Price: $815.56  |  Base IV: $440.00 (-46.0% Below Market)
    • Triad: Bear $310.00  |  Base $440.00  |  Bull $880.00  (Skew: 0.13x)
    • Finding: Anti-Peak-Cycle discipline. Refused to chase peak multiples on
      cyclical peak earnings. Allocated 0.0% Kelly (Capital Preserved).

[3] NVDA (NVIDIA — Bottleneck Monopoly):
    • Market Price: $223.67  |  Base IV: $240.00 (+7.3% Margin of Safety)
    • Triad: Bear $120.00  |  Base $240.00  |  Bull $375.00  (Skew: 1.46x)
    • Finding: 48 live tool calls parsed SEC 10-Q EDGAR filings. Verified 61%
      hyperscaler customer concentration offset by 2-year sovereign backlog.
      Kelly Cap: 5.0%. Tranche 1 Limit: $215.00.

[4] V (Visa — Tollbooth Payment Rail):
    • Market Price: $367.39  |  Base IV: $370.00 (+0.7% Fair Value)
    • Moat: ★ 4.4 / 5.0  |  Conviction: 12.0 / 15  |  Kelly Cap: 5.0%
    • Finding: Underwritten as an elite, fully valued monopoly compounding at
      12% FCF growth. Starter tranche set at $340.00 limit.


6. HARDWARE & PRODUCTION DEPLOYMENT
──────────────────────────────────────────────────────────────────────────
• Local Host Hardware: Dedicated Workstation, NVIDIA RTX 3090 (24GB GDDR6X)
• Model Weights: rs2-analyst-deep-mtp5 (Qwen3.8-27B dense, UD-Q5_K_M)
• Context & Acceleration: 81,920 Tokens with MTP 4 speculative decoding (~47 t/s)
• Web Portal: https://stockpeak.net (Next.js 14 / Edge CDN / TypeScript)
• Ledgers: Immutable JSONL append-only audit trail marked to market daily.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 LIVE DASHBOARD: https://stockpeak.net
📄 FULL INTERACTIVE SPECIFICATION: https://stockpeak.net/overview
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const handleCopy = () => {
        navigator.clipboard.writeText(messengerText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <div className="min-h-screen bg-[#0d0f12] text-[#c3bfb5] selection:bg-[#cfa14e]/30 selection:text-white">
            {/* Top Bar */}
            <header className="sticky top-0 z-50 border-b border-[#232833] bg-[#0d0f12]/95 backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="font-mono text-[18px] font-extrabold tracking-wider text-white hover:text-accent">
                            STOCKPEAK
                        </Link>
                        <span className="hidden sm:inline-block font-mono text-[11px] text-[#70757f]">
                            / INSTITUTIONAL SPECIFICATION
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleCopy}
                            className="inline-flex items-center gap-1.5 border border-[#cfa14e] bg-[#cfa14e]/10 px-4 py-2 font-mono text-[11px] font-bold text-[#cfa14e] transition-colors hover:bg-[#cfa14e]/20"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-pos" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? 'COPIED TO CLIPBOARD!' : 'COPY MESSENGER MEMORANDUM'}
                        </button>

                        <button
                            onClick={() => window.print()}
                            className="hidden sm:inline-flex items-center gap-1.5 border border-[#232833] bg-white/[0.03] px-3.5 py-2 font-mono text-[11px] text-[#70757f] hover:border-white hover:text-white"
                        >
                            <Printer className="h-3.5 w-3.5" />
                            PRINT / PDF
                        </button>

                        <Link
                            href="/"
                            className="border border-[#232833] bg-white/[0.04] px-3.5 py-2 font-mono text-[11px] font-semibold text-white hover:border-accent"
                        >
                            LIVE DESK ↗
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Header */}
            <section className="border-b border-[#232833] bg-gradient-to-b from-[#14171d] via-[#101318] to-[#0d0f12] px-6 py-16 text-center sm:py-24">
                <div className="mx-auto max-w-4xl">
                    <div className="inline-flex items-center gap-2 border border-[#cfa14e]/40 bg-[#cfa14e]/10 px-3.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-[#cfa14e] rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#cfa14e] animate-ping" />
                        Charter v3.1 Institutional Underwriting Specification
                    </div>

                    <h1 className="mt-6 text-[32px] font-extrabold tracking-tight text-white sm:text-[48px] leading-[1.12]">
                        Autonomous Agentic Equity Underwriting &amp; Capital Execution Ledgers
                    </h1>

                    <p className="mx-auto mt-6 max-w-3xl text-[15px] leading-relaxed text-[#8f94a0] sm:text-[18px]">
                        A local-LLM institutional valuation desk running on dedicated GPU hardware. Replacing retail momentum chasing and superficial heuristic filters with first-principles corporate finance, installed-base service durability, and mathematical Kelly portfolio sizing.
                    </p>

                    {/* Hardware Telemetry Strip */}
                    <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono text-[12px] text-left">
                        <div className="border border-[#232833] bg-[#14171d] p-3.5 rounded-sm">
                            <span className="block text-[#70757f] text-[10px] uppercase tracking-wider">Underwriting Model</span>
                            <span className="font-bold text-white">rs2-analyst-deep-mtp5</span>
                            <span className="block text-[#70757f] text-[10.5px] mt-0.5">27B Parameter Dense</span>
                        </div>
                        <div className="border border-[#232833] bg-[#14171d] p-3.5 rounded-sm">
                            <span className="block text-[#70757f] text-[10px] uppercase tracking-wider">Inference Hardware</span>
                            <span className="font-bold text-white">NVIDIA RTX 3090 (24GB)</span>
                            <span className="block text-[#70757f] text-[10.5px] mt-0.5">Local Dedicated Host</span>
                        </div>
                        <div className="border border-[#232833] bg-[#14171d] p-3.5 rounded-sm">
                            <span className="block text-[#70757f] text-[10px] uppercase tracking-wider">Execution Speed</span>
                            <span className="font-bold text-pos">~47.5 tok/sec</span>
                            <span className="block text-[#70757f] text-[10.5px] mt-0.5">MTP 4 Speculative Stride</span>
                        </div>
                        <div className="border border-[#232833] bg-[#14171d] p-3.5 rounded-sm">
                            <span className="block text-[#70757f] text-[10px] uppercase tracking-wider">Cognitive Window</span>
                            <span className="font-bold text-accent">81,920 Tokens</span>
                            <span className="block text-[#70757f] text-[10.5px] mt-0.5">Full Fact Pack Ingestion</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Quick Messenger Action Card */}
            <section className="mx-auto max-w-5xl px-6 -mt-6">
                <div className="border border-[#cfa14e]/40 bg-[#14171d] p-6 rounded shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
                            <Share2 className="h-3.5 w-3.5" /> Mobile Messenger Sharing Ready
                        </span>
                        <h3 className="text-[17px] font-bold text-white mt-1">
                            Copy formatted Unicode memorandum for KakaoTalk, Telegram, WhatsApp or Slack
                        </h3>
                        <p className="text-[12px] text-[#8f94a0] mt-0.5">
                            Formatted with clean ASCII borders, emojis, and zero broken markdown tables.
                        </p>
                    </div>
                    <button
                        onClick={handleCopy}
                        className="shrink-0 border border-[#cfa14e] bg-[#cfa14e] px-6 py-3 font-mono text-[12px] font-extrabold text-black transition-all hover:bg-[#cfa14e]/90"
                    >
                        {copied ? '✓ COPIED TO CLIPBOARD!' : 'COPY MESSENGER TEXT'}
                    </button>
                </div>
            </section>

            {/* The 4-Stage Value Pipeline (Detailed Flowchart & Logic) */}
            <section className="mx-auto max-w-5xl px-6 py-20">
                <div className="text-center">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
                        System Architecture
                    </span>
                    <h2 className="mt-2 text-[28px] font-extrabold text-white sm:text-[36px]">
                        The 4-Stage Value Creation Pipeline
                    </h2>
                    <p className="mx-auto mt-2 max-w-2xl text-[14px] text-[#8f94a0]">
                        How raw equity market data is autonomously filtered, forensically investigated, cognitively underwritten, and executed on ledger.
                    </p>
                </div>

                {/* SVG Visual Flowchart */}
                <div className="mt-12 overflow-x-auto border border-[#232833] bg-[#14171d] p-6 rounded-sm">
                    <svg viewBox="0 0 920 340" className="w-full min-w-[720px] text-[12px] font-mono">
                        <defs>
                            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                <path d="M 0 1 L 8 5 L 0 9 z" fill="#70757f" />
                            </marker>
                        </defs>

                        {/* Stage 1 */}
                        <g transform="translate(10, 20)">
                            <rect width="200" height="280" rx="4" fill="#0d0f12" stroke="#232833" strokeWidth="1.5" />
                            <rect width="200" height="34" rx="4" fill="#5a9b6d" fillOpacity="0.15" />
                            <text x="12" y="22" fill="#4ade80" fontWeight="bold" fontSize="11">1. DUAL-DOOR PRE-SCREEN</text>
                            
                            <text x="12" y="65" fill="#ffffff" fontWeight="bold" fontSize="13">2,900+ Equities Scored</text>
                            <text x="12" y="82" fill="#70757f" fontSize="11">US · South Korea · Taiwan</text>
                            
                            <line x1="12" y1="98" x2="188" y2="98" stroke="#232833" strokeWidth="1" />
                            <text x="12" y="122" fill="#8f94a0" fontSize="11">• Sector-neutral z-scores</text>
                            <text x="12" y="142" fill="#8f94a0" fontSize="11">• Value · Quality · Mom · LowVol</text>
                            <text x="12" y="162" fill="#8f94a0" fontSize="11">• Altman Z &gt; 1.81 (Solvency)</text>
                            <text x="12" y="182" fill="#8f94a0" fontSize="11">• Sloan Accruals &lt; 10%</text>
                            <text x="12" y="202" fill="#8f94a0" fontSize="11">• Beneish M-Score &lt; -1.78</text>

                            <rect x="12" y="226" width="176" height="42" rx="2" fill="#14171d" stroke="#5a9b6d" strokeWidth="1" />
                            <text x="20" y="244" fill="#4ade80" fontWeight="bold" fontSize="11">Top ~3% Shortlist</text>
                            <text x="20" y="259" fill="#70757f" fontSize="10">135 Nominated Tickers</text>
                        </g>

                        <line x1="220" y1="160" x2="243" y2="160" stroke="#70757f" strokeWidth="1.5" markerEnd="url(#arrow)" />

                        {/* Stage 2 */}
                        <g transform="translate(250, 20)">
                            <rect width="200" height="280" rx="4" fill="#0d0f12" stroke="#232833" strokeWidth="1.5" />
                            <rect width="200" height="34" rx="4" fill="#6b93c4" fillOpacity="0.15" />
                            <text x="12" y="22" fill="#60a5fa" fontWeight="bold" fontSize="11">2. FORENSIC RESEARCH</text>
                            
                            <text x="12" y="65" fill="#ffffff" fontWeight="bold" fontSize="13">Primary SEC Ingestion</text>
                            <text x="12" y="82" fill="#70757f" fontSize="11">Tool-Augmented Agent</text>
                            
                            <line x1="12" y1="98" x2="188" y2="98" stroke="#232833" strokeWidth="1" />
                            <text x="12" y="122" fill="#8f94a0" fontSize="11">• Max 25 Tool Searches</text>
                            <text x="12" y="142" fill="#8f94a0" fontSize="11">• 75% Jaccard Dedup</text>
                            <text x="12" y="162" fill="#8f94a0" fontSize="11">• 10-K/10-Q EDGAR Tables</text>
                            <text x="12" y="182" fill="#8f94a0" fontSize="11">• Backlog Order Durability</text>
                            <text x="12" y="202" fill="#8f94a0" fontSize="11">• Anti-Poison Hygiene</text>

                            <rect x="12" y="226" width="176" height="42" rx="2" fill="#14171d" stroke="#60a5fa" strokeWidth="1" />
                            <text x="20" y="244" fill="#60a5fa" fontWeight="bold" fontSize="11">Audited Fact Pack</text>
                            <text x="20" y="259" fill="#70757f" fontSize="10">Zero Hallucinated Inputs</text>
                        </g>

                        <line x1="460" y1="160" x2="483" y2="160" stroke="#70757f" strokeWidth="1.5" markerEnd="url(#arrow)" />

                        {/* Stage 3 */}
                        <g transform="translate(490, 20)">
                            <rect width="200" height="280" rx="4" fill="#0d0f12" stroke="#232833" strokeWidth="1.5" />
                            <rect width="200" height="34" rx="4" fill="#cfa14e" fillOpacity="0.15" />
                            <text x="12" y="22" fill="#cfa14e" fontWeight="bold" fontSize="11">3. COGNITIVE ENGINE</text>
                            
                            <text x="12" y="65" fill="#ffffff" fontWeight="bold" fontSize="13">Charter v3.1 DCF</text>
                            <text x="12" y="82" fill="#70757f" fontSize="11">Local Qwen3.8-27B (3090)</text>
                            
                            <line x1="12" y1="98" x2="188" y2="98" stroke="#232833" strokeWidth="1" />
                            <text x="12" y="122" fill="#8f94a0" fontSize="11">• Net Cap Anchor 1/(W-g)</text>
                            <text x="12" y="142" fill="#8f94a0" fontSize="11">• Installed-Base Durability</text>
                            <text x="12" y="162" fill="#8f94a0" fontSize="11">• 30%+ Margin Service PV</text>
                            <text x="12" y="182" fill="#8f94a0" fontSize="11">• Valuation Triad (3-Case)</text>
                            <text x="12" y="202" fill="#8f94a0" fontSize="11">• Contracted Floor Bounding</text>

                            <rect x="12" y="226" width="176" height="42" rx="2" fill="#14171d" stroke="#cfa14e" strokeWidth="1" />
                            <text x="20" y="244" fill="#cfa14e" fontWeight="bold" fontSize="11">Section 12 Contract</text>
                            <text x="20" y="259" fill="#70757f" fontSize="10">Conviction /15 · Moat /5</text>
                        </g>

                        <line x1="700" y1="160" x2="723" y2="160" stroke="#70757f" strokeWidth="1.5" markerEnd="url(#arrow)" />

                        {/* Stage 4 */}
                        <g transform="translate(730, 20)">
                            <rect width="180" height="280" rx="4" fill="#0d0f12" stroke="#232833" strokeWidth="1.5" />
                            <rect width="180" height="34" rx="4" fill="#9a83c2" fillOpacity="0.15" />
                            <text x="12" y="22" fill="#c084fc" fontWeight="bold" fontSize="11">4. CONSENSUS &amp; LEDGER</text>
                            
                            <text x="12" y="65" fill="#ffffff" fontWeight="bold" fontSize="13">Adaptive 2-Escalate</text>
                            <text x="12" y="82" fill="#70757f" fontSize="11">Spread &le; 15% Early Stop</text>
                            
                            <line x1="12" y1="98" x2="168" y2="98" stroke="#232833" strokeWidth="1" />
                            <text x="12" y="122" fill="#8f94a0" fontSize="11">• Half-Kelly Position Cap</text>
                            <text x="12" y="142" fill="#8f94a0" fontSize="11">• Starter &amp; Core Tranches</text>
                            <text x="12" y="162" fill="#8f94a0" fontSize="11">• Invalidation Triggers</text>
                            <text x="12" y="182" fill="#8f94a0" fontSize="11">• AI Promotion / Demote</text>
                            <text x="12" y="202" fill="#8f94a0" fontSize="11">• Real-Money Paper Book</text>

                            <rect x="12" y="226" width="156" height="42" rx="2" fill="#14171d" stroke="#c084fc" strokeWidth="1" />
                            <text x="20" y="244" fill="#c084fc" fontWeight="bold" fontSize="11">stockpeak.net</text>
                            <text x="20" y="259" fill="#70757f" fontSize="10">Immutable Daily Audit</text>
                        </g>
                    </svg>
                </div>
            </section>

            {/* Deep Underwriting Logic: The 4 Core Principles */}
            <section className="border-t border-[#232833] bg-[#14171d]/60 px-6 py-20">
                <div className="mx-auto max-w-5xl">
                    <div className="text-center">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
                            Core Institutional Logic
                        </span>
                        <h2 className="mt-2 text-[28px] font-extrabold text-white sm:text-[36px]">
                            First-Principles Valuation Foundations
                        </h2>
                    </div>

                    <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Principle 1 */}
                        <div className="border border-[#232833] bg-[#0d0f12] p-6 rounded-sm">
                            <div className="flex items-center justify-between border-b border-[#232833] pb-3">
                                <span className="font-mono text-[12px] font-bold text-accent">01 · MULTIPLE REALISM</span>
                                <span className="font-mono text-[11px] text-[#70757f]">Rule 6 Foundation</span>
                            </div>
                            <h3 className="mt-4 text-[17px] font-bold text-white">Net Capitalization Rate Multiple Anchor</h3>
                            <p className="mt-2 text-[13px] leading-relaxed text-[#8f94a0]">
                                Modern markets operate under elevated rates (10Y Rf = 4.83%). The engine rejects arbitrary 20x-28x multiple steering. Terminal multiples are mathematically anchored to cost of capital:
                            </p>
                            <div className="mt-3 p-3 bg-white/[0.02] border border-[#232833] font-mono text-[12px] text-accent">
                                Terminal Multiple = 1 / (WACC - g)<br />
                                WACC = (E/V × Ke) + (D/V × Kd × (1 - t))<br />
                                Ke = Rf + (Beta × ERP)
                            </div>
                            <p className="mt-3 text-[12px] text-[#70757f]">
                                At WACC = 9.4% and terminal growth g = 3.5%, the binding cap rate is 5.9%, creating an objective multiple anchor of ~17x terminal-year FCF.
                            </p>
                        </div>

                        {/* Principle 2 */}
                        <div className="border border-[#232833] bg-[#0d0f12] p-6 rounded-sm">
                            <div className="flex items-center justify-between border-b border-[#232833] pb-3">
                                <span className="font-mono text-[12px] font-bold text-pos">02 · COMPLETE VALUE CYCLE</span>
                                <span className="font-mono text-[11px] text-[#70757f]">Lifecycle Economics</span>
                            </div>
                            <h3 className="mt-4 text-[17px] font-bold text-white">Captive Installed-Base Service Annuities</h3>
                            <p className="mt-2 text-[13px] leading-relaxed text-[#8f94a0]">
                                In capital goods, aerospace, and medical equipment, mechanical accounting penalizes advance customer down-payments. Our engine credits what they secure:
                            </p>
                            <div className="mt-3 p-3 bg-white/[0.02] border border-[#232833] font-mono text-[12px] text-pos">
                                Transactional Delivery: 10–14% EBITDA margin<br />
                                Installed-Base Annuity: 35%+ EBITDA margin<br />
                                Customer Down-Payments = Capacity Commitment
                            </div>
                            <p className="mt-3 text-[12px] text-[#70757f]">
                                Crediting decades of recurring parts and overhaul contracts prevents falsely labeling wide-moat compounders as overvalued.
                            </p>
                        </div>

                        {/* Principle 3 */}
                        <div className="border border-[#232833] bg-[#0d0f12] p-6 rounded-sm">
                            <div className="flex items-center justify-between border-b border-[#232833] pb-3">
                                <span className="font-mono text-[12px] font-bold text-blue-400">03 · CAUSAL STRESS-TESTING</span>
                                <span className="font-mono text-[11px] text-[#70757f]">Anti-Vacuum Principle</span>
                            </div>
                            <h3 className="mt-4 text-[17px] font-bold text-white">The Contracted Visibility Floor</h3>
                            <p className="mt-2 text-[13px] leading-relaxed text-[#8f94a0]">
                                A Bear Case must represent a plausible cyclical downcycle—not an apocalyptic fiction. For an oligopolist with a 4-year backlog, the Bear Case is bounded:
                            </p>
                            <div className="mt-3 p-3 bg-white/[0.02] border border-[#232833] font-mono text-[12px] text-blue-400">
                                Bear Case = Backlog Durability Floor<br />
                                Models margin de-leverage &amp; order air-pockets<br />
                                Prevents irrational multiple-slashing
                            </div>
                            <p className="mt-3 text-[12px] text-[#70757f]">
                                GEV with a $176B backlog (4.7x revenue) has a Contracted Floor at $600 IV, bounding downside risk and enabling high-conviction asymmetric underwriting.
                            </p>
                        </div>

                        {/* Principle 4 */}
                        <div className="border border-[#232833] bg-[#0d0f12] p-6 rounded-sm">
                            <div className="flex items-center justify-between border-b border-[#232833] pb-3">
                                <span className="font-mono text-[12px] font-bold text-purple-400">04 · MATHEMATICAL SIZING</span>
                                <span className="font-mono text-[11px] text-[#70757f]">Kelly Risk Limits</span>
                            </div>
                            <h3 className="mt-4 text-[17px] font-bold text-white">Fractional Half-Kelly Portfolio Allocation</h3>
                            <p className="mt-2 text-[13px] leading-relaxed text-[#8f94a0]">
                                Position sizes are mathematically optimized to maximize log-wealth growth while completely eliminating the risk of capital impairment:
                            </p>
                            <div className="mt-3 p-3 bg-white/[0.02] border border-[#232833] font-mono text-[12px] text-purple-400">
                                Payoff Skew b = (Bull IV - T0) / (T0 - Bear IV)<br />
                                Full Kelly f* = (p × b - q) / b<br />
                                Portfolio Limit Cap = f* / 2 (Half-Kelly)
                            </div>
                            <p className="mt-3 text-[12px] text-[#70757f]">
                                Scaled down to Half-Kelly or Quarter-Kelly to protect against parameter uncertainty and macro regime shifts.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* The Section 12 Institutional Contract Card */}
            <section className="mx-auto max-w-5xl px-6 py-20">
                <div className="text-center">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
                        The Output Artifact
                    </span>
                    <h2 className="mt-2 text-[28px] font-extrabold text-white sm:text-[36px]">
                        Section 12 Institutional Machine Contract
                    </h2>
                    <p className="mx-auto mt-2 max-w-2xl text-[14px] text-[#8f94a0]">
                        Every depth analysis produces an immutable 4-quadrant execution order that drives both our web dashboard and live trading ledgers.
                    </p>
                </div>

                {/* 4-Quadrant Contract Card Mockup */}
                <div className="mt-12 border border-[#232833] bg-[#14171d] rounded overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between border-b border-[#232833] bg-white/[0.02] px-6 py-4">
                        <div className="flex items-center gap-2.5">
                            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                            <span className="font-mono text-[12px] font-bold uppercase tracking-wider text-accent">
                                Institutional Underwriting Contract (Charter v3.1 / Section 12)
                            </span>
                        </div>
                        <span className="font-mono text-[11px] text-[#70757f]">
                            Sample: GE Vernova Inc. (NYSE: GEV)
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#232833] border-b border-[#232833]">
                        {/* Q1 */}
                        <div className="p-6 space-y-4">
                            <div className="flex items-center justify-between border-b border-[#232833] pb-2">
                                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white">
                                    Quadrant 1: Conviction &amp; Moat Quality
                                </span>
                                <span className="font-mono text-[13px] font-bold text-accent">
                                    11.0 / 15
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-[#70757f] text-[11px]">Conviction Rubric</span>
                                    <div className="font-mono text-[20px] font-bold text-white mt-1">11.0 / 15</div>
                                    <span className="text-pos text-[11px]">High Conviction Core</span>
                                </div>
                                <div>
                                    <span className="text-[#70757f] text-[11px]">Economic Moat</span>
                                    <div className="font-mono text-[20px] font-bold text-accent mt-1">★ 3.6 / 5.0</div>
                                    <span className="text-[#8f94a0] text-[11px]">Widening Direction</span>
                                </div>
                            </div>
                            <p className="text-[12px] text-[#8f94a0] leading-relaxed border-t border-[#232833] pt-3">
                                55,000-turbine fleet, 300% gas turbine price increases over 3 years, 10-20 year service switching costs.
                            </p>
                        </div>

                        {/* Q2 */}
                        <div className="p-6 space-y-4">
                            <div className="flex items-center justify-between border-b border-[#232833] pb-2">
                                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white">
                                    Quadrant 2: Portfolio Risk &amp; Sizing
                                </span>
                                <span className="font-mono text-[13px] font-bold text-pos">
                                    5.5% Cap
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-[#70757f] text-[11px]">Half-Kelly Position Cap</span>
                                    <div className="font-mono text-[20px] font-bold text-pos mt-1">5.5% Max</div>
                                    <span className="text-[#70757f] text-[11px]">Portfolio Risk Budget</span>
                                </div>
                                <div>
                                    <span className="text-[#70757f] text-[11px]">Asymmetric Payoff Skew</span>
                                    <div className="font-mono text-[20px] font-bold text-accent mt-1">1.42x R:R</div>
                                    <span className="text-[#70757f] text-[11px]">Bull Upside vs Bear Risk</span>
                                </div>
                            </div>
                            <p className="text-[12px] text-[#8f94a0] leading-relaxed border-t border-[#232833] pt-3">
                                Downside Hurdle: Passed. Contracted visibility floor bounds Bear Case above $600.00 (-36.9%).
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#232833]">
                        {/* Q3 */}
                        <div className="p-6 space-y-3">
                            <div className="flex items-center justify-between border-b border-[#232833] pb-2">
                                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white">
                                    Quadrant 3: Capital Deployment Tranches
                                </span>
                                <span className="font-mono text-[11px] text-[#70757f]">Limit Orders</span>
                            </div>
                            <div className="space-y-2 font-mono text-[12px]">
                                <div className="flex items-center justify-between p-2.5 bg-[#0d0f12] border border-[#232833] rounded">
                                    <span className="text-[#8f94a0]">Tranche 1 (Starter Limit):</span>
                                    <span className="font-bold text-white">$900.00 (Active Limit)</span>
                                </div>
                                <div className="flex items-center justify-between p-2.5 bg-[#0d0f12] border border-[#232833] rounded">
                                    <span className="text-[#8f94a0]">Tranche 2 (Core Accumulation):</span>
                                    <span className="font-bold text-pos">$750.00 (Heavy Accumulation)</span>
                                </div>
                                <div className="flex items-center justify-between p-2.5 bg-[#0d0f12] border border-[#232833] rounded">
                                    <span className="text-[#70757f]">Exit Review Target:</span>
                                    <span className="font-bold text-accent">$1,450.00 (Bull IV Peak)</span>
                                </div>
                            </div>
                        </div>

                        {/* Q4 */}
                        <div className="p-6 space-y-3">
                            <div className="flex items-center justify-between border-b border-[#232833] pb-2">
                                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-warn">
                                    Quadrant 4: Thesis Invalidation Triggers
                                </span>
                                <span className="font-mono text-[11px] text-warn">Mandatory Stop</span>
                            </div>
                            <ul className="space-y-2 text-[12px] leading-relaxed text-[#8f94a0]">
                                <li className="flex items-start gap-2 p-2 bg-warn/[0.04] border border-warn/20 rounded">
                                    <span className="font-bold text-warn shrink-0">[!]</span>
                                    <span>Total backlog falls below $150B (a 15% decline indicating data-center demand peak).</span>
                                </li>
                                <li className="flex items-start gap-2 p-2 bg-warn/[0.04] border border-warn/20 rounded">
                                    <span className="font-bold text-warn shrink-0">[!]</span>
                                    <span>2027 gas turbine orders fall below 15 GW (a 40% decline from current delivery run rate).</span>
                                </li>
                                <li className="flex items-start gap-2 p-2 bg-warn/[0.04] border border-warn/20 rounded">
                                    <span className="font-bold text-warn shrink-0">[!]</span>
                                    <span>2028 EBITDA framework guidance is cut below $8B.</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Empirical Proof: 5 Case Studies */}
            <section className="border-t border-[#232833] bg-[#14171d]/60 px-6 py-20">
                <div className="mx-auto max-w-5xl">
                    <div className="text-center">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
                            Empirical Track Record
                        </span>
                        <h2 className="mt-2 text-[28px] font-extrabold text-white sm:text-[36px]">
                            Proven Underwriting Across Market Archetypes
                        </h2>
                    </div>

                    <div className="mt-12 space-y-4">
                        {/* GEV */}
                        <div className="border border-[#232833] bg-[#0d0f12] p-5 rounded-sm">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#232833] pb-3">
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-[18px] font-extrabold text-white">GEV</span>
                                    <span className="text-[13px] font-semibold text-[#8f94a0]">GE Vernova Inc. · Capital Goods</span>
                                    <span className="border border-[#4ade80]/30 bg-[#4ade80]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-pos">
                                        AI PROMOTED
                                    </span>
                                </div>
                                <div className="font-mono text-[13px] font-bold text-pos">
                                    $1,100.00 Base IV (+15.7% MoS) vs $951.04 Market
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                                <div><span className="text-[#70757f]">Moat Quality:</span> <b className="text-white">★ 3.6 / 5.0</b></div>
                                <div><span className="text-[#70757f]">Conviction:</span> <b className="text-white">11.0 / 15</b></div>
                                <div><span className="text-[#70757f]">Half-Kelly Cap:</span> <b className="text-pos">5.5% Allocation</b></div>
                                <div><span className="text-[#70757f]">Payoff Skew:</span> <b className="text-accent">1.42x R:R</b></div>
                            </div>
                            <p className="mt-2.5 text-[12px] leading-relaxed text-[#8f94a0]">
                                Credited 55,000-turbine fleet generating 30%+ gross margin service annuities locked into 15-year contracts. Downside bounded by $176B contracted backlog visibility floor.
                            </p>
                        </div>

                        {/* CAT */}
                        <div className="border border-[#232833] bg-[#0d0f12] p-5 rounded-sm">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#232833] pb-3">
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-[18px] font-extrabold text-white">CAT</span>
                                    <span className="text-[13px] font-semibold text-[#8f94a0]">Caterpillar Inc. · Heavy Construction</span>
                                    <span className="border border-[#f87171]/30 bg-[#f87171]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-neg">
                                        CAPITAL PRESERVED
                                    </span>
                                </div>
                                <div className="font-mono text-[13px] font-bold text-neg">
                                    $440.00 Base IV (-46.0% MoS) vs $815.56 Market
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                                <div><span className="text-[#70757f]">Moat Quality:</span> <b className="text-white">★ 4.0 / 5.0</b></div>
                                <div><span className="text-[#70757f]">Conviction:</span> <b className="text-white">10.0 / 15</b></div>
                                <div><span className="text-[#70757f]">Half-Kelly Cap:</span> <b className="text-neg">0.0% (Zero Alloc)</b></div>
                                <div><span className="text-[#70757f]">Payoff Skew:</span> <b className="text-[#70757f]">0.13x (Unfavorable)</b></div>
                            </div>
                            <p className="mt-2.5 text-[12px] leading-relaxed text-[#8f94a0]">
                                Anti-Peak-Cycle discipline. Refused to chase peak multiples on cyclical peak construction equipment earnings. Modeled dealer destocking and margin de-leverage; preserved capital.
                            </p>
                        </div>

                        {/* NVDA */}
                        <div className="border border-[#232833] bg-[#0d0f12] p-5 rounded-sm">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#232833] pb-3">
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-[18px] font-extrabold text-white">NVDA</span>
                                    <span className="text-[13px] font-semibold text-[#8f94a0]">NVIDIA Corporation · Semiconductor Bottleneck</span>
                                    <span className="border border-[#4ade80]/30 bg-[#4ade80]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-pos">
                                        CORE HOLD / TRANCHE
                                    </span>
                                </div>
                                <div className="font-mono text-[13px] font-bold text-pos">
                                    $240.00 Base IV (+7.3% MoS) vs $223.67 Market
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                                <div><span className="text-[#70757f]">Moat Quality:</span> <b className="text-white">★ 3.8 / 5.0</b></div>
                                <div><span className="text-[#70757f]">Conviction:</span> <b className="text-white">12.0 / 15</b></div>
                                <div><span className="text-[#70757f]">Half-Kelly Cap:</span> <b className="text-pos">5.0% Allocation</b></div>
                                <div><span className="text-[#70757f]">Payoff Skew:</span> <b className="text-accent">1.46x R:R</b></div>
                            </div>
                            <p className="mt-2.5 text-[12px] leading-relaxed text-[#8f94a0]">
                                48 tool calls parsed SEC EDGAR disclosures; verified 61% hyperscaler concentration offset by durable 2-year sovereign AI backlog. Invalidation trigger: Data Center YoY &lt; 30%.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Bottom Messenger Share Banner */}
            <section className="border-t border-[#232833] bg-[#0d0f12] px-6 py-16 text-center">
                <div className="mx-auto max-w-2xl">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
                        Immediate Distribution
                    </span>
                    <h3 className="text-[22px] font-extrabold text-white mt-2">
                        Share This Analysis With Your Investment Team
                    </h3>
                    <p className="mt-2 text-[13px] text-[#8f94a0]">
                        One-click copy of the complete institutional text memorandum with full Unicode styling, ASCII architecture boxes, and case studies.
                    </p>
                    <button
                        onClick={handleCopy}
                        className="mt-6 inline-flex items-center gap-2 border border-[#cfa14e] bg-[#cfa14e] px-8 py-3.5 font-mono text-[12px] font-extrabold text-black transition-all hover:bg-[#cfa14e]/90 shadow-lg"
                    >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'COPIED TO CLIPBOARD!' : 'COPY COMPLETE MESSENGER MEMO'}
                    </button>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-[#232833] px-6 py-8 text-center font-mono text-[11px] text-[#70757f]">
                Stockpeak &amp; RS2 Local · Charter v3.1 Institutional Underwriting Specification · All Rights Reserved
            </footer>
        </div>
    );
}
