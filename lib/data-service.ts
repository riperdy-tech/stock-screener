import { type StockCandidate } from "./blueprint";

export function formatKoreanWon(n: number, decimals: number = 2) {
    if (Math.abs(n) >= 1e12) return `${(n / 1e12).toLocaleString('en-US', {maximumFractionDigits: decimals})}조원`;
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toLocaleString('en-US', {maximumFractionDigits: decimals})}억원`;
    if (Math.abs(n) >= 1e4) return `${(n / 1e4).toLocaleString('en-US', {maximumFractionDigits: decimals})}만원`;
    return `${n.toLocaleString('en-US', {maximumFractionDigits: decimals})}원`;
}

export function formatTaiwanNTD(n: number, decimals: number = 2) {
    if (Math.abs(n) >= 1e12) return `${(n / 1e12).toLocaleString('en-US', {maximumFractionDigits: decimals})}兆元`;
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toLocaleString('en-US', {maximumFractionDigits: decimals})}億元`;
    if (Math.abs(n) >= 1e4) return `${(n / 1e4).toLocaleString('en-US', {maximumFractionDigits: decimals})}萬元`;
    return `${n.toLocaleString('en-US', {maximumFractionDigits: decimals})}元`;
}

function parseFlexibleNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const cleaned = String(value).replace(/[%,$,x]/g, '').trim();
    if (!cleaned || cleaned.toLowerCase() === 'n/a' || cleaned.toLowerCase() === 'nan') return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberList(value: any): number[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(parseFlexibleNumber).filter((n): n is number => n !== null);

    const raw = String(value).trim();
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed
                .map((item) => typeof item === 'object'
                    ? parseFlexibleNumber(item.Close ?? item.close ?? item.Price ?? item.price ?? item.value)
                    : parseFlexibleNumber(item))
                .filter((n): n is number => n !== null);
        }
    } catch (e) {
        // Fall through to delimiter parsing.
    }

    return raw
        .split(/[|;\s]+/)
        .map(parseFlexibleNumber)
        .filter((n): n is number => n !== null);
}

function firstNumber(...values: any[]): number | null {
    for (const value of values) {
        const parsed = parseFlexibleNumber(value);
        if (parsed !== null) return parsed;
    }
    return null;
}

function parseCSV(text: string): any[] {
    const rows: any[] = [];
    let row: string[] = [];
    let currentVal = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentVal += '"';
                i++; // Skip the escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(currentVal.trim());
            currentVal = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
            if (currentVal || row.length > 0) {
                row.push(currentVal.trim());
                rows.push(row);
            }
            row = [];
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    if (currentVal || row.length > 0) {
        row.push(currentVal.trim());
        rows.push(row);
    }
    
    if (rows.length < 2) return [];
    const headers = rows[0];
    
    return rows.slice(1).map(r => {
        const obj: Record<string, any> = {};
        for (let i = 0; i < headers.length; i++) {
            if (headers[i]) {
                obj[headers[i]] = r[i] || '';
            }
        }
        return obj;
    });
}

export type Market = 'US' | 'Korea' | 'Taiwan';

