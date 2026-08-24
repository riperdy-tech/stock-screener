'use client';

import { useState, useRef, useEffect } from "react";
import { useLanguage } from "./LanguageContext";
import { clsx } from "clsx";

// Desk idiom: mono two-letter codes, no flag images (the design ships no assets
// beyond the two Google fonts, and flagcdn.com was an external request per render).
const LANGUAGES = [
    { code: "en", name: "English", locale: "US market labels" },
    { code: "ko", name: "한국어", locale: "Korea market labels" },
    { code: "zh", name: "中文", locale: "Taiwan market labels" },
] as const;

export function LanguageToggle() {
    const { language, setLanguage } = useLanguage();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKey);
        };
    }, []);

    const current = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

    return (
        <div ref={ref} className="relative z-50 inline-block text-left">
            <button
                onClick={() => setOpen(!open)}
                className="font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-ink-2 hover:text-ink"
                title="Select language"
                aria-label={`Current language: ${current.name}`}
                aria-expanded={open}
                aria-haspopup="menu"
            >
                {current.code.toUpperCase()} {open ? '▴' : '▾'}
            </button>

            {open && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-56 border border-rule-22 bg-page">
                    <div className="border-b border-rule-14 px-3 py-2">
                        <div className="font-mono font-semibold text-[11px] uppercase tracking-micro text-ink-3">Language</div>
                    </div>
                    <div className="flex flex-col">
                        {LANGUAGES.map((lng) => (
                            <button
                                key={lng.code}
                                role="menuitem"
                                onClick={() => { setLanguage(lng.code as "en" | "ko" | "zh"); setOpen(false); }}
                                className={clsx(
                                    "flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left transition-colors",
                                    language === lng.code ? "text-accent" : "text-ink-2 hover:text-ink",
                                )}
                            >
                                <span className="text-[12.5px] font-semibold normal-case">{lng.name}</span>
                                <span className="font-mono font-semibold text-[11px] uppercase tracking-micro text-ink-3">{lng.code}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
