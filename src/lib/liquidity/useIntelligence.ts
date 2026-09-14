import { useSyncExternalStore } from "react";

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

function toScanResult(
  market: ComputedMarket,
  contract: AuthoritativeContract,
  rank: number,
): ScanResult {
  const analysis = market.authoritative;
  const now = Date.now();
  const psychologyAdherence = contract.vetoes.length === 0 ? 100 : Math.max(0, 100 - contract.vetoes.length * 20);
  const trajectory =
    contract.trajectory === "RELEASING"
      ? "RELEASING"
      : contract.trajectory === "MATURING"
        ? "MATURING"
        : contract.trajectory === "EXHAUSTING"
          ? "EXHAUSTING"
          : contract.trajectory === "STRENGTHENING"
            ? "STRENGTHENING"
            : contract.trajectory === "WEAKENING"
              ? "WEAKENING"
              : "STABLE";
  const strictQualified =
    contract.qualificationStatus === "QUALIFIED" &&
    contract.age >= 12 &&
    contract.accumulatedLiquidity >= 65 &&
    contract.maturity >= 62 &&
    contract.exhaustion >= 65 &&
    contract.delivery >= 62 &&
    contract.conflict < 60 &&
    contract.vetoes.length === 0;

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
    trajectory: trajectory as ScanResult["trajectory"],
    explanation: {
      primaryReasons: contract.evidence.slice(0, 6),
      runnerUpComparison: null,
    },
    timeline: [],
    evidenceHistory: [],
    isOverride: false,
    overrideCount: 0,
    isInvalidated: contract.state === "INVALIDATED",
    invalidationReason: contract.state === "INVALIDATED" ? "Authoritative lifecycle invalidated" : null,
  } as ScanResult;
}

/**
 * Production selection facade.
 *
 * This replaces the former independent scanner/zone ranking path. Selection is
 * now derived directly from the cached authoritative V4 contract projections.
 * The old scanner module remains available only for compatibility and is not
 * invoked by the production UI.
 */
export function useBestLiquidityScanner() {
  const snap = useIntelligenceSnapshot();
  const [state, setState] = useStateFromAuthoritative();

  const ranked = snap.markets
    .flatMap((market) =>
      (market.authoritative?.contracts ?? []).map((contract) => ({ market, contract })),
    )
    .sort((a, b) => b.contract.confirmation - a.contract.confirmation);

  const allRanked = ranked.map(({ market, contract }, i) => toScanResult(market, contract, i + 1));
  const currentSelection = allRanked[0] ?? null;
  const bestQualified = allRanked.find((x) => x.qualified) ?? null;

  const scan = () => {
    setState((previous) => ({ ...previous, totalScansPerformed: previous.totalScansPerformed + 1 }));
    return currentSelection;
  };

  return {
    ...state,
    currentSelection,
    bestQualified,
    allRanked,
    noRankedFound: allRanked.length === 0,
    noQualifiedFound: bestQualified === null,
    isScanning: false,
    cooldownActive: false,
    cooldownRemainingSeconds: 0,
    rankHoldTimeSeconds: 0,
    lastOverride: null,
    overrideCount: 0,
    scan,
    reset: () => setState((previous) => ({ ...previous, totalScansPerformed: 0 })),
  } satisfies Omit<ScannerState, "currentSelection" | "bestQualified" | "allRanked" | "noRankedFound" | "noQualifiedFound" | "isScanning" | "cooldownActive" | "cooldownRemainingSeconds" | "rankHoldTimeSeconds" | "lastOverride" | "overrideCount"> & {
    currentSelection: ScanResult | null;
    bestQualified: ScanResult | null;
    allRanked: ScanResult[];
    noRankedFound: boolean;
    noQualifiedFound: boolean;
    isScanning: boolean;
    cooldownActive: boolean;
    cooldownRemainingSeconds: number;
    rankHoldTimeSeconds: number;
    lastOverride: ScannerState["lastOverride"];
    overrideCount: number;
    scan: () => ScanResult | null;
    reset: () => void;
  };
}

function useStateFromAuthoritative() {
  const [state, setState] = requireReactState();
  return [state, setState] as const;
}

function requireReactState() {
  // Kept isolated so the external-store hook remains the only reactive source
  // for market intelligence. Scanner state itself is merely UI scan counters.
  return useState<{ totalScansPerformed: number }>({ totalScansPerformed: 0 });
}

export function useJournal() {
  return useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getServerSnapshot);
}
