"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { TRANSLATIONS, Language, FILTER_DEFS_EN, FILTER_DEFS_KO, FILTER_DEFS_ZH } from "@/lib/i18n";

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: keyof typeof TRANSLATIONS['en']) => string;
    filterDefs: Record<string, string>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguage] = useState<Language>('en');

    // Load from localStorage if available
    useEffect(() => {
        const saved = localStorage.getItem('app-language') as Language;
        if (saved && (saved === 'en' || saved === 'ko' || saved === 'zh')) {
            setLanguage(saved);
        }
    }, []);

    // Keep the document language in sync so screen readers and the browser's
    // own translation heuristics see the right locale.
    useEffect(() => {
        document.documentElement.lang = language === 'ko' ? 'ko' : language === 'zh' ? 'zh-TW' : 'en';
    }, [language]);

    const handleSetLanguage = (lang: Language) => {
        setLanguage(lang);
        localStorage.setItem('app-language', lang);
    };

    const t = (key: keyof typeof TRANSLATIONS['en']) => {
        return TRANSLATIONS[language][key] || TRANSLATIONS['en'][key] || key;
    };

    const filterDefs = language === 'ko' ? FILTER_DEFS_KO : language === 'zh' ? FILTER_DEFS_ZH : FILTER_DEFS_EN;

    return (
        <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t, filterDefs }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
}
