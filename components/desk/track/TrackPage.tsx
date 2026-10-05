'use client';

// The /track route: the Track record view inside the same Shell as the Desk.

import React from 'react';
import { useDepthOutcomes, useDeskData } from '@/lib/desk/useDeskData';
import { Shell } from '../Shell';
import { TrackView } from './TrackView';

export function TrackPage() {
    const { ledgers, loading, reload, auth } = useDeskData();
    const { outcomes, loaded } = useDepthOutcomes();
    return (
        <Shell tab="track" loading={loading} onReload={reload}>
            <div className="pt-6 pb-4">
                <TrackView ledgers={ledgers} outcomes={outcomes} outcomesLoaded={loaded} loggedIn={!!auth.user} loading={loading} />
            </div>
        </Shell>
    );
}
