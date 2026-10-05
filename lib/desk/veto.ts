// Plain-English names for the screen's veto codes (`fct_veto`, `fct_llm_veto`). Unknown codes show
// as the code in lower case with spaces, never blank.
import type { TRANSLATIONS } from '@/lib/i18n';

type Key = keyof typeof TRANSLATIONS['en'];

const VETO_KEY: Record<string, Key> = {
    NOT_TRADABLE: 'vetoNotTradable',
    MARKET_CAP_BELOW_300M: 'vetoSmall',
    PRICE_BELOW_3: 'vetoPenny',
    ILLIQUID_ADV_BELOW_300K: 'vetoIlliquid',
    NON_OPERATING_SHELL_SPAC: 'vetoShell',
    FORENSIC_MANIPULATION_RISK: 'vetoForensic',
    NO_FUNDAMENTAL_HISTORY: 'vetoNoHistory',
    CHRONIC_OPERATING_LOSS_LEVERAGE: 'vetoLossLeverage',
    FAILED_TIER1_HYGIENE: 'vetoHygiene',
    llm_reject: 'vetoLlmReject',
};

/** i18n key for a veto code, or null when the code is not one we have words for. */
export const vetoKey = (code: string): Key | null => VETO_KEY[code] ?? null;

/** Fallback text for a code with no gloss. */
export const vetoFallback = (code: string): string => code.toLowerCase().replace(/_/g, ' ');

/** The veto code a row carries, screen veto first. */
export function vetoCodeOf(e: { fct_veto?: string | null; fct_llm_veto?: string | null }): string | null {
    return e.fct_veto || e.fct_llm_veto || null;
}
