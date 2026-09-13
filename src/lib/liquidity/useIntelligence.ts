import { useMemo, useSyncExternalStore } from "react";

import { getFeed, type MarketState } from "./feed";
import { analyzeMarket, type MarketAnalysis } from "./engine";
import { journal } from "./journal";

export interface ComputedMarket extends MarketState {
  analysis: MarketAnalysis | null;
}

export function useFeed() {
  const feed = getFeed();
  return useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getServerSnapshot);
}

export function useJournal() {
  return useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getServerSnapshot);
}

/** Runs the shared engine over the whole universe for each feed version. */
export function useIntelligence() {
  const snapshot = useFeed();
  const markets = useMemo<ComputedMarket[]>(
    () => snapshot.markets.map((m) => ({ ...m, analysis: analyzeMarket(m.history) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.version],
  );
  return { snapshot, markets };
}
