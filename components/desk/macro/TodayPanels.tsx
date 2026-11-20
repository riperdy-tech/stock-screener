'use client';

// "Today" on the Overview tab (WO_MS1): what the market is doing now, from the daily market state, the news read, the
// economy state and the driver exposures. Every field is optional; a missing file hides its block (the news block says so).
// Nothing here is a forecast and none of it moves a number.

import React from 'react';
import { useLanguage } from '@/components/LanguageContext';
import type { MriDailyRead, MriDriverExposures, MriEconomyState, MriMarketState } from '@/lib/data-service';
import { safeHttpUrl } from '@/lib/desk/macroPanels';
import {
    agreeKey, DASH, driverMoveRows, driverPhrase, econWordKey, economyRows, exposedKey, fundRows, marketMetrics, readState,
    sectorLeadersLaggards, sgn, type DriverPhrase,
} from '@/lib/desk/marketState';
import { fill } from '@/lib/desk/text';
import type { TRANSLATIONS } from '@/lib/i18n';
import { Micro } from '../primitives';
import { Metric, Note, Section } from './MacroPanels';

type Key = keyof typeof TRANSLATIONS['en'];

/** A driver in words in the viewer's language. */
export function useDriverText() {
    const { t } = useLanguage();
    return (p: DriverPhrase | null): string => (p === null ? DASH : p.key === null ? p.vars.raw : fill(t(p.key), p.vars));
}

/** A file's own words (an economy state, say) in the viewer's language when this page knows them, as written when not. */
const useWord = () => {
    const { t } = useLanguage();
    return (w: string | null) => (w === null ? DASH : (econWordKey(w) ? t(econWordKey(w) as Key) : w));
};

const Off = ({ children }: { children: React.ReactNode }) => <p className="mt-3 font-mono text-[11px] text-off">{children}</p>;

function MarketBlock({ ms }: { ms: MriMarketState }) {
    const { t } = useLanguage();
    const { leaders, laggards } = sectorLeadersLaggards(ms);
    const metrics = marketMetrics(ms);
    const moves = (rows: typeof leaders) => rows.map((r) => `${r.name} ${sgn(r.rel, 1)}`).join(' · ') || DASH;
    return (
        <Section title={t('mcTMarket')}>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                {metrics.map((m) => (
                    <Metric
                        key={m.key} label={t(m.label as Key)}
                        value={m.valueKey ? t(m.valueKey as Key) : m.value}
                        sub={m.sub ? fill(t(m.sub.key as Key), { v: m.sub.v }) : undefined}
                    />
                ))}
            </div>
            <div className="mt-4 space-y-1.5 text-[13px] text-ink-2">
                <p><Micro className="mr-2">{t('mcTLeaders')}</Micro>{moves(leaders)}</p>
                <p><Micro className="mr-2">{t('mcTLaggards')}</Micro>{moves(laggards)}</p>
            </div>
            <p className="mt-2 font-mono text-[11px] text-off">{t('mcTVsIndex')}</p>
        </Section>
    );
}

