import re

file_path = r"c:\Users\riper\Downloads\Stock Screener\Stock Screener\components\StockDetailModal.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add functions
functions = """    const downloadDsResult = () => {
        if (!savedReport) return;
        const text = `Date: ${savedReport.timestamp}\\nCost: $${savedReport.cost}\\n\\n${savedReport.content}`;
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${candidate.symbol}_deepseek_report.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const copyDsResult = () => {
        if (!savedReport) return;
        navigator.clipboard.writeText(savedReport.content);
        alert("Copied!");
    };

    return ("""

content = content.replace("    return (", functions)

# Add buttons to UI
ui_old = """                                    <div className="bg-blue-500/10 px-4 py-3 border-b border-blue-500/20 flex justify-between items-center shrink-0">
                                        <span className="text-xs text-muted-foreground">Generated on: {new Date(savedReport.timestamp).toLocaleString()}</span>
                                    </div>"""

ui_new = """                                    <div className="bg-blue-500/10 px-4 py-3 border-b border-blue-500/20 flex justify-between items-center shrink-0 flex-wrap gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            Generated on: {new Date(savedReport.timestamp).toLocaleString()} | Cost: ${savedReport.cost} | Tokens: {savedReport.usage?.total_tokens}
                                        </span>
                                        <div className="flex gap-2 items-center">
                                            <button onClick={downloadDsResult} className="flex items-center gap-1 text-xs bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-md shadow-sm border border-border transition-colors font-semibold">Download .txt</button>
                                            <button onClick={copyDsResult} className="flex items-center gap-1 text-xs bg-[#4d6bfe] hover:bg-[#3b54d1] text-white px-3 py-1.5 rounded-md shadow-sm transition-colors font-semibold">Copy Result</button>
                                        </div>
                                    </div>"""

content = content.replace(ui_old, ui_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Added buttons to StockDetailModal")
