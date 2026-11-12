// Plain words for the reason a Qwen row has no value (qwen_overlay.json `no_value_reason`).
// Most reasons are already one plain clause, written by rs2-local tools/site/qwen_site.py. A refusal or pipeline error
// arrives as its raw exception text ("packet refused: PacketRefused: ticker_not_in_factor_profiles: ... at <commit>").
// Those are mapped to one clause each; an unknown technical string gets a generic clause, never the raw text.

const GENERIC = 'the analysis could not be completed for a technical reason';

const REFUSALS: { match: RegExp; text: string }[] = [
    { match: /ticker_not_in_factor_profiles/i, text: "the company was not in the screener's data when the reading was prepared" },
    { match: /fetch ?failed|time(d)? ?out/i, text: 'a filing download timed out' },
    { match: /input_missing/i, text: 'a figure the valuation needs is missing from the filings' },
    { match: /debt_unavailable/i, text: "the company's debt is not available in the filed data" },
];

/** True for an exception string or a bare snake_case code; false for a sentence already written for readers. */
const isTechnical = (s: string): boolean =>
    /^(packet refused|pipeline error)\b/i.test(s)
    || /^[a-z0-9_]+$/.test(s)
    || /^[A-Za-z0-9_.]+: /.test(s)
    || /\b[A-Za-z]+(Error|Exception|Refused|Refusal|Failed)\b/.test(s)
    || /https?:\/\//i.test(s);

/** The reason as one plain clause; null when there is none. Plain reasons pass through unchanged. */
export function plainNoValueReason(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const s = raw.trim();
    if (s === '') return null;
    if (!isTechnical(s)) return s;
    return REFUSALS.find((r) => r.match.test(s))?.text ?? GENERIC;
}
