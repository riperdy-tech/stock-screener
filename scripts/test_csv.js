const fs = require('fs');

const text = fs.readFileSync('public/data/stocks.csv', 'utf8');
const lines = text.trim().split('\n');
const headers = lines[0].split(',').map(h => h.trim());

function parseCSV() {
    return lines.slice(1).map(line => {
        let row = {};
        let currentVal = ''; let inQuotes = false; let colIndex = 0;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
                const key = headers[colIndex];
                if (key) row[key] = currentVal.trim();
                currentVal = ''; colIndex++;
            } else currentVal += char;
        }
        if (colIndex < headers.length) row[headers[colIndex]] = currentVal.trim();
        return row;
    });
}

const rawData = parseCSV();

const adaptedData = rawData.map(row => ({
    marketCap: parseFloat(row['Market Cap']) || 0,
    price: parseFloat(row['Price']) || 0,
    revenueGrowth: parseFloat(row['Rev Growth']) || 0,
    grossMargin: parseFloat(row['Gross Margin']) || 0,
    roic: parseFloat(row['ROIC']) || 0,
    insiderOwnership: parseFloat(row['Insider Own']) || 0,
    pegRatio: parseFloat(row['PEG']) || 0,
    priceToSales: 0,
}));

const finalData = adaptedData.map(cand => {
    cand.revenueGrowth = (cand.revenueGrowth || 0) * 100;
    cand.grossMargin = (cand.grossMargin || 0) * 100;
    cand.roic = (cand.roic || 0) * 100;
    cand.insiderOwnership = (cand.insiderOwnership || 0) * 100;
    return cand;
});

const filters = {
    minMarketCap: 0, maxMarketCap: 10000, maxPrice: 1000,
    minRevenueGrowth: -50, minGrossMargin: -50, minROIC: -50,
    maxPS: 50, maxPEG: 10, minInsiderOwnership: 0, maxFloat: 5000,
};

let count = 0;
for (const c of finalData) {
    const mcapM = c.marketCap / 1000000;
    if (filters.minMarketCap > 0 && mcapM < filters.minMarketCap) continue;
    if (filters.maxPrice > 0 && filters.maxPrice < 1000 && c.price > filters.maxPrice) continue;
    if (c.revenueGrowth < filters.minRevenueGrowth) continue;
    if (c.grossMargin < filters.minGrossMargin) continue;
    if (c.roic < filters.minROIC) continue;
    if (c.insiderOwnership < filters.minInsiderOwnership) continue;
    if (filters.maxPEG < 10 && c.pegRatio > filters.maxPEG) continue;
    if (filters.maxPS < 50 && c.priceToSales > filters.maxPS) continue;
    count++;
}
console.log('Passed ZERO_BASE filters count:', count);
