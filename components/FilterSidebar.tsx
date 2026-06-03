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
    const activeLensTitle = screenMode === 'reverse' ? 'Reverse Engine'
        : screenMode === 'paradigm' ? 'Paradigm Themes'
            : screenMode === 'youtube' ? 'YouTube Strategy'
                : '100-Bagger';
    const activeLensBody = screenMode === 'reverse'
        ? 'Quality, valuation, survivability, and composite filters.'
        : screenMode === 'paradigm'
            ? 'Theme, conviction, momentum, and economics filters.'
            : screenMode === 'youtube'
                ? 'Video strategy playbooks update immediately.'
                : 'Strict growth, valuation, float, and ownership gates.';
    const resultLabel = screenMode === 'reverse' ? 'Reverse candidates'
        : screenMode === 'paradigm' ? 'Paradigm candidates'
            : screenMode === 'youtube' ? 'YouTube candidates'
                : t('assets');

    return (
        <div className={clsx(
            "fixed inset-y-0 left-0 z-50 w-[min(27rem,100vw)] bg-card/95 backdrop-blur-3xl border-r border-border/50 flex flex-col h-[100dvh] overflow-hidden shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.8)] transition-transform duration-300 md:relative md:translate-x-0 md:z-40 md:bg-card/80",
            isOpen ? "translate-x-0" : "-translate-x-full"
        )}>
            <div className="p-5 border-b border-border/50 flex justify-between items-center bg-muted/40">
                <div className="flex items-center gap-2 text-xl font-black">
                    <Filter className="h-6 w-6 text-primary" />
                    {t('filters')}
                </div>
                <button onClick={onClose} className="md:hidden p-2 focus:outline-none hover:bg-destructive/20 hover:text-destructive rounded-md transition-colors border border-transparent hover:border-destructive/30">
                     <X className="h-5 w-5" />
                </button>
            </div>

            <div className="filter-section-list flex-1 overflow-y-auto p-4 space-y-4">
                <div className="rounded-xl border border-border/60 bg-secondary/25 p-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-base font-black uppercase tracking-wider text-muted-foreground">Active lens</div>
                            <div className="mt-1 truncate text-xl font-black text-foreground">
                                {activeLensTitle}
                            </div>
                        </div>
                        <div className="shrink-0 text-right">
                            <div className="font-mono text-3xl font-black leading-none text-primary">{totalResults.toLocaleString()}</div>
                            <div className="mt-1 text-base font-bold uppercase tracking-wider text-muted-foreground">{resultLabel}</div>
                        </div>
                    </div>
                    <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                        {activeLensBody}
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
                                            "px-3 py-2 text-base font-bold rounded-md border transition-all",
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
                                            "px-3 py-2 text-base font-bold rounded-md border transition-all",
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
                            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border/50 bg-secondary/20 px-3 py-2.5">
                                <input
                                    type="checkbox"
                                    checked={localReverseFilters.nominatedOnly}
                                    onChange={(e) => setLocalReverseFilters({ ...localReverseFilters, nominatedOnly: e.target.checked })}
                                    className="w-5 h-5 rounded border-border accent-amber-500"
                                />
                                <span className="text-base font-medium text-muted-foreground">Nominated only</span>
                            </label>
                        </Section>

                        {/* Phase 11d: Deep-Dive */}
                        <Section title="Deep-Dive (v3.2)">
                            <p className="text-base text-muted-foreground mb-2">Click cards to select stocks, or use N below for top-ranked.</p>
                            <div className="flex items-center gap-3">
                                <select
                                    value={(batchN && [5,10,25].includes(batchN)) ? batchN : 0}
                                    onChange={(e) => { const v = Number(e.target.value); if (v > 0 && onBatchNChange) onBatchNChange(v); }}
                                    className="rounded-md border border-border/70 bg-secondary/40 px-3.5 py-2.5 text-base font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                                    className="w-24 rounded-md border border-border/70 bg-secondary/40 px-3 py-2.5 text-center text-base font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>
                            <button
                                onClick={onDeepDiveClick}
                                disabled={batchDispatching}
                                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-base font-black text-white transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
                            >
                                <Sparkles className="h-4 w-4" />
                                {batchDispatching ? 'Dispatching...' : selectedCount && selectedCount > 0 ? `Deep-Dive Selected (${selectedCount})` : `Deep-Dive Top ${batchN || 25}`}
                            </button>
                            {batchStatus && (
                                <p className={clsx(
                                    "text-base mt-1",
                                    batchStatus.startsWith("Error") ? "text-red-400" : "text-emerald-400"
                                )}>{batchStatus}</p>
                            )}
                        </Section>

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
                                            "px-3 py-2 text-base font-bold rounded-md border transition-all",
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
                                            "rounded-md border px-3.5 py-2.5 text-base font-mono transition-all",
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
                                className="w-full bg-secondary/40 border border-border/70 text-foreground text-base rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                            />
                            <p className="text-base text-muted-foreground mt-1">Case-insensitive substring match on Yahoo industry name.</p>
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
                            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border/50 bg-secondary/20 px-3 py-2.5">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.acceleratingOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, acceleratingOnly: e.target.checked })}
                                    className="w-5 h-5 rounded border-border accent-emerald-500"
                                />
                                <span className="text-base font-medium text-muted-foreground">Accelerating only</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border/50 bg-secondary/20 px-3 py-2.5">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.bridgedOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, bridgedOnly: e.target.checked })}
                                    className="w-5 h-5 rounded border-border accent-blue-500"
                                />
                                <span className="text-base font-medium text-muted-foreground">Forward-EPS bridged only</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border/50 bg-secondary/20 px-3 py-2.5">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.multiThemeOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, multiThemeOnly: e.target.checked })}
                                    className="w-5 h-5 rounded border-border accent-purple-500"
                                />
                                <span className="text-base font-medium text-muted-foreground">Multi-theme only (2+ themes)</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border/50 bg-secondary/20 px-3 py-2.5">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.macroWarningOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, macroWarningOnly: e.target.checked })}
                                    className="w-5 h-5 rounded border-border accent-red-500"
                                />
                                <span className="text-base font-medium text-muted-foreground">Macro warning only</span>
                            </label>
                        </Section>

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
                                            "w-full rounded-md border px-3 py-2.5 text-left text-base font-bold transition-all",
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
                        label={`${t('minMarketCap')} (${market === 'Korea' ? 'B KRW' : 'M $'})`}
                        value={localFilters.minMarketCap} 
                        onChange={(v) => handleChange("minMarketCap", v)} 
                        strictValue={STRICT_FILTERS.minMarketCap} field="minMarketCap" defs={filterDefs} 
                        min={0} max={market === 'Korea' ? 100000 : 5000} step={market === 'US' ? 10 : 100} 
                    />
                    <InputGroup 
                        label={`${t('maxMarketCap')} (${market === 'Korea' ? 'B KRW' : 'B $'})`}
                        value={localFilters.maxMarketCap} 
                        onChange={(v) => handleChange("maxMarketCap", v)} 
                        strictValue={STRICT_FILTERS.maxMarketCap} field="maxMarketCap" defs={filterDefs} 
                        min={0} max={market === 'Korea' ? 200000 : 10000} step={100} 
                    />
                    <InputGroup 
                        label={`${t('maxPrice')} (${market === 'Korea' ? 'KRW' : '$'})`}
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

                <div className="text-center text-base text-muted-foreground mt-8 pb-20">
                    {screenMode === 'reverse' ? `${totalResults} Reverse candidates`
                        : screenMode === 'paradigm' ? `${totalResults} Paradigm candidates`
                        : screenMode === 'youtube' ? `${totalResults} YouTube strategy candidates`
                        : `${t('showing')} ${totalResults} ${t('assets')}`}
                </div>
            </div>

            {/* Sticky Actions Footer */}
            {screenMode === 'reverse' && (
                <SidebarActions
                    primaryLabel="Apply Reverse"
                    onPrimary={handleReverseApply}
                    onReset={handleReverseReset}
                    tone="emerald"
                    contextLabel="Reverse candidates"
                    contextValue={totalResults}
                />
            )}
            {screenMode === 'paradigm' && (
                <SidebarActions
                    primaryLabel="Apply Paradigm"
                    onPrimary={handleParadigmApply}
                    onReset={handleParadigmReset}
                    tone="purple"
                    contextLabel="Paradigm candidates"
                    contextValue={totalResults}
                />
            )}
            {screenMode === 'youtube' && (
                <div className="sticky bottom-0 z-10 border-t border-border/50 bg-card/80 p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
                        <div>
                            <div className="text-base font-black uppercase tracking-wider text-muted-foreground">Live YouTube filter</div>
                            <div className="mt-1 text-base font-bold text-red-300">Updates instantly</div>
                        </div>
                        <div className="text-right">
                            <div className="font-mono text-2xl font-black text-foreground">{totalResults.toLocaleString()}</div>
                            <div className="text-base font-bold text-muted-foreground">matches</div>
                        </div>
                    </div>
                </div>
            )}
            {screenMode !== 'reverse' && screenMode !== 'paradigm' && screenMode !== 'youtube' && (
                <SidebarActions
                    primaryLabel={t('apply')}
                    onPrimary={handleApply}
                    onReset={handleReset}
                    tone="primary"
                    resetLabel={t('reset')}
                    contextLabel={t('assets')}
                    contextValue={totalResults}
                />
            )}
        </div>
    );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <section className="filter-section rounded-xl border border-border/60 bg-background/20 p-4 shadow-sm">
            <h3 className="filter-section-title flex items-center gap-3 text-xl font-black text-foreground">{title}</h3>
            <div className="mt-4 space-y-4">
                {children}
            </div>
        </section>
    )
}