function NewsBlock({ dr, pricesDriver }: { dr: MriDailyRead | null; pricesDriver: string | null | undefined }) {
    const { t } = useLanguage();
    const driverText = useDriverText();
    const state = readState(dr);
    if (!dr || state === 'none') {
        return (
            <Section title={t('mcTNews')}>
                <Off>{t('mcTNoRead')}</Off>
                {dr?.detail && <p className="mt-1 font-mono text-[11px] text-off">{dr.detail}</p>}
            </Section>
        );
    }
    const read = dr.read ?? {};
    const agree = agreeKey(dr.agree);
    const exposed = read.exposed ?? [];
    const quotes = dr.quotes ?? [];
    return (
        <Section title={t('mcTNews')}>
            {state === 'kept' && <p className="mt-3 font-mono text-[11px] text-warn">{fill(t('mcTKept'), { d: dr.carried_from ?? DASH })}</p>}
            {read.why && <p className="mt-3 text-[13px] leading-relaxed text-ink">{read.why}</p>}
            <p className="mt-3 font-mono text-[11px] text-ink-2">
                {t('mcTNewsName')} {driverText(driverPhrase(read.driver))} · {t('mcTPricesName')} {driverText(driverPhrase(pricesDriver ?? dr.prices?.driver))} · {agree ? t(agree) : DASH}
            </p>
            {read.changed_since_previous && (
                <p className="mt-3 text-[13px] text-ink-2"><Micro className="mr-2">{t('mcTChanged')}</Micro>{read.changed_since_previous}</p>
            )}
            {exposed.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
                    {exposed.map((x, i) => {
                        const k = exposedKey(x.direction);
                        return (
                            <li key={i} className="break-words">
                                <b className="font-semibold text-ink">{x.what ?? DASH}</b>
                                {' · '}{k ? t(k) : (x.direction ?? DASH)}
                                {x.reason && <> · {x.reason}</>}
                            </li>
                        );
                    })}
                </ul>
            )}
            {quotes.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink-2">
                    {quotes.map((q, i) => {
                        const href = safeHttpUrl(q.source_url);
                        const text = `“${q.text ?? DASH}”`;
                        return (
                            <li key={i} className="break-words">
                                {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-rule-18 underline-offset-2 hover:text-ink">{text}</a> : text}
                                <span className="font-mono text-[11px] text-off"> · {q.source ?? DASH} · {q.published_at ? q.published_at.slice(0, 10) : DASH}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-off">{dr.model ? `${dr.model} · ` : ''}{t('mcTNewsFoot')}</p>
        </Section>
    );
}

function EconomyBlock({ es }: { es: MriEconomyState }) {
    const { t } = useLanguage();
    const word = useWord();
    return (
        <Section title={t('mcTEconomy')}>
            {es.summary && <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{es.summary}</p>}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
                {economyRows(es).map((r) => (
                    <Metric
                        key={r.key} label={t(r.label as Key)}
                        value={<span className="text-[15px]">{r.words.map(word).join(', ')}</span>}
                        sub={fill(t(r.numKey as Key), r.numVars)}
                    />
                ))}
            </div>
        </Section>
    );
}

function MovesBlock({ x }: { x: MriDriverExposures }) {
    const { t } = useLanguage();
    const drivers = driverMoveRows(x);
    const funds = fundRows(x);
    return (
        <Section title={t('mcTMoves')}>
            {x.summary && <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{x.summary}</p>}
            {drivers.length > 0 && (
                <ul className="mt-3 space-y-1 font-mono text-[11px] text-ink-2">
                    {drivers.map((d) => (
                        <li key={d.id}>
                            {(['market', 'rates', 'oil'].includes(d.id) ? t(`mcTD${d.id}` as Key) : d.id)}: {d.change}
                            {' · '}{d.moved === null ? DASH : d.moved ? t('mcTMoved') : t('mcTQuiet')}
                        </li>
                    ))}
                </ul>
            )}
            {funds.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse text-left">
                        <thead>
                            <tr className="border-b border-rule-18">
                                <th className="px-2 py-1.5 text-left"><Micro>{t('mcTSector')}</Micro></th>
                                <th className="px-2 py-1.5 text-right"><Micro>{t('mcTRealised')}</Micro></th>
                                <th className="px-2 py-1.5 text-right"><Micro>{t('mcTImplied')}</Micro></th>
                                <th className="px-2 py-1.5 text-right"><Micro>{t('mcTUnexplained')}</Micro></th>
                            </tr>
                        </thead>
                        <tbody>
                            {funds.map((f) => (
                                <tr key={f.id} className="border-b border-rule-10 text-[13px]">
                                    <td className="px-2 py-1.5 text-ink-2">{f.name}</td>
                                    <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink">{sgn(f.realised)}</td>
                                    <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink-2">{sgn(f.implied)}</td>
                                    <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink-2">{sgn(f.unexplained)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <Note>{t('mcTMovesNote')}</Note>
        </Section>
    );
}

/** The four blocks, in order. A block whose file did not load is left out; the news block says "No news read today" instead. */
export function TodaySection({ market, economy, exposures, dailyRead, loaded }: {
    market: MriMarketState | null; economy: MriEconomyState | null; exposures: MriDriverExposures | null; dailyRead: MriDailyRead | null; loaded: boolean;
}) {
    const { t } = useLanguage();
    if (!market && !economy && !exposures && !dailyRead && !loaded) return null;
    return (
        <section>
            <h2 className="text-[16px] font-bold text-ink">{t('mcTToday')}</h2>
            <div className="mt-3 space-y-6">
                {market && <MarketBlock ms={market} />}
                {loaded && <NewsBlock dr={dailyRead} pricesDriver={market?.driver} />}
                {economy && <EconomyBlock es={economy} />}
                {exposures && <MovesBlock x={exposures} />}
            </div>
        </section>
    );
}
