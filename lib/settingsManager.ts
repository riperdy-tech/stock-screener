import fs from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'app_settings.json');
const USAGE_PATH = path.join(process.cwd(), 'data', 'token_usage.json');

export interface AppSettings {
    GEMINI_API_KEY: string;
    DAILY_TOKEN_LIMIT: number;
}

export interface TokenUsage {
    date: string;
    tokensUsed: number;
}

export function getSettings(): AppSettings {
    try {
        const data = fs.readFileSync(SETTINGS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        // Fallback default
        return {
            GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
            DAILY_TOKEN_LIMIT: 30000
        };
    }
}

export function saveSettings(settings: AppSettings) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export function getTokenUsage(): TokenUsage {
    const today = new Date().toISOString().split('T')[0];
    try {
        const data = fs.readFileSync(USAGE_PATH, 'utf-8');
        const usage: TokenUsage = JSON.parse(data);
        if (usage.date !== today) {
            // Reset for new day
            return { date: today, tokensUsed: 0 };
        }
        return usage;
    } catch (e) {
        return { date: today, tokensUsed: 0 };
    }
}

export function logTokenUsage(tokens: number) {
    const usage = getTokenUsage();
    usage.tokensUsed += tokens;
    fs.writeFileSync(USAGE_PATH, JSON.stringify(usage, null, 2));
}

export function isQuotaExceeded(): boolean {
    const usage = getTokenUsage();
    const settings = getSettings();
    return usage.tokensUsed >= settings.DAILY_TOKEN_LIMIT;
}
