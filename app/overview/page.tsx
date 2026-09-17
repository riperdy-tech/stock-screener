'use client';

// Executive Brochure & System Architecture Overview (/overview)
// Tailor-crafted for institutional presentations, client walk-throughs, and mobile sharing.

import React, { useState } from 'react';
import Link from 'next/link';
import { 
    Cpu, Shield, Layers, TrendingUp, CheckCircle, Copy, Check, Printer, 
    Share2, ExternalLink, ArrowRight, Activity, Terminal, Database 
} from 'lucide-react';

export default function OverviewPage() {
    const [copied, setCopied] = useState(false);

    const messengerText = `🏛️ STOCKPEAK & RS2 LOCAL
Autonomous Institutional Equity Underwriting Desk
━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 WHAT THE SYSTEM DOES
An autonomous institutional underwriting engine running locally on dedicated inference hardware (NVIDIA RTX 3090, 81.9k context).

Instead of retail momentum chasing or generic AI wrappers, our engine executes live primary-source SEC EDGAR research, derives mathematical cap rates, models multi-decade installed-base service annuities, and enforces fractional Kelly portfolio risk limits.

━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 THE 4-STAGE PIPELINE

1️⃣ STAGE 1: DUAL-DOOR FACTOR FUNNEL
• 2,900+ global equities (US, Korea, Taiwan) scored daily.
• Sector-neutral factor model: Value, Quality, Momentum, Low-Vol, Revisions.
• Forensic stress-tests: Altman Z (<1.81), Sloan Accruals (>10%), Beneish M-Score.
• Funnel: Shortlists the top ~3% (135 stocks) for deep AI underwriting.

2️⃣ STAGE 2: LIVE FORENSIC INVESTIGATION
• Tool-augmented agent runs live SEC EDGAR searches (max 25 calls).
• Fetches full 10-K/10-Q statements, backlog orders, and customer concentration.
• Anti-poisoning filter discards retail blogs and unverified social media noise.

3️⃣ STAGE 3: COGNITIVE UNDERWRITING (Charter v3.1)
• Qwen3.8-27B dense model running on local GPU with MTP 4 speculative decoding (~47 tok/s).
• Rule 6 Realism: Multiple anchored to net cap rate: 1 / (WACC - g).
• Installed-Base Economics: Credits 30%+ gross margin recurring aftermarket service annuities.
• Multi-Scenario Triad: Bear Case (Backlog Floor), Base Case (DCF), Bull Case (Leverage).

4️⃣ STAGE 4: ADAPTIVE CONSENSUS & LEDGERS
• Two independent random seeds run concurrently.
• Spread <= 15% ──> Level 0 Early-Stop (~38–44 min, ~40% faster).
• Spread > 15%  ──> Escalated to Sample 3 (~55–65 min).
• Synthesizes Section 12 Machine Contract with Kelly Sizing, Tranches, and Invalidation Triggers.

━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 EMPIRICAL PROOF (CASE STUDIES)

• GEV (GE Vernova): Underwritten at $1,100 IV vs $951 market (+15.7% MoS). Credited 55,000-turbine fleet recurring service annuity. Kelly Cap: 5.5%.
• CAT (Caterpillar): Avoided at $440 IV vs $815 market (-46% below market). Refused to chase peak-cycle multiples. Kelly Cap: 0.0% (Capital Preserved).
• NVDA (NVIDIA): Underwritten at $240 IV (+7.3% MoS) via 48 live tool calls parsing hyperscaler concentration vs sovereign AI backlog. Kelly Cap: 5.0%.

━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 LIVE PORTAL: https://stockpeak.net
📄 FULL BROCHURE: https://stockpeak.net/overview`;

    const handleCopy = () => {
        navigator.clipboard.writeText(messengerText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <div className="min-h-screen bg-[#0d0f12] text-[#c3bfb5] selection:bg-accent/30 selection:text-white">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-50 border-b border-[#232833] bg-[#0d0f12]/90 backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="font-mono text-[18px] font-extrabold tracking-wider text-white hover:text-accent">
                            STOCKPEAK
                        </Link>
                        <span className="hidden sm:inline-block font-mono text-[11px] text-[#70757f]">
                            / INSTITUTIONAL OVERVIEW
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleCopy}
                            className="inline-flex items-center gap-1.5 border border-[#232833] bg-white/[0.03] px-3.5 py-1.5 font-mono text-[11px] font-semibold text-white transition-colors hover:border-accent hover:text-accent"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-pos" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? 'COPIED FOR CHAT!' : 'COPY FOR MESSENGER'}
                        </button>

                        <button
                            onClick={() => window.print()}
                            className="hidden sm:inline-flex items-center gap-1.5 border border-[#232833] bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-[#70757f] hover:border-white hover:text-white"
                        >
                            <Printer className="h-3.5 w-3.5" />
                            PRINT / PDF
                        </button>

                        <Link
                            href="/"
                            className="border border-[#cfa14e]/40 bg-[#cfa14e]/10 px-3.5 py-1.5 font-mono text-[11px] font-bold text-[#cfa14e] hover:bg-[#cfa14e]/20"
                        >
                            LAUNCH DESK ↗
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="border-b border-[#232833] bg-gradient-to-b from-[#14171d] to-[#0d0f12] px-6 py-16 text-center sm:py-20">
                <div className="mx-auto max-w-4xl">
                    <div className="inline-flex items-center gap-2 border border-[#cfa14e]/30 bg-[#cfa14e]/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-[#cfa14e] rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#cfa14e] animate-ping" />
                        Charter v3.1 Institutional Underwriting Specification
                    </div>

                    <h1 className="mt-6 text-[32px] font-extrabold tracking-tight text-white sm:text-[46px] leading-[1.15]">
                        Autonomous Agentic Equity Underwriting &amp; Execution Ledgers
                    </h1>

                    <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-[#8f94a0] sm:text-[17px]">
                        A local-LLM institutional valuation desk running on dedicated hardware. Eliminating retail momentum chasing through first-principles financial engineering, installed-base service durability, and mathematical Kelly sizing.
                    </p>

                    <div className="mt-8 flex flex-wrap justify-center gap-4 text-left font-mono text-[12px]">
                        <div className="border border-[#232833] bg-[#14171d] px-4 py-2.5 rounded-sm">
                            <span className="block text-[#70757f] text-[10px] uppercase">Engine</span>
                            <span className="font-bold text-white">rs2-analyst-deep-mtp5</span>
                        </div>
                        <div className="border border-[#232833] bg-[#14171d] px-4 py-2.5 rounded-sm">
                            <span className="block text-[#70757f] text-[10px] uppercase">Inference</span>
                            <span className="font-bold text-white">NVIDIA RTX 3090 (24GB)</span>
                        </div>
                        <div className="border border-[#232833] bg-[#14171d] px-4 py-2.5 rounded-sm">
                            <span className="block text-[#70757f] text-[10px] uppercase">Throughput</span>
                            <span className="font-bold text-pos">~47 tok/s (MTP 4)</span>
                        </div>
                        <div className="border border-[#232833] bg-[#14171d] px-4 py-2.5 rounded-sm">
                            <span className="block text-[#70757f] text-[10px] uppercase">Context Window</span>
                            <span className="font-bold text-accent">81,920 Tokens</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Visual Pipeline Flowchart (Pure SVG, 100% Mobile Compatible) */}
            <section className="mx-auto max-w-5xl px-6 py-16">
                <div className="text-center">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
                        System Mechanics
                    </span>
                    <h2 className="mt-2 text-[26px] font-extrabold text-white sm:text-[32px]">
                        The 4-Stage Value Engine
                    </h2>
                    <p className="mt-2 text-[14px] text-[#70757f]">
                        From 2,900+ multi-market equities down to binding capital execution contracts.
                    </p>
                </div>

                {/* Interactive SVG Flowchart */}
                <div className="mt-10 overflow-x-auto border border-[#232833] bg-[#14171d] p-6 rounded-sm">
                    <svg viewBox="0 0 900 320" className="w-full min-w-[700px] text-[12px] font-mono">
                        {/* Background Grids */}
                        <defs>
                            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#5a9b6d" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="#6b93c4" stopOpacity="0.2" />
                            </linearGradient>
                            <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#6b93c4" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="#cfa14e" stopOpacity="0.2" />
                            </linearGradient>
                            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                <path d="M 0 1 L 8 5 L 0 9 z" fill="#70757f" />
                            </marker>
                        </defs>

                        {/* Stage 1: Quant Pre-Screen */}
                        <g transform="translate(10, 20)">
                            <rect width="195" height="260" rx="4" fill="#0d0f12" stroke="#232833" strokeWidth="1.5" />
                            <rect width="195" height="32" rx="4" fill="#5a9b6d" fillOpacity="0.15" />
                            <text x="12" y="21" fill="#4ade80" fontWeight="bold" fontSize="11">1. QUANT PRE-SCREEN</text>
                            
                            <text x="12" y="60" fill="#ffffff" fontWeight="bold" fontSize="13">2,900+ Equities</text>
                            <text x="12" y="80" fill="#70757f" fontSize="11">US · Korea · Taiwan</text>
                            
                            <line x1="12" y1="95" x2="183" y2="95" stroke="#232833" strokeWidth="1" />
                            <text x="12" y="120" fill="#8f94a0" fontSize="11">• Dual-Door Factor Model</text>
                            <text x="12" y="140" fill="#8f94a0" fontSize="11">• Sector-Neutral z-scores</text>
                            <text x="12" y="160" fill="#8f94a0" fontSize="11">• Altman Z &gt; 1.81 Solvency</text>
                            <text x="12" y="180" fill="#8f94a0" fontSize="11">• Sloan Accrual &lt; 10%</text>

                            <rect x="12" y="215" width="171" height="48" rx="2" fill="#14171d" stroke="#5a9b6d" strokeWidth="1" />
                            <text x="20" y="235" fill="#4ade80" fontWeight="bold" fontSize="11">Top ~3% Shortlist</text>
                            <text x="20" y="252" fill="#70757f" fontSize="10">135 Nominated Tickers</text>
                        </g>

                        {/* Arrow 1 */}
                        <line x1="215" y1="150" x2="238" y2="150" stroke="#70757f" strokeWidth="1.5" markerEnd="url(#arrow)" />

                        {/* Stage 2: Forensic Research */}
                        <g transform="translate(245, 20)">
                            <rect width="195" height="260" rx="4" fill="#0d0f12" stroke="#232833" strokeWidth="1.5" />
                            <rect width="195" height="32" rx="4" fill="#6b93c4" fillOpacity="0.15" />
                            <text x="12" y="21" fill="#60a5fa" fontWeight="bold" fontSize="11">2. LIVE FORENSIC TOOLS</text>
                            
                            <text x="12" y="60" fill="#ffffff" fontWeight="bold" fontSize="13">Primary SEC Data</text>
                            <text x="12" y="80" fill="#70757f" fontSize="11">SearXNG Scraper Agent</text>
                            
                            <line x1="12" y1="95" x2="183" y2="95" stroke="#232833" strokeWidth="1" />
                            <text x="12" y="120" fill="#8f94a0" fontSize="11">• Max 25 Tool Calls</text>
                            <text x="12" y="140" fill="#8f94a0" fontSize="11">• 75% Jaccard Dedup</text>
                            <text x="12" y="160" fill="#8f94a0" fontSize="11">• 10-K/10-Q Financials</text>
                            <text x="12" y="180" fill="#8f94a0" fontSize="11">• Backlog Order Intake</text>

                            <rect x="12" y="215" width="171" height="48" rx="2" fill="#14171d" stroke="#60a5fa" strokeWidth="1" />
                            <text x="20" y="235" fill="#60a5fa" fontWeight="bold" fontSize="11">Audited Fact Pack</text>
                            <text x="20" y="252" fill="#70757f" fontSize="10">Zero Retail Hallucinations</text>
                        </g>

                        {/* Arrow 2 */}
                        <line x1="450" y1="150" x2="473" y2="150" stroke="#70757f" strokeWidth="1.5" markerEnd="url(#arrow)" />

                        {/* Stage 3: Cognitive Engine */}
                        <g transform="translate(480, 20)">
                            <rect width="195" height="260" rx="4" fill="#0d0f12" stroke="#232833" strokeWidth="1.5" />
                            <rect width="195" height="32" rx="4" fill="#cfa14e" fillOpacity="0.15" />
                            <text x="12" y="21" fill="#cfa14e" fontWeight="bold" fontSize="11">3. CHARTER V3.1 ENGINE</text>
                            
                            <text x="12" y="60" fill="#ffffff" fontWeight="bold" fontSize="13">Cognitive DCF</text>
                            <text x="12" y="80" fill="#70757f" fontSize="11">Local Qwen3.8-27B (3090)</text>
                            
                            <line x1="12" y1="95" x2="183" y2="95" stroke="#232833" strokeWidth="1" />
                            <text x="12" y="120" fill="#8f94a0" fontSize="11">• Net Cap Rate Anchor</text>
                            <text x="12" y="140" fill="#8f94a0" fontSize="11">• Installed-Base Annuity</text>
                            <text x="12" y="160" fill="#8f94a0" fontSize="11">• Valuation Triad (3-Case)</text>
                            <text x="12" y="180" fill="#8f94a0" fontSize="11">• Backlog Visibility Floor</text>

                            <rect x="12" y="215" width="171" height="48" rx="2" fill="#14171d" stroke="#cfa14e" strokeWidth="1" />
                            <text x="20" y="235" fill="#cfa14e" fontWeight="bold" fontSize="11">Section 12 Contract</text>
                            <text x="20" y="252" fill="#70757f" fontSize="10">Conviction /15 · Moat /5</text>
                        </g>

                        {/* Arrow 3 */}
                        <line x1="685" y1="150" x2="708" y2="150" stroke="#70757f" strokeWidth="1.5" markerEnd="url(#arrow)" />

                        {/* Stage 4: Consensus & Ledgers */}
                        <g transform="translate(715, 20)">
                            <rect width="175" height="260" rx="4" fill="#0d0f12" stroke="#232833" strokeWidth="1.5" />
                            <rect width="175" height="32" rx="4" fill="#9a83c2" fillOpacity="0.15" />
                            <text x="12" y="21" fill="#c084fc" fontWeight="bold" fontSize="11">4. EXECUTION LEDGER</text>
                            
                            <text x="12" y="60" fill="#ffffff" fontWeight="bold" fontSize="13">Adaptive Consensus</text>
                            <text x="12" y="80" fill="#70757f" fontSize="11">Spread &le; 15% Early Stop</text>
                            
                            <line x1="12" y1="95" x2="163" y2="95" stroke="#232833" strokeWidth="1" />
                            <text x="12" y="120" fill="#8f94a0" fontSize="11">• Half-Kelly Position Cap</text>
                            <text x="12" y="140" fill="#8f94a0" fontSize="11">• Tranche Accumulation</text>
                            <text x="12" y="160" fill="#8f94a0" fontSize="11">• Invalidation Triggers</text>
                            <text x="12" y="180" fill="#8f94a0" fontSize="11">• AI Promotion/Demote</text>

                            <rect x="12" y="215" width="151" height="48" rx="2" fill="#14171d" stroke="#c084fc" strokeWidth="1" />
                            <text x="20" y="235" fill="#c084fc" fontWeight="bold" fontSize="11">stockpeak.net</text>
                            <text x="20" y="252" fill="#70757f" fontSize="10">Real-Time Ledger Audit</text>
                        </g>
                    </svg>
                </div>
            </section>

            {/* Core Pillars: The Institutional Standard */}
            <section className="border-t border-[#232833] bg-[#14171d]/60 px-6 py-16">
                <div className="mx-auto max-w-5xl">
                    <div className="text-center">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
                            Institutional Tenets
                        </span>
                        <h2 className="mt-2 text-[26px] font-extrabold text-white sm:text-[32px]">
                            Why We Differ From Retail &amp; Standard AI
                        </h2>
                    </div>

                    <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
                        <div className="border border-[#232833] bg-[#0d0f12] p-6 rounded-sm">
                            <div className="flex h-10 w-10 items-center justify-center rounded bg-[#cfa14e]/10 text-accent font-bold">
                                01
                            </div>
                            <h3 className="mt-4 text-[16px] font-bold text-white">Systemic Integrity</h3>
                            <p className="mt-2 text-[13px] leading-relaxed text-[#8f94a0]">
                                No heuristic band-aids. When a valuation anomaly occurs, we resolve the architectural root cause at the engine level rather than patching narrow ticker exceptions.
                            </p>
                        </div>

                        <div className="border border-[#232833] bg-[#0d0f12] p-6 rounded-sm">
                            <div className="flex h-10 w-10 items-center justify-center rounded bg-[#4ade80]/10 text-pos font-bold">
                                02
                            </div>
                            <h3 className="mt-4 text-[16px] font-bold text-white">Installed-Base Economics</h3>
                            <p className="mt-2 text-[13px] leading-relaxed text-[#8f94a0]">
                                Capital equipment deliveries are leading indicators of expanding captive installed bases. We credit the multi-decade 30%+ gross margin recurring aftermarket service annuities they secure.
                            </p>
                        </div>

                        <div className="border border-[#232833] bg-[#0d0f12] p-6 rounded-sm">
                            <div className="flex h-10 w-10 items-center justify-center rounded bg-[#60a5fa]/10 text-blue-400 font-bold">
                                03
                            </div>
                            <h3 className="mt-4 text-[16px] font-bold text-white">Mathematical Risk Sizing</h3>
                            <p className="mt-2 text-[13px] leading-relaxed text-[#8f94a0]">
                                Exit multiples are anchored to prevailing net cap rates <code>1 / (WACC - g)</code>. Positions are capped via fractional Kelly criterion with explicit, falsifiable operational stop triggers.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Empirical Proof: 5 Case Studies */}
            <section className="mx-auto max-w-5xl px-6 py-16">
                <div className="text-center">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
                        Empirical Validation
                    </span>
                    <h2 className="mt-2 text-[26px] font-extrabold text-white sm:text-[32px]">
                        Cross-Archetype Underwriting Proof
                    </h2>
                </div>

                <div className="mt-10 space-y-4">
                    {/* GEV */}
                    <div className="border border-[#232833] bg-[#14171d] p-5 rounded-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#232833] pb-3">
                            <div className="flex items-center gap-3">
                                <span className="font-mono text-[18px] font-extrabold text-white">GEV</span>
                                <span className="text-[13px] font-semibold text-[#8f94a0]">GE Vernova Inc.</span>
                                <span className="border border-[#4ade80]/30 bg-[#4ade80]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-pos">
                                    AI PROMOTED
                                </span>
                            </div>
                            <div className="font-mono text-[13px] font-bold text-pos">
                                $1,100.00 Base IV (+15.7% MoS) vs $951.04 Market
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                            <div><span className="text-[#70757f]">Moat:</span> <b className="text-white">★ 3.6 / 5.0</b></div>
                            <div><span className="text-[#70757f]">Conviction:</span> <b className="text-white">11.0 / 15</b></div>
                            <div><span className="text-[#70757f]">Half-Kelly Cap:</span> <b className="text-pos">5.5% Allocation</b></div>
                            <div><span className="text-[#70757f]">Payoff Skew:</span> <b className="text-accent">1.42x R:R</b></div>
                        </div>
                        <p className="mt-2.5 text-[12px] leading-relaxed text-[#8f94a0]">
                            Credited 55,000-turbine fleet generating 30%+ gross margin service annuities locked into 15-year contracts. Downside bounded by $176B contracted backlog visibility floor.
                        </p>
                    </div>

                    {/* CAT */}
                    <div className="border border-[#232833] bg-[#14171d] p-5 rounded-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#232833] pb-3">
                            <div className="flex items-center gap-3">
                                <span className="font-mono text-[18px] font-extrabold text-white">CAT</span>
                                <span className="text-[13px] font-semibold text-[#8f94a0]">Caterpillar Inc.</span>
                                <span className="border border-[#f87171]/30 bg-[#f87171]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-neg">
                                    CAPITAL PRESERVED
                                </span>
                            </div>
                            <div className="font-mono text-[13px] font-bold text-neg">
                                $440.00 Base IV (-46.0% MoS) vs $815.56 Market
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                            <div><span className="text-[#70757f]">Moat:</span> <b className="text-white">★ 4.0 / 5.0</b></div>
                            <div><span className="text-[#70757f]">Conviction:</span> <b className="text-white">10.0 / 15</b></div>
                            <div><span className="text-[#70757f]">Half-Kelly Cap:</span> <b className="text-neg">0.0% (Zero)</b></div>
                            <div><span className="text-[#70757f]">Payoff Skew:</span> <b className="text-[#70757f]">0.13x (Unfavorable)</b></div>
                        </div>
                        <p className="mt-2.5 text-[12px] leading-relaxed text-[#8f94a0]">
                            Anti-Peak-Cycle discipline in action. Refused to chase peak multiples on cyclical peak earnings. Modeled dealer destocking and margin de-leverage; preserved capital.
                        </p>
                    </div>

                    {/* NVDA */}
                    <div className="border border-[#232833] bg-[#14171d] p-5 rounded-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#232833] pb-3">
                            <div className="flex items-center gap-3">
                                <span className="font-mono text-[18px] font-extrabold text-white">NVDA</span>
                                <span className="text-[13px] font-semibold text-[#8f94a0]">NVIDIA Corporation</span>
                                <span className="border border-[#4ade80]/30 bg-[#4ade80]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-pos">
                                    CORE HOLD / TRANCHE
                                </span>
                            </div>
                            <div className="font-mono text-[13px] font-bold text-pos">
                                $240.00 Base IV (+7.3% MoS) vs $223.67 Market
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                            <div><span className="text-[#70757f]">Moat:</span> <b className="text-white">★ 3.8 / 5.0</b></div>
                            <div><span className="text-[#70757f]">Conviction:</span> <b className="text-white">12.0 / 15</b></div>
                            <div><span className="text-[#70757f]">Half-Kelly Cap:</span> <b className="text-pos">5.0% Allocation</b></div>
                            <div><span className="text-[#70757f]">Payoff Skew:</span> <b className="text-accent">1.46x R:R</b></div>
                        </div>
                        <p className="mt-2.5 text-[12px] leading-relaxed text-[#8f94a0]">
                            48 tool calls parsed SEC EDGAR disclosures; verified 61% hyperscaler concentration offset by durable 2-year sovereign AI backlog. Invalidation trigger: Data Center YoY &lt; 30%.
                        </p>
                    </div>
                </div>
            </section>

            {/* Messenger Sharing Callout */}
            <section className="border-t border-[#232833] bg-[#14171d] px-6 py-12 text-center">
                <div className="mx-auto max-w-2xl">
                    <h3 className="text-[20px] font-extrabold text-white">Share With Your Investment Committee</h3>
                    <p className="mt-2 text-[13px] text-[#8f94a0]">
                        Click below to copy a pristine, emoji-formatted executive summary optimized for Telegram, WhatsApp, KakaoTalk, and Slack.
                    </p>
                    <button
                        onClick={handleCopy}
                        className="mt-6 inline-flex items-center gap-2 border border-accent bg-accent/10 px-6 py-3 font-mono text-[12px] font-bold text-accent transition-colors hover:bg-accent/20"
                    >
                        {copied ? <Check className="h-4 w-4 text-pos" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'COPIED TO CLIPBOARD!' : 'COPY MESSENGER SUMMARY'}
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
