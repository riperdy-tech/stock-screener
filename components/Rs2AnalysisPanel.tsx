"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import clsx from "clsx";
import { ExternalLink, ChevronDown } from "lucide-react";
import { fetchRs2Index, fetchRs2Report, type Rs2RunMeta, type Rs2Bundle } from "@/lib/data-service";

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
const convTone = (c?: number | null) => (c == null ? "text-muted-foreground" : c >= 10 ? "text-emerald-400" : c >= 7 ? "text-amber-400" : "text-red-400");
const stancePill = (s?: string | null) =>
    s === "undervalued" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : s === "overvalued" ? "border-red-500/30 bg-red-500/10 text-red-400"
    : "border-amber-500/30 bg-amber-500/10 text-amber-400";
const gapTone = (g?: number | null) => (g == null ? "text-muted-foreground" : g <= -1 ? "text-emerald-400" : g >= 1 ? "text-red-400" : "text-amber-400");
const bandTone = (b?: string | null) => (b === "research_now" ? "text-emerald-400" : b === "watchlist" ? "text-amber-400" : "text-muted-foreground");
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
        <a target="_blank" rel="noopener noreferrer" className="break-all text-blue-400 underline decoration-blue-400/40 underline-offset-2 hover:decoration-blue-400" {...props} />
    ),
};

function Md({ children }: { children: string }) {
    return (
        <div className="prose prose-invert prose-sm max-w-none break-words leading-relaxed text-foreground/90 prose-headings:font-black prose-headings:text-foreground prose-p:leading-6 prose-li:leading-6 prose-strong:text-foreground prose-a:text-blue-400 prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:overflow-x-hidden prose-code:whitespace-pre-wrap">
            <ReactMarkdown components={mdComponents}>{children}</ReactMarkdown>
        </div>
    );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border/60 bg-background/70 px-2 py-3 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={clsx("mt-1 font-mono text-lg font-black leading-none", tone)}>{value}</div>
        </div>
    );
}

function Note({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-md border border-dashed border-border bg-background/40 p-5 text-center text-xs leading-relaxed text-muted-foreground">
            {children}
        </div>
    );
}

