import os

file_path = r"c:\Users\riper\Downloads\Stock Screener\Stock Screener\lib\prompt-builder.ts"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    if "export async function buildPrompt(" in line:
        break

new_code = """    // Determine market context from ticker suffix
    let market: Market = 'US';
    if (ticker.endsWith('.NS') || ticker.endsWith('.BO')) market = 'India';
    if (ticker.endsWith('.KS') || ticker.endsWith('.KQ')) market = 'Korea';

    // Rely on rich financial detail embedded inside the CSV data pipeline
    const financialDetail = result.financialData;

    // Use rich data if available, otherwise fall back to screener summary
    const dataBrief = financialDetail
        ? formatFinancialData(financialDetail as FinancialDetail, market)
        : formatScreenerData(result, market);

    let rs2Content = "";
    try {
        if (typeof window !== "undefined") {
            const response = await fetch('/RS2.txt');
            rs2Content = await response.text();
        } else {
            // Server side or edge
            const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
            const response = await fetch(`${baseUrl}/RS2.txt`);
            rs2Content = await response.text();
        }
    } catch (e) {
        console.error("Failed to load RS2.txt", e);
        rs2Content = "Failed to load RS2.txt prompt template.";
    }

    return `${rs2Content}\\n\\n### Company Ticker: ${ticker.toUpperCase()}\\n\\n${dataBrief}`;
}
"""

with open(file_path, "w", encoding="utf-8") as f:
    for line in new_lines:
        f.write(line)
    f.write(new_code)

print("Updated prompt-builder.ts")
