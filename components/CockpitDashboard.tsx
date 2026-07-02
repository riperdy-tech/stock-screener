'use client';

// Decision Cockpit — primary decision surface for the Factor Lab engine.
// Tabs: Rankings (sector-neutral factor composite), Research Queue,
// Portfolio (rendered plan), Validation (backtest/outcomes/IC evidence).
// The four legacy lenses live unchanged at /lenses.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { AuthModal } from './AuthModal';
import {
    Activity, ArrowUpRight, BarChart3, Briefcase, ExternalLink, FlaskConical,
    HelpCircle, Layers3, LineChart as LineChartIcon, RefreshCw, Search, ShieldAlert, X,
} from 'lucide-react';
import {
    Bar, BarChart, Brush, CartesianGrid, Legend, Line, LineChart, ReferenceLine,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    fetchBacktest, fetchFactorIc, fetchFactorScores, fetchOutcomes,
    fetchOverlaySignals, fetchPaperLedgers, fetchPortfolioPlan, fetchPortfolioPlanLlm, fetchStocks, fetchValuationModels,
    FactorEntry, FactorScoresPayload, ValuationModel,
} from '@/lib/data-service';
import { quarterKelly, POSITION_CAP_PCT } from '@/lib/kelly';

type TabId = 'rankings' | 'track' | 'portfolio' | 'validation';

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
                        <p>Click any row for the per-stock detail: factor profile, the reverse-DCF read (the growth the price implies vs what the company has demonstrated), and the RS2 local-LLM research + verdict.</p>
                    </HelpSection>

                    <HelpSection title="Track Record tab — the honest meter">
                        <p>From inception, three portfolios are <b>paper-traded daily, for real, with transaction costs</b> — no backtest, no hindsight. When a stock enters the ranked list it gets bought at that day&apos;s price; when it drops out it gets sold. The record persists forever.</p>
                        <p><b>plan</b> = the value core (Kelly-sized, ~50% cash). <b>plan2</b> = the hybrid (value core + quality sleeve, ~78% invested, holds the expensive leaders). <b>equal</b> = equal-weighting every Research Now name (pure stock-picking test). <b>mine</b> = your saved My Portfolio holdings, unitized like a fund (adding/removing money moves units, never fakes performance).</p>
                        <p>Watch <b>plan vs plan2</b>: if plan2 wins, paying up for quality leaders beat the value discipline this period; if plan wins, the discipline (and cash) paid off. That&apos;s the value-vs-growth question answered with your own live money simulation.</p>
                        <p><b>How to read it</b>: plan beating equal = the sizing machinery adds value. Equal beating IWM = the stock selection itself works. Mine lagging plan = your own deviations cost money (the behavior gap). &quot;Sold too early&quot; flags exits that kept rising — a recurring pattern there means the exit rule needs work. Sharpe/CAGR appear only after enough days; early on this page is deliberately boring.</p>
                    </HelpSection>

                    <HelpSection title="Portfolio tab">
                        <p><b>My Portfolio (top)</b>: enter your ACTUAL holdings (saved only in this browser) and each is checked against the model: a quarter-Kelly suggested size, an over/under-weight verdict, and loud flags if a holding is vetoed or outside coverage.</p>
                        <p><b>Suggested plan (below)</b>: NOT your portfolio — a machine-built allocation from the Research Now list, with a <b>Value core / Hybrid</b> toggle.</p>
                        <p><b>Value core (plan)</b>: quarter-Kelly sizing — expected edge = the expectations gap closing over ~3 years (only names priced BELOW their demonstrated growth have measurable edge, so high-ranked-but-expensive names like TSM are skipped with &quot;no Kelly edge&quot;); risk = volatility; f = 0.25 × edge/risk², capped 5%. Forensic flags halve size; GPR 2-3 and insider selling shrink it; sector 25% / theme 30% caps; rest stays cash (often ~50%).</p>
                        <p><b>Hybrid (plan2)</b>: the same value core PLUS a <b>quality sleeve</b> that buys the top-ranked names REGARDLESS of valuation gap (capped ~35% of book) — so it holds the expensive leaders (TSM, GOOGL, MU) the core refuses, and deploys the idle cash (~78% invested). Trade-off: more leader exposure and less cash, but it pays up for quality instead of demanding a margin of safety. Sleeve rows are tinted pink.</p>
                        <p>Why two? The value core protects you in a bust (won&apos;t overpay) but lags in a melt-up; the hybrid captures the leaders but rides them down harder. Track Record shows how both actually perform.</p>
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

