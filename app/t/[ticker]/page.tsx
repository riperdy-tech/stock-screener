import { Suspense } from 'react';
import { StockDetailPage } from '@/components/desk/detail/StockDetailPage';

// Ticker pages are client-rendered from the same cached static payloads as the
// rankings, so navigating in and back out costs no refetch.
export default function TickerPage({ params }: { params: { ticker: string } }) {
    return (
        <Suspense fallback={null}>
            <StockDetailPage ticker={decodeURIComponent(params.ticker).toUpperCase()} />
        </Suspense>
    );
}
