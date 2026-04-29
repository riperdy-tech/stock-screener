import re

dashboard_path = r"c:\Users\riper\Downloads\Stock Screener\Stock Screener\components\ScreenerDashboard.tsx"

with open(dashboard_path, "r", encoding="utf-8") as f:
    dashboard = f.read()

# Add state
state_injection = """    const [dsError, setDsError] = useState("");
    
    const [backgroundDsTask, setBackgroundDsTask] = useState<{ticker: string, status: 'running' | 'completed' | 'error', message?: string} | null>(null);"""
dashboard = dashboard.replace('    const [dsError, setDsError] = useState("");', state_injection)

# Add logic in handleDeepseekRun
run_old = """    const handleDeepseekRun = async () => {
        if (!dsPassword) { setDsError("Please enter password"); return; }
        setDsLoading(true); setDsError("");
        try {
            const res = await fetch("/api/deepseek", {"""

run_new = """    const handleDeepseekRun = async () => {
        if (!dsPassword) { setDsError("Please enter password"); return; }
        setDsLoading(true); setDsError("");
        setBackgroundDsTask({ ticker: selectedAiTicker, status: 'running' });
        try {
            const res = await fetch("/api/deepseek", {"""
dashboard = dashboard.replace(run_old, run_new)

run_end_old = """            setDsResult(data);
            setShowDsPassword(false);
            setDsPassword("");
        } catch (e: any) {
            setDsError(e.message);
        } finally {
            setDsLoading(false);
        }"""

run_end_new = """            setDsResult(data);
            setShowDsPassword(false);
            setDsPassword("");
            setBackgroundDsTask({ ticker: selectedAiTicker, status: 'completed' });
        } catch (e: any) {
            setDsError(e.message);
            setBackgroundDsTask({ ticker: selectedAiTicker, status: 'error', message: e.message });
        } finally {
            setDsLoading(false);
        }"""
dashboard = dashboard.replace(run_end_old, run_end_new)

# Inject toast in ScreenerDashboard render
toast_html = """            {/* Deepseek Task Alert */}
            {backgroundDsTask && (
                <div className="fixed bottom-6 right-6 z-[100] bg-[#1a1f2e] border border-blue-500/30 rounded-xl shadow-2xl p-4 min-w-[300px] flex flex-col gap-3 animate-in slide-in-from-bottom-5">
                    <div className="flex justify-between items-start gap-4">
                        <div className="flex items-start gap-3">
                            <Sparkles className={clsx("h-5 w-5 mt-0.5", backgroundDsTask.status === 'running' ? "text-blue-400 animate-pulse" : backgroundDsTask.status === 'error' ? "text-danger" : "text-success")} />
                            <div className="flex flex-col">
                                <span className="font-bold text-sm text-foreground">
                                    {backgroundDsTask.status === 'running' ? `Analyzing ${backgroundDsTask.ticker}...` : backgroundDsTask.status === 'error' ? `Error analyzing ${backgroundDsTask.ticker}` : `Analysis Complete: ${backgroundDsTask.ticker}`}
                                </span>
                                <span className="text-xs text-muted-foreground mt-1">
                                    {backgroundDsTask.status === 'running' ? 'Deepseek V4.0 Pro is generating report.' : backgroundDsTask.status === 'error' ? backgroundDsTask.message : 'Report saved to scorecard!'}
                                </span>
                            </div>
                        </div>
                        <button onClick={() => setBackgroundDsTask(null)} className="text-muted-foreground hover:text-foreground">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );"""

# Replace the last closing divs of ScreenerDashboard
dashboard = re.sub(r"        <\/div>\s*<\/div>\s*\)\;\s*\}\s*$", "        </div>\n" + toast_html + "\n}", dashboard, flags=re.MULTILINE)
# Wait, ScreenerDashboard ends with:
#             )}
# 
# 
#         </div>
#     );
# }
# So we can replace that specifically:
pattern = re.compile(r"\{\/\* AI Modal Overlay \*\/\}.*?<\/div>\s*\)\;\s*\}", re.DOTALL)
# Actually, easier to just do a strict replace on the end of the file.
end_str = """            )}


        </div>
    );
}"""

if end_str in dashboard:
    dashboard = dashboard.replace(end_str, """            )}

""" + toast_html)
else:
    # Just append before the last </div>
    dashboard = dashboard[:dashboard.rfind("</div>")] + toast_html + "\n"

with open(dashboard_path, "w", encoding="utf-8") as f:
    f.write(dashboard)


# Update StockDetailModal.tsx polling
modal_path = r"c:\Users\riper\Downloads\Stock Screener\Stock Screener\components\StockDetailModal.tsx"
with open(modal_path, "r", encoding="utf-8") as f:
    modal = f.read()

poll_old = """    useEffect(() => {
        fetch(`/data/reports/${candidate.symbol}.json`)
            .then(res => {
                if (res.ok) return res.json();
                throw new Error("Not found");
            })
            .then(data => setSavedReport(data))
            .catch(() => setSavedReport(null));
    }, [candidate.symbol]);"""

poll_new = """    useEffect(() => {
        let isMounted = true;
        const checkReport = () => {
            fetch(`/data/reports/${candidate.symbol}.json?t=${new Date().getTime()}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error("Not found");
                })
                .then(data => {
                    if (isMounted) {
                        setSavedReport((prev: any) => {
                            if (!prev || prev.timestamp !== data.timestamp) {
                                return data;
                            }
                            return prev;
                        });
                    }
                })
                .catch(() => {
                    // Ignore 404s while polling
                });
        };
        
        checkReport();
        const interval = setInterval(checkReport, 5000); // Check every 5 seconds
        
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [candidate.symbol]);"""

modal = modal.replace(poll_old, poll_new)

with open(modal_path, "w", encoding="utf-8") as f:
    f.write(modal)

print("Updated toast and polling!")
