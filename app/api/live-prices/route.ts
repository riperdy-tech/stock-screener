import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const { tickers } = await request.json() as { tickers: string[] };

        if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
            return NextResponse.json({ prices: {} });
        }

        // Sanitize: only allow valid ticker chars [A-Z0-9.-]
        const safe = tickers
            .map(t => t.toUpperCase().replace(/[^A-Z0-9.\-]/g, ''))
            .filter(t => t.length > 0 && t.length <= 12);

        if (safe.length === 0) return NextResponse.json({ prices: {} });

        const scriptPath = path.join(process.cwd(), 'scripts', 'get_prices.py');

        const prices = await new Promise<Record<string, number>>((resolve) => {
            const proc = spawn('python', [scriptPath, ...safe], {
                timeout: 20_000, // 20s max
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
            proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

            proc.on('close', () => {
                try {
                    const result = JSON.parse(stdout.trim() || '{}');
                    resolve(result);
                } catch {
                    if (stderr) console.error('[live-prices] Python stderr:', stderr);
                    resolve({});
                }
            });

            proc.on('error', (err) => {
                console.error('[live-prices] spawn error:', err.message);
                resolve({});
            });
        });

        return NextResponse.json({ prices });

    } catch (err: any) {
        console.error('[live-prices] error:', err.message);
        return NextResponse.json({ prices: {} });
    }
}
