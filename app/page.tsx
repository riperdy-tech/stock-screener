import { Suspense } from 'react';
import CockpitDashboard from '@/components/CockpitDashboard';

// useSearchParams (the shell's ?tab= nav) needs a Suspense boundary at the
// route level or the static prerender fails.
export default function Home() {
    return (
        <Suspense fallback={null}>
            <CockpitDashboard />
        </Suspense>
    );
}
