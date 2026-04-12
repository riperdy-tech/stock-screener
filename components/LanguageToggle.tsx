import { useLanguage } from "./LanguageContext";
import { clsx } from "clsx";

export function LanguageToggle() {
    const { language, setLanguage } = useLanguage();

    const toggle = () => {
        if (language === 'en') setLanguage('ko');
        else if (language === 'ko') setLanguage('zh');
        else setLanguage('en');
    };

    const getFlag = () => {
        if (language === 'en') return "https://flagcdn.com/w20/us.png";
        if (language === 'ko') return "https://flagcdn.com/w20/kr.png";
        return "https://flagcdn.com/w20/tw.png";
    };

    const getTooltip = () => {
        if (language === 'en') return "Switch to Korean";
        if (language === 'ko') return "중국어(번체)로 전환";
        return "切換至英文";
    };

    return (
        <button
            onClick={toggle}
            className="flex items-center gap-2 group focus:outline-none bg-secondary/50 hover:bg-secondary/80 px-2 py-1 rounded-md transition-colors border border-border/50"
            title={getTooltip()}
        >
            <img src={getFlag()} alt={language} className="w-4 h-3 rounded-sm opacity-90" />
            <span className="text-xs font-bold text-foreground uppercase">
                {language}
            </span>
        </button>
    );
}
