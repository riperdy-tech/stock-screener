import { type StockCandidate } from "./blueprint";

export async function fetchStocks(): Promise<StockCandidate[]> {
    try {
        const response = await fetch("/data/stocks.json");
        if (!response.ok) {
            throw new Error("Failed to fetch stock data");
        }
        const data = await response.json();
        return data as StockCandidate[];
    } catch (error) {
        console.error("Error loading stocks:", error);
        return [];
    }
}