export async function fetchStocks(market: Market = 'US'): Promise<{ data: StockCandidate[], lastUpdated: string | null }> {
    try {
        const basePath = '';
        const filename = market === 'US' ? 'stocks.csv' : 'stocks_intl.csv';
        
        const response = await fetch(`${basePath}/data/${filename}?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${market} stock data`);
        }
        const text = await response.text();
        let rawData = parseCSV(text);

        // ROBUST MARKET FILTERING:
        // Ensure each tab ONLY shows its own data regardless of the source file.
        if (market === 'Korea') {
            rawData = rawData.filter(r => {
                const s = r['Symbol'] || '';
                return s.endsWith('.KS') || s.endsWith('.KQ');
            });
        } else if (market === 'Taiwan') {
            rawData = rawData.filter(r => {
                const s = r['Symbol'] || '';
                return s.endsWith('.TW') || s.endsWith('.TWO');
            });
        } else if (market === 'US') {
            // US tab should filter OUT international suffixes to be safe
            rawData = rawData.filter(r => {
                const s = r['Symbol'] || '';
                return !s.endsWith('.KS') && !s.endsWith('.KQ') && !s.endsWith('.TW') && !s.endsWith('.TWO');
            });
        }
        
        const lastMod = response.headers.get('Last-Modified');
        let lastUpdated = null;
        if (lastMod) {
            const d = new Date(lastMod);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            lastUpdated = `${yyyy}-${mm}-${dd}`;
        }

        const mappedData = rawData.map(row => {
            // Percent values in CSV are decimals (e.g. 0.25 for 25%).
            // Use 100 as multiplier for dashboard cards which expect integers.
            const multiplier = 100;

            const financialData = (() => {
                const fd = row['Financial_Data'];
                if (!fd) return null;
                try { return JSON.parse(decodeURIComponent(escape(atob(fd)))); } catch(e) { return null; }
            })();

            const base = {
                symbol: row['Symbol'] || '',
                name: (row['Name'] || '').replace(/"/g, ''),
                description: (row['Description'] || '').replace(/"/g, ''),
                sector: row['Sector'] || 'Unknown',
                industry: row['Industry'] || 'Unknown',
                price: parseFlexibleNumber(row['Price']) || 0,
                marketCap: parseFlexibleNumber(row['Market Cap']) || 0,
                lastUpdated: row['Last_Updated'] || undefined,

                // Metrics (Convert decimals to % points)
                revenueGrowth: (parseFlexibleNumber(row['Rev Growth']) || 0) * multiplier,
                grossMargin: (parseFlexibleNumber(row['Gross Margin']) || 0) * multiplier,
                roic: (parseFlexibleNumber(row['ROIC']) || 0) * multiplier,
                insiderOwnership: (parseFlexibleNumber(row['Insider Own']) || 0) * multiplier,
                
                pegRatio: parseFlexibleNumber(row['PEG']) || 0,
                zScore: parseFlexibleNumber(row['Z-Score']) || 0,
                peRatio: firstNumber(row['P/E'], row['PE'], row['Trailing P/E'], row['Current P/E']) || 0,
                priceToSales: parseFlexibleNumber(row['P/S']) || 0,
                floatShares: parseFlexibleNumber(row['Float']) || 0,
                ocf: parseFlexibleNumber(row['OCF']) || 0,
                capex: parseFlexibleNumber(row['CAPEX']) || 0,

                // Optional fields used by the YouTube multi-strategy filter.
                epsTtm: firstNumber(row['EPS TTM'], row['EPS_TTM'], row['Trailing EPS'], row['EPS']),
                previousEpsTtm: firstNumber(row['Previous EPS TTM'], row['Previous_EPS_TTM'], row['Prior EPS TTM']),
                forwardEpsEstimate: firstNumber(row['Forward EPS'], row['Forward_EPS'], row['Forward EPS Estimate'], row['Next Year EPS']),
                priceToBook: firstNumber(row['P/B'], row['PB'], row['Price/Book'], row['Price to Book']),
                fiveYearAveragePe: firstNumber(row['5Y Avg P/E'], row['5Y Average P/E'], row['PE 5Y Avg'], row['P/E 5Y Avg']),
                monthlyMa20: firstNumber(row['20M MA'], row['20 Month MA'], row['20-Month MA'], row['Monthly MA 20']),
                monthlyCloses: parseNumberList(row['Monthly Closes'] || row['Monthly_Closes'] || row['Monthly Prices'] || row['Monthly_Prices']),
                quarterlyEps: parseNumberList(row['Quarterly EPS'] || row['Quarterly_EPS']),

                // Adapter Metadata
                _status: row['Status'],
                _score: parseFlexibleNumber(row['Score']) || 0,
                _failCodes: (row['Fail Codes'] || '').split(',').filter((c: string) => c),
                _financialData: financialData,
                _reasons: []
            };
            return base;
        }) as any[];
        
        return { data: mappedData, lastUpdated };
    } catch (error) {
        console.error("Error loading stocks:", error);
        return { data: [], lastUpdated: null };
    }
}
