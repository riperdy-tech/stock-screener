'use client';

// Decision Cockpit — primary decision surface for the Factor Lab engine.
// Tabs: Rankings (sector-neutral factor composite), Research Queue,
// Portfolio (rendered plan), Validation (backtest/outcomes/IC evidence).
// The four legacy lenses live unchanged at /lenses.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
    Activity, ArrowUpRight, BarChart3, Briefcase, ExternalLink, FlaskConical,
    HelpCircle, Layers3, Microscope, RefreshCw, Search, ShieldAlert, X,
} from 'lucide-react';
import {
    Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    fetchBacktest, fetchFactorIc, fetchFactorScores, fetchOutcomes,
    fetchOverlaySignals, fetchPortfolioPlan, fetchStocks, fetchValuationModels,
    FactorEntry, FactorScoresPayload, ValuationModel,
} from '@/lib/data-service';
import { dcfValue } from '@/lib/dcf';
import { quarterKelly, POSITION_CAP_PCT } from '@/lib/kelly';

type TabId = 'rankings' | 'research' | 'portfolio' | 'validation';

interface StockInfo {
    name: string;
    sector: string;
    industry: string;
    price: number;
    marketCap: number;
}

// Five robust factors, equal-weighted (theme = context tag, never additive)
const FACTOR_ORDER = ['value', 'quality', 'momentum', 'lowvol', 'revisions'] as const;
const FACTOR_COLORS: Record<string, string> = {
    value: '#34d399', quality: '#38bdf8', momentum: '#fbbf24',
    lowvol: '#a78bfa', revisions: '#fb7185',
};
const GPR_STYLES: Record<number, string> = {
    0: 'border-border bg-secondary/30 text-muted-foreground',
    1: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    2: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    3: 'border-red-500/40 bg-red-500/10 text-red-300',
};

function OverlayChips({ overlay }: { overlay: any }) {
    if (!overlay) return null;
    const gpr = overlay.gpr;
    const demand = overlay.informed_demand;
    return (
        <span className="inline-flex items-center gap-1.5">
            {gpr && gpr.gpr_level !== undefined && (
                <span className={clsx('inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider', GPR_STYLES[gpr.gpr_level] || GPR_STYLES[0])}
                    title={`Geopolitical exposure ${gpr.gpr_level}/3${gpr.channels?.length ? ` (${gpr.channels.join(', ')})` : ''}: ${gpr.note || ''}`}>
                    GPR {gpr.gpr_level}
                </span>
            )}
            {demand === 1 && <span className="text-[10px] font-black text-emerald-300" title="Informed demand positive: insider net buying without rising short interest">▲ INSIDERS</span>}
            {demand === -1 && <span className="text-[10px] font-black text-red-300" title="Informed demand negative: insider selling with elevated/rising short interest">▼ INSIDERS</span>}
        </span>
    );
}
const BAND_STYLES: Record<string, string> = {
    research_now: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    watchlist: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
    monitor: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    pass: 'border-border bg-secondary/30 text-muted-foreground',
};

