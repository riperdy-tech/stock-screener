import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import CockpitDashboard from '@/components/CockpitDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// useSearchParams (the shell's ?tab= nav) needs a Suspense boundary at the
// route level or the static prerender fails.
// Track record is its own route now; the old ?tab=track links keep working.
export default function Home({ searchParams }: { searchParams: { tab?: string | string[] } }) {
    if (searchParams.tab === 'track') redirect('/track');
    return (
        <Suspense fallback={null}>
            <CockpitDashboard />
        </Suspense>
    );
}
