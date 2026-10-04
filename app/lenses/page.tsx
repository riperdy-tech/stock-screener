import { ScreenerDashboard } from "@/components/ScreenerDashboard";

// Legacy lens views (100-bagger / Reverse / YouTube), unchanged.
// The Stockpeak desk at / is the primary decision surface.
export default function Lenses() {
    return (
        <>
            <div className="border-b border-rule-14 bg-surface px-4 py-1.5 text-[12px] text-warn">
                Legacy lenses — older screens kept for reference. They are not the current system; the main desk is.
            </div>
            <ScreenerDashboard />
        </>
    );
}