function SidebarActions({ primaryLabel, onPrimary, onReset, tone, resetLabel = "Reset", contextLabel, contextValue }: { primaryLabel: string; onPrimary: () => void; onReset: () => void; tone: "emerald" | "primary" | "purple"; resetLabel?: string; contextLabel?: string; contextValue?: number }) {
    const primaryClass = tone === "emerald"
        ? "bg-emerald-600 text-white hover:bg-emerald-500"
        : tone === "purple"
            ? "bg-purple-600 text-white hover:bg-purple-500"
            : "bg-primary text-primary-foreground hover:bg-primary/90";

    return (
        <div className="sticky bottom-0 z-10 border-t border-border/50 bg-card/80 p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            {contextLabel && contextValue !== undefined && (
                <div className="mb-3 flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-secondary/25 px-4 py-3">
                    <div>
                        <div className="text-base font-black uppercase tracking-wider text-muted-foreground">Current view</div>
                        <div className="mt-1 text-base font-bold text-foreground">{contextLabel}</div>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-2xl font-black text-primary">{contextValue.toLocaleString()}</div>
                        <div className="text-base font-bold text-muted-foreground">results</div>
                    </div>
                </div>
            )}
            <div className="flex gap-3">
                <button
                    onClick={onPrimary}
                    className={clsx("flex-1 rounded-lg px-4 py-3 text-base font-black shadow transition-colors", primaryClass)}
                >
                    {primaryLabel}
                </button>
                <button
                    onClick={onReset}
                    className="flex-1 rounded-lg border border-border bg-muted px-4 py-3 text-base font-bold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                    {resetLabel}
                </button>
            </div>
        </div>
    );
}

