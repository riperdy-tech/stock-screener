import { useState, useRef, useEffect } from "react";
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
        { code: 'en', name: 'English', flag: "https://flagcdn.com/w20/us.png" },
        { code: 'ko', name: '한국어', flag: "https://flagcdn.com/w20/kr.png" },
        { code: 'zh', name: '繁體中文', flag: "https://flagcdn.com/w20/tw.png" }
    ];

    const current = languages.find(l => l.code === language) || languages[0];

    return (
        <div ref={ref} className="relative inline-block text-left z-50">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 group focus:outline-none bg-secondary/50 hover:bg-secondary/80 px-2.5 py-1.5 rounded-md transition-colors border border-border/50"
                title="Select Language"
            >
                <img src={current.flag} alt={current.code} className="w-4 h-3 rounded-sm opacity-90" />
                <span className="text-xs font-bold text-foreground uppercase">{current.code}</span>
                <span className="text-xs text-muted-foreground ml-1">▼</span>
            </button>
            
            {open && (
                <div className="absolute right-0 mt-2 w-32 origin-top-right rounded-md bg-card border border-border shadow-lg focus:outline-none overflow-hidden">
                    <div className="py-1 flex flex-col">
                        {languages.map((lng) => (
                            <button
                                key={lng.code}
                                onClick={() => {
                                    setLanguage(lng.code as 'en' | 'ko' | 'zh');
                                    setOpen(false);
                                }}
                                className={clsx(
                                    "flex items-center gap-3 w-full text-left px-4 py-2.5 text-xs transition-colors",
                                    language === lng.code ? "bg-primary/20 text-primary font-bold" : "text-foreground hover:bg-secondary/80"
                                )}
                            >
                                <img src={lng.flag} alt={lng.code} className="w-4 h-3 rounded-sm opacity-90" />
                                <span>{lng.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
