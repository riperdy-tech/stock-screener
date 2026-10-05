import { TrackPage } from '@/components/desk/track/TrackPage';

// Client-rendered from the same cached static payloads as the Desk, so moving between the Desk,
// a ticker page and back costs no refetch.
export default function Track() {
    return <TrackPage />;
}
