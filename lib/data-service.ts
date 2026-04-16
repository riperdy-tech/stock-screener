import { type StockCandidate } from "./blueprint";

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
            priceToSales: parseFloat(row['P/S']) || 0,
            floatShares: parseFloat(row['Float']) || 0,

            // Add extra fields needed for ScreeningResult mapping in Dashboard
            _status: row['Status'],
            _score: parseFloat(row['Score']) || 0,
            _failCodes: (row['Fail Codes'] || '').split(',').filter((c: string) => c),
            _financialData: (() => {
                const fd = row['Financial_Data'];
                if (!fd) return null;
                try { return JSON.parse(decodeURIComponent(escape(atob(fd)))); } catch(e) { return null; }
            })(),
            _reasons: [] // We don't export reasons to CSV to save space, maybe add later?
        })) as any[]; // Cast to any to pass "extra" fields to the dashboard adapter
        
        return { data: mappedData, lastUpdated };
    } catch (error) {
        console.error("Error loading stocks:", error);
        return { data: [], lastUpdated: null };
    }
}
