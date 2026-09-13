import { useSyncExternalStore } from "react";

import { getIntelligence, type ComputedMarket, type IntelligenceSnapshot } from "./intelligence";
import { journal } from "./journal";
import { getLiquidityScanner, type ScanResult, type ScannerState } from "./scanner";

export type { ComputedMarket, IntelligenceSnapshot, ScanResult, ScannerState };

/** Read-only subscription to the continuously running intelligence engine. */
export function useIntelligenceSnapshot(): IntelligenceSnapshot {
  const intel = getIntelligence();
  return useSyncExternalStore(intel.subscribe, intel.getSnapshot, intel.getServerSnapshot);
}

export function useIntelligence() {
  const snap = useIntelligenceSnapshot();
  return {
    snapshot: snap.feed,
    markets: snap.markets,
    opportunities: snap.opportunities,
    zones: snap.zones,
    cycleMs: snap.cycleMs,
    cycles: snap.cycles,
  };
}

export function useBestLiquidityScanner() {
  const scanner = getLiquidityScanner();
  const state = useSyncExternalStore(
    scanner.subscribe,
    scanner.getSnapshot,
    scanner.getServerSnapshot,
  );

  const scan = () => {
    const intel = getIntelligence();
    return scanner.scan(intel.getZoneRegistry());
  };

  return {
    ...state,
    scan,
    reset: () => scanner.reset(),
  };
}

export function useJournal() {
  return useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getServerSnapshot);
}
