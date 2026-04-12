import { Filter, X, HelpCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useLanguage } from "./LanguageContext";
import clsx from "clsx";

export interface FilterState {
    minMarketCap: number; // Millions
    maxMarketCap: number; // Billions
    maxPrice: number;
    minRevenueGrowth: number;
    minGrossMargin: number;
    minROIC: number;
    maxPS: number;
    maxPEG: number;
    minInsiderOwnership: number;
    maxFloat: number; // Millions
}

interface FilterSidebarProps {
    filters: FilterState;
    setFilters: (f: FilterState) => void;
    isOpen: boolean;
    onClose: () => void;
    totalResults: number;
}

export const DEFAULT_FILTERS: FilterState = {
    minMarketCap: 50,
    maxMarketCap: 2000,
    maxPrice: 25,
    minRevenueGrowth: 20,
    minGrossMargin: 30,
    minROIC: 15,
    maxPS: 10,
    maxPEG: 1.5,
    minInsiderOwnership: 15,
    maxFloat: 50,
};

export const ZERO_BASE_FILTERS: FilterState = {
    minMarketCap: 0,
    maxMarketCap: 10000,
    maxPrice: 1000,
    minRevenueGrowth: -50,
    minGrossMargin: -50,
    minROIC: -50,
    maxPS: 50,
    maxPEG: 10,
    minInsiderOwnership: 0,
    maxFloat: 5000,
};

export const STRICT_FILTERS: FilterState = {
    minMarketCap: 50,
    maxMarketCap: 2000,
    maxPrice: 25,
    minRevenueGrowth: 20,
    minGrossMargin: 30,
    minROIC: 15,
    maxPS: 10,
    maxPEG: 1.5,
    minInsiderOwnership: 15,
    maxFloat: 50,
};

