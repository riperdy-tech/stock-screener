// Shared presentational helpers for the /help page. Used by both the English
// body (in page.tsx) and the Korean body (content-ko.tsx) so both languages
// render with identical styling.

export function Section({ id, title, icon, children }: {
    id: string; title: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-24 border-b border-border/60 pb-10 last:border-b-0">
            <div className="flex items-center gap-2">
                {icon && <span className="text-emerald-400">{icon}</span>}
                <h2 className="text-xl font-black tracking-tight text-foreground">{title}</h2>
            </div>
            <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-foreground/90">
                {children}
            </div>
        </section>
    );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="pt-1 text-sm font-black uppercase tracking-wider text-emerald-300">{children}</h3>
    );
}

export function Callout({ kind, children }: { kind: 'tip' | 'warn' | 'info'; children: React.ReactNode }) {
    const styles = {
        tip: 'border-emerald-500/40 bg-emerald-500/[0.07] text-emerald-100/90',
        warn: 'border-amber-500/40 bg-amber-500/[0.07] text-amber-100/90',
        info: 'border-sky-500/40 bg-sky-500/[0.07] text-sky-100/90',
    }[kind];
    return (
        <div className={`rounded-lg border p-3 text-[13px] leading-relaxed ${styles}`}>
            {children}
        </div>
    );
}