// RS2 LLM verdict chip — renders only when a verdict exists (no-op otherwise). Self-contained.
function LlmChip({ entry }: { entry?: FactorEntry | null }) {
    const v = entry?.fct_llm_verdict;
    if (!v) return null;
    const promoted = entry?.fct_llm === 'promoted';
    const demoted = entry?.fct_llm === 'demoted' || entry?.fct_veto === 'llm_reject';
    const cls = promoted ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
        : demoted ? 'border-red-500/50 bg-red-500/10 text-red-300'
            : 'border-sky-500/40 bg-sky-500/10 text-sky-300';
    const label = promoted ? 'LLM ▲' : demoted ? 'LLM ✕' : 'LLM';
    const tip = [
        v.stance && `stance ${v.stance}`,
        v.action && `action ${v.action}`,
        v.conviction != null && `conviction ${v.conviction}/15`,
        v.gap != null && `gap ${v.gap > 0 ? '+' : ''}${v.gap}pts`,
        v.mos_pct != null && `MoS ${v.mos_pct > 0 ? '+' : ''}${v.mos_pct}%`,
        v.analyzed_date && `(${v.analyzed_date})`,
    ].filter(Boolean).join(' · ');
    return (
        <span title={`RS2 LLM — ${tip}`}
            className={clsx('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider', cls)}>
            {label}{v.conviction != null ? ` ${v.conviction}` : ''}
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

function ValuationWorkbench({ model }: { ticker: string; model: ValuationModel | undefined; marketCap: number | undefined }) {
    const a = model?.assumptions;

    if (!model || model.implied_growth === null || !a) {
        return (
            <p className="text-xs text-muted-foreground">
                No reverse-DCF model{model?.reason ? ` (${model.reason.replace(/_/g, ' ')})` : ''} — typically negative base cash flow or missing fundamentals.
            </p>
        );
    }

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
            <p className="text-[10px] text-muted-foreground">
                Base: {fmtMcap(a.base_cf)} {a.base_cf_kind.replace(/_/g, ' ')} (FY{a.fiscal_year}) · terminal {fmtPct(a.terminal_growth)} · sector WACC {a.wacc}%. Not a price target.
            </p>
        </div>
    );
}

interface Holding { ticker: string; value: number; }
const MY_PORTFOLIO_KEY = 'myPortfolio_v1';

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** Bulk-paste parser. One position per line: first token = ticker, LAST
 *  number on the line = market value (broker exports typically end the row
 *  with market value, so extra columns like shares/price are harmless).
 *  `$`, `%`, commas, parentheses stripped. A line starting with CASH sets
 *  cash. Returns skipped lines for honest feedback. */
function parseBulkPortfolio(text: string): { holdings: Holding[]; cash: number | null; skipped: string[] } {
    const holdings: Holding[] = [];
    const seen = new Set<string>();
    let cash: number | null = null;
    const skipped: string[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
        // Strip thousands-separator commas (digit,digit) BEFORE tokenizing,
        // otherwise "$1,205.00" splits into 1 and 205.00. Commas followed by
        // whitespace remain column separators ("AAPL, 8000" still works).
        const line = rawLine.trim().replace(/(\d),(?=\d)/g, '$1');
        if (!line) continue;
        const tokens = line.split(/[\s,;\t]+/);
        const ticker = (tokens[0] || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
        const numbers = tokens.slice(1)
            .map(tok => parseFloat(tok.replace(/[$%,()]/g, '')))
            .filter(n => Number.isFinite(n) && n > 0);
        const value = numbers.length ? numbers[numbers.length - 1] : NaN;
        if (ticker === 'CASH' && Number.isFinite(value)) {
            cash = value;
            continue;
        }
        // Skip obvious header rows (e.g. "Symbol Value") quietly
        if ((ticker === 'SYMBOL' || ticker === 'TICKER') && !Number.isFinite(value)) continue;
        if (!TICKER_RE.test(ticker) || !Number.isFinite(value)) {
            skipped.push(line.slice(0, 40));
            continue;
        }
        if (!seen.has(ticker)) {
            seen.add(ticker);
            holdings.push({ ticker, value });
        }
    }
    return { holdings, cash, skipped };
}

function MyPortfolio({ factor, valuations, overlay, stockInfo, onSelect, user, onRequireLogin }: {
    factor: Record<string, FactorEntry>;
    valuations: Record<string, ValuationModel>;
    overlay: Record<string, any>;
    stockInfo: Record<string, StockInfo>;
    onSelect: (t: string) => void;
    user: any;
    onRequireLogin: () => void;
}) {
    const [holdings, setHoldings] = useState<Holding[]>([]);
    const [cash, setCash] = useState<number>(0);
    const [newTicker, setNewTicker] = useState('');
    const [newValue, setNewValue] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [showBulk, setShowBulk] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkStatus, setBulkStatus] = useState<string | null>(null);

    const importBulk = (replace: boolean) => {
        const { holdings: parsed, cash: parsedCash, skipped } = parseBulkPortfolio(bulkText);
        if (parsed.length === 0 && parsedCash === null) {
            setBulkStatus('Nothing parseable found — expected lines like "AAPL 12500".');
            return;
        }
        setHoldings(prev => {
            if (replace) return parsed;
            const merged = [...prev];
            for (const p of parsed) {
                const i = merged.findIndex(h => h.ticker === p.ticker);
                if (i >= 0) merged[i] = p; else merged.push(p);
            }
            return merged;
        });
        if (parsedCash !== null) setCash(parsedCash);
        setBulkStatus(`Imported ${parsed.length} position${parsed.length === 1 ? '' : 's'}`
            + (parsedCash !== null ? ` + cash $${parsedCash.toLocaleString()}` : '')
            + (skipped.length ? ` · skipped ${skipped.length}: ${skipped.slice(0, 3).join(' | ')}${skipped.length > 3 ? '…' : ''}` : ''));
        setBulkText('');
    };

    const saveSnapshot = async () => {
        if (!user) { onRequireLogin(); return; }
        if (!supabase) { setSaveStatus('failed: auth/storage not configured'); return; }
        setSaveStatus('saving…');
        const clean = holdings
            .filter(h => h.ticker && Number.isFinite(h.value) && h.value > 0)
            .map(h => ({ ticker: h.ticker.toUpperCase(), value: h.value }));
        // RLS scopes this upsert to the logged-in user (user_id = auth.uid()).
        const { error } = await supabase.from('my_portfolio').upsert({
            user_id: user.id,
            holdings: clean,
            cash: Number.isFinite(cash) && cash >= 0 ? cash : 0,
            saved_at: new Date().toISOString(),
        });
        if (error) {
            setSaveStatus(`failed: ${error.message}`);
            setTimeout(() => setSaveStatus(null), 6000);
            return;
        }
        // Auto-fire the Update Mine Ledger workflow so the ledger refreshes without
        // the Actions tab. ~1 min to run; the daily chain is the fallback.
        setSaveStatus('saved ✓ — starting ledger refresh…');
        try {
            const r = await fetch('/api/refresh-mine', { method: 'POST' });
            const d = await r.json();
            setSaveStatus(d?.ok
                ? 'saved ✓ — ledger updating (~1 min), then refresh this page'
                : `saved ✓ — auto-refresh failed (${d?.error || r.status}); run Update Mine Ledger manually`);
        } catch {
            setSaveStatus('saved ✓ — auto-refresh unreachable; run Update Mine Ledger manually');
        }
        setTimeout(() => setSaveStatus(null), 9000);
    };

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
                <button onClick={saveSnapshot} disabled={holdings.length === 0}
                    className="rounded-md border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-black text-sky-300 hover:bg-sky-500/25 disabled:opacity-40"
                    title="Saves your holdings snapshot to Supabase so the daily tracker measures your real portfolio (Track Record tab, 'mine' ledger)">
                    Save snapshot for tracking
                </button>
                {saveStatus && <span className="text-[11px] font-bold text-muted-foreground">{saveStatus}</span>}
                <button onClick={() => setShowBulk(s => !s)}
                    className="rounded-md border border-border bg-secondary/20 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground">
                    {showBulk ? 'Hide bulk paste' : 'Bulk paste…'}
                </button>
            </div>

            {showBulk && (
                <div className="mt-2 rounded-md border border-border bg-secondary/10 p-2.5">
                    <p className="text-[11px] text-muted-foreground">
                        One position per line: <b className="font-mono text-foreground">TICKER  value</b> — the <b>last number</b> on
                        each line is taken as market value, so broker rows with extra columns (shares, price…) paste fine.
                        Separators: spaces, commas, or tabs. <b className="font-mono text-foreground">CASH 5000</b> sets cash.
                        Example: <span className="font-mono text-foreground">NVDA 12,500.50</span> · <span className="font-mono text-foreground">AAPL, 10, 150.00, 1500.00</span>
                    </p>
                    <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
                        rows={6} placeholder={'NVDA 12500\nAAPL 8000\nINCY 5,250.75\nCASH 3000'}
                        className="mt-2 w-full rounded-md border border-border bg-secondary/20 p-2 font-mono text-xs outline-none focus:border-emerald-500/50" />
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <button onClick={() => importBulk(false)}
                            className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-black text-emerald-300 hover:bg-emerald-500/25">
                            Import (merge)
                        </button>
                        <button onClick={() => importBulk(true)}
                            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-300 hover:bg-amber-500/20"
                            title="Clears the current list and replaces it with the pasted positions">
                            Replace all
                        </button>
                        {bulkStatus && <span className="text-[11px] font-bold text-muted-foreground">{bulkStatus}</span>}
                    </div>
                </div>
            )}

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
                                        <td className="px-2 py-1.5"><div className="flex flex-wrap items-center gap-1">{r.entry ? <BandChip band={r.entry.fct_band} veto={r.entry.fct_veto} /> : <span className="text-muted-foreground">—</span>}<LlmChip entry={r.entry} /></div></td>
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

// Benchmark line styling (data key = lowercased symbol). Unknown symbols fall
// back to a neutral grey so newly-added benchmarks still render.
const BENCH_META: Record<string, { color: string; dash: string }> = {
    IWM: { color: '#64748b', dash: '4 3' },
    SPY: { color: '#e2e8f0', dash: '2 2' },
    QQQ: { color: '#facc15', dash: '1 3' },
    SOXX: { color: '#fb923c', dash: '3 2' },
    DRAM: { color: '#22d3ee', dash: '2 3' },
};
const benchColor = (b: string) => BENCH_META[b]?.color ?? '#9ca3af';
const benchDash = (b: string) => BENCH_META[b]?.dash ?? '3 3';
const DEFAULT_BENCHES = ['IWM', 'SPY', 'QQQ'];  // SOXX/DRAM off by default (toggle on)

export default function CockpitDashboard() {
    const [tab, setTab] = useState<TabId>('rankings');
    const [factor, setFactor] = useState<FactorScoresPayload | null>(null);
    const [valuations, setValuations] = useState<Record<string, ValuationModel>>({});
    const [plan, setPlan] = useState<any | null>(null);
    const [outcomes, setOutcomes] = useState<any | null>(null);
    const [backtest, setBacktest] = useState<any | null>(null);
    const [ic, setIc] = useState<any | null>(null);
    const [overlay, setOverlay] = useState<Record<string, any>>({});
    const [ledgers, setLedgers] = useState<any | null>(null);
    const [ledgerView, setLedgerView] = useState<'plan' | 'plan2' | 'equal' | 'mine'>('plan');
    const [planView, setPlanView] = useState<'plan' | 'plan2'>('plan');
    const [planLlm, setPlanLlm] = useState<any | null>(null);          // LLM-overlay variant
    const [planSource, setPlanSource] = useState<'baseline' | 'llm'>('baseline');
    const [showLlm, setShowLlm] = useState(true);                      // overlay LLM lines on the NAV chart
    const [navRange, setNavRange] = useState<'1m' | '3m' | 'ytd' | 'all'>('all');
    const [tradeQuery, setTradeQuery] = useState('');
    const [benchSel, setBenchSel] = useState<Set<string>>(new Set(DEFAULT_BENCHES));
    const toggleBench = (b: string) => setBenchSel(prev => {
        const next = new Set(prev);
        next.has(b) ? next.delete(b) : next.add(b);
        return next;
    });
    const [stockInfo, setStockInfo] = useState<Record<string, StockInfo>>({});
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [bandFilter, setBandFilter] = useState<string>('all');
    const [llmFilter, setLlmFilter] = useState<string>('all');   // filter rankings by RS2 LLM verdict
    const [sectorFilter, setSectorFilter] = useState<string>('all');
    const [limit, setLimit] = useState(100);
    const [selected, setSelected] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const auth = useAuth();
    const [showAuth, setShowAuth] = useState(false);

    // The logged-in user's private `mine` ledger (user_mine_ledgers, RLS-scoped).
    // Merged into the global ledger book so Track Record renders all four cards.
    const attachMine = async (base: any): Promise<any> => {
        let mine: any = undefined;
        if (supabase && auth.user) {
            const { data } = await supabase
                .from('user_mine_ledgers').select('data').eq('user_id', auth.user.id).maybeSingle();
            mine = data?.data?.ledger;
        }
        return base ? { ...base, ledgers: { ...base.ledgers, mine } } : base;
    };

    // Re-attach mine on login/logout (loadAll handles mount + manual refresh).
    useEffect(() => {
        if (!auth.ready) return;
        let cancelled = false;
        (async () => {
            let mine: any = undefined;
            if (supabase && auth.user) {
                const { data } = await supabase
                    .from('user_mine_ledgers').select('data').eq('user_id', auth.user.id).maybeSingle();
                mine = data?.data?.ledger;
            }
            if (!cancelled) setLedgers((prev: any) => prev ? { ...prev, ledgers: { ...prev.ledgers, mine } } : prev);
        })();
        return () => { cancelled = true; };
    }, [auth.user, auth.ready]);

    const loadAll = async () => {
        setLoading(true);
        const [f, v, p, o, b, i, ov, pl, s, pllm] = await Promise.all([
            fetchFactorScores(), fetchValuationModels(), fetchPortfolioPlan(),
            fetchOutcomes(), fetchBacktest(), fetchFactorIc(), fetchOverlaySignals(),
            fetchPaperLedgers(), fetchStocks('US'), fetchPortfolioPlanLlm(),
        ]);
        setLedgers(await attachMine(pl));
        setFactor(f);
        setValuations(v?.tickers ?? {});
        setPlan(p);
        setPlanLlm(pllm);
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
        if (llmFilter !== 'all') {
            const v = e.fct_llm_verdict;
            if (llmFilter === 'reviewed' && !v) return false;
            else if (llmFilter === 'promoted' && e.fct_llm !== 'promoted') return false;
            else if (llmFilter === 'demoted' && e.fct_llm !== 'demoted') return false;
            else if (llmFilter === 'vetoed' && e.fct_llm_veto !== 'llm_reject') return false;
            else if ((llmFilter === 'undervalued' || llmFilter === 'fair' || llmFilter === 'overvalued')
                     && v?.stance !== llmFilter) return false;
        }
        if (sectorFilter !== 'all' && stockInfo[t]?.sector !== sectorFilter) return false;
        if (search) {
            const q = search.toUpperCase();
            if (!t.includes(q) && !(stockInfo[t]?.name || '').toUpperCase().includes(q)) return false;
        }
        return true;
    }), [rows, bandFilter, llmFilter, sectorFilter, search, stockInfo]);

    const navCurve = useMemo(() => {
        const L = ledgers?.ledgers;
        if (!L) return [];
        const byDate: Record<string, any> = {};
        const firsts: Record<string, number> = {};
        const benchList: string[] = L && ledgers?.config?.benchmarks ? ledgers.config.benchmarks : DEFAULT_BENCHES;
        const benchKeys: Record<string, string> = Object.fromEntries(benchList.map((s: string) => [s, s.toLowerCase()]));
        for (const name of ['plan', 'plan2', 'equal', 'mine', 'plan_llm', 'plan2_llm', 'equal_llm'] as const) {
            for (const row of L[name]?.nav_series ?? []) {
                if (row.nav === null || row.nav === undefined) continue;
                byDate[row.date] = byDate[row.date] || { date: row.date };
                if (firsts[name] === undefined) firsts[name] = row.nav;
                byDate[row.date][name] = Number(((row.nav / firsts[name]) * 100).toFixed(2));
                // Benchmarks: prefer the multi-benchmark dict, fall back to scalar IWM
                const benches = row.benches || (row.bench != null ? { IWM: row.bench } : {});
                for (const [sym, key] of Object.entries(benchKeys)) {
                    const v = benches[sym];
                    if (v === null || v === undefined) continue;
                    if (firsts[key] === undefined) firsts[key] = v;
                    byDate[row.date][key] = Number(((v / firsts[key]) * 100).toFixed(2));
                }
            }
        }
        const all = Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
        if (navRange === 'all' || all.length === 0) return all;
        const lastDate: string = (all[all.length - 1] as any).date;
        const cut = new Date(lastDate + 'T00:00:00Z');
        if (navRange === '1m') cut.setUTCMonth(cut.getUTCMonth() - 1);
        else if (navRange === '3m') cut.setUTCMonth(cut.getUTCMonth() - 3);
        else if (navRange === 'ytd') { cut.setUTCMonth(0); cut.setUTCDate(1); }
        const cutStr = cut.toISOString().slice(0, 10);
        return all.filter((r: any) => r.date >= cutStr);
    }, [ledgers, navRange]);

    const allBenches: string[] = useMemo(
        () => (ledgers?.config?.benchmarks as string[] | undefined) ?? DEFAULT_BENCHES, [ledgers]);

    const soldTooEarly = useMemo(() => {
        const L = ledgers?.ledgers;
        if (!L) return [];
        const out: any[] = [];
        for (const name of ['plan', 'plan2', 'equal'] as const) {
            for (const c of L[name]?.closed ?? []) {
                if (c.post_exit_return_pct !== null && c.post_exit_return_pct > 10) {
                    out.push({ ...c, ledger: name });
                }
            }
        }
        return out.sort((a, b) => b.post_exit_return_pct - a.post_exit_return_pct).slice(0, 10);
    }, [ledgers]);

    const equityCurve = useMemo(() => {
        const quarters = backtest?.quarters ?? [];
        let s = 1, w = 1;
        let spy = 1, qqq = 1, vc = 1;
        return quarters.map((q: any) => {
            s *= 1 + q.top_return_pct / 100;
            w *= 1 + q.iwm_return_pct / 100;
            if (q.spy_return_pct != null) spy *= 1 + q.spy_return_pct / 100;
            if (q.qqq_return_pct != null) qqq *= 1 + q.qqq_return_pct / 100;
            if (q.value_core_return_pct != null) vc *= 1 + q.value_core_return_pct / 100;
            return {
                formation: q.formation, hybrid: Number(s.toFixed(3)), valueCore: Number(vc.toFixed(3)),
                iwm: Number(w.toFixed(3)), spy: Number(spy.toFixed(3)), qqq: Number(qqq.toFixed(3)),
                excess: q.excess_vs_iwm_pct,
            };
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
    // Portfolio tab: baseline vs LLM-overlay source, then value core vs hybrid
    const basePlan = planSource === 'llm' && planLlm ? planLlm : plan;
    const activePlan = planView === 'plan2' && basePlan?.plan2 ? basePlan.plan2 : basePlan;

    const tabs: { id: TabId; label: string; icon: any }[] = [
        { id: 'rankings', label: 'Rankings', icon: BarChart3 },
        { id: 'track', label: 'Track Record', icon: LineChartIcon },
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
                        {auth.ready && (auth.user ? (
                            <button onClick={() => auth.signOut()}
                                className="rounded-md border border-border bg-secondary/20 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                                title={auth.user.email || 'Log out'}>
                                Log out
                            </button>
                        ) : (
                            <button onClick={() => setShowAuth(true)}
                                className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25">
                                Log in
                            </button>
                        ))}
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
                            <select value={llmFilter} onChange={e => setLlmFilter(e.target.value)}
                                title="Filter by the RS2 local-LLM verdict"
                                className={clsx('rounded-md border bg-secondary/20 px-2 py-1.5 text-xs font-semibold',
                                    llmFilter === 'all' ? 'border-border' : 'border-sky-500/50 text-sky-300')}>
                                <option value="all">All LLM</option>
                                <option value="reviewed">LLM: reviewed</option>
                                <option value="promoted">LLM: promoted</option>
                                <option value="demoted">LLM: demoted</option>
                                <option value="vetoed">LLM: vetoed</option>
                                <option value="undervalued">LLM: undervalued</option>
                                <option value="fair">LLM: fair</option>
                                <option value="overvalued">LLM: overvalued</option>
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
                                                <td className="px-3 py-2"><div className="flex flex-wrap items-center gap-1"><BandChip band={e.fct_band} veto={e.fct_veto} /><LlmChip entry={e} /></div></td>
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

                {/* ── Track Record (live paper-trading ledgers) ─────────── */}
                {tab === 'track' && (ledgers?.ledgers ? (
                    <div className="space-y-4">
                        <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/[0.07] p-2.5 text-xs text-sky-200/90">
                            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer" onClick={() => setShowHelp(true)} />
                            <p>
                                <b>The honest meter.</b> Since {ledgers.inception}, four portfolios are paper-traded daily:
                                {' '}<b className="text-emerald-300">plan</b> (value core),
                                {' '}<b className="text-pink-400">plan2</b> (hybrid + quality sleeve),
                                {' '}<b className="text-sky-300">equal</b> (equal-weight all Research Now),
                                {' '}<b className="text-violet-300">mine</b> (your holdings). plan-vs-plan2 = value discipline vs paying up for leaders;
                                plan-vs-equal = sizing value; mine-vs-plan = your behavior gap. Costs: {ledgers.config?.cost_bps}bps per trade.{' '}
                                <button onClick={() => setShowHelp(true)} className="font-bold underline">Full explanation</button>
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {(['plan', 'plan2', 'equal', 'mine'] as const).map(name => {
                                const led = ledgers.ledgers[name];
                                const s = led?.summary ?? {};
                                const live = led && s.observations > 0 && led.nav_series.some((r: any) => r.nav !== null);
                                const label = name === 'plan' ? 'plan · value core'
                                    : name === 'plan2' ? 'plan2 · hybrid' : name;
                                return (
                                    <div key={name} className={clsx('rounded-lg border bg-card/95 p-3',
                                        ledgerView === name ? 'border-emerald-500/50' : 'border-border')}>
                                        <button onClick={() => setLedgerView(name)} className="w-full text-left">
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-[11px] font-black uppercase tracking-wider">{label}</span>
                                                <span className="font-mono text-lg font-black">
                                                    {live && s.cumulative_return_pct !== undefined && s.cumulative_return_pct !== null
                                                        ? `${s.cumulative_return_pct >= 0 ? '+' : ''}${s.cumulative_return_pct}%` : '—'}
                                                </span>
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                                <span>CAGR: <b className="font-mono text-foreground">{s.cagr_pct ?? 'too early'}</b></span>
                                                <span>Max DD: <b className="font-mono text-foreground">{s.max_drawdown_pct ?? '—'}%</b></span>
                                                <span>Sharpe: <b className="font-mono text-foreground">{s.sharpe ?? 'needs 21d'}</b></span>
                                                <span>Win rate: <b className="font-mono text-foreground">{s.win_rate_pct ?? '—'}{s.win_rate_pct ? '%' : ''}</b></span>
                                                <span>Open: <b className="font-mono text-foreground">{s.open_positions ?? 0}</b></span>
                                            </div>
                                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground">
                                                {allBenches.filter(b => benchSel.has(b)).map(b => {
                                                    const ex = (s.excess_vs || {})[b];
                                                    const fallback = b === 'IWM' ? s.excess_vs_bench_pct : undefined;
                                                    const val = ex !== undefined ? ex : fallback;
                                                    return (
                                                        <span key={b}>vs {b}: <b className={clsx('font-mono', val == null ? 'text-muted-foreground' : val >= 0 ? 'text-success' : 'text-danger')}>
                                                            {val == null ? '—' : `${val >= 0 ? '+' : ''}${val}pts`}</b></span>
                                                    );
                                                })}
                                            </div>
                                            {!live && name === 'mine' && (
                                                <p className="mt-2 text-[10px] text-amber-300">
                                                    {auth.user
                                                        ? 'Idle — save a My Portfolio snapshot (Portfolio tab), then run Update Mine Ledger.'
                                                        : 'Log in and save a My Portfolio snapshot to track your own portfolio.'}
                                                </p>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="rounded-lg border border-border bg-card/95 p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">NAV — indexed to 100 at inception</h3>
                                <div className="flex gap-1">
                                    {(['1m', '3m', 'ytd', 'all'] as const).map(r => (
                                        <button key={r} onClick={() => setNavRange(r)}
                                            className={clsx('rounded px-2 py-0.5 text-[10px] font-black uppercase',
                                                navRange === r ? 'bg-emerald-500/20 text-emerald-300' : 'text-muted-foreground hover:text-foreground')}>
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Benchmarks:</span>
                                {allBenches.map(b => (
                                    <button key={b} onClick={() => toggleBench(b)}
                                        className={clsx('rounded border px-2 py-0.5 text-[10px] font-black uppercase transition',
                                            benchSel.has(b) ? 'border-current' : 'border-border text-muted-foreground opacity-50 hover:opacity-80')}
                                        style={benchSel.has(b) ? { color: benchColor(b), borderColor: benchColor(b) } : undefined}>
                                        {b}
                                    </button>
                                ))}
                                <button onClick={() => setShowLlm(v => !v)}
                                    className={clsx('rounded border px-2 py-0.5 text-[10px] font-black uppercase transition',
                                        showLlm ? 'border-sky-400 text-sky-300' : 'border-border text-muted-foreground opacity-50 hover:opacity-80')}
                                    title="Overlay the LLM-variant NAV lines (dashed) for baseline-vs-LLM comparison">
                                    LLM overlay (dashed)
                                </button>
                            </div>
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={navCurve}>
                                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#64748b" minTickGap={28} interval="preserveStartEnd" />
                                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} stroke="#64748b" />
                                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Line type="monotone" dataKey="plan" name="plan (core)" stroke="#34d399" dot={false} strokeWidth={2} />
                                    <Line type="monotone" dataKey="plan2" name="plan2 (hybrid)" stroke="#f472b6" dot={false} strokeWidth={2} />
                                    <Line type="monotone" dataKey="equal" stroke="#38bdf8" dot={false} strokeWidth={2} />
                                    <Line type="monotone" dataKey="mine" stroke="#a78bfa" dot={false} strokeWidth={2} />
                                    {showLlm && [
                                        <Line key="pl" type="monotone" dataKey="plan_llm" name="plan · LLM" stroke="#fbbf24" dot={false} strokeWidth={2.5} strokeDasharray="7 3" />,
                                        <Line key="p2l" type="monotone" dataKey="plan2_llm" name="plan2 · LLM" stroke="#fb923c" dot={false} strokeWidth={2.5} strokeDasharray="7 3" />,
                                        <Line key="eql" type="monotone" dataKey="equal_llm" name="equal · LLM" stroke="#2dd4bf" dot={false} strokeWidth={2.5} strokeDasharray="7 3" />,
                                    ]}
                                    {allBenches.filter(b => benchSel.has(b)).map(b => (
                                        <Line key={b} type="monotone" dataKey={b.toLowerCase()} name={b}
                                            stroke={benchColor(b)} dot={false} strokeWidth={1.5} strokeDasharray={benchDash(b)} />
                                    ))}
                                    <Brush dataKey="date" height={24} stroke="#475569" fill="#0b1220"
                                        travellerWidth={8} gap={1}
                                        tickFormatter={(d: string) => (typeof d === 'string' ? d.slice(5) : d)} />
                                </LineChart>
                            </ResponsiveContainer>
                            {navCurve.length < 5 && (
                                <p className="mt-1 text-[11px] text-muted-foreground">Day {navCurve.length} — lines get meaningful after a few weeks. This page is designed to be boring for a while.</p>
                            )}
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-lg border border-border bg-card/95 p-3">
                                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                                    Open positions — {ledgerView}
                                </h3>
                                <div className="max-h-72 overflow-y-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                            <tr><th className="px-2 py-1.5">Sym</th><th className="px-2 py-1.5">Entry</th>
                                                <th className="px-2 py-1.5 text-right">Entry $</th><th className="px-2 py-1.5 text-right">Now $</th>
                                                <th className="px-2 py-1.5 text-right">P&L</th></tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(ledgers.ledgers[ledgerView]?.state?.holdings ?? {}).map(([t, h]: [string, any]) => {
                                                const mark = ledgers.ledgers[ledgerView]?.last_marks?.[t];
                                                const pnl = mark && h.entry_price ? (mark / h.entry_price - 1) * 100 : null;
                                                return (
                                                    <tr key={t} className="border-t border-border/50">
                                                        <td className="cursor-pointer px-2 py-1.5 font-black hover:text-emerald-300" onClick={() => setSelected(t)}>{t}</td>
                                                        <td className="px-2 py-1.5 font-mono text-muted-foreground">{h.entry_date}</td>
                                                        <td className="px-2 py-1.5 text-right font-mono">{h.entry_price}</td>
                                                        <td className="px-2 py-1.5 text-right font-mono">{mark ?? '—'}</td>
                                                        <td className={clsx('px-2 py-1.5 text-right font-mono font-black',
                                                            pnl === null ? 'text-muted-foreground' : pnl >= 0 ? 'text-success' : 'text-danger')}>
                                                            {pnl === null ? '—' : `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%`}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="rounded-lg border border-border bg-card/95 p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                                        Trade history — {ledgerView}
                                    </h3>
                                    <input value={tradeQuery} onChange={e => setTradeQuery(e.target.value)} placeholder="filter ticker / date"
                                        className="w-36 rounded-md border border-border bg-secondary/20 px-2 py-1 text-[11px] outline-none focus:border-emerald-500/50" />
                                </div>
                                <div className="max-h-72 overflow-y-auto">
                                    {(() => {
                                        const trades = (ledgers.ledgers[ledgerView]?.trades ?? []);
                                        const tq = tradeQuery.trim().toUpperCase();
                                        const filtered = tq
                                            ? trades.filter((t: any) => (t.ticker || '').toUpperCase().includes(tq) || (t.date || '').includes(tq))
                                            : trades;
                                        const shown = filtered.slice().reverse().slice(0, 500);
                                        if (filtered.length === 0) return <p className="px-2 py-2 text-[11px] text-muted-foreground">No trades match.</p>;
                                        return (<>
                                            <table className="w-full text-left text-xs">
                                                <tbody>
                                                    {shown.map((tr: any, i: number) => (
                                                        <tr key={i} className="border-t border-border/50">
                                                            <td className="px-2 py-1.5 font-mono text-muted-foreground">{tr.date}</td>
                                                            <td className={clsx('px-2 py-1.5 font-black uppercase', tr.side === 'buy' ? 'text-emerald-300' : 'text-red-300')}>{tr.side}</td>
                                                            <td className="cursor-pointer px-2 py-1.5 font-black hover:text-emerald-300" onClick={() => setSelected(tr.ticker)}>{tr.ticker}</td>
                                                            <td className="px-2 py-1.5 text-right font-mono">{tr.price ?? '—'}</td>
                                                            <td className="px-2 py-1.5 text-[10px] text-muted-foreground">{(tr.reason || '').replace(/_/g, ' ')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                                                {filtered.length > 500 ? `Showing latest 500 of ${filtered.length}` : `${filtered.length} trade${filtered.length === 1 ? '' : 's'}`}
                                            </p>
                                        </>);
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* Closed trades — realized round-trip history */}
                        <div className="rounded-lg border border-border bg-card/95 p-3">
                            <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                                Closed trades — {ledgerView} (realized)
                            </h3>
                            <div className="max-h-80 overflow-y-auto">
                                {(() => {
                                    const closed = (ledgers.ledgers[ledgerView]?.closed ?? []).slice()
                                        .sort((a: any, b: any) => (b.exit_date || '').localeCompare(a.exit_date || ''));
                                    if (closed.length === 0) return <p className="px-2 py-2 text-[11px] text-muted-foreground">No closed trades yet — sells appear here once positions exit.</p>;
                                    const wins = closed.filter((c: any) => c.return_pct != null && c.return_pct > 0).length;
                                    const withRet = closed.filter((c: any) => c.return_pct != null);
                                    return (<>
                                        <table className="w-full text-left text-xs">
                                            <thead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                                <tr><th className="px-2 py-1.5">Sym</th><th className="px-2 py-1.5">Entry</th><th className="px-2 py-1.5">Exit</th>
                                                    <th className="px-2 py-1.5 text-right">Days</th><th className="px-2 py-1.5 text-right">Return</th>
                                                    <th className="px-2 py-1.5 text-right">Post-exit</th></tr>
                                            </thead>
                                            <tbody>
                                                {closed.map((c: any, i: number) => (
                                                    <tr key={i} className="border-t border-border/50">
                                                        <td className="cursor-pointer px-2 py-1.5 font-black hover:text-emerald-300" onClick={() => setSelected(c.ticker)}>{c.ticker}</td>
                                                        <td className="px-2 py-1.5 font-mono text-muted-foreground">{c.entry_date}</td>
                                                        <td className="px-2 py-1.5 font-mono text-muted-foreground">{c.exit_date}</td>
                                                        <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{c.hold_days ?? '—'}</td>
                                                        <td className={clsx('px-2 py-1.5 text-right font-mono font-black',
                                                            c.return_pct == null ? 'text-muted-foreground' : c.return_pct >= 0 ? 'text-success' : 'text-danger')}>
                                                            {c.return_pct == null ? '—' : `${c.return_pct >= 0 ? '+' : ''}${c.return_pct}%`}
                                                        </td>
                                                        <td className={clsx('px-2 py-1.5 text-right font-mono',
                                                            c.post_exit_return_pct == null ? 'text-muted-foreground' : c.post_exit_return_pct >= 0 ? 'text-success' : 'text-danger')}>
                                                            {c.post_exit_return_pct == null ? '—' : `${c.post_exit_return_pct >= 0 ? '+' : ''}${c.post_exit_return_pct}%`}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                                            {closed.length} closed{withRet.length ? ` · win rate ${(100 * wins / withRet.length).toFixed(0)}%` : ''} · &ldquo;Post-exit&rdquo; = move in the 30d after selling (sold-too-early signal)
                                        </p>
                                    </>);
                                })()}
                            </div>
                        </div>

                        {soldTooEarly.length > 0 && (
                            <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3">
                                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-amber-300">Sold too early? (+10%+ within 30 days after exit)</h3>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    {soldTooEarly.map((c, i) => (
                                        <span key={i} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono">
                                            {c.ticker} ({c.ledger}): +{c.post_exit_return_pct}% in {c.post_exit_days}d post-exit
                                        </span>
                                    ))}
                                </div>
                                <p className="mt-2 text-[11px] text-muted-foreground">Recurring pattern here = exits fire too fast; consider a stickier exit band.</p>
                            </div>
                        )}
                    </div>
                ) : <p className="text-sm text-muted-foreground">No paper ledger yet — run the chain once (run_chain.bat).</p>)}

                {/* ── Portfolio ──────────────────────────────────────── */}
                {tab === 'portfolio' && (plan ? (
                    <div className="space-y-4">
                        <MyPortfolio factor={factor?.tickers ?? {}} valuations={valuations}
                            overlay={overlay} stockInfo={stockInfo} onSelect={setSelected}
                            user={auth.user} onRequireLogin={() => setShowAuth(true)} />

                        {/* Baseline vs LLM-overlay source (A/B) — LLM option only when the variant exists */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground">Source:</span>
                            {([['baseline', 'Baseline', 'quant only'],
                               ['llm', 'LLM overlay', planLlm ? 'RS2 verdicts' : 'no data yet']] as const).map(([id, lbl, sub]) => (
                                <button key={id} onClick={() => planLlm || id === 'baseline' ? setPlanSource(id) : null}
                                    disabled={id === 'llm' && !planLlm}
                                    className={clsx('rounded-md border px-3 py-1.5 text-xs font-bold transition-colors',
                                        id === 'llm' && !planLlm ? 'cursor-not-allowed border-border bg-secondary/10 text-muted-foreground/40'
                                            : planSource === id ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                                                : 'border-border bg-secondary/20 text-muted-foreground hover:text-foreground')}>
                                    {lbl} <span className="font-mono opacity-70">· {sub}</span>
                                </button>
                            ))}
                            {planSource === 'llm' && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300/80">comparing LLM-adjusted Research-Now</span>
                            )}
                        </div>
                        {/* Suggested-plan selector: value core vs hybrid */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground">Suggested plan:</span>
                            {([['plan', 'Value core', `${basePlan.invested_pct}% inv`],
                               ['plan2', 'Hybrid (+ quality sleeve)', basePlan.plan2 ? `${basePlan.plan2.invested_pct}% inv` : '—']] as const).map(([id, lbl, sub]) => (
                                <button key={id} onClick={() => setPlanView(id)}
                                    className={clsx('rounded-md border px-3 py-1.5 text-xs font-bold transition-colors',
                                        planView === id ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                                            : 'border-border bg-secondary/20 text-muted-foreground hover:text-foreground')}>
                                    {lbl} <span className="font-mono opacity-70">· {sub}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/[0.07] p-2.5 text-xs text-sky-200/90">
                            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer" onClick={() => setShowHelp(true)} />
                            {planView === 'plan' ? (
                                <p>
                                    <b>Value core, not your holdings.</b> Quarter-Kelly sizes only research_now names priced
                                    BELOW their demonstrated growth (negative gap); no edge = no position, so it runs ~50% cash and
                                    won&apos;t hold expensive leaders like TSM.{' '}
                                    <button onClick={() => setShowHelp(true)} className="font-bold underline">Full explanation</button>
                                </p>
                            ) : (
                                <p>
                                    <b>Hybrid = value core + quality sleeve.</b> Keeps the Kelly core, then adds the top-ranked names
                                    REGARDLESS of valuation gap (capped ~35% of book) — so it captures TSM, GOOGL, MU and deploys the
                                    idle cash. More invested, more leader exposure, less value discipline.{' '}
                                    <button onClick={() => setShowHelp(true)} className="font-bold underline">Full explanation</button>
                                </p>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {[['Invested', `${activePlan.invested_pct}%`], ['Cash', `${activePlan.cash_pct}%`],
                              ['Positions', activePlan.position_count],
                              ...(planView === 'plan2' && activePlan.sleeve_pct !== undefined ? [['Quality sleeve', `${activePlan.sleeve_pct}%`]] : []),
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
                                    {(activePlan.positions ?? []).map((p: any) => (
                                        <tr key={p.symbol} onClick={() => setSelected(p.symbol)}
                                            className={clsx('cursor-pointer border-t border-border/50 odd:bg-secondary/10 hover:bg-emerald-500/[0.06]',
                                                p.sizing_method === 'quality_sleeve' && 'bg-pink-500/[0.05]')}>
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
                            {[['Sector allocation', activePlan.sector_allocation], ['Theme allocation', activePlan.theme_allocation]].map(([title, alloc]) => (
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
                                ['Hybrid CAGR', `${backtest.summary.hybrid_cagr_pct ?? backtest.summary.strategy_cagr_pct}%`],
                                ['Value-core CAGR', `${backtest.summary.value_core_cagr_pct ?? '—'}%`],
                                ['IWM CAGR', `${backtest.summary.iwm_cagr_pct}%`],
                                ['SPY CAGR', `${backtest.summary.spy_cagr_pct ?? '—'}%`],
                                ['QQQ CAGR', `${backtest.summary.qqq_cagr_pct ?? '—'}%`],
                                ['Hit rate vs IWM', `${backtest.summary.hit_rate_vs_iwm_pct}%`],
                                ['Decile spread', `${backtest.summary.mean_decile_spread_pct}%/q`],
                            ].map(([k, v]) => (
                                <div key={k as string} className="rounded-lg border border-border bg-card/95 px-4 py-2">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{k}</div>
                                    <div className="font-mono text-lg font-black">{v as string}</div>
                                </div>
                            ))}
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-lg border border-border bg-card/95 p-3">
                                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">Equity curve — hybrid / value-core vs IWM / SPY / QQQ (quarterly, backtest)</h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <LineChart data={equityCurve}>
                                        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                                        <XAxis dataKey="formation" tick={{ fontSize: 9 }} stroke="#64748b" />
                                        <YAxis tick={{ fontSize: 10 }} stroke="#64748b" />
                                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Line type="monotone" dataKey="hybrid" name="hybrid (plan2)" stroke="#34d399" dot={false} strokeWidth={2} />
                                        <Line type="monotone" dataKey="valueCore" name="value core (plan)" stroke="#f472b6" dot={false} strokeWidth={2} strokeDasharray="5 2" />
                                        <Line type="monotone" dataKey="iwm" name="IWM" stroke="#64748b" dot={false} strokeWidth={2} />
                                        <Line type="monotone" dataKey="spy" name="SPY" stroke="#94a3b8" dot={false} strokeWidth={1.5} strokeDasharray="3 2" />
                                        <Line type="monotone" dataKey="qqq" name="QQQ" stroke="#facc15" dot={false} strokeWidth={1.5} strokeDasharray="1 3" />
                                    </LineChart>
                                </ResponsiveContainer>
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                    Backtest proxies: <b>hybrid</b> = top-decile basket (what plan2&apos;s sleeve buys); <b>value core</b> = the cheaper half of that decile (what plan&apos;s Kelly core buys). Live Kelly sizing/cash isn&apos;t backtestable — the real plan/plan2 are measured forward in <b>Track Record</b>. Over 2017-26 the two nearly overlap: cheap-tilting the winners barely changed historical returns.
                                </p>
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
                                                <th className="px-2 py-1.5 text-right">Excess vs IWM</th>
                                                <th className="px-2 py-1.5 text-right">vs SPY</th><th className="px-2 py-1.5 text-right">vs QQQ</th>
                                                <th className="px-2 py-1.5 text-right">% beat IWM</th></tr>
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
                                                    <td className={clsx('px-2 py-1.5 text-right font-mono', r.mean_excess_vs_spy_pct == null ? 'text-muted-foreground' : r.mean_excess_vs_spy_pct >= 0 ? 'text-success' : 'text-danger')}>{r.mean_excess_vs_spy_pct ?? '—'}%</td>
                                                    <td className={clsx('px-2 py-1.5 text-right font-mono', r.mean_excess_vs_qqq_pct == null ? 'text-muted-foreground' : r.mean_excess_vs_qqq_pct >= 0 ? 'text-success' : 'text-danger')}>{r.mean_excess_vs_qqq_pct ?? '—'}%</td>
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
            {showAuth && <AuthModal onClose={() => setShowAuth(false)} signIn={auth.signIn} signUp={auth.signUp} />}

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
