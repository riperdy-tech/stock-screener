import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { readFileSync } from 'fs';
import { join } from 'path';

const MAX_BATCH_SIZE = 30;

function buildServerPrompt(ticker: string, engineContent: string, reverse: any, financials: any): string {
    let reversePriming = "";
    if (reverse && reverse.rev_band && reverse.rev_band !== "Excluded") {
        const parts: string[] = [];
        parts.push("## Reverse Screening Engine — Pre-Analysis Context");
        parts.push("");
        parts.push("This stock was nominated by the reverse screening engine for deep analysis.");
        parts.push("The engine's triage findings (NOT a verdict — your full v3.2 analysis decides):");
        parts.push("");
        if (reverse.rev_archetype) {
            const archStr = reverse.rev_archetype_secondary
                ? `${reverse.rev_archetype} (+${reverse.rev_archetype_secondary} transition)`
                : reverse.rev_archetype;
            parts.push(`- Archetype: ${archStr}`);
        }
        if (reverse.rev_composite != null) {
            parts.push(`- Reverse composite score: ${Math.round(reverse.rev_composite)}/100 (band: ${reverse.rev_band}, rank: #${reverse.rev_rank ?? "?"})`);
        }
        if (reverse.rev_mos != null) parts.push(`- Margin-of-safety proxy: ${Math.round(reverse.rev_mos)}/100`);
        parts.push(`- Quality: ${reverse.rev_quality ?? "?"}/100 | Survivability: ${reverse.rev_survivability ?? "?"}/100 | Impairment prob: ${reverse.rev_impairment_prob != null ? (reverse.rev_impairment_prob * 100).toFixed(0) + "%" : "?"}`);
        if (reverse.rev_cagr_proxy != null) {
            parts.push(`- CAGR proxy: ${reverse.rev_cagr_proxy.toFixed(1)}% | Drawdown proxy: ${reverse.rev_drawdown_proxy != null ? (reverse.rev_drawdown_proxy * 100).toFixed(1) + "%" : "?"} | Efficiency: ${reverse.rev_efficiency != null ? reverse.rev_efficiency.toFixed(2) + "x" : "?"}`);
        }
        if (reverse.rev_data_quality != null) parts.push(`- Data quality: ${reverse.rev_data_quality}/5 | Route confidence: ${reverse.rev_route_confidence ?? "?"}`);
        if (reverse.rev_pro) parts.push(`- Strongest reason flagged: ${reverse.rev_pro}`);
        if (reverse.rev_con) parts.push(`- Strongest concern flagged: ${reverse.rev_con}`);
        if (reverse.rev_flags) {
            parts.push(`- Flags: ${reverse.rev_flags.split(",").filter((f: string) => f).join(", ")}`);
        }
        parts.push("");
        parts.push("Treat these as a starting hypothesis to verify and challenge, not as conclusions.");
        reversePriming = parts.join("\n") + "\n";
    }

    let dataBrief = `── MARKET SNAPSHOT ──\n  Ticker: ${ticker}\n  (No financial data available)\n`;
    if (financials) {
        const m = financials.Calculated_Metrics || {};
        dataBrief = [
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `  FINANCIAL DATA BRIEF — ${ticker}`,
            `  Data As Of: ${financials.Data_Fetched_Date || 'Unknown'}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, ``,
            `── MARKET SNAPSHOT ──`,
            `  Stock Price: ${financials.Price ?? 'N/A'}`,
            `  Market Cap: ${financials.Market_Cap ?? 'N/A'}`,
            `  Enterprise Value: ${financials.Enterprise_Value_EV ?? 'N/A'}`,
            `  Total Cash: ${financials.Total_Cash ?? 'N/A'}`,
            `  Total Debt: ${financials.Total_Debt ?? 'N/A'}`,
            `  Free Cash Flow TTM: ${financials.Free_Cash_Flow_TTM ?? 'N/A'}`, ``,
            `── CALCULATED METRICS (TTM) ──`,
            `  TTM Revenue: ${m.TTM_Revenue ?? 'N/A'}`,
            `  Gross Margin: ${m['TTM_Gross_Margin_%'] != null ? m['TTM_Gross_Margin_%'].toFixed(1) + '%' : 'N/A'}`,
            `  YoY Revenue Growth: ${m['YoY_Revenue_Growth_%'] != null ? m['YoY_Revenue_Growth_%'].toFixed(1) + '%' : 'N/A'}`,
            `  FCF Margin: ${m['FCF_Margin_%'] != null ? m['FCF_Margin_%'].toFixed(1) + '%' : 'N/A'}`,
            `  EV/Sales: ${m.EV_to_Sales != null ? m.EV_to_Sales.toFixed(2) + 'x' : 'N/A'}`,
            `  EV/EBIT: ${m.EV_to_EBIT != null ? m.EV_to_EBIT.toFixed(2) + 'x' : 'N/A'}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ].join('\n');
    }

    const dataBlock = `[DATA_BLOCK]\nAfter your full analysis above, you MUST append EXACTLY this JSON structure (NO markdown fences, NO extra text). Replace ALL angle-bracket placeholders with actual values.\n\n{\n  "classification": {\n    "archetype": "<Stable Incumbent|Quality Compounder|Cyclical|Product-Platform Hybrid|Option-Led / High-Beta|Regulatory>",\n    "valuation_engine": "<Engine 1|Engine 2|Engine 3|Engine 4|Engine 5>",\n    "sector": "<SECTOR_NAME>",\n    "moat_score": <0.0-10.0>,\n    "moat_direction": "<WIDENING|STABLE|NARROWING>",\n    "financial_strength": "<EXCELLENT|GOOD|ADEQUATE|WEAK|CONCERNING>",\n    "summary": "<2-3 sentence company snapshot>"\n  },\n  "macro": {\n    "dominant_regime": "<Goldilocks|Reflation|Stagflation|Recession>",\n    "regime_probability": <0.0-1.0>,\n    "rate_sensitivity": <-3 to +3 integer>,\n    "dollar_sensitivity": <-3 to +3 integer>,\n    "macro_impact_score": <-3.0 to +3.0 float>,\n    "summary": "<2-3 sentence macro impact on this stock>"\n  },\n  "valuation": {\n    "current_price": <number>,\n    "intrinsic_value": <number>,\n    "margin_of_safety_pct": <number>,\n    "valuation_status": "<UNDERVALUED|FAIR_TO_UNDERVALUED|FAIR|OVERVALUED>",\n    "core_value": <number>,\n    "execution_value": <number>,\n    "ecosystem_value": <number>,\n    "drag_value": <number>,\n    "ev_to_sales": <number>,\n    "ev_to_gross_profit": <number>,\n    "fcf_yield_pct": <number>,\n    "summary": "<2-3 sentence valuation thesis>"\n  },\n  "scenarios": {\n    "bear_price": <number>,\n    "bear_probability": <0.0-1.0>,\n    "base_price": <number>,\n    "base_probability": <0.0-1.0>,\n    "bull_execution_price": <number>,\n    "bull_execution_probability": <0.0-1.0>,\n    "bull_ecosystem_price": <number>,\n    "bull_ecosystem_probability": <0.0-1.0>,\n    "expected_price": <number>,\n    "summary": "<2-3 sentence scenario rationale>"\n  },\n  "growth": {\n    "revenue_growth_1y_pct": <number>,\n    "revenue_growth_3y_cagr_pct": <number>,\n    "eps_growth_1y_pct": <number>,\n    "margin_trajectory": "<Expanding|Stable|Contracting>",\n    "free_cash_flow_1y_pct": <number>,\n    "rule_of_40": <number>,\n    "summary": "<2-3 sentence growth outlook>"\n  },\n  "verdict": {\n    "conviction": <0.0-15.0>,\n    "action": "<BUY|ACCUMULATE|HOLD|SELL>",\n    "upside_pct": <number>,\n    "rating": "<Overpriced|Fair|Underpriced>",\n    "top_risk": "<single most impactful risk>",\n    "top_catalyst": "<single most impactful catalyst>",\n    "position_size_pct": <0.0-10.0>,\n    "model_confidence": "<High|Medium|Low>",\n    "summary": "<2-3 sentence investment thesis>"\n  }\n}`;

    return `You are a world-class financial analyst. Follow the Integrated Stock Analysis Engine v3.2 framework below to produce a complete analysis of ${ticker.toUpperCase()}.\n\n${engineContent}\n\n### Company Ticker: ${ticker.toUpperCase()}\n\n${reversePriming}${dataBrief}`;
}

