import { useMemo, useSyncExternalStore } from "react";

import { getFeed, type MarketState } from "./feed";
import { analyzeMarket, type MarketAnalysis } from "./engine";
import { analyzeAuthoritativeMarket, type AuthoritativeMarket } from "./authoritative-v4";
import { journal } from "./journal";

export interface ComputedMarket extends MarketState {
  analysis: MarketAnalysis | null;
  authoritative: AuthoritativeMarket | null;
}

export function useFeed() {
  const feed = getFeed();
  return useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getServerSnapshot);
}

export function useJournal() {
  return useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getServerSnapshot);
}

const authoritativeCache = new Map<string, AuthoritativeMarket>();

/**
 * Computes the legacy quantitative research view and the authoritative
 * reservoir/lifecycle view from the same canonical feed snapshot.
 * The Liquidity tab consumes only `authoritative`.
 */
export function useIntelligence() {
  const snapshot = useFeed();
  const markets = useMemo<ComputedMarket[]>(() => snapshot.markets.map((m) => {
    const previous = authoritativeCache.get(m.symbol);
    const authoritative = analyzeAuthoritativeMarket(m.symbol, m.history, previous);
    authoritativeCache.set(m.symbol, authoritative);
    return { ...m, analysis: analyzeMarket(m.history), authoritative };
  }), [snapshot.version]);
  return { snapshot, markets };
}
