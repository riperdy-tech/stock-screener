import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings, getTokenUsage } from '@/lib/settingsManager';

export async function GET(req: NextRequest) {
    // Check Admin Password
    const password = req.headers.get('x-admin-password');
    if (password !== process.env.APP_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = getSettings();
    const usage = getTokenUsage();

    return NextResponse.json({
        apiKey: settings.GEMINI_API_KEY ? "*".repeat(15) + settings.GEMINI_API_KEY.slice(-4) : "",
        dailyLimit: settings.DAILY_TOKEN_LIMIT,
        tokensUsed: usage.tokensUsed
    });
}

export async function POST(req: NextRequest) {
    // Check Admin Password
    const password = req.headers.get('x-admin-password');
    if (password !== process.env.APP_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { apiKey, dailyLimit } = await req.json();
        
        const currentSettings = getSettings();
        if (apiKey && apiKey.length > 5 && !apiKey.includes('****')) {
            currentSettings.GEMINI_API_KEY = apiKey;
        }
        if (dailyLimit !== undefined) {
            currentSettings.DAILY_TOKEN_LIMIT = parseInt(dailyLimit, 10);
        }

        saveSettings(currentSettings);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