export async function POST(req: Request) {
    try {
        const { tickers, password } = await req.json();

        // ── Auth — identical to existing single-stock route ──
        if (password !== "RSYS" && password !== process.env.APP_PASSWORD) {
            return NextResponse.json({ error: "Unauthorized: Invalid password" }, { status: 401 });
        }

        // ── Validate input ──
        if (!Array.isArray(tickers) || tickers.length === 0) {
            return NextResponse.json({ error: "tickers must be a non-empty array" }, { status: 400 });
        }
        if (tickers.length > MAX_BATCH_SIZE) {
            return NextResponse.json({
                error: `Batch size capped at ${MAX_BATCH_SIZE}. Received ${tickers.length} tickers.`
            }, { status: 400 });
        }

        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const ghToken = process.env.GH_PAT || process.env.GITHUB_TOKEN;
        const canDispatch = !!ghToken;

        // ── Load v3.2 engine + stocks.json for prompt building ──
        let engineContent = "";
        try { engineContent = readFileSync(join(process.cwd(), 'Reference', 'integrated_stock_analysis_engine_v3_2.md'), 'utf-8'); } catch (e) {}
        let reverseMap: Record<string, any> = {};
        try {
            const stocks = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'stocks.json'), 'utf-8'));
            for (const s of stocks) { if (s.reverse && s.symbol) reverseMap[s.symbol] = s.reverse; }
        } catch (e) {}

        const now = new Date().toISOString();
        const inserted: string[] = [];

        for (const ticker of tickers) {
            const sym = String(ticker).trim().toUpperCase();
            if (!sym) continue;

            // Load financial data + build full v3.2 prompt with reverse priming
            let financials: any = null;
            try { financials = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'financials', `${sym}.json`), 'utf-8')); } catch (e) {}
            const prompt = buildServerPrompt(sym, engineContent, reverseMap[sym] || null, financials);

            await supabase.from('ai_reports').delete().eq('ticker', sym);

            const { error: sbError } = await supabase
                .from('ai_reports')
                .insert({
                    ticker: sym,
                    content: "Analysis in progress... please wait.",
                    status: 'pending',
                    prompt,
                    batch_id: batchId,
                    created_at: now,
                });

            if (sbError) {
                console.error(`Failed to insert ${sym}:`, sbError);
                continue;
            }
            inserted.push(sym);
        }

        if (inserted.length === 0) {
            return NextResponse.json({ error: "No valid tickers could be inserted" }, { status: 500 });
        }

// ── Dispatch GitHub Actions with delay to prevent worker race condition ──
        let dispatched = 0;
        if (canDispatch) {
            for (const ticker of inserted) {
                try {
                    const ghRes = await fetch(`https://api.github.com/repos/riperdy-tech/stock-screener/dispatches`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${ghToken}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'StockScreener-App'
                        },
                        body: JSON.stringify({ event_type: 'trigger-ai-analysis' })
                    });
                    if (ghRes.ok) dispatched++;
                    // Delay 3s between dispatches so each worker picks a different pending job
                    if (dispatched < inserted.length) {
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                } catch (ghErr: any) {}
            }
        }

        return NextResponse.json({
            batch_id: batchId,
            queued: inserted.length,
            dispatched,
            ...(!canDispatch ? { note: "GitHub token not configured — rows inserted as pending; worker picks up on cron." } : {}),
        });

    } catch (e: any) {
        console.error("Batch Analysis Trigger Error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
