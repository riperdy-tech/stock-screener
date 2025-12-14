import { type StockCandidate } from "./blueprint";

// Basic CSV Parser (assuming simple structure without complex quotes for now)
function parseCSV(text: string): any[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());

    return lines.slice(1).map(line => {
        const values = line.split(','); // WARNING: This breaks if commas in Name. But for MVP manual mode it's okay. 
        // Ideally we'd use a regex or library, but trying to keep it light.
        // Actually, Python pandas CSV export handles quotes. We should handle quotes basic.

        // Simple regex for CSV splitting ignoring commas inside quotes
        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        // Fallback to simple split if regex fails or is too complex for this context
        // Let's stick to simple split for now, assuming stock names don't have commas usually?
        // Actually, "Company, Inc." is common. 
        // Let's try a better split:

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
    });
}

export async function fetchStocks(): Promise<StockCandidate[]> {
    try {
        // Fetch CSV instead of JSON
        const response = await fetch(`/data/stocks.csv?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error("Failed to fetch stock data");
        }
        const text = await response.text();
        const rawData = parseCSV(text);

        return rawData.map(row => ({
            symbol: row['Symbol'] || '',
            name: (row['Name'] || '').replace(/"/g, ''), // Cleanup quotes
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
            _reasons: [] // We don't export reasons to CSV to save space, maybe add later?
        })) as any[]; // Cast to any to pass "extra" fields to the dashboard adapter
    } catch (error) {
        console.error("Error loading stocks:", error);
        return [];
    }
}
