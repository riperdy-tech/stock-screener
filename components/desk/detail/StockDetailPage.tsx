'use client';

import { useSearchParams } from 'next/navigation';
import { StockDetail } from './StockDetail';

/** Reads ?from= so "← Rankings" returns to the surface the reader came from. */
export function StockDetailPage({ ticker }: { ticker: string }) {
    const params = useSearchParams();
    return <StockDetail ticker={ticker} from={params.get('from') ?? undefined} />;
}