function InputGroup({ label, value, onChange, hint, strictValue, field, defs, min = 0, max = 100, step = 1 }: { label: string, value: number, onChange: (v: string) => void, hint?: string, strictValue?: number, field?: string, defs?: Record<string, string>, min?: number, max?: number, step?: number }) {
    // Dynamically colorize the slider thumb. If it's stricter than the strict limit, it glows warning color!
    const isStrict = strictValue !== undefined && (
        (label.includes('max') && value <= strictValue) ||
        (label.includes('min') && value >= strictValue)
    );

    return (
        <div className="group/input">
            <div className="mb-3 flex items-start justify-between gap-4">
                <div className="flex items-center gap-1.5 group relative cursor-help w-fit">
                    <label className="text-base font-bold text-muted-foreground group-hover/input:text-foreground transition-colors">{label}</label>
                    {field && <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors" />}

                    {/* Tooltip */}
                    {field && defs && (
                        <div className="absolute left-0 bottom-full mb-2 w-56 p-3 bg-[#1a1a1a]/95 backdrop-blur-md border border-border shadow-2xl rounded-md text-base text-gray-300 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                            {defs[field] || "Filter criteria"}
                            <div className="absolute bottom-[-4px] left-4 w-2 h-2 bg-[#1a1a1a] border-r border-b border-border transform rotate-45"></div>
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {strictValue !== undefined && (
                        <span className="rounded border border-warning/30 bg-warning/10 px-2.5 py-1 font-mono text-base font-black text-warning">
                            Strict {formatRangeBound(strictValue)}
                        </span>
                    )}
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-32 rounded border border-border/50 bg-secondary/30 px-3 py-2.5 text-right font-mono text-base transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                className={`w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer outline-none transition-all
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:rounded-full ${isStrict ? '[&::-webkit-slider-thumb]:bg-warning [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(237,137,54,0.8)]' : '[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(59,130,246,0.6)]'}
                hover:[&::-webkit-slider-thumb]:scale-125 hover:[&::-webkit-slider-thumb]:transition-transform`}
            />
            <div className="mt-2 flex items-center justify-between font-mono text-base font-bold text-muted-foreground/70">
                <span>{formatRangeBound(min)}</span>
                <span>{formatRangeBound(max)}</span>
            </div>
            {hint && <div className="text-base text-muted-foreground/60 mt-1">{hint}</div>}
        </div>
    )
}

function formatRangeBound(value: number): string {
    if (Math.abs(value) >= 1000) return value.toLocaleString();
    return String(value);
}
