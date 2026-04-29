import re

file_path = r"c:\Users\riper\Downloads\Stock Screener\Stock Screener\components\ScreenerDashboard.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove buildSimplePrompt imports and usages
content = content.replace("import { buildPrompt, buildSimplePrompt } from \"@/lib/prompt-builder\";", "import { buildPrompt } from \"@/lib/prompt-builder\";")

content = content.replace("const [aiSimpleResult, setAiSimpleResult] = useState<string | null>(null);", "")
content = content.replace("const [copiedSimple, setCopiedSimple] = useState(false);", "")

copy_to_clipboard_old = """    const copyToClipboard = (text: string, isSimple: boolean) => {
        if (text) {
            navigator.clipboard.writeText(text);
            if (isSimple) {
                setCopiedSimple(true);
                setTimeout(() => setCopiedSimple(false), 2000);
            } else {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        }
    };"""

copy_to_clipboard_new = """    const copyToClipboard = (text: string) => {
        if (text) {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };
    
    // Deepseek states
    const [dsPassword, setDsPassword] = useState("");
    const [showDsPassword, setShowDsPassword] = useState(false);
    const [dsLoading, setDsLoading] = useState(false);
    const [dsResult, setDsResult] = useState<any>(null);
    const [dsError, setDsError] = useState("");
    
    const handleDeepseekRun = async () => {
        if (!dsPassword) { setDsError("Please enter password"); return; }
        setDsLoading(true); setDsError("");
        try {
            const res = await fetch("/api/deepseek", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    password: dsPassword,
                    ticker: selectedAiTicker,
                    prompt: aiResult
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to run Deepseek");
            setDsResult(data);
            setShowDsPassword(false);
            setDsPassword("");
        } catch (e: any) {
            setDsError(e.message);
        } finally {
            setDsLoading(false);
        }
    };
    
    const downloadDsResult = () => {
        if (!dsResult) return;
        const text = `Date: ${dsResult.timestamp}\\nCost: $${dsResult.cost}\\n\\n${dsResult.content}`;
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedAiTicker}_deepseek_report.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const copyDsResult = () => {
        if (!dsResult) return;
        navigator.clipboard.writeText(dsResult.content);
        alert("Copied!");
    };
"""
content = content.replace(copy_to_clipboard_old, copy_to_clipboard_new)

handle_ai_review_old = """    const handleAiReview = async (result: ScreeningResult) => {
        const ticker = result.candidate.symbol;
        setSelectedAiTicker(ticker);
        setAiModalOpen(true);
        setAiLoading(true);
        setAiResult(null);
        setAiSimpleResult(null);
        setCopied(false);
        setCopiedSimple(false);
        try {
            const prompt = await buildPrompt(ticker, result);
            const simplePrompt = await buildSimplePrompt(ticker, result);
            setAiResult(prompt);
            setAiSimpleResult(simplePrompt);
        } catch (e: any) {
            setAiResult("Error: " + e.message);
        } finally {
            setAiLoading(false);
        }
    };"""

handle_ai_review_new = """    const handleAiReview = async (result: ScreeningResult) => {
        const ticker = result.candidate.symbol;
        setSelectedAiTicker(ticker);
        setAiModalOpen(true);
        setAiLoading(true);
        setAiResult(null);
        setCopied(false);
        setDsResult(null);
        setDsError("");
        setShowDsPassword(false);
        
        try {
            const prompt = await buildPrompt(ticker, result);
            setAiResult(prompt);
        } catch (e: any) {
            setAiResult("Error: " + e.message);
        } finally {
            setAiLoading(false);
        }
    };"""
content = content.replace(handle_ai_review_old, handle_ai_review_new)

modal_old_start = """                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-[350px] sm:min-h-[450px]">"""
modal_old_end = """                                            <span className="text-sm font-bold tracking-wide">ChatGPT</span>
                                        </a>
                                    </div>"""

import re
pattern = re.compile(re.escape(modal_old_start) + r".*?" + re.escape(modal_old_end), re.DOTALL)

