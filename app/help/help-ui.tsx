// Shared presentational helpers for the /help page. Used by the English, Korean and Chinese
// bodies so all three render with identical styling. Desk editorial style: rules and whitespace,
// text glyphs, no icon tiles, no cards (handoff README 5.7 and 3.2). Colours are the desk tokens,
// so the page is correct only inside the desk Shell's `.theme-light` scope.

import Link from 'next/link';
import { FAMILY, GATE_REASON_LABEL } from '@/lib/desk/tone';

/** A section: 1 px ink top rule, 14 px 600 header (handoff README 3.2). */
export function Section({ id, title, children }: {
    id: string; title: string; children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-6 border-t border-ink pt-3.5">
            <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
            <div className="mt-2.5 space-y-3 text-[13.5px] leading-[1.55] text-ink-q">
                {children}
            </div>
        </section>
    );
}

export function SubHeading({ id, children }: { id?: string; children: React.ReactNode }) {
    return (
        <h3 id={id} className="scroll-mt-6 pt-2 text-[13px] font-semibold text-ink">{children}</h3>
    );
}

/** An in-page or in-site link: the accent colour is the "interactive affordance" token. */
export function A({ href, children }: { href: string; children: React.ReactNode }) {
    const cls = 'text-accent hover:text-ink hover:underline';
    return href.startsWith('#')
        ? <a href={href} className={cls}>{children}</a>
        : <Link href={href} className={cls}>{children}</Link>;
}

/**
 * A notice, in the desk's banner styles: warn = amber tint with a 2 px amber left rule; info = the
 * recessed panel with a 2 px grey left rule; tip = the recessed panel with a 2 px ink rule.
 */
export function Callout({ kind, children }: { kind: 'tip' | 'warn' | 'info'; children: React.ReactNode }) {
    const styles = {
        tip: 'border-ink bg-page',
        warn: 'border-warn bg-warn/10',
        info: 'border-off bg-page',
    }[kind];
    return (
        <div className={`border-l-2 px-3.5 py-2.5 text-[13px] leading-[1.55] text-ink-q ${styles}`}>
            {children}
        </div>
    );
}

/** The swatches of the colour key, in the order the three languages list their rows. */
const KEY_SWATCH = [
    'var(--accent)',      // blue: the list, selection
    FAMILY.quality,       // violet: Quality
    FAMILY.value,         // teal: Value
    FAMILY.momentum,      // pink: Trend
    'var(--pos)',         // green: good
    'var(--fair)',        // neutral ink: fair
    'var(--neg)',         // coral: bad
    'var(--warn)',        // amber: warning
    'var(--off)',         // grey: does not count
] as const;

/** The colour key as a table: swatch and name, then what it means. `rows` follows KEY_SWATCH. */
export function ColourKey({ rows }: { rows: { name: string; text: React.ReactNode }[] }) {
    return (
        <table className="w-full border-t border-rule-14 text-left text-[13px]">
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i} className="border-b border-rule-10 align-baseline">
                        <th scope="row" className="w-[34%] whitespace-nowrap py-1.5 pr-3 align-baseline font-semibold text-ink sm:w-[22%]">
                            <span aria-hidden className="mr-1.5" style={{ color: KEY_SWATCH[i] }}>●</span>
                            {r.name}
                        </th>
                        <td className="py-1.5 align-baseline text-ink-q">{r.text}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/**
 * Every gate reason code with its wording, rendered from the Desk's own constant
 * (lib/desk/tone.ts GATE_REASON_LABEL) so this list cannot drift from what a blocked row says.
 */
export function GateReasons() {
    return (
        <dl className="border-t border-rule-14">
            {Object.entries(GATE_REASON_LABEL).map(([code, label]) => (
                <div key={code} className="grid grid-cols-1 gap-x-4 border-b border-rule-10 py-1.5 sm:grid-cols-[minmax(0,250px)_minmax(0,1fr)]">
                    <dt className="break-words font-mono text-[11px] leading-[1.7] text-ink-2">{code}</dt>
                    <dd className="text-[13px] text-ink-q">{label}</dd>
                </div>
            ))}
        </dl>
    );
}

/** One door of the screen: a colour square in the door's family colour, then its title and text. */
export function DoorCard({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
    return (
        <div className="border-t border-rule-14 pt-2">
            <p className="font-semibold text-ink">
                <span aria-hidden className="mr-1.5" style={{ color }}>■</span>
                {title}
            </p>
            <p className="mt-1">{children}</p>
        </div>
    );
}
