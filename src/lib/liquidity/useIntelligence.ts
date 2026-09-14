import { useMemo, useState, useSyncExternalStore } from "react";

import { getIntelligence, type ComputedMarket, type IntelligenceSnapshot } from "./intelligence";
import { journal } from "./journal";
import type { AuthoritativeContract, AuthoritativeMarketAnalysis } from "./authoritative-v4";
import type { ScanResult, ScannerState } from "./scanner";
import { COOLDOWN_SECONDS } from "./scanner";

export type {
  ComputedMarket,
  IntelligenceSnapshot,
  ScanResult,
  ScannerState,
  AuthoritativeContract,
  AuthoritativeMarketAnalysis,
};
export {
  analyzeAuthoritativeProductionMarket,
  AUTHORITATIVE_PRODUCTION_GATES,
  LIFECYCLE_ORDER,
} from "./authoritative-production";

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

function canonicalVetoes(contract: AuthoritativeContract): string[] {
  return contract.vetoes;
}

function toScanResult(market: ComputedMarket, contract: AuthoritativeContract, rank: number, scannedAt: number): ScanResult {
  const vetoes = canonicalVetoes(contract);
  const strictQualified = contract.qualified;
  const psychologyAdherence = vetoes.length === 0 ? 100 : Math.max(0, 100 - vetoes.length * 20);
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
    qualificationReasons: strictQualified ? [] : vetoes,
    qualificationReason: strictQualified ? "All authoritative production gates satisfied" : (vetoes[0] ?? "Authoritative production gates not satisfied"),
    scannedAt,
    formattedTime: new Date(scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
    rankHoldTimeSeconds: 0,
    liquidityLevel: contract.liquidityLevel,
    liquidityTrend: 0,
    liquidityAcceleration: 0,
    psychologyAdherence,
    psychologyDetails: {} as ScanResult["psychologyDetails"],
    liquidityComposition: {} as ScanResult["liquidityComposition"],
    psychologyScore: psychologyAdherence,
    psychologyValidity: vetoes.length === 0 ? "VALID" : "REJECT",
    psychologyReasons: vetoes,
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
    multiWindowSupport: `${[contract.maturity >= 62, contract.exhaustion >= 65, contract.delivery >= 62, contract.reservoirScore >= 50, contract.conflict < 60, vetoes.length === 0].filter(Boolean).length}/6`,
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

function rankAuthoritativeSnapshot(snap: IntelligenceSnapshot, scannedAt: number): ScanResult[] {
  return snap.markets
    .flatMap((market) => (market.authoritative?.contracts ?? []).map((contract) => ({ market, contract })))
    .sort((a, b) => b.contract.confirmation - a.contract.confirmation)
    .map(({ market, contract }, i) => toScanResult(market, contract, i + 1, scannedAt));
}

/**
 * Deliberate production scanner.
 *
 * IMPORTANT: the authoritative engine may continue observing live ticks between scans,
 * but the selected market/contract is a SNAPSHOT taken only when the user presses SCAN.
 * This prevents the UI from jumping between candidates every intelligence cycle.
 */
export function useBestLiquidityScanner() {
  const snap = useIntelligenceSnapshot();
  const [scanVersion, setScanVersion] = useState(0);
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number | null>(null);
  const [scannedRanked, setScannedRanked] = useState<ScanResult[]>([]);

  const liveRanked = useMemo(() => rankAuthoritativeSnapshot(snap, Date.now()), [snap]);

  const cooldownRemainingSeconds = lastScanTimestamp === null
    ? 0
    : Math.max(0, COOLDOWN_SECONDS - Math.floor((Date.now() - lastScanTimestamp) / 1000));
  const cooldownActive = lastScanTimestamp !== null && cooldownRemainingSeconds > 0;

  const currentSelection = scannedRanked[0] ?? null;
  const bestQualified = scannedRanked.find((x) => x.qualified) ?? null;

  const scan = () => {
    if (cooldownActive) return currentSelection;
    const scannedAt = Date.now();
    const ranked = rankAuthoritativeSnapshot(snap, scannedAt);
    setScannedRanked(ranked);
    setLastScanTimestamp(scannedAt);
    setScanVersion((v) => v + 1);
    return ranked[0] ?? null;
  };

  const reset = () => {
    setScannedRanked([]);
    setLastScanTimestamp(null);
    setScanVersion((v) => v + 1);
  };

  // Recompute the cooldown on every intelligence render without ever changing the
  // selected formation. This is intentionally presentation state, not selection logic.
  void scanVersion;
  void liveRanked;

  return {
    currentSelection,
    bestQualified,
    // Keep the leaderboard tied to the last deliberate scan, not live ticks.
    allRanked: scannedRanked,
    lastScanTimestamp,
    cooldownRemainingSeconds,
    cooldownActive,
    isScanning: false,
    noRankedFound: scannedRanked.length === 0,
    noQualifiedFound: scannedRanked.length > 0 && bestQualified === null,
    totalScansPerformed: lastScanTimestamp === null ? 0 : scanVersion,
    overrideCount: 0,
    rankHoldTimeSeconds: 0,
    scanHistory: [],
    lastOverride: null,
    scan,
    reset,
  } as ScannerState & { scan: () => ScanResult | null; reset: () => void };
}

export function useJournal() {
  return useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getServerSnapshot);
}
