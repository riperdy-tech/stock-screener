import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
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
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/50 px-3 py-2 transition-colors hover:bg-secondary/80 focus:outline-none"
                title="Select Language"
            >
                <img src={current.flag} alt={current.code} className="h-3.5 w-5 rounded-sm opacity-90" />
                <span className="text-sm font-bold uppercase text-foreground">{current.code}</span>
                <ChevronDown className={clsx("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-40 origin-top-right overflow-hidden rounded-lg border border-border bg-card shadow-lg focus:outline-none">
                    <div className="flex flex-col py-1">
                        {languages.map((lng) => (
                            <button
                                key={lng.code}
                                onClick={() => {
                                    setLanguage(lng.code as "en" | "ko" | "zh");
                                    setOpen(false);
                                }}
                                className={clsx(
                                    "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                                    language === lng.code ? "bg-primary/20 font-bold text-primary" : "text-foreground hover:bg-secondary/80"
                                )}
                            >
                                <img src={lng.flag} alt={lng.code} className="h-3.5 w-5 rounded-sm opacity-90" />
                                <span>{lng.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
