import { type StockCandidate } from "./blueprint";

export function formatKoreanWon(n: number, decimals: number = 2) {
    if (Math.abs(n) >= 1e12) return `${(n / 1e12).toLocaleString(undefined, {maximumFractionDigits: decimals})}조원`;
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toLocaleString(undefined, {maximumFractionDigits: decimals})}억원`;
    if (Math.abs(n) >= 1e4) return `${(n / 1e4).toLocaleString(undefined, {maximumFractionDigits: decimals})}만원`;
    return `${n.toLocaleString(undefined, {maximumFractionDigits: decimals})}원`;
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

export type Market = 'US' | 'India' | 'Korea';

export async function fetchStocks(market: Market = 'US'): Promise<{ data: StockCandidate[], lastUpdated: string | null }> {
    try {
        const isProd = process.env.NODE_ENV === 'production';
        const basePath = isProd ? '/stock-screener' : '';
        const filename = market === 'US' ? 'stocks.csv' : 'stocks_intl.csv';
        
        const response = await fetch(`${basePath}/data/${filename}?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${market} stock data`);
        }
        const text = await response.text();
        let rawData = parseCSV(text);

        // ROBUST MARKET FILTERING:
        // Ensure each tab ONLY shows its own data regardless of the source file.
        if (market === 'India') {
            rawData = rawData.filter(r => (r['Symbol'] || '').endsWith('.NS'));
        } else if (market === 'Korea') {
            rawData = rawData.filter(r => {
                const s = r['Symbol'] || '';
                return s.endsWith('.KS') || s.endsWith('.KQ');
            });
        } else if (market === 'US') {
            // US tab should filter OUT international suffixes to be safe
            rawData = rawData.filter(r => {
                const s = r['Symbol'] || '';
                return !s.endsWith('.NS') && !s.endsWith('.KS') && !s.endsWith('.KQ');
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

            const base = {
                symbol: row['Symbol'] || '',
                name: (row['Name'] || '').replace(/"/g, ''),
                description: (row['Description'] || '').replace(/"/g, ''),
                sector: row['Sector'] || 'Unknown',
                industry: row['Industry'] || 'Unknown',
                price: parseFloat(row['Price']) || 0,
                marketCap: parseFloat(row['Market Cap']) || 0,

                // Metrics (Convert decimals to % points)
                revenueGrowth: (parseFloat(row['Rev Growth']) || 0) * multiplier,
                grossMargin: (parseFloat(row['Gross Margin']) || 0) * multiplier,
                roic: (parseFloat(row['ROIC']) || 0) * multiplier,
                insiderOwnership: (parseFloat(row['Insider Own']) || 0) * multiplier,
                
                pegRatio: parseFloat(row['PEG']) || 0,
                zScore: parseFloat(row['Z-Score']) || 0,
                peRatio: 0,
                priceToSales: parseFloat(row['P/S']) || 0,
                floatShares: parseFloat(row['Float']) || 0,
                ocf: parseFloat(row['OCF']) || 0,
                capex: parseFloat(row['CAPEX']) || 0,

                // Adapter Metadata
                _status: row['Status'],
                _score: parseFloat(row['Score']) || 0,
                _failCodes: (row['Fail Codes'] || '').split(',').filter((c: string) => c),
                _financialData: (() => {
                    const fd = row['Financial_Data'];
                    if (!fd) return null;
                    try { return JSON.parse(decodeURIComponent(escape(atob(fd)))); } catch(e) { return null; }
                })(),
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
