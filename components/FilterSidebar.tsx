import { Filter, X, HelpCircle, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { useLanguage } from "./LanguageContext";
import { Market } from "@/lib/data-service";
import { YoutubeStrategyFilter } from "@/lib/youtube-strategy";
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

// Phase 10: Reverse Engine filter state
export interface ReverseFilterState {
    archetypes: string[];       // selected archetypes (empty = all)
    bands: string[];            // selected bands (empty = all)
    minComposite: number;       // 0-100
    minMoS: number;             // 0-100
    minSurvivability: number;   // 0-100
    nominatedOnly: boolean;
}

export const DEFAULT_REVERSE_FILTERS: ReverseFilterState = {
    archetypes: [],
    bands: [],
    minComposite: 0,
    minMoS: 0,
    minSurvivability: 0,
    nominatedOnly: false,
};

// WS1-T6+: Paradigm dimension filter state
export interface ParadigmFilterState {
    themes: string[];          // selected themes (empty = all)
    bands: string[];           // pdm_band selection (empty = all)
    industryQuery: string;     // substring match on industry (case-insensitive)
    minSignal: number;         // 0-100
    minMembership: number;     // 0-100
    minMomentum: number;       // 0-100
    minGate: number;           // 0-100
    acceleratingOnly: boolean;
    macroWarningOnly: boolean;
    bridgedOnly: boolean;      // gate_bridged_forward in flags
    multiThemeOnly: boolean;   // pdm_themes.length > 1
}

export const DEFAULT_PARADIGM_FILTERS: ParadigmFilterState = {
    themes: [],
    bands: [],
    industryQuery: "",
    minSignal: 0,
    minMembership: 0,
    minMomentum: 0,
    minGate: 0,
    acceleratingOnly: false,
    macroWarningOnly: false,
    bridgedOnly: false,
    multiThemeOnly: false,
};

// All 9 themes from paradigm_config.json
export const PARADIGM_THEMES = [
    "ai_compute",
    "physical_ai",
    "glp1_metabolic",
    "cloud_software",
    "energy_transition",
    "cybersecurity",
    "quantum_computing",
    "space_economy",
    "nuclear_renaissance",
];

export const PARADIGM_BAND_LABELS: Record<string, string> = {
    high: "STRONG",
    mid: "SOLID",
    watch: "WATCH",
    skip: "PASS",
    no_data: "NO DATA",
};

interface FilterSidebarProps {
    filters: FilterState;
    setFilters: (f: FilterState) => void;
    isOpen: boolean;
    onClose: () => void;
    totalResults: number;
    market: Market;
    // Phase 10: Reverse Engine mode
    screenMode?: '100bagger' | 'reverse' | 'paradigm' | 'youtube';
    reverseFilters?: ReverseFilterState;
    setReverseFilters?: (f: ReverseFilterState) => void;
    // WS1-T6+: Paradigm filters
    paradigmFilters?: ParadigmFilterState;
    setParadigmFilters?: (f: ParadigmFilterState) => void;
    youtubeFilter?: YoutubeStrategyFilter;
    setYoutubeFilter?: (f: YoutubeStrategyFilter) => void;
    // Phase 11d: Deep-Dive controls
    batchN?: number;
    onBatchNChange?: (n: number) => void;
    batchDispatching?: boolean;
    batchStatus?: string | null;
    onDeepDiveClick?: () => void;
    selectedCount?: number;
}

const YOUTUBE_FILTERS: Array<{ value: YoutubeStrategyFilter; label: string }> = [
    { value: "any", label: "Any Video Signal" },
    { value: "earningsMomentum", label: "Earnings Momentum" },
    { value: "deepValueReversal", label: "Deep Value Reversal" },
    { value: "turnaroundSeed", label: "Turnaround Seed" },
    { value: "turnaroundScaleIn", label: "Turnaround Scale-In" },
];

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

export function FilterSidebar({ filters, setFilters, isOpen, onClose, totalResults, market, screenMode, reverseFilters, setReverseFilters, paradigmFilters, setParadigmFilters, youtubeFilter = "any", setYoutubeFilter, batchN, onBatchNChange, batchDispatching, batchStatus, onDeepDiveClick, selectedCount }: FilterSidebarProps) {
    const { t, filterDefs } = useLanguage();

    // Local state for Manual Apply
    const [localFilters, setLocalFilters] = useState<FilterState>(filters);
    const [localReverseFilters, setLocalReverseFilters] = useState<ReverseFilterState>(reverseFilters || DEFAULT_REVERSE_FILTERS);
    const [localParadigmFilters, setLocalParadigmFilters] = useState<ParadigmFilterState>(paradigmFilters || DEFAULT_PARADIGM_FILTERS);

    // Sync local state when global filters change (e.g. initial load or external reset)
    useEffect(() => {
        setLocalFilters(filters);
    }, [filters]);

    useEffect(() => {
        if (reverseFilters) setLocalReverseFilters(reverseFilters);
    }, [reverseFilters]);

    useEffect(() => {
        if (paradigmFilters) setLocalParadigmFilters(paradigmFilters);
    }, [paradigmFilters]);

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

    // Phase 10: Reverse filter handlers
    const toggleArchetype = (arch: string) => {
        const next = localReverseFilters.archetypes.includes(arch)
            ? localReverseFilters.archetypes.filter(a => a !== arch)
            : [...localReverseFilters.archetypes, arch];
        setLocalReverseFilters({ ...localReverseFilters, archetypes: next });
    };

    const toggleBand = (band: string) => {
        const next = localReverseFilters.bands.includes(band)
            ? localReverseFilters.bands.filter(b => b !== band)
            : [...localReverseFilters.bands, band];
        setLocalReverseFilters({ ...localReverseFilters, bands: next });
    };

    const handleReverseApply = () => {
        if (setReverseFilters) setReverseFilters(localReverseFilters);
    };

    const handleReverseReset = () => {
        setLocalReverseFilters(DEFAULT_REVERSE_FILTERS);
        if (setReverseFilters) setReverseFilters(DEFAULT_REVERSE_FILTERS);
    };

    // WS1-T6+: Paradigm filter handlers
    const toggleParadigmTheme = (theme: string) => {
        const next = localParadigmFilters.themes.includes(theme)
            ? localParadigmFilters.themes.filter(t => t !== theme)
            : [...localParadigmFilters.themes, theme];
        setLocalParadigmFilters({ ...localParadigmFilters, themes: next });
    };

    const toggleParadigmBand = (band: string) => {
        const next = localParadigmFilters.bands.includes(band)
            ? localParadigmFilters.bands.filter(b => b !== band)
            : [...localParadigmFilters.bands, band];
        setLocalParadigmFilters({ ...localParadigmFilters, bands: next });
    };

    const handleParadigmApply = () => {
        if (setParadigmFilters) setParadigmFilters(localParadigmFilters);
    };

    const handleParadigmReset = () => {
        setLocalParadigmFilters(DEFAULT_PARADIGM_FILTERS);
        if (setParadigmFilters) setParadigmFilters(DEFAULT_PARADIGM_FILTERS);
    };

    return (
        <div className={clsx(
            "fixed inset-y-0 left-0 z-50 w-80 bg-card/95 backdrop-blur-3xl border-r border-border/50 flex flex-col h-[100dvh] overflow-hidden shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.8)] transition-transform duration-300 md:relative md:translate-x-0 md:z-40 md:bg-card/80",
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
                <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Active lens</div>
                    <div className="mt-0.5 text-sm font-bold text-foreground">
                        {screenMode === 'reverse' ? 'Reverse Engine'
                            : screenMode === 'paradigm' ? 'Paradigm Themes'
                            : screenMode === 'youtube' ? 'YouTube Strategy'
                            : '100-Bagger'}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        Filter set scoped to the current screening lens.
                    </p>
                </div>

                {/* Phase 10: Reverse Engine controls (shown only in reverse mode) */}
                {screenMode === 'reverse' && (
                    <>
                        <Section title="Archetype">
                            <div className="flex flex-wrap gap-1.5">
                                {['A','B','C','D','E','F','G','H','I'].map(arch => (
                                    <button
                                        key={arch}
                                        onClick={() => toggleArchetype(arch)}
                                        className={clsx(
                                            "px-2.5 py-1 text-xs font-bold rounded-md border transition-all",
                                            localReverseFilters.archetypes.includes(arch)
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-secondary/40 border-border/50 text-muted-foreground hover:border-primary/40"
                                        )}
                                    >
                                        {arch}
                                    </button>
                                ))}
                            </div>
                        </Section>

                        <Section title="Band">
                            <div className="flex flex-wrap gap-1.5">
                                {['High','Solid','Watchlist','Monitor','Reject-tier'].map(band => (
                                    <button
                                        key={band}
                                        onClick={() => toggleBand(band)}
                                        className={clsx(
                                            "px-2.5 py-1 text-[10px] font-bold rounded-md border transition-all",
                                            localReverseFilters.bands.includes(band)
                                                ? band === 'High' ? "bg-emerald-500/30 text-emerald-400 border-emerald-500/50"
                                                : band === 'Solid' ? "bg-blue-500/30 text-blue-400 border-blue-500/50"
                                                : band === 'Watchlist' ? "bg-amber-500/30 text-amber-400 border-amber-500/50"
                                                : band === 'Monitor' ? "bg-gray-500/30 text-gray-400 border-gray-500/50"
                                                : "bg-muted/30 text-muted-foreground border-border/50"
                                                : "bg-secondary/40 border-border/50 text-muted-foreground hover:border-primary/40"
                                        )}
                                    >
                                        {band}
                                    </button>
                                ))}
                            </div>
                        </Section>

                        <Section title="Score Thresholds">
                            <InputGroup
                                label="Min Composite"
                                value={localReverseFilters.minComposite}
                                onChange={(v) => setLocalReverseFilters({ ...localReverseFilters, minComposite: parseFloat(v) || 0 })}
                                min={0} max={100} step={1}
                            />
                            <InputGroup
                                label="Min MoS"
                                value={localReverseFilters.minMoS}
                                onChange={(v) => setLocalReverseFilters({ ...localReverseFilters, minMoS: parseFloat(v) || 0 })}
                                min={0} max={100} step={1}
                            />
                            <InputGroup
                                label="Min Survivability"
                                value={localReverseFilters.minSurvivability}
                                onChange={(v) => setLocalReverseFilters({ ...localReverseFilters, minSurvivability: parseFloat(v) || 0 })}
                                min={0} max={100} step={1}
                            />
                        </Section>

                        <Section title="Nomination">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={localReverseFilters.nominatedOnly}
                                    onChange={(e) => setLocalReverseFilters({ ...localReverseFilters, nominatedOnly: e.target.checked })}
                                    className="w-4 h-4 rounded border-border accent-amber-500"
                                />
                                <span className="text-xs font-medium text-muted-foreground">★ Nominated only</span>
                            </label>
                        </Section>

                        {/* Phase 11d: Deep-Dive */}
                        <Section title="Deep-Dive (v3.2)">
                            <p className="text-[10px] text-muted-foreground mb-2">Click cards to select stocks, or use N below for top-ranked.</p>
                            <div className="flex items-center gap-2">
                                <select
                                    value={(batchN && [5,10,25].includes(batchN)) ? batchN : 0}
                                    onChange={(e) => { const v = Number(e.target.value); if (v > 0 && onBatchNChange) onBatchNChange(v); }}
                                    className="bg-secondary/40 border border-border/70 text-foreground rounded-md px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                    <option value={0}>N</option>
                                    <option value={5}>5</option>
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                </select>
                                <input
                                    type="number"
                                    min={1} max={30}
                                    value={batchN || 25}
                                    onChange={(e) => { const v = parseInt(e.target.value); if (v >= 1 && v <= 30 && onBatchNChange) onBatchNChange(v); }}
                                    className="w-14 bg-secondary/40 border border-border/70 text-foreground rounded-md px-1.5 py-1.5 text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>
                            <button
                                onClick={onDeepDiveClick}
                                disabled={batchDispatching}
                                className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg transition-all active:scale-95 disabled:opacity-50"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                {batchDispatching ? 'Dispatching...' : selectedCount && selectedCount > 0 ? `Deep-Dive Selected (${selectedCount})` : `Deep-Dive Top ${batchN || 25}`}
                            </button>
                            {batchStatus && (
                                <p className={clsx(
                                    "text-[10px] mt-1",
                                    batchStatus.startsWith("Error") ? "text-red-400" : "text-emerald-400"
                                )}>{batchStatus}</p>
                            )}
                        </Section>

                        {/* Reverse Apply/Reset */}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={handleReverseApply}
                                className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow transition-colors"
                            >
                                Apply Reverse
                            </button>
                            <button
                                onClick={handleReverseReset}
                                className="flex-1 px-2 py-2 bg-muted hover:bg-destructive/10 hover:text-destructive text-muted-foreground text-xs font-medium rounded border border-border transition-colors"
                            >
                                Reset
                            </button>
                        </div>
                    </>
                )}

                {/* WS1-T6+: Paradigm controls (shown only in paradigm mode) */}
                {screenMode === 'paradigm' && (
                    <>
                        <Section title="Conviction Tier (Band)">
                            <div className="flex flex-wrap gap-1.5">
                                {[
                                    { id: 'high', label: 'STRONG', cls: 'bg-emerald-500/30 text-emerald-400 border-emerald-500/50' },
                                    { id: 'mid', label: 'SOLID', cls: 'bg-blue-500/30 text-blue-400 border-blue-500/50' },
                                    { id: 'watch', label: 'WATCH', cls: 'bg-amber-500/30 text-amber-400 border-amber-500/50' },
                                    { id: 'skip', label: 'PASS', cls: 'bg-gray-500/30 text-gray-400 border-gray-500/50' },
                                ].map(({ id, label, cls }) => (
                                    <button
                                        key={id}
                                        onClick={() => toggleParadigmBand(id)}
                                        className={clsx(
                                            "px-2.5 py-1 text-[10px] font-bold rounded-md border transition-all",
                                            localParadigmFilters.bands.includes(id)
                                                ? cls
                                                : "bg-secondary/40 border-border/50 text-muted-foreground hover:border-primary/40"
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </Section>

                        <Section title="Themes">
                            <div className="flex flex-wrap gap-1.5">
                                {PARADIGM_THEMES.map(theme => (
                                    <button
                                        key={theme}
                                        onClick={() => toggleParadigmTheme(theme)}
                                        className={clsx(
                                            "px-2 py-1 text-[10px] font-mono rounded-md border transition-all",
                                            localParadigmFilters.themes.includes(theme)
                                                ? "bg-purple-500/30 text-purple-300 border-purple-500/50"
                                                : "bg-secondary/40 border-border/50 text-muted-foreground hover:border-purple-400/40"
                                        )}
                                    >
                                        {theme}
                                    </button>
                                ))}
                            </div>
                        </Section>

                        <Section title="Industry">
                            <input
                                type="text"
                                placeholder="filter (e.g. Semi, Software, Solar)"
                                value={localParadigmFilters.industryQuery}
                                onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, industryQuery: e.target.value })}
                                className="w-full bg-secondary/40 border border-border/70 text-foreground text-xs rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">Case-insensitive substring match on Yahoo industry name.</p>
                        </Section>

                        <Section title="Score Thresholds (0-100)">
                            <InputGroup
                                label="Min Signal (mem*mom*gate)"
                                value={localParadigmFilters.minSignal}
                                onChange={(v) => setLocalParadigmFilters({ ...localParadigmFilters, minSignal: parseFloat(v) || 0 })}
                                min={0} max={100} step={1}
                            />
                            <InputGroup
                                label="Min Membership"
                                value={localParadigmFilters.minMembership}
                                onChange={(v) => setLocalParadigmFilters({ ...localParadigmFilters, minMembership: parseFloat(v) || 0 })}
                                min={0} max={100} step={1}
                            />
                            <InputGroup
                                label="Min Momentum"
                                value={localParadigmFilters.minMomentum}
                                onChange={(v) => setLocalParadigmFilters({ ...localParadigmFilters, minMomentum: parseFloat(v) || 0 })}
                                min={0} max={100} step={1}
                            />
                            <InputGroup
                                label="Min Economics Gate"
                                value={localParadigmFilters.minGate}
                                onChange={(v) => setLocalParadigmFilters({ ...localParadigmFilters, minGate: parseFloat(v) || 0 })}
                                min={0} max={100} step={1}
                            />
                        </Section>

                        <Section title="Flag Filters">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.acceleratingOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, acceleratingOnly: e.target.checked })}
                                    className="w-4 h-4 rounded border-border accent-emerald-500"
                                />
                                <span className="text-xs font-medium text-muted-foreground">↑ Accelerating only</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.bridgedOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, bridgedOnly: e.target.checked })}
                                    className="w-4 h-4 rounded border-border accent-blue-500"
                                />
                                <span className="text-xs font-medium text-muted-foreground">Forward-EPS bridged only</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.multiThemeOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, multiThemeOnly: e.target.checked })}
                                    className="w-4 h-4 rounded border-border accent-purple-500"
                                />
                                <span className="text-xs font-medium text-muted-foreground">Multi-theme only (2+ themes)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.macroWarningOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, macroWarningOnly: e.target.checked })}
                                    className="w-4 h-4 rounded border-border accent-red-500"
                                />
                                <span className="text-xs font-medium text-muted-foreground">⚠ Macro warning only</span>
                            </label>
                        </Section>

                        {/* Paradigm Apply/Reset */}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={handleParadigmApply}
                                className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded shadow transition-colors"
                            >
                                Apply Paradigm
                            </button>
                            <button
                                onClick={handleParadigmReset}
                                className="flex-1 px-2 py-2 bg-muted hover:bg-destructive/10 hover:text-destructive text-muted-foreground text-xs font-medium rounded border border-border transition-colors"
                            >
                                Reset
                            </button>
                        </div>
                    </>
                )}

                {screenMode === 'youtube' && (
                    <>
                        <Section title="Video Strategy">
                            <div className="space-y-1.5">
                                {YOUTUBE_FILTERS.map(filter => (
                                    <button
                                        key={filter.value}
                                        type="button"
                                        onClick={() => setYoutubeFilter?.(filter.value)}
                                        className={clsx(
                                            "w-full rounded-md border px-3 py-2 text-left text-xs font-bold transition-all",
                                            youtubeFilter === filter.value
                                                ? "border-red-500/50 bg-red-500/15 text-red-300"
                                                : "border-border/50 bg-secondary/40 text-muted-foreground hover:border-red-400/40 hover:text-foreground"
                                        )}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                        </Section>
                    </>
                )}

                {/* 100-Bagger controls (shown only in 100-bagger mode) */}
                {screenMode !== 'reverse' && screenMode !== 'paradigm' && screenMode !== 'youtube' && (
                <>
                {/* Size & Price */}
                <Section title={t('sizePrice')}>
                    <InputGroup 
                        label={`${t('minMarketCap')} (${market === 'Korea' ? 'B ₩' : 'M $'})`} 
                        value={localFilters.minMarketCap} 
                        onChange={(v) => handleChange("minMarketCap", v)} 
                        strictValue={STRICT_FILTERS.minMarketCap} field="minMarketCap" defs={filterDefs} 
                        min={0} max={market === 'Korea' ? 100000 : 5000} step={market === 'US' ? 10 : 100} 
                    />
                    <InputGroup 
                        label={`${t('maxMarketCap')} (${market === 'Korea' ? 'B ₩' : 'B $'})`} 
                        value={localFilters.maxMarketCap} 
                        onChange={(v) => handleChange("maxMarketCap", v)} 
                        strictValue={STRICT_FILTERS.maxMarketCap} field="maxMarketCap" defs={filterDefs} 
                        min={0} max={market === 'Korea' ? 200000 : 10000} step={100} 
                    />
                    <InputGroup 
                        label={`${t('maxPrice')} (${market === 'Korea' ? '₩' : '$'})`} 
                        value={localFilters.maxPrice} 
                        onChange={(v) => handleChange("maxPrice", v)} 
                        strictValue={STRICT_FILTERS.maxPrice} field="maxPrice" defs={filterDefs} 
                        min={0} max={market === 'Korea' ? 1000000 : 1000} step={market === 'US' ? 1 : 10} 
                    />
                    <InputGroup 
                        label={`${t('maxFloat')} (M)`} 
                        value={localFilters.maxFloat} 
                        onChange={(v) => handleChange("maxFloat", v)} 
                        strictValue={STRICT_FILTERS.maxFloat} field="maxFloat" defs={filterDefs} 
                        min={0} max={5000} step={10} 
                    />
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
                </>
                )}

                <div className="text-center text-xs text-muted-foreground mt-8 pb-20">
                    {screenMode === 'reverse' ? `${totalResults} Reverse candidates`
                        : screenMode === 'paradigm' ? `${totalResults} Paradigm candidates`
                        : screenMode === 'youtube' ? `${totalResults} YouTube strategy candidates`
                        : `${t('showing')} ${totalResults} ${t('assets')}`}
                </div>
            </div>

            {/* Sticky Actions Footer — show only for 100-bagger mode */}
            {screenMode !== 'reverse' && screenMode !== 'paradigm' && screenMode !== 'youtube' && (
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
                        className="flex-1 px-2 py-2 bg-muted hover:bg-destructive/10 hover:text-destructive text-muted-foreground text-xs font-medium rounded border border-border transition-colors"
                    >
                        {t('reset')}
                    </button>
                </div>
            </div>
            )}
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
                        <span className="text-[10px] text-muted-foreground/80 font-mono">Strict: {strictValue}</span>
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
