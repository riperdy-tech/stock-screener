import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
    try {
        const { password, ticker, prompt } = await req.json();

        if (password !== "RSYS" && password !== process.env.APP_PASSWORD) {
            return NextResponse.json({ error: "Unauthorized: Invalid password" }, { status: 401 });
        }

        // 1. Create a "Pending" request in Supabase
        // This is the "structural" hand-off to the background worker.
        const { error: sbError } = await supabase
            .from('ai_reports')
            .upsert({
                ticker,
                content: "Analysis in progress... please wait.",
                status: 'pending',
                prompt: prompt,
                created_at: new Date().toISOString()
            });

        if (sbError) throw sbError;

        // 2. Trigger the GitHub Action Worker
        // Note: This requires a GITHUB_PAT in your environment variables
        const ghToken = process.env.GH_PAT || process.env.GITHUB_TOKEN;
        
        if (!ghToken) {
            return NextResponse.json({ 
                status: 'error', 
                error: "System Configuration Error: GitHub Token (GH_PAT) not found in Vercel environment. Please check your Vercel settings." 
            }, { status: 500 });
        }

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
            
            if (!ghRes.ok) {
                const errText = await ghRes.text();
                console.error("GitHub Dispatch Failed:", ghRes.status, errText);
                return NextResponse.json({ 
                    status: 'error', 
                    error: `GitHub rejected the request (${ghRes.status}): ${errText}. Check if your token has 'workflow' scope.` 
                }, { status: 500 });
            }
            
            console.log("GitHub Worker triggered successfully.");
        } catch (ghErr: any) {
            console.warn("Could not trigger GitHub Action automatically:", ghErr);
            return NextResponse.json({ 
                status: 'error', 
                error: `Network error triggering GitHub: ${ghErr.message}` 
            }, { status: 500 });
        }

        return NextResponse.json({ 
            status: 'queued', 
            message: `AI analysis for ${ticker} has been started in the cloud.` 
        });

    } catch (e: any) {
        console.error("Analysis Trigger Error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
