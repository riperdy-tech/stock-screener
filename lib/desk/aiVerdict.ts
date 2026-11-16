// The one AI verdict a Desk row shows: the filings read's (Gemini or Claude Opus) when it gives one, else Claude's
// valuation's, else none. A read that did not run, or that ended in no call (the valuation code could not value the
// name), never hides a BUY, WATCH or AVOID from Claude's valuation; a no call is shown only when neither has a verdict.
// Pure, no React.

import type { OpusVerdictCode } from '@/lib/data-service';
import type { DeskRow } from './rankings';

/** gemini and opus: the filings read (gemini_c files; the row's model says which); claude: Claude's valuation (opus_overlay). */
export type AiSource = 'gemini' | 'opus' | 'claude';

export function aiVerdict(r: Pick<DeskRow, 'geminiC' | 'opus'>): { verdict: OpusVerdictCode; source: AiSource } | null {
    const read = r.geminiC && r.geminiC.analysis !== 'not run'
        ? { verdict: r.geminiC.verdict, source: ((r.geminiC.model ?? '').includes('claude') ? 'opus' : 'gemini') as AiSource }
        : null;
    const quick = r.opus ? { verdict: r.opus.verdict, source: 'claude' as AiSource } : null;
    if (read && read.verdict !== 'NO_CALL') return read;
    if (quick && quick.verdict !== 'NO_CALL') return quick;
    return read ?? quick;
}
