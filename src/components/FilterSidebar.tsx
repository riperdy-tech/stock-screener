import { Filter, X, HelpCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useLanguage } from "./LanguageContext";

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
    minMarketCap: 0,
    maxMarketCap: 100000, // Effectively infinite
    maxPrice: 10000,
    minRevenueGrowth: -100,
    minGrossMargin: -100,
    minROIC: -100,
    maxPS: 1000,
    maxPEG: 1000,
    minInsiderOwnership: 0,
    maxFloat: 5000, // 5B shares
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
        setLocalFilters(DEFAULT_FILTERS);
        setFilters(DEFAULT_FILTERS);
    };

    return (
        <div className="w-80 bg-card border-r border-border flex flex-col h-screen sticky top-0 overflow-hidden shrink-0">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20">
                <div className="flex items-center gap-2 font-semibold">
                    <Filter className="h-5 w-5 text-primary" />
                    {t('filters')}
                </div>
                {/* Permanent Sidebar - No Close Button */}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* Size & Price */}
                <Section title={t('sizePrice')}>
                    <InputGroup label={t('minMarketCap')} value={localFilters.minMarketCap} onChange={(v) => handleChange("minMarketCap", v)} strictValue={STRICT_FILTERS.minMarketCap} field="minMarketCap" defs={filterDefs} />
                    <InputGroup label={t('maxMarketCap')} value={localFilters.maxMarketCap} onChange={(v) => handleChange("maxMarketCap", v)} strictValue={STRICT_FILTERS.maxMarketCap} field="maxMarketCap" defs={filterDefs} />
                    <InputGroup label={t('maxPrice')} value={localFilters.maxPrice} onChange={(v) => handleChange("maxPrice", v)} strictValue={STRICT_FILTERS.maxPrice} field="maxPrice" defs={filterDefs} />
                    <InputGroup label={t('maxFloat')} value={localFilters.maxFloat} onChange={(v) => handleChange("maxFloat", v)} strictValue={STRICT_FILTERS.maxFloat} field="maxFloat" defs={filterDefs} />
                </Section>

                {/* Growth & Margins */}
                <Section title={t('growthEff')}>
                    <InputGroup label={t('minRevGrowth')} value={localFilters.minRevenueGrowth} onChange={(v) => handleChange("minRevenueGrowth", v)} strictValue={STRICT_FILTERS.minRevenueGrowth} field="minRevenueGrowth" defs={filterDefs} />
                    <InputGroup label={t('minGrossMargin')} value={localFilters.minGrossMargin} onChange={(v) => handleChange("minGrossMargin", v)} strictValue={STRICT_FILTERS.minGrossMargin} field="minGrossMargin" defs={filterDefs} />
                    <InputGroup label={t('minROIC')} value={localFilters.minROIC} onChange={(v) => handleChange("minROIC", v)} strictValue={STRICT_FILTERS.minROIC} field="minROIC" defs={filterDefs} />
                </Section>

                {/* Valuation */}
                <Section title={t('valuation')}>
                    <InputGroup label={t('maxPS')} value={localFilters.maxPS} onChange={(v) => handleChange("maxPS", v)} strictValue={STRICT_FILTERS.maxPS} field="maxPS" defs={filterDefs} />
                    <InputGroup label={t('maxPEG')} value={localFilters.maxPEG} onChange={(v) => handleChange("maxPEG", v)} strictValue={STRICT_FILTERS.maxPEG} field="maxPEG" defs={filterDefs} />
                </Section>

                {/* Inside Skin */}
                <Section title={t('ownership')}>
                    <InputGroup label={t('minInsider')} value={localFilters.minInsiderOwnership} onChange={(v) => handleChange("minInsiderOwnership", v)} strictValue={STRICT_FILTERS.minInsiderOwnership} field="minInsiderOwnership" defs={filterDefs} />
                </Section>

                <div className="text-center text-xs text-muted-foreground mt-8 pb-20">
                    {t('showing')} {totalResults} {t('assets')}
                </div>
            </div>

            {/* Sticky Actions Footer */}
            <div className="p-4 border-t border-border bg-card sticky bottom-0">
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

function InputGroup({ label, value, onChange, hint, strictValue, field, defs }: { label: string, value: number, onChange: (v: string) => void, hint?: string, strictValue?: number, field?: string, defs?: Record<string, string> }) {
    return (
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <div className="flex items-center gap-1.5 group relative cursor-help w-fit">
                    <label className="text-xs text-muted-foreground block">{label}</label>
                    {field && <HelpCircle className="h-3 w-3 text-gray-600 group-hover:text-primary transition-colors" />}

                    {/* Tooltip */}
                    {field && defs && (
                        <div className="absolute left-0 bottom-full mb-2 w-48 p-2 bg-[#1a1a1a] border border-gray-700 rounded-md text-xs text-gray-300 shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                            {defs[field] || "Filter criteria"}
                            <div className="absolute bottom-[-4px] left-4 w-2 h-2 bg-[#1a1a1a] border-r border-b border-gray-700 transform rotate-45"></div>
                        </div>
                    )}
                </div>

                {strictValue !== undefined && (
                    <span className="text-[10px] text-primary/70 font-mono">Strict: {strictValue}</span>
                )}
            </div>
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-secondary/30 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
            {hint && <div className="text-[10px] text-muted-foreground/60 mt-1">{hint}</div>}
        </div>
    )
}