function fmtMcap(v: number | undefined): string {
    if (!v) return '—';
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${v.toFixed(0)}`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
    if (v === null || v === undefined) return '—';
    return `${(v * 100).toFixed(digits)}%`;
}

function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-border/60 bg-secondary/10 p-3">
            <h3 className="mb-1.5 text-xs font-black uppercase tracking-wider text-emerald-300">{title}</h3>
            <div className="space-y-1.5 text-xs leading-relaxed text-foreground/90">{children}</div>
        </section>
    );
}

function HelpModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between">
                    <h2 className="text-lg font-black">How this page works</h2>
                    <button onClick={onClose} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="mt-3 space-y-3">
                    <HelpSection title="The big picture">
                        <p>Every day the system scores ~6,600 US stocks and ranks them with ONE composite number built from six &quot;factors&quot; — measurable traits that have historically predicted returns. The top 3% become the <b>Research Now</b> list. Nothing here is a buy order; it is a ranked shortlist plus the evidence for and against each name.</p>
                    </HelpSection>

                    <HelpSection title="Rankings tab">
                        <p><b>Composite</b> (0–100): the weighted mix of six factor scores. Each factor is measured against the stock&apos;s OWN SECTOR — a bank competes with banks, so &quot;high momentum&quot; can&apos;t just mean &quot;is a tech stock.&quot;</p>
                        <p><b>The five factors</b>: <span className="text-emerald-300">value</span> (cheap vs cash flows), <span className="text-sky-300">quality</span> (profitable, stable, clean accounting), <span className="text-amber-300">momentum</span> (12-month winner, near its high), <span className="text-violet-300">low-vol</span> (calm price behavior), <span className="text-rose-300">revisions</span> (estimates improving). They are <b>equal-weighted on purpose</b>: decades of research (DeMiguel et al. 2009) show weights estimated from backtests overfit and lose to simple 1/N out-of-sample. We still MEASURE each factor&apos;s predictive power (Validation tab) — we just don&apos;t let short samples steer the engine.</p>
                        <p><b>Theme is a context tag, not a factor</b>: naive theme-chasing destroys value (specialized theme ETFs average −3.1%/yr), so theme membership is shown for orientation and risk (late-cycle crowding warnings) but never adds to the score.</p>
                        <p><b>Band</b>: Research Now = top 3% · Watchlist = top 10% · Monitor = top 30% · Pass = the rest.</p>
                        <p><b>Veto</b> (red chip): automatic disqualification regardless of score — failed the reverse engine&apos;s safety checks, fired both forensic-accounting alarms, or is heavily diluting shareholders. The reason is written on the chip.</p>
                        <p><b>DCF gap</b>: compares the growth the current PRICE requires vs the growth the company has actually DELIVERED (last 5 years of SEC filings). <span className="text-emerald-300">Green negative</span> = priced for less growth than demonstrated (potential bargain). <span className="text-amber-300">Amber positive</span> = price needs acceleration nobody has proven yet (you must believe a story).</p>
                        <p>Click any row for the per-stock detail: factor profile + an interactive valuation workbench where you can drag growth/discount sliders and watch fair value change.</p>
                    </HelpSection>

                    <HelpSection title="Research Queue tab">
                        <p>Just the Research Now names as cards. Suggested workflow: click a card → read the factor profile → read the valuation verdict → if still interesting, open the Lenses view and run the AI deep-dive. A high rank earns a stock your ATTENTION, never an automatic buy.</p>
                    </HelpSection>

                    <HelpSection title="Portfolio tab">
                        <p><b>My Portfolio (top)</b>: enter your ACTUAL holdings (saved only in this browser) and each is checked against the model: a quarter-Kelly suggested size, an over/under-weight verdict, and loud flags if a holding is vetoed or outside coverage.</p>
                        <p><b>Suggested plan (below)</b>: NOT your portfolio — a machine-built allocation from the Research Now list. <b>Sizing is quarter-Kelly</b>: expected edge = the expectations gap closing over ~3 years (only names priced BELOW their demonstrated growth have measurable edge — that&apos;s why many high-ranked names are skipped with &quot;no Kelly edge&quot;); risk = price volatility; f = 0.25 × edge/risk², capped at 5%. Forensic flags halve size; geopolitical exposure (GPR 2-3) and insider selling shrink it further; sector 25% / theme 30% caps; the rest stays cash.</p>
                        <p><b>Macro flags</b>: warning lights from Fed data. If 2+ fire, every size halves automatically.</p>
                    </HelpSection>

                    <HelpSection title="Overlay chips (GPR / insiders)">
                        <p><b>GPR 0-3</b>: geopolitical exposure tagged from the company&apos;s actual business profile (revenue geography, supply chains, regulation, sanctions). Never a buy/sell signal — it shrinks position sizes and demands a bigger margin of safety at level 3.</p>
                        <p><b>▲/▼ INSIDERS</b>: &quot;informed demand&quot; — insiders net-buying while short sellers retreat (▲, confirming) or insiders selling into elevated short interest (▼, interrogate the thesis). Confirmation/warning only, never additive score.</p>
                    </HelpSection>

                    <HelpSection title="Validation tab — &quot;does this even work?&quot;">
                        <p><b>Equity curve</b>: growth of $1 since 2017. Green line = buying the strategy&apos;s top-decile picks each quarter (simulated). Grey = IWM, the small-cap index ETF (the &quot;just buy the market&quot; alternative). Green above grey = the method beat the market in simulation.</p>
                        <p><b>Quarterly excess bars</b>: one bar per quarter = strategy return MINUS index return. Above zero = won that quarter. Expect plenty of losing quarters — a good system wins modestly more often than it loses.</p>
                        <p><b>Factor IC chart</b>: each line = one factor&apos;s &quot;prediction score&quot; per quarter (correlation between the factor&apos;s ranking and what actually happened next quarter). Above zero = the factor helped. These measured values are exactly what sets the composite weights — the system trusts factors in proportion to their evidence.</p>
                        <p><b>Live signal outcomes</b>: the honest table. Every day the system publishes its lists; this table fills in their REAL forward returns as time passes (first results ~2 weeks after launch). Simulation can fool you; this can&apos;t.</p>
                        <p><b>The yellow banner</b>: the simulation only sees companies that still exist today — the ones that went bankrupt are invisible, which flatters every number. Treat backtest results as an upper bound; trust the live outcomes table more as it fills in.</p>
                    </HelpSection>

                    <HelpSection title="Where the data comes from">
                        <p>SEC filings (10 years of fundamentals), Yahoo Finance (prices, estimates), FRED (Fed macro data). The whole pipeline re-runs daily via GitHub Actions; weights recalibrate monthly from measured evidence.</p>
                    </HelpSection>
                </div>
            </div>
        </div>
    );
}

function BandChip({ band, veto }: { band: string | null; veto: string | null }) {
    if (veto) {
        return (
            <span className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-300">
                <ShieldAlert className="h-3 w-3" /> {veto.replace(/_/g, ' ')}
            </span>
        );
    }
    if (!band) return <span className="text-xs text-muted-foreground">—</span>;
    return (
        <span className={clsx('inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider', BAND_STYLES[band] || BAND_STYLES.pass)}>
            {band.replace(/_/g, ' ')}
        </span>
    );
}

function ContributionBar({ entry }: { entry: FactorEntry }) {
    const contributions = entry.fct_contributions;
    if (!contributions) return <div className="h-2 w-full rounded bg-secondary/40" />;
    const total = FACTOR_ORDER.reduce((s, f) => s + Math.abs(contributions[f] ?? 0), 0) || 1;
    return (
        <div className="flex h-2 w-full overflow-hidden rounded bg-secondary/40" title={
            FACTOR_ORDER.map(f => `${f}: ${contributions[f] !== undefined ? contributions[f].toFixed(2) : '—'}`).join('  ')
        }>
            {FACTOR_ORDER.map(f => {
                const c = contributions[f];
                if (c === undefined || c === null) return null;
                return (
                    <div
                        key={f}
                        style={{ width: `${(Math.abs(c) / total) * 100}%`, backgroundColor: FACTOR_COLORS[f], opacity: c >= 0 ? 0.95 : 0.3 }}
                    />
                );
            })}
        </div>
    );
}

function FactorProfile({ entry }: { entry: FactorEntry }) {
    const z = entry.fct_z || {};
    return (
        <div className="space-y-1.5">
            {FACTOR_ORDER.map(f => {
                const v = z[f];
                const width = v === null || v === undefined ? 0 : Math.min(Math.abs(v) / 3, 1) * 50;
                return (
                    <div key={f} className="flex items-center gap-2 text-xs">
                        <span className="w-20 shrink-0 font-bold uppercase tracking-wider text-muted-foreground">{f}</span>
                        <div className="relative h-3 flex-1 rounded bg-secondary/40">
                            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                            {v !== null && v !== undefined && (
                                <div
                                    className="absolute inset-y-0 rounded-sm"
                                    style={{
                                        backgroundColor: FACTOR_COLORS[f],
                                        left: v >= 0 ? '50%' : `${50 - width}%`,
                                        width: `${width}%`,
                                        opacity: 0.9,
                                    }}
                                />
                            )}
                        </div>
                        <span className="w-12 shrink-0 text-right font-mono font-black">
                            {v === null || v === undefined ? '—' : v.toFixed(2)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function ValuationWorkbench({ ticker, model, marketCap }: { ticker: string; model: ValuationModel | undefined; marketCap: number | undefined }) {
    const a = model?.assumptions;
    const [growth, setGrowth] = useState<number>(model?.implied_growth ?? 0.08);
    const [wacc, setWacc] = useState<number>(a ? a.wacc / 100 : 0.10);

    useEffect(() => {
        setGrowth(model?.implied_growth ?? 0.08);
        setWacc(a ? a.wacc / 100 : 0.10);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticker]);

    if (!model || model.implied_growth === null || !a) {
        return (
            <p className="text-xs text-muted-foreground">
                No reverse-DCF model{model?.reason ? ` (${model.reason.replace(/_/g, ' ')})` : ''} — typically negative base cash flow or missing fundamentals.
            </p>
        );
    }

    const fair = dcfValue({ baseCf: a.base_cf, growth, wacc, terminalGrowth: a.terminal_growth });
    const mcap = marketCap || a.market_cap;
    const upside = fair !== null && mcap ? fair / mcap - 1 : null;
    const evidenced = model.hist_revenue_cagr_5y;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border/60 bg-secondary/20 p-2">
                    <div className="font-bold uppercase tracking-wider text-muted-foreground">Price implies</div>
                    <div className="mt-1 font-mono text-lg font-black text-amber-300">{fmtPct(model.implied_growth)}/yr</div>
                    <div className="text-[10px] text-muted-foreground">growth for 5y (then fade)</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-secondary/20 p-2">
                    <div className="font-bold uppercase tracking-wider text-muted-foreground">Demonstrated</div>
                    <div className="mt-1 font-mono text-lg font-black text-sky-300">{evidenced !== null && evidenced !== undefined ? `${fmtPct(evidenced)}/yr` : '—'}</div>
                    <div className="text-[10px] text-muted-foreground">5y revenue CAGR (SEC)</div>
                </div>
            </div>
            {model.verdict && (
                <p className={clsx('rounded-md border p-2 text-xs font-semibold',
                    (model.expectations_gap_pts ?? 0) > 5 ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : (model.expectations_gap_pts ?? 0) < -5 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                            : 'border-border bg-secondary/20 text-muted-foreground')}>
                    {model.verdict}
                </p>
            )}
            <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Scenario sliders (live DCF)</div>
                <label className="block text-xs">
                    <span className="flex justify-between"><span>Stage-1 growth</span><span className="font-mono font-black">{fmtPct(growth)}</span></span>
                    <input type="range" min={-30} max={60} step={1} value={Math.round(growth * 100)}
                        onChange={e => setGrowth(Number(e.target.value) / 100)} className="w-full accent-emerald-400" />
                </label>
                <label className="block text-xs">
                    <span className="flex justify-between"><span>Discount rate (WACC)</span><span className="font-mono font-black">{fmtPct(wacc)}</span></span>
                    <input type="range" min={6} max={16} step={0.5} value={wacc * 100}
                        onChange={e => setWacc(Number(e.target.value) / 100)} className="w-full accent-sky-400" />
                </label>
                <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                    <span className="text-muted-foreground">Fair value vs market cap</span>
                    <span className={clsx('font-mono text-sm font-black', upside !== null && upside >= 0 ? 'text-success' : 'text-danger')}>
                        {fair !== null ? fmtMcap(fair) : '—'} ({upside !== null ? `${upside >= 0 ? '+' : ''}${(upside * 100).toFixed(0)}%` : '—'})
                    </span>
                </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
                Base: {fmtMcap(a.base_cf)} {a.base_cf_kind.replace(/_/g, ' ')} (FY{a.fiscal_year}) · terminal {fmtPct(a.terminal_growth)} · sector WACC {a.wacc}%. Not a price target.
            </p>
        </div>
    );
}

interface Holding { ticker: string; value: number; }
const MY_PORTFOLIO_KEY = 'myPortfolio_v1';

function MyPortfolio({ factor, valuations, overlay, stockInfo, onSelect }: {
    factor: Record<string, FactorEntry>;
    valuations: Record<string, ValuationModel>;
    overlay: Record<string, any>;
    stockInfo: Record<string, StockInfo>;
    onSelect: (t: string) => void;
}) {
    const [holdings, setHoldings] = useState<Holding[]>([]);
    const [cash, setCash] = useState<number>(0);
    const [newTicker, setNewTicker] = useState('');
    const [newValue, setNewValue] = useState('');
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(MY_PORTFOLIO_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                setHoldings(Array.isArray(parsed.holdings) ? parsed.holdings : []);
                setCash(typeof parsed.cash === 'number' ? parsed.cash : 0);
            }
        } catch { /* fresh start */ }
        setLoaded(true);
    }, []);

    useEffect(() => {
        if (!loaded) return;
        try {
            localStorage.setItem(MY_PORTFOLIO_KEY, JSON.stringify({ holdings, cash }));
        } catch { /* storage full/blocked — non-fatal */ }
    }, [holdings, cash, loaded]);

    const total = holdings.reduce((s, h) => s + h.value, 0) + cash;

    const addHolding = () => {
        const t = newTicker.trim().toUpperCase();
        const v = parseFloat(newValue);
        if (!t || !Number.isFinite(v) || v <= 0) return;
        setHoldings(prev => [...prev.filter(h => h.ticker !== t), { ticker: t, value: v }]);
        setNewTicker('');
        setNewValue('');
    };

    const sectorWeights: Record<string, number> = {};
    const rows = holdings.map(h => {
        const wt = total > 0 ? (h.value / total) * 100 : 0;
        const entry = factor[h.ticker];
        const vm = valuations[h.ticker];
        const k = quarterKelly({
            expectationsGapPts: vm?.expectations_gap_pts,
            annualizedVol: entry?.fct_vol,
        });
        const vetoed = !!entry?.fct_veto;
        const modelWt = vetoed ? 0 : k.weightPct;
        let verdict: string;
        let tone: string;
        if (!entry) { verdict = 'NO COVERAGE'; tone = 'text-muted-foreground'; }
        else if (vetoed) { verdict = `VETOED (${entry.fct_veto!.replace(/_/g, ' ')})`; tone = 'text-red-300'; }
        else if (modelWt === null) { verdict = k.reason.toUpperCase(); tone = 'text-muted-foreground'; }
        else if (wt > modelWt + 1) { verdict = 'OVERWEIGHT'; tone = 'text-amber-300'; }
        else if (wt < modelWt - 1) { verdict = 'UNDERWEIGHT'; tone = 'text-sky-300'; }
        else { verdict = 'ALIGNED'; tone = 'text-emerald-300'; }
        const sector = stockInfo[h.ticker]?.sector || 'Unknown';
        sectorWeights[sector] = (sectorWeights[sector] || 0) + wt;
        return { ...h, wt, entry, vm, k, modelWt, verdict, tone, sector };
    });

    const covered = rows.filter(r => r.entry && r.entry.fct_composite !== null);
    const weightedComposite = covered.length
        ? covered.reduce((s, r) => s + (r.entry!.fct_composite! * r.wt), 0) / covered.reduce((s, r) => s + r.wt, 0)
        : null;
    const sectorBreaches = Object.entries(sectorWeights).filter(([, w]) => w > 25);

    return (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.03] p-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-300">My Portfolio — Kelly check</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
                Enter your ACTUAL holdings (stored only in this browser). Each is compared against the model&apos;s
                quarter-Kelly suggested size (cap {POSITION_CAP_PCT}%) and flagged if it&apos;s vetoed or oversized.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <input value={newTicker} onChange={e => setNewTicker(e.target.value)} placeholder="Ticker"
                    onKeyDown={e => e.key === 'Enter' && addHolding()}
                    className="w-24 rounded-md border border-border bg-secondary/20 px-2 py-1.5 text-xs font-bold uppercase outline-none focus:border-emerald-500/50" />
                <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="Value $"
                    type="number" min="0" onKeyDown={e => e.key === 'Enter' && addHolding()}
                    className="w-28 rounded-md border border-border bg-secondary/20 px-2 py-1.5 text-xs font-bold outline-none focus:border-emerald-500/50" />
                <button onClick={addHolding}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-black text-emerald-300 hover:bg-emerald-500/25">
                    Add / Update
                </button>
                <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    Cash $
                    <input value={cash || ''} onChange={e => setCash(parseFloat(e.target.value) || 0)} type="number" min="0"
                        className="w-28 rounded-md border border-border bg-secondary/20 px-2 py-1.5 text-xs font-bold outline-none focus:border-emerald-500/50" />
                </label>
            </div>

            {rows.length > 0 && (
                <>
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-xs">
                            <thead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                <tr><th className="px-2 py-1.5">Sym</th><th className="px-2 py-1.5 text-right">Value</th>
                                    <th className="px-2 py-1.5 text-right">Your wt</th><th className="px-2 py-1.5 text-right">Kelly wt</th>
                                    <th className="px-2 py-1.5">Verdict</th><th className="px-2 py-1.5 text-right">Gap</th>
                                    <th className="px-2 py-1.5">Band</th><th className="px-2 py-1.5">Overlay</th><th className="px-2 py-1.5" /></tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.ticker} className="border-t border-border/50">
                                        <td className="cursor-pointer px-2 py-1.5 font-black hover:text-emerald-300"
                                            onClick={() => r.entry && onSelect(r.ticker)}>{r.ticker}</td>
                                        <td className="px-2 py-1.5 text-right font-mono">${r.value.toLocaleString()}</td>
                                        <td className="px-2 py-1.5 text-right font-mono font-black">{r.wt.toFixed(1)}%</td>
                                        <td className="px-2 py-1.5 text-right font-mono">{r.modelWt === null ? '—' : `${r.modelWt.toFixed(1)}%`}</td>
                                        <td className={clsx('px-2 py-1.5 text-[10px] font-black', r.tone)} title={r.k.reason}>{r.verdict}</td>
                                        <td className="px-2 py-1.5 text-right font-mono">
                                            {r.vm?.expectations_gap_pts !== null && r.vm?.expectations_gap_pts !== undefined
                                                ? `${r.vm.expectations_gap_pts > 0 ? '+' : ''}${r.vm.expectations_gap_pts.toFixed(0)}pts` : '—'}
                                        </td>
                                        <td className="px-2 py-1.5">{r.entry ? <BandChip band={r.entry.fct_band} veto={r.entry.fct_veto} /> : <span className="text-muted-foreground">—</span>}</td>
                                        <td className="px-2 py-1.5"><OverlayChips overlay={overlay[r.ticker]} /></td>
                                        <td className="px-2 py-1.5 text-right">
                                            <button onClick={() => setHoldings(prev => prev.filter(h => h.ticker !== r.ticker))}
                                                className="text-muted-foreground hover:text-red-300" title="Remove"><X className="h-3.5 w-3.5" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        <span>Total: <b className="font-mono text-foreground">${total.toLocaleString()}</b></span>
                        <span>Cash: <b className="font-mono text-foreground">{total > 0 ? ((cash / total) * 100).toFixed(1) : 0}%</b></span>
                        {weightedComposite !== null && <span>Weighted composite: <b className="font-mono text-foreground">{weightedComposite.toFixed(1)}</b></span>}
                        {sectorBreaches.map(([s, w]) => (
                            <span key={s} className="font-bold text-amber-300">⚠ {s} {w.toFixed(0)}% (&gt;25% concentration rule)</span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default function CockpitDashboard() {
    const [tab, setTab] = useState<TabId>('rankings');
    const [factor, setFactor] = useState<FactorScoresPayload | null>(null);
    const [valuations, setValuations] = useState<Record<string, ValuationModel>>({});
    const [plan, setPlan] = useState<any | null>(null);
    const [outcomes, setOutcomes] = useState<any | null>(null);
    const [backtest, setBacktest] = useState<any | null>(null);
    const [ic, setIc] = useState<any | null>(null);
    const [overlay, setOverlay] = useState<Record<string, any>>({});
    const [stockInfo, setStockInfo] = useState<Record<string, StockInfo>>({});
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [bandFilter, setBandFilter] = useState<string>('all');
    const [sectorFilter, setSectorFilter] = useState<string>('all');
    const [limit, setLimit] = useState(100);
    const [selected, setSelected] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);

    const loadAll = async () => {
        setLoading(true);
        const [f, v, p, o, b, i, ov, s] = await Promise.all([
            fetchFactorScores(), fetchValuationModels(), fetchPortfolioPlan(),
            fetchOutcomes(), fetchBacktest(), fetchFactorIc(), fetchOverlaySignals(), fetchStocks('US'),
        ]);
        setFactor(f);
        setValuations(v?.tickers ?? {});
        setPlan(p);
        setOutcomes(o);
        setBacktest(b);
        setIc(i);
        setOverlay(ov?.tickers ?? {});
        const info: Record<string, StockInfo> = {};
        for (const row of (s.data as any[])) {
            if (row.symbol) {
                info[row.symbol] = {
                    name: row.name, sector: row.sector, industry: row.industry,
                    price: row.price, marketCap: row.marketCap,
                };
            }
        }
        setStockInfo(info);
        setLoading(false);
    };

    useEffect(() => { loadAll(); }, []);

    const rows = useMemo(() => {
        if (!factor) return [];
        return Object.entries(factor.tickers)
            .filter(([, e]) => e.fct_rank !== null)
            .sort((a, b) => (a[1].fct_rank! - b[1].fct_rank!));
    }, [factor]);

    const sectors = useMemo(() => {
        const set = new Set<string>();
        rows.forEach(([t]) => { const s = stockInfo[t]?.sector; if (s) set.add(s); });
        return Array.from(set).sort();
    }, [rows, stockInfo]);

    const filteredRows = useMemo(() => rows.filter(([t, e]) => {
        if (bandFilter !== 'all' && e.fct_band !== bandFilter) return false;
        if (sectorFilter !== 'all' && stockInfo[t]?.sector !== sectorFilter) return false;
        if (search) {
            const q = search.toUpperCase();
            if (!t.includes(q) && !(stockInfo[t]?.name || '').toUpperCase().includes(q)) return false;
        }
        return true;
    }), [rows, bandFilter, sectorFilter, search, stockInfo]);

    const researchRows = useMemo(
        () => rows.filter(([, e]) => e.fct_band === 'research_now'),
        [rows]);

    const equityCurve = useMemo(() => {
        const quarters = backtest?.quarters ?? [];
        let s = 1, w = 1;
        return quarters.map((q: any) => {
            s *= 1 + q.top_return_pct / 100;
            w *= 1 + q.iwm_return_pct / 100;
            return { formation: q.formation, strategy: Number(s.toFixed(3)), iwm: Number(w.toFixed(3)), excess: q.excess_vs_iwm_pct };
        });
    }, [backtest]);

    const icCurve = useMemo(() => {
        const factors = ic?.factors ?? {};
        const byFormation: Record<string, any> = {};
        for (const [fname, fdata] of Object.entries<any>(factors)) {
            for (const row of fdata.series ?? []) {
                byFormation[row.formation] = byFormation[row.formation] || { formation: row.formation };
                byFormation[row.formation][fname] = row.ic;
            }
        }
        return Object.values(byFormation).sort((a: any, b: any) => a.formation.localeCompare(b.formation));
    }, [ic]);

    const selectedEntry = selected ? factor?.tickers[selected] : null;
    const selectedInfo = selected ? stockInfo[selected] : null;

    const tabs: { id: TabId; label: string; icon: any }[] = [
        { id: 'rankings', label: 'Rankings', icon: BarChart3 },
        { id: 'research', label: 'Research Queue', icon: Microscope },
        { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
        { id: 'validation', label: 'Validation', icon: Activity },
    ];

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* ── Header ─────────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
                <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <FlaskConical className="h-6 w-6 text-emerald-400" />
                        <div>
                            <h1 className="text-lg font-black tracking-tight">FACTOR LAB <span className="text-emerald-400">COCKPIT</span></h1>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {factor ? `${factor.scored_count} scored · weights ${Object.entries(factor.weights_used).map(([f, w]) => `${f[0].toUpperCase()}${Math.round((w as number) * 100)}`).join(' ')} · ${factor.engine}` : 'loading…'}
                            </p>
                        </div>
                    </div>
                    <nav className="ml-2 flex flex-wrap items-center gap-1">
                        {tabs.map(({ id, label, icon: Icon }) => (
                            <button key={id} onClick={() => setTab(id)}
                                className={clsx('flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors',
                                    tab === id ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-border bg-secondary/20 text-muted-foreground hover:text-foreground')}>
                                <Icon className="h-3.5 w-3.5" /> {label}
                            </button>
                        ))}
                    </nav>
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => setShowHelp(true)}
                            className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/20 px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                            title="How this page works" aria-label="Open help">
                            <HelpCircle className="h-4 w-4" />
                        </button>
                        <Link href="/lenses" className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/20 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground">
                            <Layers3 className="h-3.5 w-3.5" /> Lenses
                        </Link>
                        <Link href="/reports" className="rounded-md border border-border bg-secondary/20 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground">
                            AI Reports
                        </Link>
                        <button onClick={loadAll} className="rounded-md border border-border bg-secondary/20 p-1.5 text-muted-foreground hover:text-foreground" title="Refresh">
                            <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-[1500px] px-4 py-4">
                {/* ── Rankings ───────────────────────────────────────── */}
                {tab === 'rankings' && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ticker or name…"
                                    className="rounded-md border border-border bg-secondary/20 py-1.5 pl-7 pr-2 text-xs font-semibold outline-none focus:border-emerald-500/50" />
                            </div>
                            <select value={bandFilter} onChange={e => setBandFilter(e.target.value)}
                                className="rounded-md border border-border bg-secondary/20 px-2 py-1.5 text-xs font-semibold">
                                <option value="all">All bands</option>
                                <option value="research_now">Research now</option>
                                <option value="watchlist">Watchlist</option>
                                <option value="monitor">Monitor</option>
                                <option value="pass">Pass</option>
                            </select>
                            <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}
                                className="rounded-md border border-border bg-secondary/20 px-2 py-1.5 text-xs font-semibold">
                                <option value="all">All sectors</option>
                                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <span className="text-xs font-semibold text-muted-foreground">{filteredRows.length} stocks · sector-neutral z, IC-calibrated weights</span>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full min-w-[980px] text-left text-xs">
                                <thead className="sticky top-0 bg-secondary/60 text-[10px] font-black uppercase tracking-wider text-muted-foreground backdrop-blur">
                                    <tr>
                                        <th className="px-3 py-2">#</th>
                                        <th className="px-3 py-2">Stock</th>
                                        <th className="px-3 py-2">Composite</th>
                                        <th className="px-3 py-2 w-52">Factor mix</th>
                                        <th className="px-3 py-2">Band</th>
                                        <th className="px-3 py-2">DCF gap</th>
                                        <th className="px-3 py-2 text-right">Price</th>
                                        <th className="px-3 py-2 text-right">MCap</th>
                                        <th className="px-3 py-2">Sector</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRows.slice(0, limit).map(([t, e]) => {
                                        const info = stockInfo[t];
                                        const vm = valuations[t];
                                        const gap = vm?.expectations_gap_pts;
                                        return (
                                            <tr key={t} onClick={() => setSelected(t)}
                                                className="cursor-pointer border-t border-border/50 transition-colors odd:bg-secondary/10 hover:bg-emerald-500/[0.06]">
                                                <td className="px-3 py-2 font-mono font-black text-muted-foreground">{e.fct_rank}</td>
                                                <td className="px-3 py-2">
                                                    <div className="font-black">{t}</div>
                                                    <div className="max-w-[180px] truncate text-[10px] text-muted-foreground">{info?.name || ''}</div>
                                                </td>
                                                <td className="px-3 py-2 font-mono text-sm font-black text-emerald-300">{e.fct_composite?.toFixed(1)}</td>
                                                <td className="px-3 py-2"><ContributionBar entry={e} /></td>
                                                <td className="px-3 py-2"><BandChip band={e.fct_band} veto={e.fct_veto} /></td>
                                                <td className="px-3 py-2 font-mono font-bold">
                                                    {gap === null || gap === undefined ? <span className="text-muted-foreground">—</span> :
                                                        <span className={gap > 5 ? 'text-amber-300' : gap < -5 ? 'text-emerald-300' : 'text-muted-foreground'}>
                                                            {gap > 0 ? '+' : ''}{gap.toFixed(0)}pts
                                                        </span>}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">{info?.price ? `$${info.price.toFixed(2)}` : '—'}</td>
                                                <td className="px-3 py-2 text-right font-mono">{fmtMcap(info?.marketCap)}</td>
                                                <td className="px-3 py-2 text-muted-foreground">{info?.sector || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {filteredRows.length > limit && (
                            <button onClick={() => setLimit(l => l + 100)}
                                className="w-full rounded-md border border-border bg-secondary/20 py-2 text-xs font-bold text-muted-foreground hover:text-foreground">
                                Show more ({filteredRows.length - limit} remaining)
                            </button>
                        )}
                    </div>
                )}

                {/* ── Research Queue ─────────────────────────────────── */}
                {tab === 'research' && (
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">
                            Top {researchRows.length} (≥97th percentile, post-veto, post-haircut). Each deserves a thesis before any buy — open the workbench, read the gap, then run the AI deep-dive from the Lenses page.
                        </p>
                        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                            {researchRows.map(([t, e]) => {
                                const info = stockInfo[t];
                                const vm = valuations[t];
                                return (
                                    <button key={t} onClick={() => setSelected(t)}
                                        className="rounded-lg border border-border bg-card/95 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-500/40">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="text-base font-black">{t} <span className="font-mono text-xs text-emerald-300">#{e.fct_rank}</span></div>
                                                <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">{info?.name}</div>
                                            </div>
                                            <span className="font-mono text-lg font-black text-emerald-300">{e.fct_composite?.toFixed(1)}</span>
                                        </div>
                                        <div className="mt-2"><ContributionBar entry={e} /></div>
                                        <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
                                            {vm?.verdict || 'No reverse-DCF model for this name.'}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Portfolio ──────────────────────────────────────── */}
                {tab === 'portfolio' && (plan ? (
                    <div className="space-y-4">
                        <MyPortfolio factor={factor?.tickers ?? {}} valuations={valuations}
                            overlay={overlay} stockInfo={stockInfo} onSelect={setSelected} />
                        <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/[0.07] p-2.5 text-xs text-sky-200/90">
                            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer" onClick={() => setShowHelp(true)} />
                            <p>
                                <b>Suggested plan, not your holdings.</b> The machine sizes the Factor Lab research_now names with
                                quarter-Kelly (edge from the expectations gap, risk from volatility; no negative gap = no position),
                                halves flagged names, caps sectors at 25% / themes at 30%, leaves the rest as cash.{' '}
                                <button onClick={() => setShowHelp(true)} className="font-bold underline">Full explanation</button>
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {[['Invested', `${plan.invested_pct}%`], ['Cash', `${plan.cash_pct}%`],
                              ['Positions', plan.position_count],
                              ['Macro flags', plan.macro_flags?.length ? plan.macro_flags.join(', ') : 'none']].map(([k, v]) => (
                                <div key={k as string} className="rounded-lg border border-border bg-card/95 px-4 py-2">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{k}</div>
                                    <div className="font-mono text-lg font-black">{v as any}</div>
                                </div>
                            ))}
                        </div>
                        {plan.macro_derisk_active && (
                            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs font-bold text-amber-200">
                                MACRO DE-RISK ACTIVE — position sizes halved by rule.
                            </p>
                        )}
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full min-w-[860px] text-left text-xs">
                                <thead className="bg-secondary/60 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-2">Sym</th><th className="px-3 py-2 text-right">Weight</th>
                                        <th className="px-3 py-2">Sizing</th><th className="px-3 py-2 text-right">Gap</th>
                                        <th className="px-3 py-2 text-right">FctRank</th>
                                        <th className="px-3 py-2">Theme (context)</th><th className="px-3 py-2">Overlay</th><th className="px-3 py-2">Flags</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(plan.positions ?? []).map((p: any) => (
                                        <tr key={p.symbol} onClick={() => setSelected(p.symbol)}
                                            className="cursor-pointer border-t border-border/50 odd:bg-secondary/10 hover:bg-emerald-500/[0.06]">
                                            <td className="px-3 py-2 font-black">{p.symbol}{p.rev_nominated && <span className="ml-1 text-[9px] font-black text-sky-300" title="Also nominated by the reverse engine — independent confirmation">✓REV</span>}</td>
                                            <td className="px-3 py-2 text-right font-mono font-black">{p.weight_pct}%</td>
                                            <td className="px-3 py-2 text-[10px] font-bold uppercase text-muted-foreground">{(p.sizing_method || '').replace('_', ' ')}</td>
                                            <td className="px-3 py-2 text-right font-mono">{p.expectations_gap_pts !== null && p.expectations_gap_pts !== undefined ? `${p.expectations_gap_pts > 0 ? '+' : ''}${Math.round(p.expectations_gap_pts)}` : '—'}</td>
                                            <td className="px-3 py-2 text-right font-mono">{p.fct_rank ?? '—'}</td>
                                            <td className="px-3 py-2 text-muted-foreground">{p.theme_primary || '—'}</td>
                                            <td className="px-3 py-2"><OverlayChips overlay={overlay[p.symbol]} /></td>
                                            <td className="px-3 py-2 text-[10px] text-red-300">{(p.forensic_flags ?? []).join(', ') || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                            {[['Sector allocation', plan.sector_allocation], ['Theme allocation', plan.theme_allocation]].map(([title, alloc]) => (
                                <div key={title as string} className="rounded-lg border border-border bg-card/95 p-3">
                                    <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">{title as string}</h3>
                                    <ResponsiveContainer width="100%" height={Math.max(120, Object.keys(alloc || {}).length * 28)}>
                                        <BarChart layout="vertical" data={Object.entries(alloc || {}).map(([k, v]) => ({ name: k, pct: v }))}>
                                            <XAxis type="number" tick={{ fontSize: 10 }} unit="%" stroke="#64748b" />
                                            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} stroke="#64748b" />
                                            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                                            <Bar dataKey="pct" fill="#34d399" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{plan.disclaimer}</p>
                    </div>
                ) : <p className="text-sm text-muted-foreground">No portfolio plan found — run scripts/build_portfolio_plan.py.</p>)}

                {/* ── Validation ─────────────────────────────────────── */}
                {tab === 'validation' && (
                    <div className="space-y-4">
                        <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/[0.07] p-2.5 text-xs text-sky-200/90">
                            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer" onClick={() => setShowHelp(true)} />
                            <p>
                                <b>This page answers &quot;does the system actually work?&quot;</b> Top charts = simulated history
                                (green line above grey = beat the index; bars above zero = won that quarter). The IC chart shows each
                                factor&apos;s measured prediction power — those values set the composite weights. The bottom table is
                                the REAL forward record of published signals, filling in as time passes.{' '}
                                <button onClick={() => setShowHelp(true)} className="font-bold underline">Full explanation</button>
                            </p>
                        </div>
                        {backtest?.survivorship_caveat && (
                            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs font-bold text-amber-200">
                                ⚠ {backtest.survivorship_caveat} Expect live performance ≈ half of these numbers (post-publication decay, McLean-Pontiff 2016).
                            </p>
                        )}
                        <div className="flex flex-wrap gap-3">
                            {backtest?.summary && [
                                ['Strategy CAGR', `${backtest.summary.strategy_cagr_pct}%`],
                                ['IWM CAGR', `${backtest.summary.iwm_cagr_pct}%`],
                                ['Hit rate', `${backtest.summary.hit_rate_vs_iwm_pct}%`],
                                ['Decile spread', `${backtest.summary.mean_decile_spread_pct}%/q`],
                                ['Max DD', `${backtest.summary.strategy_max_drawdown_pct}%`],
                            ].map(([k, v]) => (
                                <div key={k as string} className="rounded-lg border border-border bg-card/95 px-4 py-2">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{k}</div>
                                    <div className="font-mono text-lg font-black">{v as string}</div>
                                </div>
                            ))}
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-lg border border-border bg-card/95 p-3">
                                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">Equity curve — top decile vs IWM (quarterly)</h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <LineChart data={equityCurve}>
                                        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                                        <XAxis dataKey="formation" tick={{ fontSize: 9 }} stroke="#64748b" />
                                        <YAxis tick={{ fontSize: 10 }} stroke="#64748b" />
                                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Line type="monotone" dataKey="strategy" stroke="#34d399" dot={false} strokeWidth={2} />
                                        <Line type="monotone" dataKey="iwm" stroke="#64748b" dot={false} strokeWidth={2} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="rounded-lg border border-border bg-card/95 p-3">
                                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">Quarterly excess vs IWM</h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={equityCurve}>
                                        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                                        <XAxis dataKey="formation" tick={{ fontSize: 9 }} stroke="#64748b" />
                                        <YAxis tick={{ fontSize: 10 }} stroke="#64748b" unit="%" />
                                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                                        <ReferenceLine y={0} stroke="#475569" />
                                        <Bar dataKey="excess" fill="#38bdf8" radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="rounded-lg border border-border bg-card/95 p-3">
                            <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                                Per-factor rank-IC by quarter (diagnostic only — the composite is equal-weighted by design)
                            </h3>
                            <ResponsiveContainer width="100%" height={240}>
                                <LineChart data={icCurve}>
                                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                                    <XAxis dataKey="formation" tick={{ fontSize: 9 }} stroke="#64748b" />
                                    <YAxis tick={{ fontSize: 10 }} stroke="#64748b" />
                                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <ReferenceLine y={0} stroke="#475569" />
                                    {['value', 'quality', 'momentum', 'lowvol'].map(f => (
                                        <Line key={f} type="monotone" dataKey={f} stroke={FACTOR_COLORS[f]} dot={false} strokeWidth={1.5} />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="rounded-lg border border-border bg-card/95 p-3">
                            <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">Live signal outcomes (forward log, matures over time)</h3>
                            {(outcomes?.evaluated?.length ?? 0) > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[700px] text-left text-xs">
                                        <thead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                            <tr><th className="px-2 py-1.5">Cohort</th><th className="px-2 py-1.5">Horizon</th><th className="px-2 py-1.5">Source</th>
                                                <th className="px-2 py-1.5 text-right">n</th><th className="px-2 py-1.5 text-right">Median</th>
                                                <th className="px-2 py-1.5 text-right">Excess vs IWM</th><th className="px-2 py-1.5 text-right">% beat IWM</th></tr>
                                        </thead>
                                        <tbody>
                                            {outcomes.evaluated.map((r: any, idx: number) => (
                                                <tr key={idx} className="border-t border-border/50">
                                                    <td className="px-2 py-1.5 font-mono">{r.snapshot_date}</td>
                                                    <td className="px-2 py-1.5 font-mono">{r.horizon_days}d</td>
                                                    <td className="px-2 py-1.5">{r.source}</td>
                                                    <td className="px-2 py-1.5 text-right font-mono">{r.n_evaluated}</td>
                                                    <td className="px-2 py-1.5 text-right font-mono">{r.median_return_pct}%</td>
                                                    <td className={clsx('px-2 py-1.5 text-right font-mono font-black', r.mean_excess_vs_iwm_pct >= 0 ? 'text-success' : 'text-danger')}>{r.mean_excess_vs_iwm_pct}%</td>
                                                    <td className="px-2 py-1.5 text-right font-mono">{r.pct_beat_iwm}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    No matured cohorts yet{outcomes?.pending?.length ? ` — ${outcomes.pending.length} pending, next matures soon` : ''}. The forward log is the honest validation clock.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

            {/* ── Detail slide-over ─────────────────────────────────── */}
            {selected && selectedEntry && (
                <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setSelected(null)}>
                    <div className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-background p-4 shadow-2xl"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-xl font-black">{selected}</h2>
                                <p className="text-xs text-muted-foreground">{selectedInfo?.name} · {selectedInfo?.sector}</p>
                            </div>
                            <button onClick={() => setSelected(null)} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <BandChip band={selectedEntry.fct_band} veto={selectedEntry.fct_veto} />
                            {selectedEntry.fct_rank && <span className="font-mono text-xs font-black text-muted-foreground">rank #{selectedEntry.fct_rank}</span>}
                            {selectedEntry.fct_composite !== null && <span className="font-mono text-lg font-black text-emerald-300">{selectedEntry.fct_composite.toFixed(1)}</span>}
                            <OverlayChips overlay={overlay[selected!]} />
                            <a href={`https://www.tradingview.com/chart/?symbol=${selected}`} target="_blank" rel="noreferrer"
                                className="ml-auto flex items-center gap-1 rounded-md border border-border bg-secondary/20 px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">
                                TradingView <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>

                        <h3 className="mb-2 mt-5 text-xs font-black uppercase tracking-wider text-muted-foreground">Factor profile (sector-neutral z)</h3>
                        <FactorProfile entry={selectedEntry} />
                        {selectedEntry.fct_haircuts && (
                            <p className="mt-2 text-[10px] text-muted-foreground">
                                Haircuts — survivability ×{selectedEntry.fct_haircuts.survivability}, data quality ×{selectedEntry.fct_haircuts.data_quality}, forensic ×{selectedEntry.fct_haircuts.forensic}
                            </p>
                        )}
                        {selectedEntry.fct_context?.theme_primary && (
                            <p className="mt-2 rounded-md border border-purple-500/30 bg-purple-500/[0.06] p-2 text-[11px] text-purple-200/90">
                                <b>Context (not scored):</b> theme {selectedEntry.fct_context.theme_primary}
                                {selectedEntry.fct_context.theme_score !== null ? ` (strength ${selectedEntry.fct_context.theme_score}/100)` : ''} — themes are a
                                hunting ground and risk tag, never additive alpha.
                            </p>
                        )}

                        <h3 className="mb-2 mt-5 text-xs font-black uppercase tracking-wider text-muted-foreground">Valuation workbench (reverse DCF)</h3>
                        <ValuationWorkbench ticker={selected} model={valuations[selected]} marketCap={selectedInfo?.marketCap} />

                        <div className="mt-5 rounded-md border border-border bg-secondary/10 p-2.5 text-[11px] text-muted-foreground">
                            Full lens detail (reverse engine, paradigm, AI deep-dive) lives in the{' '}
                            <Link href="/lenses" className="font-bold text-emerald-300 underline">Lenses view</Link>.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
