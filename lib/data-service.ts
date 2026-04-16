import { type StockCandidate } from "./blueprint";

// Basic CSV Parser (assuming simple structure without complex quotes for now)
function parseCSV(text: string): any[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());

    return lines.slice(1).map(line => {
        // Trim Windows line endings
        line = line.replace(/\r$/, '');
        if (!line.trim()) return null;

        let row: Record<string, any> = {};
        let currentVal = '';
        let inQuotes = false;
        let colIndex = 0;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                const key = headers[colIndex];
                if (key) row[key] = currentVal.trim();
                currentVal = '';
                colIndex++;
            } else {
                currentVal += char;
            }
        }
        // Last value
        if (colIndex < headers.length) {
            row[headers[colIndex]] = currentVal.trim();
        }

        return row;
    }).filter(Boolean);
}

export async function fetchStocks(): Promise<{ data: StockCandidate[], lastUpdated: string | null }> {
    try {
        // Fetch CSV instead of JSON
        // Fix for GitHub Pages: URL needs to include the repo name in production
        const isProd = process.env.NODE_ENV === 'production';
        const basePath = isProd ? '/stock-screener' : '';
        const response = await fetch(`${basePath}/data/stocks.csv?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error("Failed to fetch stock data");
        }
        const text = await response.text();
        const rawData = parseCSV(text);
        
        const lastMod = response.headers.get('Last-Modified');
        let lastUpdated = null;
        if (lastMod) {
            const d = new Date(lastMod);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            lastUpdated = `${yyyy}-${mm}-${dd}`;
        }

        const mappedData = rawData.map(row => ({
            symbol: row['Symbol'] || '',
            name: (row['Name'] || '').replace(/"/g, ''), // Cleanup quotes
            description: (row['Description'] || '').replace(/"/g, ''),
            sector: row['Sector'] || 'Unknown',
            industry: row['Industry'] || 'Unknown',
            price: parseFloat(row['Price']) || 0,
            marketCap: parseFloat(row['Market Cap']) || 0,

            // Metrics (Handle missing/NaN)
            revenueGrowth: parseFloat(row['Rev Growth']) || 0,
            grossMargin: parseFloat(row['Gross Margin']) || 0,
            roic: parseFloat(row['ROIC']) || 0,
            insiderOwnership: parseFloat(row['Insider Own']) || 0,
            pegRatio: parseFloat(row['PEG']) || 0,
            zScore: parseFloat(row['Z-Score']) || 0,

            // These might be missing in CSV, set defaults
            peRatio: 0,
            priceToSales: 0,
            floatShares: 0,

            // Add extra fields needed for ScreeningResult mapping in Dashboard
            _status: row['Status'],
            _score: parseFloat(row['Score']) || 0,
            _failCodes: (row['Fail Codes'] || '').split(',').filter((c: string) => c),
            _financialData: row['Financial_Data'] ? JSON.parse(atob(row['Financial_Data'])) : null,
            _reasons: [] // We don't export reasons to CSV to save space, maybe add later?
        })) as any[]; // Cast to any to pass "extra" fields to the dashboard adapter
        
        return { data: mappedData, lastUpdated };
    } catch (error) {
        console.error("Error loading stocks:", error);
        return { data: [], lastUpdated: null };
    }
}
