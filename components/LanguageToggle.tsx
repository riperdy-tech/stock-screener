import { useLanguage } from "./LanguageContext";
import { clsx } from "clsx";

export function LanguageToggle() {
    const { language, setLanguage } = useLanguage();

    const toggle = () => {
        setLanguage(language === 'en' ? 'ko' : 'en');
    };

    return (
        <button
            onClick={toggle}
            className="flex items-center gap-3 group focus:outline-none"
            title={language === 'en' ? "Switch to Korean" : "영어로 전환"}
        >
            <span className={clsx("text-sm font-bold transition-colors", language === 'en' ? "text-foreground" : "text-muted-foreground")}>
                EN
            </span>

            {/* Pill Container */}
            <div className={clsx(
                "relative w-12 h-7 rounded-full transition-all duration-300 shadow-inner",
                language === 'en' ? "bg-secondary" : "bg-primary/20 ring-1 ring-primary"
            )}>
                {/* Visual Flags Background (Optional Subtlety) */}

                {/* Sliding Circle */}
                <div
                    className={clsx(
                        "absolute top-1 left-1 w-5 h-5 bg-background rounded-full shadow-md flex items-center justify-center transition-all duration-300 transform",
                        language === 'en' ? "translate-x-0" : "translate-x-5"
                    )}
                >
                    {/* Tiny Flag Icon inside circle? Or just simple circle per request image which had circle on side */}
                    {language === 'en' ? (
                        <img src="https://flagcdn.com/w20/us.png" alt="US" className="w-3 h-3 rounded-full opacity-80" />
                    ) : (
                        <img src="https://flagcdn.com/w20/kr.png" alt="KR" className="w-3 h-3 rounded-full opacity-80" />
                    )}
                </div>
            </div>

            <span className={clsx("text-sm font-bold transition-colors", language === 'ko' ? "text-foreground" : "text-muted-foreground")}>
                KO
            </span>
        </button>
    );
}
