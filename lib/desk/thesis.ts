// The depth engine writes no thesis field, so the desk quotes the model instead
// of paraphrasing it: every transcript opens with a `HEADLINE (numbers first):`
// block, and those bullets are the analyst's own summary of the case.
//
// Nothing here invents text. If a transcript has no headline block, the caller
// falls back to the reverse-DCF verdict sentence, and if that is missing too the
// detail page simply shows no thesis.

export interface Headline {
    bullets: string[];
    action: string | null;
    sample: number | null;
}

const TAG_RE = /\s*\[(Actual|Estimate|Unconfirmed|Assumption)[^\]]*\]/gi;

/** Strip the provenance tags the model appends to each claim. */
export function stripTags(line: string): string {
    return line.replace(TAG_RE, '').replace(/\s{2,}/g, ' ').trim();
}

/** Pull the HEADLINE block out of one raw transcript. */
export function parseHeadline(report: string | null | undefined, sample: number | null = null): Headline | null {
    if (!report) return null;
    const idx = report.search(/HEADLINE[^\n]*:/i);
    if (idx < 0) return null;

    const body = report.slice(report.indexOf('\n', idx) + 1);
    const bullets: string[] = [];
    let action: string | null = null;

    for (const raw of body.split('\n')) {
        const line = raw.replace(/\r$/, '');
        if (!line.trim()) break;                    // blank line ends the block
        if (/^\s{2,}[•·]/.test(line)) continue;     // sub-bullets are detail, not headline
        const m = line.match(/^\s*[-–]\s+(.*)$/);
        if (!m) break;                              // any non-bullet ends the block
        const text = stripTags(m[1]);
        if (!text) continue;
        const act = text.match(/^ACTION:\s*(.+)$/i);
        if (act) { action = act[1].trim(); continue; }
        bullets.push(text);
    }

    if (!bullets.length && !action) return null;
    return { bullets, action, sample };
}

export interface DepthSampleLike {
    sample: number;
    plausible: boolean;
    report?: string | null;
    iv?: number | null;
}

/** Headline from the first sample that passed the plausibility guards. */
export function headlineFromSamples(samples: DepthSampleLike[] | undefined | null): Headline | null {
    if (!samples?.length) return null;
    const ordered = [...samples].sort((a, b) => Number(b.plausible) - Number(a.plausible) || a.sample - b.sample);
    for (const s of ordered) {
        const h = parseHeadline(s.report, s.sample);
        if (h) return h;
    }
    return null;
}