export function Rs2AnalysisPanel({ symbol, displayTicker }: { symbol: string; displayTicker: string }) {
    const ticker = symbol.toUpperCase();
    const [history, setHistory] = useState<Rs2RunMeta[] | null>(null); // null = loading, [] = none
    const [selectedTs, setSelectedTs] = useState<string | null>(null);
    const [bundle, setBundle] = useState<Rs2Bundle | null>(null);
    const [bundleLoading, setBundleLoading] = useState(false);
    const [subTab, setSubTab] = useState<"full" | "research" | "raw">("full");
    const [openStages, setOpenStages] = useState<Record<string, boolean>>({ s1: true });

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

    if (history === null) return <div className="p-6 text-center text-sm text-muted-foreground">Loading RS2 analysis…</div>;
    if (history.length === 0)
        return (
            <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
                <div className="text-sm font-black text-foreground">No RS2 analysis yet for {displayTicker}</div>
                <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
                    The local RS2 engine analyzes Research-Now and Watchlist names on a weekly / bi-weekly cadence. It hasn't produced a report for this ticker yet.
                </p>
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
            {/* header: ticker + TradingView overview + method */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-lg font-black tracking-tight">{displayTicker}</span>
                <a
                    href={`https://www.tradingview.com/symbols/${ticker}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2e39] bg-[#131722] px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#2a2e39]"
                    title="Open the TradingView company overview (not the chart)"
                >
                    <img src="https://www.google.com/s2/favicons?domain=tradingview.com&sz=32" alt="TV" className="h-3.5 w-3.5 rounded-sm" />
                    TradingView overview
                    <ExternalLink className="h-3 w-3" />
                </a>
                <span className="ml-auto rounded-md border border-border/60 bg-secondary/40 px-2.5 py-1 text-xs text-muted-foreground">
                    Method: <span className="font-black text-foreground">{humanMethod(method)}</span>
                </span>
            </div>

            {/* verdict banner */}
            <div className="flex flex-wrap items-center gap-3">
                <span className={clsx("rounded-full border px-3.5 py-1 text-sm font-black capitalize", stancePill(stance))}>
                    {stance || "—"}
                </span>
                <span className="text-base font-black">{action || "—"}</span>
            </div>

            {/* colored metric boxes */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Metric label="Conviction" value={conviction != null ? `${conviction}/15` : "—"} tone={convTone(conviction)} />
                <Metric label="Intrinsic Value" value={iv != null ? `$${iv}` : "—"} tone="text-foreground" />
                <Metric label="Margin of Safety" value={mos != null ? `${mos > 0 ? "+" : ""}${mos}%` : "—"}
                    tone={mos == null ? "text-muted-foreground" : mos >= 0 ? "text-success" : "text-danger"} />
                <Metric label="Band" value={bandLabel(band)} tone={bandTone(band)} />
                <Metric label="Analyzed" value={fmtDate(date)} tone="text-foreground/80" />
            </div>

            {/* run history */}
            {history.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {history.map((h) => (
                        <button
                            key={h.ts}
                            onClick={() => setSelectedTs(h.ts)}
                            className={clsx(
                                "whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-bold transition-colors",
                                h.ts === selectedTs
                                    ? "border-primary/50 bg-primary/10 text-primary"
                                    : "border-border/60 bg-secondary/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                            )}
                        >
                            {fmtDate(h.date)} · {shortAction(h.action)}{h.conviction != null ? ` ${h.conviction}` : ""}
                        </button>
                    ))}
                </div>
            )}

            {/* sub-tabs */}
            <div className="flex gap-2 border-b border-border/60 pb-2">
                {([["full", "Full analysis"], ["research", "Research & news"], ["raw", "Raw stages"]] as const).map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setSubTab(id)}
                        className={clsx(
                            "rounded-md border px-3 py-1.5 text-xs font-black transition-colors",
                            subTab === id
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border/60 bg-secondary/30 text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* panels */}
            <div className="rounded-lg border border-border/60 bg-card/40 p-4">
                {bundleLoading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">Loading report…</div>
                ) : subTab === "full" ? (
                    bundle?.final_md ? <Md>{bundle.final_md}</Md> : <Note>Full analysis text isn't stored for this older run — only the newest reports keep the full text. The verdict summary above is from the run index.</Note>
                ) : subTab === "research" ? (
                    bundle?.research_md ? (
                        <div className="space-y-3">
                            <div className="text-xs text-muted-foreground">
                                Deep-research brief{bundle.research_generated ? ` · generated ${bundle.research_generated}` : ""} · every cited source is listed inline below.
                            </div>
                            <Md>{linkify(bundle.research_md)}</Md>
                        </div>
                    ) : <Note>The research brief isn't stored for this older run.</Note>
                ) : rawKeys.length ? (
                    <div className="space-y-2">
                        {STAGE_TITLES.filter(([k]) => bundle?.raw?.[k]).map(([k, title]) => (
                            <div key={k} className="overflow-hidden rounded-lg border border-border/60">
                                <button
                                    onClick={() => setOpenStages((s) => ({ ...s, [k]: !s[k] }))}
                                    className="flex w-full items-center justify-between gap-2 bg-secondary/30 px-3 py-2 text-left text-sm font-black text-foreground transition-colors hover:bg-secondary/50"
                                >
                                    <span>{title}</span>
                                    <ChevronDown className={clsx("h-4 w-4 shrink-0 transition-transform", openStages[k] && "rotate-180")} />
                                </button>
                                {openStages[k] && (
                                    <div className="border-t border-border/60 p-3">
                                        {k === "s3_inputs" ? (
                                            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">{bundle!.raw[k]}</pre>
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
