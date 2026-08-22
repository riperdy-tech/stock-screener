// Shared presentational helpers for the /help page. Used by both the English
// body (in page.tsx) and the Korean body (content-ko.tsx) so both languages
// render with identical styling.

export function Section({ id, title, icon, children }: {
    id: string; title: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-24 border-b border-rule-6 pb-10 last:border-b-0">
            <div className="flex items-center gap-2">
                {icon && <span className="text-pos">{icon}</span>}
                <h2 className="text-xl font-extrabold tracking-tight text-ink">{title}</h2>
            </div>
            <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-q">
                {children}
            </div>
        </section>
    );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="pt-1 text-sm font-extrabold uppercase tracking-wider text-pos">{children}</h3>
    );
}

export function Callout({ kind, children }: { kind: 'tip' | 'warn' | 'info'; children: React.ReactNode }) {
    const styles = {
        tip: 'border-pos/40 bg-pos/10 text-ink-q',
        warn: 'border-warn/40 bg-warn/10] text-amber-100/90',
        info: 'border-accent/40 bg-accent/10] text-sky-100/90',
    }[kind];
    return (
        <div className={` border p-3 text-[13px] leading-relaxed ${styles}`}>
            {children}
        </div>
    );
}
