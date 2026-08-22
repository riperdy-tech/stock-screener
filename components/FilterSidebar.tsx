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
    youtubeFilters?: YoutubeStrategyFilter[];
    onYoutubeFilterToggle?: (f: YoutubeStrategyFilter) => void;
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

export function FilterSidebar({ filters, setFilters, isOpen, onClose, totalResults, market, screenMode, reverseFilters, setReverseFilters, paradigmFilters, setParadigmFilters, youtubeFilters = ["any"], onYoutubeFilterToggle, batchN, onBatchNChange, batchDispatching, batchStatus, onDeepDiveClick, selectedCount }: FilterSidebarProps) {
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
    const activeLensTitle = screenMode === 'reverse' ? t('strategyReverseTitle')
        : screenMode === 'paradigm' ? t('strategyParadigmTitle')
            : screenMode === 'youtube' ? t('strategyYoutubeTitle')
                : t('strategy100Title');
    const activeLensBody = screenMode === 'reverse'
        ? t('lensBodyReverse')
        : screenMode === 'paradigm'
            ? t('lensBodyParadigm')
            : screenMode === 'youtube'
                ? t('lensBodyYoutube')
                : t('lensBody100');
    const resultLabel = screenMode === 'reverse' ? t('reverseCandidates')
        : screenMode === 'paradigm' ? t('paradigmCandidates')
            : screenMode === 'youtube' ? t('youtubeCandidates')
                : t('assets');

    return (
        <div className={clsx(
            "fixed inset-y-0 left-0 z-50 w-[min(22.5rem,100vw)] bg-surface -3xl border-r border-rule-6 flex flex-col h-[100dvh] overflow-hidden shrink-0  transition-transform duration-300 md:relative md:translate-x-0 md:z-40 md:bg-surface",
            isOpen ? "translate-x-0" : "-translate-x-full"
        )}>
            <div className="p-3 border-b border-rule-6 flex justify-between items-center bg-white/5">
                <div className="flex items-center gap-2 text-base font-extrabold">
                    <Filter className="h-5 w-5 text-accent" />
                    {t('filters')}
                </div>
                <button onClick={onClose} className="md:hidden p-2 focus:outline-none hover:bg-destructive/20 hover:text-destructive transition-colors border border-transparent hover:border-destructive/30">
                     <X className="h-5 w-5" />
                </button>
            </div>

            <div className="filter-section-list flex-1 overflow-y-auto p-2.5 space-y-2.5">
                <div className="border border-rule-6 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-xs font-extrabold uppercase tracking-wider text-ink-2">{t('activeLens')}</div>
                            <div className="mt-1 truncate text-sm font-extrabold text-ink">
                                {activeLensTitle}
                            </div>
                        </div>
                        <div className="shrink-0 text-right">
                            <div className="font-mono text-xl font-extrabold leading-none text-accent">{totalResults.toLocaleString()}</div>
                            <div className="mt-1 text-xs font-bold uppercase tracking-wider text-ink-2">{resultLabel}</div>
                        </div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">
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
                                            "px-2.5 py-1.5 text-sm font-bold  border transition-all",
                                            localReverseFilters.archetypes.includes(arch)
                                                ? "border-pos/40 bg-pos/10 text-pos "
                                                : "bg-white/5 border-rule-6 text-ink-2 hover:border-accent/40"
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
                                            "px-2.5 py-1.5 text-sm font-bold  border transition-all",
                                            localReverseFilters.bands.includes(band)
                                                ? band === 'High' ? "bg-pos/10 text-pos border-pos/40"
                                                : band === 'Solid' ? "bg-accent/10 text-accent border-accent/40"
                                                : band === 'Watchlist' ? "bg-warn/10 text-warn border-warn/40"
                                                : band === 'Monitor' ? "bg-white/5 text-ink-2 border-rule-14"
                                                : "bg-white/5 text-ink-2 border-rule-6"
                                                : "bg-white/5 border-rule-6 text-ink-2 hover:border-accent/40"
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
                            <label className="flex items-center gap-3 cursor-pointer border border-rule-6 bg-white/5 px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={localReverseFilters.nominatedOnly}
                                    onChange={(e) => setLocalReverseFilters({ ...localReverseFilters, nominatedOnly: e.target.checked })}
                                    className="h-4 w-4 border-rule-9 accent-amber-500"
                                />
                                <span className="text-sm font-medium text-ink-2">Nominated only</span>
                            </label>
                        </Section>

                        {/* Phase 11d: Deep-Dive */}
                        <Section title="Deep-Dive (v3.2)">
                            <p className="text-sm text-ink-2 mb-2">Click cards to select stocks, or use N below for top-ranked.</p>
                            <div className="flex items-center gap-3">
                                <select
                                    value={(batchN && [5,10,25].includes(batchN)) ? batchN : 0}
                                    onChange={(e) => { const v = Number(e.target.value); if (v > 0 && onBatchNChange) onBatchNChange(v); }}
                                    className="border border-rule-6 bg-white/5 px-3 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                                    className="w-20 border border-rule-6 bg-white/5 px-2.5 py-2 text-center text-sm font-bold text-ink focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>
                            <button
                                onClick={onDeepDiveClick}
                                disabled={batchDispatching}
                                className="mt-3 flex w-full items-center justify-center gap-2 bg-accent px-3 py-2 text-sm font-extrabold text-surface transition-all hover:bg-accent/80 active:scale-95 disabled:opacity-50"
                            >
                                <Sparkles className="h-4 w-4" />
                                {batchDispatching ? 'Dispatching...' : selectedCount && selectedCount > 0 ? `Deep-Dive Selected (${selectedCount})` : `Deep-Dive Top ${batchN || 25}`}
                            </button>
                            {batchStatus && (
                                <p className={clsx(
                                    "text-sm mt-1",
                                    batchStatus.startsWith("Error") ? "text-neg" : "text-pos"
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
                                    { id: 'high', label: 'STRONG', cls: 'bg-pos/10 text-pos border-pos/40' },
                                    { id: 'mid', label: 'SOLID', cls: 'bg-accent/10 text-accent border-accent/40' },
                                    { id: 'watch', label: 'WATCH', cls: 'bg-warn/10 text-warn border-warn/40' },
                                    { id: 'skip', label: 'PASS', cls: 'bg-white/5 text-ink-2 border-rule-14' },
                                ].map(({ id, label, cls }) => (
                                    <button
                                        key={id}
                                        onClick={() => toggleParadigmBand(id)}
                                        className={clsx(
                                            "px-2.5 py-1.5 text-sm font-bold  border transition-all",
                                            localParadigmFilters.bands.includes(id)
                                                ? cls
                                                : "bg-white/5 border-rule-6 text-ink-2 hover:border-accent/40"
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
                                            " border px-3 py-2 text-sm font-mono transition-all",
                                            localParadigmFilters.themes.includes(theme)
                                                ? "bg-white/5 text-ink-2 border-rule-14"
                                                : "bg-white/5 border-rule-6 text-ink-2 hover:border-rule-14"
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
                                className="w-full bg-white/5 border border-rule-6 text-ink text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                            />
                            <p className="text-sm text-ink-2 mt-1">Case-insensitive substring match on Yahoo industry name.</p>
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
                            <label className="flex items-center gap-3 cursor-pointer border border-rule-6 bg-white/5 px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.acceleratingOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, acceleratingOnly: e.target.checked })}
                                    className="h-4 w-4 border-rule-9 accent-emerald-500"
                                />
                                <span className="text-sm font-medium text-ink-2">Accelerating only</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer border border-rule-6 bg-white/5 px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.bridgedOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, bridgedOnly: e.target.checked })}
                                    className="h-4 w-4 border-rule-9 accent-blue-500"
                                />
                                <span className="text-sm font-medium text-ink-2">Forward-EPS bridged only</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer border border-rule-6 bg-white/5 px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.multiThemeOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, multiThemeOnly: e.target.checked })}
                                    className="h-4 w-4 border-rule-9 accent-purple-500"
                                />
                                <span className="text-sm font-medium text-ink-2">Multi-theme only (2+ themes)</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer border border-rule-6 bg-white/5 px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={localParadigmFilters.macroWarningOnly}
                                    onChange={(e) => setLocalParadigmFilters({ ...localParadigmFilters, macroWarningOnly: e.target.checked })}
                                    className="h-4 w-4 border-rule-9 accent-red-500"
                                />
                                <span className="text-sm font-medium text-ink-2">Macro warning only</span>
                            </label>
                        </Section>

                    </>
                )}

                {screenMode === 'youtube' && (
                    <>
                        <Section title="Video Strategy">
                            <div className="space-y-1.5">
                                {YOUTUBE_FILTERS.map(filter => {
                                    const isActive = youtubeFilters.includes(filter.value);
                                    return (
                                        <button
                                            key={filter.value}
                                            type="button"
                                            onClick={() => onYoutubeFilterToggle?.(filter.value)}
                                            className={clsx(
                                                "flex w-full items-center justify-between gap-2  border px-3 py-2 text-left text-sm font-bold transition-all",
                                                isActive
                                                    ? "border-neg/40 bg-neg/10 text-neg"
                                                    : "border-rule-6 bg-white/5 text-ink-2 hover:border-neg/40 hover:text-ink"
                                            )}
                                        >
                                            <span>{filter.label}</span>
                                            {isActive && <span className="h-2 w-2 bg-red-300" />}
                                        </button>
                                    );
                                })}
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

                <div className="text-center text-sm text-ink-2 mt-8 pb-20">
                    {screenMode === 'reverse' ? `${totalResults} ${t('reverseCandidates')}`
                        : screenMode === 'paradigm' ? `${totalResults} ${t('paradigmCandidates')}`
                        : screenMode === 'youtube' ? `${totalResults} ${t('youtubeCandidates')}`
                        : `${t('showing')} ${totalResults} ${t('assets')}`}
                </div>
            </div>

            {/* Sticky Actions Footer */}
            {screenMode === 'reverse' && (
                <SidebarActions
                    primaryLabel={t('applyReverse')}
                    onPrimary={handleReverseApply}
                    onReset={handleReverseReset}
                    tone="emerald"
                    resetLabel={t('reset')}
                    contextLabel={t('reverseCandidates')}
                    contextValue={totalResults}
                    currentViewLabel={t('currentView')}
                    resultsLabel={t('results')}
                />
            )}
            {screenMode === 'paradigm' && (
                <SidebarActions
                    primaryLabel={t('applyParadigm')}
                    onPrimary={handleParadigmApply}
                    onReset={handleParadigmReset}
                    tone="purple"
                    resetLabel={t('reset')}
                    contextLabel={t('paradigmCandidates')}
                    contextValue={totalResults}
                    currentViewLabel={t('currentView')}
                    resultsLabel={t('results')}
                />
            )}
            {screenMode === 'youtube' && (
                <div className="sticky bottom-0 z-10 border-t border-rule-6 bg-surface p-3">
                    <div className="flex items-center justify-between gap-3 border border-neg/40 bg-neg/10] px-3 py-2">
                        <div>
                            <div className="text-xs font-extrabold uppercase tracking-wider text-ink-2">{t('liveYoutubeFilter')}</div>
                            <div className="mt-1 text-sm font-bold text-neg">{t('updatesInstantly')}</div>
                        </div>
                        <div className="text-right">
                            <div className="font-mono text-xl font-extrabold text-ink">{totalResults.toLocaleString()}</div>
                            <div className="text-xs font-bold text-ink-2">{t('matches')}</div>
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
                    currentViewLabel={t('currentView')}
                    resultsLabel={t('results')}
                />
            )}
        </div>
    );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <section className="filter-section border border-rule-6 bg-page p-2.5">
            <h3 className="filter-section-title flex items-center gap-3 text-sm font-extrabold text-ink">{title}</h3>
            <div className="mt-2 space-y-2.5">
                {children}
            </div>
        </section>
    )
}

