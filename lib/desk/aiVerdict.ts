// The one AI verdict a Desk row shows: Gemini's when Gemini has analysed the name, else Claude's, else none.
// A Gemini row whose analysis did not run (a refusal) is not a verdict and never hides Claude's.
// Pure, no React.

import type { OpusVerdictCode } from '@/lib/data-service';
import type { DeskRow } from './rankings';

/** gemini and opus: the filings read (gemini_c files; the row's model says which); claude: Claude's valuation (opus_overlay). */
export type AiSource = 'gemini' | 'opus' | 'claude';

export function aiVerdict(r: Pick<DeskRow, 'geminiC' | 'opus'>): { verdict: OpusVerdictCode; source: AiSource } | null {
    if (r.geminiC && r.geminiC.analysis !== 'not run') return { verdict: r.geminiC.verdict, source: (r.geminiC.model ?? '').includes('claude') ? 'opus' : 'gemini' };
    if (r.opus) return { verdict: r.opus.verdict, source: 'claude' };
    return null;
}
