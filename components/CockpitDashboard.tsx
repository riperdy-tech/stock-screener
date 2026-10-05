'use client';

// The desk's home surface: it owns the tab state and hands the cached
// data bag to whichever view is showing. Every panel lives under components/desk.
// The four legacy lenses live unchanged at /lenses.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthModal } from './AuthModal';
import { useDeskData } from '@/lib/desk/useDeskData';
import { Shell } from './desk/Shell';
import { RankingsView } from './desk/rankings/RankingsView';
import { MyPortfolio } from './desk/portfolio/MyPortfolio';

type TabId = 'rankings' | 'portfolio';

export default function CockpitDashboard() {
    const [tab, setTab] = useState<TabId>('rankings');
    // The shell's nav links carry ?tab=…, so the header works identically from
    // every desk surface (including the ticker pages) without prop drilling.
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlTab = searchParams.get('tab');
    useEffect(() => {
        if (urlTab === 'rankings' || urlTab === 'portfolio') setTab(urlTab);
    }, [urlTab]);
    // Every payload (and the private `mine` ledger merge) comes from one cached hook so
    // navigating to a ticker page and back never refetches the 16 MB of static JSON/CSV.
    const {
        factor, valuations, overlay, depth,
        ledgers, stockInfo, loading, reload, auth,
    } = useDeskData();
    // Ticker pages are routes now, so a detail view is shareable and the browser's
    // own Back button works. `from` tells the page which surface to return to.
    const openTicker = (ticker: string, from: 'ai' | 'quant' | 'port') =>
        router.push(`/t/${encodeURIComponent(ticker)}?from=${from}`);
    const [showAuth, setShowAuth] = useState(false);

    return (
        <Shell tab={tab} loading={loading} onReload={reload}>
            <div className="pt-6">
                {tab === 'rankings' && (
                    <RankingsView
                        factor={factor} depth={depth} valuations={valuations}
                        overlay={overlay} stockInfo={stockInfo} ledgers={ledgers}
                    />
                )}

                {tab === 'portfolio' && (
                    <div className="pb-4">
                        <MyPortfolio
                            factor={factor?.tickers ?? {}} depth={depth}
                            ledgers={ledgers} stockInfo={stockInfo}
                            onSelect={(t) => openTicker(t, 'port')}
                            user={auth.user} onRequireLogin={() => setShowAuth(true)}
                        />
                    </div>
                )}

            </div>

            {showAuth && <AuthModal onClose={() => setShowAuth(false)} signIn={auth.signIn} signUp={auth.signUp} />}

        </Shell>
    );
}
