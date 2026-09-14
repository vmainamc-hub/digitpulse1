import { useState, useSyncExternalStore } from "react";

import { getIntelligence, type ComputedMarket, type IntelligenceSnapshot } from "./intelligence";
import { journal } from "./journal";
import type { AuthoritativeContract, AuthoritativeMarketAnalysis } from "./authoritative-v4";
import type { ScanResult, ScannerState } from "./scanner";

export type {
  ComputedMarket,
  IntelligenceSnapshot,
  ScanResult,
  ScannerState,
  AuthoritativeContract,
  AuthoritativeMarketAnalysis,
};
export {
  analyzeAuthoritativeMarket,
  analyzeAuthoritativeContract,
  detectReservoirs,
  calculateStructuralLiquidityLevel,
} from "./authoritative-v4";

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

function toScanResult(market: ComputedMarket, contract: AuthoritativeContract, rank: number): ScanResult {
  const now = Date.now();
  const strictQualified =
    contract.age >= 12 &&
    contract.accumulatedLiquidity >= 65 &&
    contract.maturity >= 62 &&
    contract.exhaustion >= 65 &&
    contract.delivery >= 62 &&
    contract.conflict < 60 &&
    contract.vetoes.length === 0 &&
    contract.qualificationStatus === "QUALIFIED";
  const psychologyAdherence = contract.vetoes.length === 0 ? 100 : Math.max(0, 100 - contract.vetoes.length * 20);
  const trajectory = contract.trajectory as ScanResult["trajectory"];

  return {
    zoneId: `${market.symbol}:${contract.id}`,
    market: market.name,
    symbol: market.symbol,
    contract: contract.label,
    contractId: contract.id,
    generation: 4,
    kind: contract.side,
    barrier: contract.barrier,
    rank,
    rankingScore: contract.confirmation,
    score: contract.confirmation,
    qualified: strictQualified,
    qualificationStatus: strictQualified ? "QUALIFIED" : contract.qualificationStatus,
    qualificationReasons: strictQualified ? [] : contract.vetoes,
    qualificationReason: strictQualified ? "All authoritative V4 gates satisfied" : (contract.vetoes[0] ?? "Authoritative V4 gates not satisfied"),
    scannedAt: now,
    formattedTime: new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
    rankHoldTimeSeconds: 0,
    liquidityLevel: contract.liquidityLevel,
    liquidityTrend: 0,
    liquidityAcceleration: 0,
    psychologyAdherence,
    psychologyDetails: {} as ScanResult["psychologyDetails"],
    liquidityComposition: {} as ScanResult["liquidityComposition"],
    psychologyScore: psychologyAdherence,
    psychologyValidity: contract.vetoes.length === 0 ? "VALID" : "REJECT",
    psychologyReasons: contract.vetoes,
    liquidityScore: contract.accumulatedLiquidity,
    formationScore: contract.maturity,
    formationAge: contract.age,
    formationDuration: contract.age,
    formationAgeSeconds: 0,
    reservoirScore: contract.reservoirScore,
    reservoirRatio: `${contract.reservoirDigits.length}/10`,
    dominantExhaustion: contract.exhaustion,
    deliveryScore: contract.delivery,
    migrationScore: 0,
    absorptionScore: contract.absorption,
    releaseReadiness: contract.release,
    conflictLevel: contract.conflict >= 60 ? "HIGH" : contract.conflict >= 35 ? "MODERATE" : "LOW",
    conflictScore: contract.conflict,
    lifecycleState: contract.state as ScanResult["lifecycleState"],
    multiWindowSupport: `${[contract.maturity >= 62, contract.exhaustion >= 65, contract.delivery >= 62, contract.reservoirScore >= 50, contract.conflict < 60, contract.vetoes.length === 0].filter(Boolean).length}/6`,
    trajectory,
    explanation: { primaryReasons: contract.evidence.slice(0, 6), runnerUpComparison: null },
    timeline: [],
    evidenceHistory: [],
    isOverride: false,
    overrideCount: 0,
    isInvalidated: contract.state === "INVALIDATED",
    invalidationReason: contract.state === "INVALIDATED" ? "Authoritative lifecycle invalidated" : null,
  } as ScanResult;
}

/**
 * Production selection facade. The UI ranking now reads the cached authoritative
 * V4 projections directly; the former independent scanner is not invoked.
 */
export function useBestLiquidityScanner() {
  const snap = useIntelligenceSnapshot();
  const [totalScansPerformed, setTotalScansPerformed] = useState(0);

  const ranked = snap.markets
    .flatMap((market) => (market.authoritative?.contracts ?? []).map((contract) => ({ market, contract })))
    .sort((a, b) => b.contract.confirmation - a.contract.confirmation);
  const allRanked = ranked.map(({ market, contract }, i) => toScanResult(market, contract, i + 1));
  const currentSelection = allRanked[0] ?? null;
  const bestQualified = allRanked.find((x) => x.qualified) ?? null;

  const scan = () => {
    setTotalScansPerformed((n) => n + 1);
    return currentSelection;
  };

  return {
    currentSelection,
    bestQualified,
    allRanked,
    lastScanTimestamp: null,
    cooldownRemainingSeconds: 0,
    cooldownActive: false,
    isScanning: false,
    noRankedFound: allRanked.length === 0,
    noQualifiedFound: bestQualified === null,
    totalScansPerformed,
    overrideCount: 0,
    rankHoldTimeSeconds: 0,
    scanHistory: [],
    lastOverride: null,
    scan,
    reset: () => setTotalScansPerformed(0),
  } as ScannerState & { scan: () => ScanResult | null; reset: () => void };
}

export function useJournal() {
  return useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getServerSnapshot);
}
