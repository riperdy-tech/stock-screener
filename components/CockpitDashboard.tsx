'use client';

// The desk's home surface: it owns the tab and lens state and hands the cached
// data bag to whichever view is showing. Every panel lives under components/desk.
// The four legacy lenses live unchanged at /lenses.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthModal } from './AuthModal';
import { useDeskData } from '@/lib/desk/useDeskData';
import { Shell } from './desk/Shell';
import { RankingsView, type Lens } from './desk/rankings/RankingsView';
import { TrackView } from './desk/track/TrackView';
import { MyPortfolio } from './desk/portfolio/MyPortfolio';
import { SuggestedPlan } from './desk/portfolio/SuggestedPlan';

type TabId = 'rankings' | 'track' | 'portfolio';

export default function CockpitDashboard() {
    const [tab, setTab] = useState<TabId>('rankings');
    // The shell's nav links carry ?tab=…, so the header works identically from
    // every desk surface (including the ticker pages) without prop drilling.
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlTab = searchParams.get('tab');
    const urlLens = searchParams.get('lens');
    useEffect(() => {
        if (urlTab === 'rankings' || urlTab === 'track' || urlTab === 'portfolio') setTab(urlTab);
    }, [urlTab]);
    // Every payload (and the private `mine` ledger merge) comes from one cached hook so
    // navigating to a ticker page and back never refetches the 16 MB of static JSON/CSV.
    const {
        factor, valuations, plan, planLlm, overlay, depth, depthMeta,
        ledgers, stockInfo, macro, loading, reload, auth,
    } = useDeskData();
    // THE LENS — RS2 AI verdicts (default), the quant filter that feeds them, or
    // the two side by side. Rankings owns its own filters.
    const [lens, setLens] = useState<Lens>('ai');
    useEffect(() => {
        if (urlLens === 'ai' || urlLens === 'quant' || urlLens === 'compare') setLens(urlLens);
    }, [urlLens]);

    // Ticker pages are routes now, so a detail view is shareable and the browser's
    // own Back button works. `from` tells the page which surface to return to.
    const openTicker = (ticker: string, from: 'ai' | 'quant' | 'compare' | 'track' | 'port') =>
        router.push(`/t/${encodeURIComponent(ticker)}?from=${from}`);
    const [showAuth, setShowAuth] = useState(false);

    return (
        <Shell tab={tab} factor={factor} depthMeta={depthMeta} ledgers={ledgers} loading={loading} onReload={reload}>
            <div className="pt-6">
                {tab === 'rankings' && (
                    <RankingsView
                        factor={factor} depth={depth} valuations={valuations}
                        overlay={overlay} stockInfo={stockInfo}
                        lens={lens} onLens={setLens} onOpen={(t) => openTicker(t, lens)}
                    />
                )}

                {tab === 'track' && (
                    <TrackView
                        ledgers={ledgers}
                        loggedIn={!!auth.user}
                        onOpenTicker={(t) => openTicker(t, 'track')}
                    />
                )}

                {tab === 'portfolio' && (
                    <div className="pb-4">
                        <MyPortfolio
                            factor={factor?.tickers ?? {}} valuations={valuations} depth={depth}
                            overlay={overlay} stockInfo={stockInfo}
                            onSelect={(t) => openTicker(t, 'port')}
                            user={auth.user} onRequireLogin={() => setShowAuth(true)}
                        />
                        <SuggestedPlan
                            plan={plan} planLlm={planLlm} macro={macro} overlay={overlay}
                            onOpenTicker={(t) => openTicker(t, 'port')}
                        />
                    </div>
                )}

            </div>

            {showAuth && <AuthModal onClose={() => setShowAuth(false)} signIn={auth.signIn} signUp={auth.signUp} />}

        </Shell>
    );
}
