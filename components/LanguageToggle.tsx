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
        { code: "en", name: "English", flag: "https://flagcdn.com/w20/us.png" },
        { code: "ko", name: "Korean", flag: "https://flagcdn.com/w20/kr.png" },
        { code: "zh", name: "Chinese", flag: "https://flagcdn.com/w20/tw.png" },
    ];

    const current = languages.find(l => l.code === language) || languages[0];

    return (
        <div ref={ref} className="relative z-50 inline-block text-left">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/50 px-3.5 py-2.5 text-base font-black transition-colors hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-primary/40"
                title="Select Language"
                aria-expanded={open}
                aria-haspopup="menu"
            >
                <Globe2 className="h-5 w-5 text-primary" />
                <img src={current.flag} alt={current.code} className="h-4 w-6 rounded-sm opacity-90" />
                <span className="hidden text-foreground sm:inline">{current.name}</span>
                <span className="uppercase text-foreground sm:hidden">{current.code}</span>
                <ChevronDown className={clsx("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-60 origin-top-right overflow-hidden rounded-xl border border-border bg-card shadow-2xl focus:outline-none">
                    <div className="border-b border-border/60 px-4 py-3">
                        <div className="text-base font-black uppercase tracking-wider text-muted-foreground">Language</div>
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
                                    "flex w-full items-center justify-between gap-3 rounded-lg px-3.5 py-3 text-left text-base font-bold transition-colors",
                                    language === lng.code ? "bg-primary/15 text-primary" : "text-foreground hover:bg-secondary/80"
                                )}
                            >
                                <span className="flex items-center gap-3">
                                    <img src={lng.flag} alt={lng.code} className="h-4 w-6 rounded-sm opacity-90" />
                                    <span>{lng.name}</span>
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