modal_new = """                                    <div className="grid grid-cols-1 gap-4 flex-1 min-h-[350px] sm:min-h-[450px]">
                                        {/* Prompt Box */}
                                        <div className="relative flex-1 bg-[#0d121c] border border-border rounded-xl overflow-hidden flex flex-col shadow-inner">
                                            <div className="bg-secondary/40 px-3 sm:px-5 py-2.5 border-b border-border flex justify-between items-center shrink-0">
                                                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider font-semibold">INTEGRATED INVESTMENT ANALYSIS ENGINE v2.0</span>
                                                <button
                                                    onClick={() => copyToClipboard(aiResult!)}
                                                    className="flex items-center gap-2 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md transition-colors shadow-sm"
                                                >
                                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                    {copied ? 'COPIED!' : 'COPY PROMPT'}
                                                </button>
                                            </div>
                                            <textarea
                                                readOnly
                                                value={aiResult || ""}
                                                className="flex-1 w-full h-full bg-transparent p-4 sm:p-5 text-sm font-mono resize-none focus:outline-none focus:ring-0 text-foreground/90 overflow-y-auto leading-relaxed"
                                            />
                                        </div>
                                        
                                        {/* Deepseek Result Box */}
                                        {dsResult && (
                                            <div className="relative flex-1 bg-[#1a1f2e] border border-blue-500/30 rounded-xl overflow-hidden flex flex-col shadow-inner">
                                                <div className="bg-blue-500/10 px-3 sm:px-5 py-2.5 border-b border-blue-500/20 flex justify-between items-center shrink-0 flex-wrap gap-2">
                                                    <span className="text-xs font-mono text-blue-400 uppercase tracking-wider font-semibold">Deepseek Output</span>
                                                    <div className="flex gap-2 items-center">
                                                        <span className="text-[10px] text-muted-foreground mr-2">
                                                            {new Date(dsResult.timestamp).toLocaleString()} | Cost: ${dsResult.cost} | Tokens: {dsResult.usage?.total_tokens}
                                                        </span>
                                                        <button onClick={downloadDsResult} className="flex items-center gap-1 text-xs bg-secondary hover:bg-secondary/80 px-2 py-1 rounded">Download .txt</button>
                                                        <button onClick={copyDsResult} className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-1 rounded">Copy Result</button>
                                                    </div>
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                                                    <ReactMarkdown className="prose prose-invert prose-sm max-w-none text-foreground/90 leading-relaxed prose-headings:text-foreground prose-a:text-blue-400">
                                                        {dsResult.content}
                                                    </ReactMarkdown>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 shrink-0 mt-2">
                                        <a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-2.5 bg-[#1A73E8] hover:bg-[#1557B0] text-white py-4 sm:py-6 rounded-xl font-semibold transition-transform hover:scale-[1.02] active:scale-95 shadow-md">
                                            <img src="https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64" alt="Gemini" className="w-8 h-8 rounded-md shrink-0 shadow-sm bg-white p-1" />
                                            <span className="text-sm font-bold tracking-wide">Gemini</span>
                                        </a>
                                        <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-2.5 bg-[#D97757] hover:bg-[#C26547] text-white py-4 sm:py-6 rounded-xl font-semibold transition-transform hover:scale-[1.02] active:scale-95 shadow-md">
                                            <img src="https://www.google.com/s2/favicons?domain=claude.ai&sz=64" alt="Claude" className="w-8 h-8 rounded-md shrink-0 shadow-sm bg-white p-1" />
                                            <span className="text-sm font-bold tracking-wide">Claude</span>
                                        </a>
                                        <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-2.5 bg-[#10A37F] hover:bg-[#0E906F] text-white py-4 sm:py-6 rounded-xl font-semibold transition-transform hover:scale-[1.02] active:scale-95 shadow-md">
                                            <img src="https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64" alt="ChatGPT" className="w-8 h-8 rounded-md shrink-0 shadow-sm bg-white p-1" />
                                            <span className="text-sm font-bold tracking-wide">ChatGPT</span>
                                        </a>
                                        {showDsPassword ? (
                                            <div className="flex flex-col items-center justify-center gap-2 bg-[#4d6bfe]/20 border border-[#4d6bfe]/40 py-2 sm:py-2 rounded-xl px-2">
                                                <input type="password" placeholder="Password" value={dsPassword} onChange={(e)=>setDsPassword(e.target.value)} className="w-full text-xs p-1.5 rounded bg-background border border-border" />
                                                <button onClick={handleDeepseekRun} disabled={dsLoading} className="w-full bg-[#4d6bfe] text-white text-xs py-1.5 rounded font-bold hover:bg-[#3b54d1]">
                                                    {dsLoading ? "Running..." : "Run Deepseek"}
                                                </button>
                                                {dsError && <span className="text-[10px] text-danger">{dsError}</span>}
                                            </div>
                                        ) : (
                                            <button onClick={() => setShowDsPassword(true)} className="flex flex-col items-center justify-center gap-2.5 bg-[#4d6bfe] hover:bg-[#3b54d1] text-white py-4 sm:py-6 rounded-xl font-semibold transition-transform hover:scale-[1.02] active:scale-95 shadow-md">
                                                <img src="https://www.google.com/s2/favicons?domain=deepseek.com&sz=64" alt="Deepseek" className="w-8 h-8 rounded-md shrink-0 shadow-sm bg-white p-1" />
                                                <span className="text-sm font-bold tracking-wide">Deepseek V4.0 Pro</span>
                                            </button>
                                        )}
                                    </div>"""

content = pattern.sub(modal_new, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated ScreenerDashboard.tsx")
