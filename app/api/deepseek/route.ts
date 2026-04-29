import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
    try {
        const { password, ticker, prompt } = await req.json();

        if (password !== "RSYS" && password !== process.env.APP_PASSWORD) {
            return NextResponse.json({ error: "Unauthorized: Invalid password" }, { status: 401 });
        }

        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Deepseek API key not configured" }, { status: 500 });
        }

        const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-v4-pro",
                messages: [
                    { role: "user", content: prompt }
                ],
                reasoning_effort: "max",
                thinking: { type: "enabled" }
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            return NextResponse.json({ error: `Deepseek API error: ${response.status}`, details: errBody }, { status: response.status });
        }

        const data = await response.json();
        
        const content = data.choices?.[0]?.message?.content || "";
        const reasoning = data.choices?.[0]?.message?.reasoning_content || "";
        const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        
        // Deepseek pricing (approx): input $0.14/1M, output $0.28/1M, or similar for reasoner
        // $0.55 / 1M input, $2.19 / 1M output for reasoner
        const inputCost = (usage.prompt_tokens / 1_000_000) * 0.55;
        const outputCost = (usage.completion_tokens / 1_000_000) * 2.19;
        const totalCost = inputCost + outputCost;

        const resultData = {
            ticker,
            timestamp: new Date().toISOString(),
            reasoning,
            content,
            usage,
            cost: totalCost.toFixed(4)
        };

        // Save to public/data/reports/[ticker].json
        const reportsDir = path.join(process.cwd(), 'public', 'data', 'reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        const filePath = path.join(reportsDir, `${ticker}.json`);
        fs.writeFileSync(filePath, JSON.stringify(resultData, null, 2), 'utf-8');

        return NextResponse.json(resultData);

    } catch (e: any) {
        console.error("Deepseek API Error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
