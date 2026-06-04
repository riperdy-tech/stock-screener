import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { clsx } from "clsx";

export function LanguageToggle() {
    const { language, setLanguage } = useLanguage();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const languages = [
        { code: "en", name: "English", locale: "US market labels", flag: "https://flagcdn.com/w20/us.png" },
        { code: "ko", name: "Korean", locale: "Korea market labels", flag: "https://flagcdn.com/w20/kr.png" },
        { code: "zh", name: "Chinese", locale: "Taiwan market labels", flag: "https://flagcdn.com/w20/tw.png" },
    ];

    const current = languages.find(l => l.code === language) || languages[0];

    return (
        <div ref={ref} className="relative z-50 inline-block text-left">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-secondary/50 px-3 py-2 text-xs font-black transition-colors hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-primary/40"
                title="Select Language"
                aria-label={`Current language: ${current.name}`}
                aria-expanded={open}
                aria-haspopup="menu"
            >
                <Globe2 className="h-4 w-4 text-primary" />
                <img src={current.flag} alt={current.code} className="h-3.5 w-5 rounded-sm opacity-90" />
                <span className="hidden text-foreground sm:inline">{current.name}</span>
                <span className="uppercase text-foreground sm:hidden">{current.code}</span>
                <ChevronDown className={clsx("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-64 origin-top-right overflow-hidden rounded-xl border border-border bg-card shadow-2xl focus:outline-none">
                    <div className="border-b border-border/60 bg-secondary/20 px-3 py-2.5">
                        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Language</div>
                        <div className="mt-1 flex items-center gap-2 text-base font-black text-foreground">
                            <img src={current.flag} alt={current.code} className="h-4 w-6 rounded-sm opacity-90" />
                            {current.name}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-muted-foreground">{current.locale}</div>
                    </div>
                    <div className="flex flex-col p-1.5">
                        {languages.map((lng) => (
                            <button
                                key={lng.code}
                                onClick={() => {
                                    setLanguage(lng.code as "en" | "ko" | "zh");
                                    setOpen(false);
                                }}
                                className={clsx(
                                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors",
                                    language === lng.code ? "bg-primary/15 text-primary" : "text-foreground hover:bg-secondary/80"
                                )}
                            >
                                <span className="flex items-center gap-3">
                                    <img src={lng.flag} alt={lng.code} className="h-4 w-6 rounded-sm opacity-90" />
                                    <span className="min-w-0">
                                        <span className="block">{lng.name}</span>
                                        <span className="mt-0.5 block truncate text-xs font-semibold text-muted-foreground">{lng.locale}</span>
                                    </span>
                                </span>
                                {language === lng.code && <Check className="h-4 w-4" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
