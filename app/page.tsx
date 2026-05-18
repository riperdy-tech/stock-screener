import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { ScreenerDashboard } from "@/components/ScreenerDashboard";

export default function Home() {
    return (
        <>
            <Link
                href="/youtube-strategy"
                className="fixed bottom-5 left-5 z-[60] hidden md:flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-black text-primary shadow-lg backdrop-blur-xl transition-all hover:bg-primary hover:text-primary-foreground active:scale-95"
                title="Open the YouTube EPS strategy filter"
            >
                <BarChart3 className="h-4 w-4" />
                YouTube Strategy
            </Link>
            <ScreenerDashboard />
        </>
    );
}
