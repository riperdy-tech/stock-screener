import re

file_path = r"c:\Users\riper\Downloads\Stock Screener\Stock Screener\components\StockDetailModal.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add ReactMarkdown and hooks imports
if "import ReactMarkdown from" not in content:
    content = content.replace('import { useLanguage } from "@/components/LanguageContext";', 'import { useLanguage } from "@/components/LanguageContext";\nimport ReactMarkdown from "react-markdown";\nimport { useEffect, useState } from "react";')

# Inject state and effect
state_injection = """    const { candidate, reasons, flags, score } = result;

    const [savedReport, setSavedReport] = useState<any>(null);

    useEffect(() => {
        fetch(`/data/reports/${candidate.symbol}.json`)
            .then(res => {
                if (res.ok) return res.json();
                throw new Error("Not found");
            })
            .then(data => setSavedReport(data))
            .catch(() => setSavedReport(null));
    }, [candidate.symbol]);
"""
content = content.replace("    const { candidate, reasons, flags, score } = result;", state_injection)

# Inject report section at the end of the content div
report_section = """                        {/* Phase 2: Kill List */}
                        <div>
                            <h3 className="text-xl font-bold mb-1 flex items-center gap-2 text-danger">
                                <AlertOctagon className="h-5 w-5" /> {t('phase2')}
                            </h3>
                            <p className="text-xs text-muted-foreground mb-4">Disqualifying red flags that override high quant scores. Any flag here means the stock fails the blueprint.</p>
                            <div className="bg-danger/5 border border-danger/20 rounded-xl p-4">
                                {flags.length === 0 ? (
                                    <div className="flex items-center gap-2 text-success">
                                        <span className="text-lg">✓</span> {t('noFatalFlaws')}
                                    </div>
                                ) : (
                                    <ul className="space-y-2">
                                        {flags.map((flag, i) => (
                                            <li key={i} className="flex items-center gap-2 text-danger font-medium">
                                                <X className="h-4 w-4" /> {flag}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {/* Always show Z-Score context */}
                                <div className="mt-4 pt-4 border-t border-danger/10 text-sm flex justify-between">
                                    <span>Altman Z-Score: <span className="font-mono font-bold">{market !== 'US' && candidate.zScore === 0 ? 'N/A' : candidate.zScore}</span></span>
                                    <span className="text-muted-foreground">({t('target')}: &gt; 1.8)</span>
                                </div>
                            </div>
                        </div>

                        {/* Deepseek AI Report */}
                        {savedReport && (
                            <div>
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-blue-400">
                                    <Sparkles className="h-5 w-5" /> AI Valuation Report (Deepseek V4.0 Pro)
                                </h3>
                                <div className="bg-[#1a1f2e] border border-blue-500/30 rounded-xl overflow-hidden flex flex-col shadow-inner">
                                    <div className="bg-blue-500/10 px-4 py-3 border-b border-blue-500/20 flex justify-between items-center shrink-0">
                                        <span className="text-xs text-muted-foreground">Generated on: {new Date(savedReport.timestamp).toLocaleString()}</span>
                                    </div>
                                    <div className="p-5 overflow-y-auto max-h-[600px] custom-scrollbar">
                                        <ReactMarkdown className="prose prose-invert prose-sm max-w-none text-foreground/90 leading-relaxed prose-headings:text-foreground prose-a:text-blue-400">
                                            {savedReport.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        )}"""

import re
# regex replace the Phase 2 block to append the report block
pattern = re.compile(r"\{\/\*\s*Phase 2: Kill List\s*\*\/\}.*?<\/div>\s*<\/div>", re.DOTALL)
content = pattern.sub(report_section, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated StockDetailModal.tsx")