export function FilterSidebar({ filters, setFilters, isOpen, onClose, totalResults }: FilterSidebarProps) {
    const { t, filterDefs } = useLanguage();

    // Local state for Manual Apply
    const [localFilters, setLocalFilters] = useState<FilterState>(filters);

    // Sync local state when global filters change (e.g. initial load or external reset)
    useEffect(() => {
        setLocalFilters(filters);
    }, [filters]);

    const handleChange = (key: keyof FilterState, value: string) => {
        const num = parseFloat(value);
        setLocalFilters({ ...localFilters, [key]: isNaN(num) ? 0 : num });
    };

    const handleApply = () => {
        setFilters(localFilters);
    };

    const handleReset = () => {
        setLocalFilters(ZERO_BASE_FILTERS);
        setFilters(ZERO_BASE_FILTERS);
    };

    return (
        <div className={clsx(
            "fixed inset-y-0 left-0 z-50 w-80 bg-card/95 backdrop-blur-3xl border-r border-border/50 flex flex-col h-screen overflow-hidden shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.8)] transition-transform duration-300 md:relative md:translate-x-0 md:z-40 md:bg-card/80",
            isOpen ? "translate-x-0" : "-translate-x-full"
        )}>
            <div className="p-4 border-b border-border/50 flex justify-between items-center bg-muted/40">
                <div className="flex items-center gap-2 font-semibold">
                    <Filter className="h-5 w-5 text-primary" />
                    {t('filters')}
                </div>
                <button onClick={onClose} className="md:hidden p-1.5 focus:outline-none hover:bg-destructive/20 hover:text-destructive rounded-md transition-colors border border-transparent hover:border-destructive/30">
                     <X className="h-4 w-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* Size & Price */}
                <Section title={t('sizePrice')}>
                    <InputGroup label={t('minMarketCap')} value={localFilters.minMarketCap} onChange={(v) => handleChange("minMarketCap", v)} strictValue={STRICT_FILTERS.minMarketCap} field="minMarketCap" defs={filterDefs} min={0} max={5000} step={10} />
                    <InputGroup label={t('maxMarketCap')} value={localFilters.maxMarketCap} onChange={(v) => handleChange("maxMarketCap", v)} strictValue={STRICT_FILTERS.maxMarketCap} field="maxMarketCap" defs={filterDefs} min={0} max={10000} step={100} />
                    <InputGroup label={t('maxPrice')} value={localFilters.maxPrice} onChange={(v) => handleChange("maxPrice", v)} strictValue={STRICT_FILTERS.maxPrice} field="maxPrice" defs={filterDefs} min={0} max={1000} step={1} />
                    <InputGroup label={t('maxFloat')} value={localFilters.maxFloat} onChange={(v) => handleChange("maxFloat", v)} strictValue={STRICT_FILTERS.maxFloat} field="maxFloat" defs={filterDefs} min={0} max={5000} step={10} />
                </Section>

                {/* Growth & Margins */}
                <Section title={t('growthEff')}>
                    <InputGroup label={t('minRevGrowth')} value={localFilters.minRevenueGrowth} onChange={(v) => handleChange("minRevenueGrowth", v)} strictValue={STRICT_FILTERS.minRevenueGrowth} field="minRevenueGrowth" defs={filterDefs} min={-50} max={200} step={1} />
                    <InputGroup label={t('minGrossMargin')} value={localFilters.minGrossMargin} onChange={(v) => handleChange("minGrossMargin", v)} strictValue={STRICT_FILTERS.minGrossMargin} field="minGrossMargin" defs={filterDefs} min={-50} max={100} step={1} />
                    <InputGroup label={t('minROIC')} value={localFilters.minROIC} onChange={(v) => handleChange("minROIC", v)} strictValue={STRICT_FILTERS.minROIC} field="minROIC" defs={filterDefs} min={-50} max={100} step={1} />
                </Section>

                {/* Valuation */}
                <Section title={t('valuation')}>
                    <InputGroup label={t('maxPS')} value={localFilters.maxPS} onChange={(v) => handleChange("maxPS", v)} strictValue={STRICT_FILTERS.maxPS} field="maxPS" defs={filterDefs} min={0} max={50} step={0.5} />
                    <InputGroup label={t('maxPEG')} value={localFilters.maxPEG} onChange={(v) => handleChange("maxPEG", v)} strictValue={STRICT_FILTERS.maxPEG} field="maxPEG" defs={filterDefs} min={0} max={10} step={0.1} />
                </Section>

                {/* Inside Skin */}
                <Section title={t('ownership')}>
                    <InputGroup label={t('minInsider')} value={localFilters.minInsiderOwnership} onChange={(v) => handleChange("minInsiderOwnership", v)} strictValue={STRICT_FILTERS.minInsiderOwnership} field="minInsiderOwnership" defs={filterDefs} min={0} max={100} step={1} />
                </Section>

                <div className="text-center text-xs text-muted-foreground mt-8 pb-20">
                    {t('showing')} {totalResults} {t('assets')}
                </div>
            </div>

            {/* Sticky Actions Footer */}
            <div className="p-4 border-t border-border/50 bg-card/50 backdrop-blur-xl sticky bottom-0 z-10 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
                <div className="flex gap-2">
                    <button
                        onClick={handleApply}
                        className="flex-1 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded shadow transition-colors"
                    >
                        {t('apply')}
                    </button>
                    <button
                        onClick={handleReset}
                        className="flex-1 px-3 py-2 bg-muted hover:bg-destructive/10 hover:text-destructive text-muted-foreground text-xs font-medium rounded border border-border transition-colors"
                    >
                        {t('reset')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground/80 border-b border-border pb-1">{title}</h3>
            <div className="space-y-3 pl-1">
                {children}
            </div>
        </div>
    )
}

function InputGroup({ label, value, onChange, hint, strictValue, field, defs, min = 0, max = 100, step = 1 }: { label: string, value: number, onChange: (v: string) => void, hint?: string, strictValue?: number, field?: string, defs?: Record<string, string>, min?: number, max?: number, step?: number }) {
    // Dynamically colorize the slider thumb. If it's stricter than the strict limit, it glows warning color!
    const isStrict = strictValue !== undefined && (
        (label.includes('max') && value <= strictValue) ||
        (label.includes('min') && value >= strictValue)
    );

    return (
        <div className="group/input mb-2">
            <div className="flex justify-between items-baseline mb-2">
                <div className="flex items-center gap-1.5 group relative cursor-help w-fit">
                    <label className="text-xs font-medium text-muted-foreground group-hover/input:text-foreground transition-colors">{label}</label>
                    {field && <HelpCircle className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary transition-colors" />}

                    {/* Tooltip */}
                    {field && defs && (
                        <div className="absolute left-0 bottom-full mb-2 w-48 p-2 bg-[#1a1a1a]/95 backdrop-blur-md border border-border shadow-2xl rounded-md text-xs text-gray-300 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                            {defs[field] || "Filter criteria"}
                            <div className="absolute bottom-[-4px] left-4 w-2 h-2 bg-[#1a1a1a] border-r border-b border-border transform rotate-45"></div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {strictValue !== undefined && (
                        <span className="text-[10px] text-muted-foreground/80 font-mono opacity-0 group-hover/input:opacity-100 transition-opacity">Strict: {strictValue}</span>
                    )}
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-16 bg-secondary/30 border border-border/50 rounded px-1.5 py-1 text-xs text-right focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                    />
                </div>
            </div>
            
            {/* The Range Slider */}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer outline-none transition-all
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                [&::-webkit-slider-thumb]:rounded-full ${isStrict ? '[&::-webkit-slider-thumb]:bg-warning [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(237,137,54,0.8)]' : '[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(59,130,246,0.6)]'}
                hover:[&::-webkit-slider-thumb]:scale-125 hover:[&::-webkit-slider-thumb]:transition-transform`}
            />
            {hint && <div className="text-[10px] text-muted-foreground/60 mt-1">{hint}</div>}
        </div>
    )
}
