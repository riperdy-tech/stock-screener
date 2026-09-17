"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import clsx from "clsx";
import { ExternalLink, ChevronDown } from "lucide-react";
import { fetchRs2Index, fetchRs2Report, fetchDepthOverlay, fetchDepthReport, type Rs2RunMeta, type Rs2Bundle, type DepthVerdict, type DepthReportBundle } from "@/lib/data-service";

const humanMethod = (m?: string | null) => {
    if (!m) return "—";
    const map: Record<string, string> = {
        reverse_dcf: "Reverse DCF",
        financial_pb_roe: "Financial P/B–ROE",
        option_bridge: "Option bridge",
        engine2_cycle: "Cyclical mid-cycle",
        fcf_ttm_yf: "Reverse DCF (FCF)",
    };
    return map[m] || m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};
const convTone = (c?: number | null) => (c == null ? "text-ink-2" : c >= 10 ? "text-pos" : c >= 7 ? "text-warn" : "text-neg");
const stancePill = (s?: string | null) =>
    s === "undervalued" ? "border-pos/40 bg-pos/10 text-pos"
    : s === "overvalued" ? "border-neg/40 bg-neg/10 text-neg"
    : "border-warn/40 bg-warn/10 text-warn";
const gapTone = (g?: number | null) => (g == null ? "text-ink-2" : g <= -1 ? "text-pos" : g >= 1 ? "text-neg" : "text-warn");
const bandTone = (b?: string | null) => (b === "research_now" ? "text-pos" : b === "watchlist" ? "text-warn" : "text-ink-2");
const bandLabel = (b?: string | null) => (b === "research_now" ? "Research Now" : b === "watchlist" ? "Watchlist" : b || "—");
const shortAction = (a?: string | null) => (a ? a.split("/")[0].trim().toLowerCase() : "—");
const fmtDate = (d?: string | null) => {
    if (!d) return "—";
    const dt = new Date(d);
    return isNaN(+dt) ? d : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
// wrap bare URLs in angle brackets so react-markdown auto-links them (no remark-gfm needed)
const linkify = (md: string) => md.replace(/\bhttps?:\/\/[^\s<>()[\]]+/g, (u) => `<${u}>`);

const STAGE_TITLES: [string, string][] = [
    ["s1", "S1 · Macro classify"],
    ["s2", "S2 · Quality & moat"],
    ["s3", "S3 · Valuation"],
    ["s3_inputs", "S3 · Valuation inputs"],
    ["s4", "S4 · Scenarios"],
    ["s4_result", "S4 · Valuation result"],
    ["s5", "S5 · Conviction"],
    ["s6", "S6 · Red-team audit"],
    ["fed_data", "Fed data (inputs)"],
];

const mdComponents = {
    a: (props: any) => (
        <a target="_blank" rel="noopener noreferrer" className="break-all text-accent underline decoration-blue-400/40 underline-offset-2 hover:decoration-blue-400" {...props} />
    ),
};

function Md({ children }: { children: string }) {
    return (
        <div className="prose prose-invert prose-sm max-w-none break-words leading-relaxed text-ink-q prose-headings:font-extrabold prose-headings:text-ink prose-p:leading-6 prose-li:leading-6 prose-strong:text-ink prose-a:text-accent prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:overflow-x-hidden prose-code:whitespace-pre-wrap">
            <ReactMarkdown components={mdComponents}>{children}</ReactMarkdown>
        </div>
    );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
    return (
        <div className="flex flex-col items-center justify-center border border-rule-10 bg-page px-2 py-3 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2">{label}</div>
            <div className={clsx("mt-1 font-mono text-lg font-extrabold leading-none", tone)}>{value}</div>
        </div>
    );
}

function Note({ children }: { children: React.ReactNode }) {
    return (
        <div className="border border-dashed border-rule-14 bg-page p-5 text-center text-xs leading-relaxed text-ink-2">
            {children}
        </div>
    );
}

function DepthSamplesView({ ticker }: { ticker: string }) {
    const [bundle, setBundle] = useState<DepthReportBundle | null>(null);
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState(0);
    useEffect(() => {
        let alive = true;
        fetchDepthReport(ticker).then((b) => { if (alive) setBundle(b); });
        return () => { alive = false; };
    }, [ticker]);
    if (!bundle || bundle.samples.length === 0) return null;
    const withReports = bundle.samples.filter((s) => s.report && s.report.length > 0);
    if (withReports.length === 0) return null;
    const cur = withReports[Math.min(tab, withReports.length - 1)];
    return (
        <div className="border border-rule-10 bg-inset">
            <button
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-extrabold uppercase tracking-wide text-ink-2 hover:text-ink"
            >
                <span>Depth run transcripts — {withReports.length} sample report{withReports.length === 1 ? "" : "s"} ({bundle.run})</span>
                <span>{open ? "▾ hide" : "▸ show"}</span>
            </button>
            {open && (
                <div className="border-t border-rule-10 p-3">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                        {withReports.map((s, i) => (
                            <button
                                key={s.sample}
                                onClick={() => setTab(i)}
                                className={` border px-2.5 py-1 text-xs font-bold ${i === tab ? "border-accent bg-accent/10 text-accent" : "border-rule-14 text-ink-2 hover:text-ink"}`}
                            >
                                Sample {s.sample}{s.iv != null ? ` · $${s.iv}` : ""}{!s.plausible ? " · rejected" : ""}{s.truncated ? " · truncated" : ""}
                            </button>
                        ))}
                    </div>
                    {!cur.plausible && cur.reasons.length > 0 && (
                        <p className="mb-2 text-[11px] text-warn">
                            Guard rejection: {cur.reasons.join("; ")}
                        </p>
                    )}
                    <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap bg-page p-3 text-[11.5px] leading-relaxed text-ink-q">
                        {cur.report}
                    </pre>
                </div>
            )}
        </div>
    );
}

function DepthVerdictBanner({ v }: { v: DepthVerdict }) {
    const tone =
        v.direction === "undervalued" ? "border-pos/40 bg-pos/10 text-pos" :
        v.direction === "overvalued" ? "border-neg/40 bg-neg/10 text-neg" :
        v.direction === "hold" ? "border-warn/40 bg-warn/10 text-warn" :
        "border-rule-14 bg-white/5 text-ink-2";
    const label =
        v.direction === "undervalued" ? "UNDERVALUED — every run values it above the price" :
        v.direction === "overvalued" ? "OVERVALUED — every run values it below the price" :
        v.direction === "hold" ? "HOLD — price sits inside the model's uncertainty band" :
        "NOT USABLE — no plausible run";
    return (
        <div className={` border p-3 ${tone}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs font-extrabold uppercase tracking-wide">Depth verdict</span>
                <span className="text-sm font-extrabold">{label}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-q">
                {v.iv_band_low != null && v.iv_band_high != null && (
                    <span>IV band <b>${v.iv_band_low}–${v.iv_band_high}</b> vs price <b>${v.price}</b></span>
                )}
                {v.median_iv != null && <span>median <b>${v.median_iv}</b></span>}
                {v.spread_pct != null && <span>run spread <b>{v.spread_pct}%</b></span>}
                {v.size_hint && <span>size hint <b>{v.size_hint}</b></span>}
                {v.conviction_score != null && <span>conviction <b>{v.conviction_score}/15</b></span>}
                {v.business_quality_moat != null && <span>moat <b>{v.business_quality_moat}/5.0</b></span>}
                {v.kelly_fraction_pct != null && <span>Kelly <b>{v.kelly_fraction_pct}%</b></span>}
                <span>{v.n_basis} plausible run{v.n_basis === 1 ? "" : "s"}</span>
                {v.date && <span>{v.date}</span>}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-2">
                Band-direction scheme: the model analyzes the full fact pack in {v.n_basis >= 3 ? "three" : "multiple"} independent
                runs; the verdict is where today's price sits relative to the whole band of its
                valuations. Spread sets position size, not pass/fail.
            </p>
        </div>
    );
}

export function Rs2AnalysisPanel({ symbol, displayTicker, hideDepth = false }: {
    symbol: string;
    displayTicker: string;
    // The desk's ticker page renders the band verdict and transcripts itself, so it
    // asks this panel for the run history and the older RS2 report text only.
    hideDepth?: boolean;
}) {
    const ticker = symbol.toUpperCase();
    const [history, setHistory] = useState<Rs2RunMeta[] | null>(null); // null = loading, [] = none
    const [selectedTs, setSelectedTs] = useState<string | null>(null);
    const [bundle, setBundle] = useState<Rs2Bundle | null>(null);
    const [bundleLoading, setBundleLoading] = useState(false);
    const [subTab, setSubTab] = useState<"full" | "research" | "raw">("full");
    const [openStages, setOpenStages] = useState<Record<string, boolean>>({ s1: true });
    const [depthV, setDepthV] = useState<DepthVerdict | null>(null);

    useEffect(() => {
        let alive = true;
        fetchDepthOverlay().then((d) => {
            if (alive) setDepthV(d?.tickers?.[ticker] ?? null);
        });
        return () => { alive = false; };
    }, [ticker]);

    useEffect(() => {
        let alive = true;
        fetchRs2Index().then((idx) => {
            if (!alive) return;
            const h = idx?.tickers?.[ticker]?.history || [];
            setHistory(h);
            setSelectedTs(h[0]?.ts || null);
        });
        return () => { alive = false; };
    }, [ticker]);

    useEffect(() => {
        if (!selectedTs) { setBundle(null); return; }
        let alive = true;
        setBundleLoading(true);
        fetchRs2Report(ticker, selectedTs).then((b) => {
            if (!alive) return;
            setBundle(b);
            setBundleLoading(false);
        });
        return () => { alive = false; };
    }, [ticker, selectedTs]);

    if (history === null) return <div className="p-6 text-center text-sm text-ink-2">Loading RS2 analysis…</div>;
    if (history.length === 0)
        return (
            <div className="space-y-4">
            {!hideDepth && depthV && <DepthVerdictBanner v={depthV} />}
            {!hideDepth && depthV && <DepthSamplesView ticker={ticker} />}
            <div className="border border-dashed border-rule-14 bg-inset p-6 text-center">
                <div className="text-sm font-extrabold text-ink">No RS2 analysis yet for {displayTicker}</div>
                <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-2">
                    The local RS2 engine analyzes Research-Now and Watchlist names on a weekly / bi-weekly cadence. It hasn't produced a report for this ticker yet.
                </p>
            </div>
            </div>
        );

    const meta = history.find((h) => h.ts === selectedTs) || history[0];
    const v: Record<string, any> = bundle?.verdict || {};
    const action = v.action ?? meta.action;
    const stance = v.stance ?? meta.stance;
    const conviction = (v.conviction ?? meta.conviction) as number | null;
    const iv = (v.fair_value ?? (meta as any).fair_value) as number | null;
    const mos = (v.mos_pct ?? (meta as any).mos_pct) as number | null;
    const band = (v.band_at_analysis ?? meta.band_at_analysis) as string | null;
    const method = v.method ?? meta.method;
    const date = v.date ?? meta.date;
    const rawKeys = bundle?.raw ? Object.keys(bundle.raw) : [];

    return (
        <div className="space-y-4">
            {!hideDepth && depthV && <DepthVerdictBanner v={depthV} />}
            {!hideDepth && depthV && <DepthSamplesView ticker={ticker} />}
            {/* header: ticker + TradingView overview + method */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-lg font-extrabold tracking-tight">{displayTicker}</span>
                <a
                    href={`https://www.tradingview.com/symbols/${ticker}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 border border-[#2a2e39] bg-[#131722] px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#2a2e39]"
                    title="Open the TradingView company overview (not the chart)"
                >
                    <img src="https://www.google.com/s2/favicons?domain=tradingview.com&sz=32" alt="TV" className="h-3.5 w-3.5" />
                    TradingView overview
                    <ExternalLink className="h-3 w-3" />
                </a>
                <span className="ml-auto border border-rule-10 bg-white/5 px-2.5 py-1 text-xs text-ink-2">
                    Method: <span className="font-extrabold text-ink">{humanMethod(method)}</span>
                </span>
            </div>

            {/* verdict banner */}
            <div className="flex flex-wrap items-center gap-3">
                <span className={clsx(" border px-3.5 py-1 text-sm font-extrabold capitalize", stancePill(stance))}>
                    {stance || "—"}
                </span>
                <span className="text-base font-extrabold">{action || "—"}</span>
            </div>

            {/* colored metric boxes */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Metric label="Conviction" value={conviction != null ? `${conviction}/15` : "—"} tone={convTone(conviction)} />
                <Metric label="Intrinsic Value" value={iv != null ? `$${iv}` : "—"} tone="text-ink" />
                <Metric label="Margin of Safety" value={mos != null ? `${mos > 0 ? "+" : ""}${mos}%` : "—"}
                    tone={mos == null ? "text-ink-2" : mos >= 0 ? "text-pos" : "text-neg"} />
                <Metric label="Band" value={bandLabel(band)} tone={bandTone(band)} />
                <Metric label="Analyzed" value={fmtDate(date)} tone="text-ink-q" />
            </div>

            {/* run history */}
            {history.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {history.map((h) => (
                        <button
                            key={h.ts}
                            onClick={() => setSelectedTs(h.ts)}
                            className={clsx(
                                "whitespace-nowrap  border px-2.5 py-1.5 text-xs font-bold transition-colors",
                                h.ts === selectedTs
                                    ? "border-accent/50 bg-accent/10 text-accent"
                                    : "border-rule-10 bg-white/5 text-ink-2 hover:border-accent/30 hover:text-ink"
                            )}
                        >
                            {fmtDate(h.date)} · {shortAction(h.action)}{h.conviction != null ? ` ${h.conviction}` : ""}
                        </button>
                    ))}
                </div>
            )}

            {/* sub-tabs */}
            <div className="flex gap-2 border-b border-rule-10 pb-2">
                {([["full", "Full analysis"], ["research", "Research & news"], ["raw", "Raw stages"]] as const).map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setSubTab(id)}
                        className={clsx(
                            " border px-3 py-1.5 text-xs font-extrabold transition-colors",
                            subTab === id
                                ? "border-accent/50 bg-accent/10 text-accent"
                                : "border-rule-10 bg-white/5 text-ink-2 hover:text-ink"
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* panels */}
            <div className="scroll-dark max-h-[340px] overflow-y-auto border border-rule-10 bg-inset p-4">
                {bundleLoading ? (
                    <div className="p-4 text-center text-sm text-ink-2">Loading report…</div>
                ) : subTab === "full" ? (
                    bundle?.final_md ? <Md>{bundle.final_md}</Md> : <Note>Full analysis text isn't stored for this older run — only the newest reports keep the full text. The verdict summary above is from the run index.</Note>
                ) : subTab === "research" ? (
                    bundle?.research_md ? (
                        <div className="space-y-3">
                            <div className="text-xs text-ink-2">
                                Deep-research brief{bundle.research_generated ? ` · generated ${bundle.research_generated}` : ""} · every cited source is listed inline below.
                            </div>
                            <Md>{linkify(bundle.research_md)}</Md>
                        </div>
                    ) : <Note>The research brief isn't stored for this older run.</Note>
                ) : rawKeys.length ? (
                    <div className="space-y-2">
                        {STAGE_TITLES.filter(([k]) => bundle?.raw?.[k]).map(([k, title]) => (
                            <div key={k} className="overflow-hidden border border-rule-10">
                                <button
                                    onClick={() => setOpenStages((s) => ({ ...s, [k]: !s[k] }))}
                                    className="flex w-full items-center justify-between gap-2 bg-white/5 px-3 py-2 text-left text-sm font-extrabold text-ink transition-colors hover:bg-white/5"
                                >
                                    <span>{title}</span>
                                    <ChevronDown className={clsx("h-4 w-4 shrink-0 transition-transform", openStages[k] && "rotate-180")} />
                                </button>
                                {openStages[k] && (
                                    <div className="border-t border-rule-10 p-3">
                                        {k === "s3_inputs" ? (
                                            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink-2">{bundle!.raw[k]}</pre>
                                        ) : (
                                            <Md>{bundle!.raw[k]}</Md>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : <Note>Raw stage files aren't stored for this older run.</Note>}
            </div>
        </div>
    );
}