function SidebarActions({ primaryLabel, onPrimary, onReset, tone, resetLabel = "Reset", contextLabel, contextValue, currentViewLabel = "Current view", resultsLabel = "results" }: { primaryLabel: string; onPrimary: () => void; onReset: () => void; tone: "emerald" | "primary" | "purple"; resetLabel?: string; contextLabel?: string; contextValue?: number; currentViewLabel?: string; resultsLabel?: string }) {
    const primaryClass = tone === "emerald"
        ? "bg-accent text-surface hover:bg-accent/80"
        : tone === "purple"
            ? "bg-purple-600 text-surface hover:bg-purple-500"
            : "border border-pos/40 bg-pos/10 text-pos hover:bg-pos/10";

    return (
        <div className="sticky bottom-0 z-10 border-t border-rule-6 bg-surface p-3">
            {contextLabel && contextValue !== undefined && (
                <div className="mb-3 flex items-center justify-between gap-3 border border-rule-6 bg-white/5 px-3 py-2">
                    <div>
                        <div className="text-xs font-extrabold uppercase tracking-wider text-ink-2">{currentViewLabel}</div>
                        <div className="mt-1 text-sm font-bold text-ink">{contextLabel}</div>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-lg font-extrabold text-accent">{contextValue.toLocaleString()}</div>
                        <div className="text-xs font-bold text-ink-2">{resultsLabel}</div>
                    </div>
                </div>
            )}
            <div className="flex gap-3">
                <button
                    onClick={onPrimary}
                    className={clsx("flex-1  px-3 py-2 text-sm font-extrabold  transition-colors", primaryClass)}
                >
                    {primaryLabel}
                </button>
                <button
                    onClick={onReset}
                    className="flex-1 border border-rule-9 bg-muted px-3 py-2 text-sm font-bold text-ink-2 transition-colors hover:bg-destructive/10 hover:text-destructive"
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
            <div className="mb-1.5 flex items-start justify-between gap-3">
                <div className="flex items-center gap-1.5 group relative cursor-help w-fit">
                    <label className="text-xs font-bold text-ink-2 group-hover/input:text-ink transition-colors">{label}</label>
                    {field && <HelpCircle className="h-3.5 w-3.5 shrink-0 text-ink-2/50 group-hover:text-accent transition-colors" />}

                    {/* Tooltip */}
                    {field && defs && (
                        <div className="absolute left-0 bottom-full mb-2 w-56 p-3 bg-page border border-rule-9 text-sm text-ink-2 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                            {defs[field] || "Filter criteria"}
                            <div className="absolute bottom-[-4px] left-4 w-2 h-2 bg-[#1a1a1a] border-r border-b border-rule-9 transform rotate-45"></div>
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {strictValue !== undefined && (
                        <span className="border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-xs font-extrabold text-warn">
                            Strict {formatRangeBound(strictValue)}
                        </span>
                    )}
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-24 border border-rule-6 bg-white/5 px-2 py-1.5 text-right font-mono text-xs transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-primary"
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
                className={`w-full h-1.5 bg-white/5  appearance-none cursor-pointer outline-none transition-all
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]: ${isStrict ? '[&::-webkit-slider-thumb]:bg-warning [&::-webkit-slider-thumb]:' : '[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:'}
                hover:[&::-webkit-slider-thumb]:scale-125 hover:[&::-webkit-slider-thumb]:transition-transform`}
            />
            <div className="mt-2 flex items-center justify-between font-mono text-xs font-bold text-ink-3">
                <span>{formatRangeBound(min)}</span>
                <span>{formatRangeBound(max)}</span>
            </div>
            {hint && <div className="text-xs text-ink-3 mt-1">{hint}</div>}
        </div>
    )
}

function formatRangeBound(value: number): string {
    if (Math.abs(value) >= 1000) return value.toLocaleString();
    return String(value);
}
