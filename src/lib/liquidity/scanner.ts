/**
 * BEST LIQUIDITY SCAN + SMART 1-MINUTE OVERRIDE ENGINE
 *
 * Layer 3: Decision & Selection Layer over Persistent Formations (Layer B).
 *
 * Core Architecture & Constraints:
 * 1. The user physically controls when to perform a Scan.
 * 2. Scans rank persistent LiquidityZone formations, NOT raw latest ticks or reactive market cards.
 * 3. Hard qualification gates run BEFORE ranking — invalid Sentinel psychology, losing-side Red,
 *    severe conflict, or insufficient formation persistence are strictly rejected.
 * 4. 60-second smart cooldown prevents tick-by-tick churn and rapid flapping.
 * 5. Material Superiority Override: A candidate that is MATERIALLY SUPERIOR (passes all hard gates,
 *    has sufficient formation persistence, and exceeds the superiority margin) immediately overrides
 *    the current selection even inside the 60s cooldown.
 * 6. Stable Zone Identity: The selected formation maintains its stable zoneId across live ticks;
 *    if the selected formation becomes invalidated, it is explicitly shown as INVALIDATED.
 * 7. If no formation passes hard qualification, explicitly returns NO QUALIFIED LIQUIDITY FORMATION.
 */

import { clamp, mean } from "./math";
import type { LiquidityZone, ZoneLifecycleState, ZoneRegistry } from "./zones";

export const COOLDOWN_SECONDS = 60;
export const COOLDOWN_MS = COOLDOWN_SECONDS * 1000;

/**
 * Material superiority margin: candidate must be at least this many composite points
 * higher (on a 0-100 scale) to override an existing selection during cooldown.
 */
export const SUPERIORITY_MARGIN = 7.0;

/** Minimum persistent ticks a new formation must have before being eligible to override */
export const MIN_OVERRIDE_PERSISTENCE_TICKS = 16;

/** Minimum formation persistence ticks to qualify for scan ranking */
export const MIN_QUALIFICATION_PERSISTENCE_TICKS = 8;

/** Minimum accumulated liquidity score floor */
export const MIN_ACCUMULATED_LIQUIDITY_FLOOR = 35;

/** Maximum allowable conflict score for hard qualification */
export const MAX_ALLOWABLE_CONFLICT = 55;

export type FormationTrajectory =
  | "STRENGTHENING"
  | "STABLE"
  | "WEAKENING"
  | "MATURING"
  | "EXHAUSTING"
  | "RELEASING"
  | "INVALIDATING";

export type QualificationStatus =
  "QUALIFIED" | "WATCH" | "NOT_QUALIFIED" | "BLOCKED" | "CONFLICTED";

export type ScanQualificationStatus = QualificationStatus;

export interface ZoneQualificationResult {
  isQualified: boolean;
  status: QualificationStatus;
  reasons: string[];
}

export interface ScanResult {
  zoneId: string;
  market: string;
  symbol: string;
  contract: string;
  contractId: string;
  kind: "OVER" | "UNDER";
  barrier: number;

  rank: number;
  rankingScore: number;
  score: number; // Composite ranking score (0-100) alias

  qualified: boolean;
  qualificationStatus: QualificationStatus;
  qualificationReasons: string[];
  qualificationReason: string;

  scannedAt: number;
  formattedTime: string;

  // Authoritative metrics derived from engines
  psychologyScore: number;
  psychologyValidity: "VALID" | "WATCH" | "REJECT";
  psychologyReasons: string[];
  liquidityScore: number;
  formationScore: number;
  formationAge: number;
  formationDuration: number;
  formationAgeSeconds: number;

  reservoirScore: number;
  reservoirRatio: string; // e.g. "5/6"
  dominantExhaustion: number;
  deliveryScore: number;
  migrationScore: number;
  absorptionScore: number;
  releaseReadiness: number;
  conflictLevel: "LOW" | "MODERATE" | "HIGH";
  conflictScore: number;

  lifecycleState: ZoneLifecycleState;
  multiWindowSupport: string; // e.g. "5/6"
  trajectory: FormationTrajectory;

  // Override tracking
  isOverride: boolean;
  overrideCount: number;
  previousZoneId?: string;
  previousMarketContract?: string;
  previousScore?: number;
  overrideReason?: string;
  overrideAt?: number;

  // Invalidation tracking if selected zone degrades
  isInvalidated: boolean;
  invalidationReason?: string | null;
}

export interface SuperiorityEvaluation {
  isSuperior: boolean;
  scoreDelta: number;
  reason?: string;
}

export interface ScannerState {
  currentSelection: ScanResult | null; // #1 Ranked formation
  bestQualified: ScanResult | null; // #1 Qualified formation (or null if none qualify)
  allRanked: ScanResult[]; // All ranked formations in descending rank order
  lastScanTimestamp: number | null;
  cooldownRemainingSeconds: number;
  cooldownActive: boolean;
  isScanning: boolean;
  noRankedFound: boolean; // True ONLY if no rankable formations exist at all
  noQualifiedFound: boolean; // True if no qualified formation exists
  totalScansPerformed: number;
  overrideCount: number;
  lastOverride: {
    at: number;
    previous: string;
    next: string;
    reason: string;
    scoreDelta: number;
  } | null;
}

/**
 * Format timestamp into standard human-readable format (e.g. 19:42:16)
 */
export function formatScanTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Determine formation trajectory based on recent history and lifecycle state.
 */
export function determineTrajectory(z: LiquidityZone): FormationTrajectory {
  if (z.isTerminal || z.lifecycleState === "INVALIDATED") {
    return "INVALIDATING";
  }
  if (
    z.lifecycleState === "RELEASE" ||
    z.lifecycleState === "CONFIRMED" ||
    z.lifecycleState === "RIPE"
  ) {
    return "RELEASING";
  }
  if (z.lifecycleState === "EXHAUSTING" || z.lifecycleState === "RELEASE_WATCH") {
    return "EXHAUSTING";
  }
  if (z.lifecycleState === "MATURE" || z.lifecycleState === "BUILDING") {
    return "MATURING";
  }

  const hist = z.trajectoryHistory;
  if (hist.length >= 6) {
    const recent = hist.slice(-3);
    const prior = hist.slice(-6, -3);
    const delta = mean(recent) - mean(prior);
    if (delta > 1.2) return "STRENGTHENING";
    if (delta < -1.2) return "WEAKENING";
  }

  return "STABLE";
}

/**
 * Compute multi-window dimensional support out of 6 independent core dimensions.
 */
export function calculateMultiWindowSupport(z: LiquidityZone): {
  count: number;
  total: number;
  ratio: string;
} {
  const acc = z.accumulators;
  let count = 0;
  const total = 6;

  if (acc.reservoirPersistence >= 45) count++;
  if (acc.dominantExhaustion >= 55) count++;
  if (acc.delivery >= 50) count++;
  if (acc.migration >= 40) count++;
  if (acc.absorption >= 35) count++;
  if (z.currentPsychology.valid) count++;

  return {
    count,
    total,
    ratio: `${count}/${total}`,
  };
}

/**
 * Check whether a zone is an eligible, non-corrupted formation object.
 * Note: A formation that fails qualification IS STILL ELIGIBLE to be ranked.
 */
export function isEligibleFormation(z: LiquidityZone | null | undefined): boolean {
  if (!z) return false;
  if (!z.zoneId || !z.symbol || !z.contract) return false;
  if (!z.accumulators || typeof z.accumulators.accumulatedLiquidity !== "number") return false;
  if (isNaN(z.accumulators.accumulatedLiquidity) || isNaN(z.ageTicks)) return false;
  return true;
}

/**
 * Structural qualification evaluation.
 * Does NOT remove the formation from ranking — provides qualification status and reasons.
 */
export function qualifyFormation(z: LiquidityZone): ZoneQualificationResult {
  const reasons: string[] = [];
  const psych = z.currentPsychology;
  const acc = z.accumulators;

  // 1. Blocked state
  if (z.lifecycleState === "BLOCKED") {
    return {
      isQualified: false,
      status: "BLOCKED",
      reasons: ["Formation blocked by structural hazard or contradiction"],
    };
  }

  // 2. Severe conflict / Conflicted state
  if (z.lifecycleState === "CONFLICTED" || acc.conflict > MAX_ALLOWABLE_CONFLICT) {
    return {
      isQualified: false,
      status: "CONFLICTED",
      reasons: [
        `Severe conflict level (${acc.conflict.toFixed(0)}% > ${MAX_ALLOWABLE_CONFLICT}% limit)`,
      ],
    };
  }

  // 3. Terminal / Invalidation state
  if (z.isTerminal || z.lifecycleState === "INVALIDATED") {
    return {
      isQualified: false,
      status: "NOT_QUALIFIED",
      reasons: [z.invalidationReason || "Formation marked terminal/invalidated"],
    };
  }

  // 4. Mandatory Sentinel Psychology Rule
  if (!psych.valid) {
    if (psych.reasons && psych.reasons.length > 0) {
      for (const r of psych.reasons) {
        if (!reasons.includes(r)) reasons.push(r);
      }
    } else {
      reasons.push("Sentinel psychology rejected: invalid psychological structure");
    }
  }

  // 5. Prohibited losing-side Red check
  const losers =
    z.kind === "OVER"
      ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d <= z.barrier)
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d >= z.barrier);

  if (losers.includes(psych.red)) {
    reasons.push(`Red digit d${psych.red} is on losing side`);
  }
  if (losers.includes(psych.secondRed)) {
    reasons.push(`Second Red digit d${psych.secondRed} is on losing side`);
  }

  // 6. Prohibited losing-side Purple check
  if (psych.purple !== null && psych.purple !== undefined) {
    if (losers.includes(psych.purple)) {
      reasons.push(`Purple digit d${psych.purple} is on losing side`);
    }
  }

  // 7. Parity & digit constraints
  if (z.kind === "UNDER") {
    if (psych.green % 2 === 0) reasons.push(`UNDER Green d${psych.green} must be odd`);
    if (psych.red % 2 !== 0 || psych.red === 8)
      reasons.push(`UNDER Red d${psych.red} must be even and never 8`);
  } else {
    if (psych.green % 2 !== 0) reasons.push(`OVER Green d${psych.green} must be even`);
    if (psych.red % 2 === 0 || psych.red === 1)
      reasons.push(`OVER Red d${psych.red} must be odd and never 1`);
  }

  // 8. Insufficient formation persistence
  if (z.ageTicks < MIN_QUALIFICATION_PERSISTENCE_TICKS) {
    reasons.push(
      `Insufficient formation persistence (${z.ageTicks} ticks < ${MIN_QUALIFICATION_PERSISTENCE_TICKS} required)`,
    );
  }

  // 9. Insufficient liquidity evidence floor
  if (acc.accumulatedLiquidity < MIN_ACCUMULATED_LIQUIDITY_FLOOR) {
    reasons.push(
      `Accumulated liquidity below floor (${acc.accumulatedLiquidity.toFixed(0)}% < ${MIN_ACCUMULATED_LIQUIDITY_FLOOR}%)`,
    );
  }

  // 10. Stale formation check (feed inactive for > 45s)
  const now = Date.now();
  if (now - z.currentTimestamp > 45_000) {
    reasons.push("Stale market feed observation (>45s inactive)");
  }

  const isQualified = reasons.length === 0;
  let status: QualificationStatus = "QUALIFIED";
  if (!isQualified) {
    if (psych.outcome === "WATCH" && reasons.every((r) => r.toLowerCase().includes("watch"))) {
      status = "WATCH";
    } else {
      status = "NOT_QUALIFIED";
    }
  }

  return {
    isQualified,
    status,
    reasons,
  };
}

/**
 * Deterministic Composite Formation Score (0 to 100).
 *
 * Follows the 15 evaluation dimensions specified in Requirement 10:
 * 1. Hard qualification
 * 2. Psychology validity
 * 3. Formation maturity
 * 4. Formation persistence
 * 5. Liquidity strength
 * 6. Reservoir strength
 * 7. Dominant exhaustion
 * 8. Delivery strength
 * 9. Migration/rotation
 * 10. Absorption
 * 11. Release readiness
 * 12. Multi-window agreement
 * 13. Conflict penalty
 * 14. Formation trajectory
 * 15. Overall ranking score
 */
export function calculateFormationRankScore(z: LiquidityZone): number {
  const acc = z.accumulators;
  const psych = z.currentPsychology;

  // Base liquidity & temporal dynamics
  const liquidityPart = acc.accumulatedLiquidity * 0.22;
  const exhaustionPart = acc.dominantExhaustion * 0.18;
  const deliveryPart = acc.delivery * 0.18;
  const reservoirPart = acc.reservoirPersistence * 0.12;
  const migrationPart = acc.migration * 0.1;
  const absorptionPart = acc.absorption * 0.08;

  // Release readiness bonus (positive acceleration towards release)
  const releaseBonus = Math.max(0, acc.deliveryAcceleration) * 0.15;

  // Multi-window agreement
  const multiWin = calculateMultiWindowSupport(z);
  const multiWinPart = (multiWin.count / multiWin.total) * 8.0;

  // Formation persistence bonus (saturates around 120 ticks)
  const persistenceBonus = Math.min(1, z.ageTicks / 120) * 6.0;

  // Psychology contribution
  const psychBonus = psych.valid ? 4.0 : psych.outcome === "WATCH" ? 0 : -4.0;

  // Lifecycle maturity tier bonus
  let stateBonus = 0;
  switch (z.lifecycleState) {
    case "CONFIRMED":
      stateBonus = 10;
      break;
    case "RELEASE":
      stateBonus = 8;
      break;
    case "RIPE":
      stateBonus = 6;
      break;
    case "RELEASE_WATCH":
      stateBonus = 4;
      break;
    case "EXHAUSTING":
      stateBonus = 3;
      break;
    case "ABSORBING":
      stateBonus = 2;
      break;
    case "MATURE":
      stateBonus = 1;
      break;
    case "CONFLICTED":
      stateBonus = -10;
      break;
    case "BLOCKED":
      stateBonus = -20;
      break;
    case "INVALIDATED":
      stateBonus = -35;
      break;
    default:
      stateBonus = 0;
  }

  // Conflict & contradiction penalties
  const conflictPenalty = acc.conflict * 0.12;
  const contradictionPenalty = acc.contradiction * 0.1;

  // Trajectory bonus
  const traj = determineTrajectory(z);
  let trajBonus = 0;
  if (traj === "STRENGTHENING" || traj === "RELEASING") trajBonus = 3.0;
  else if (traj === "WEAKENING" || traj === "INVALIDATING") trajBonus = -4.0;

  const rawScore =
    liquidityPart +
    exhaustionPart +
    deliveryPart +
    reservoirPart +
    migrationPart +
    absorptionPart +
    releaseBonus +
    multiWinPart +
    persistenceBonus +
    psychBonus +
    stateBonus +
    trajBonus -
    conflictPenalty -
    contradictionPenalty;

  return Math.round(clamp(rawScore, 0, 100) * 10) / 10;
}

/**
 * Deterministic comparison function between two LiquidityZones:
 * Returns > 0 if a is better than b, < 0 if b is better than a, 0 if equal.
 *
 * CRITICAL RULE:
 * Ranking answers "What is currently ranked #1?"
 * Qualification answers "Does it pass structural rules?"
 * Therefore, comparison is based purely on formation strength and deterministic tie-breakers.
 * Non-qualified formations are NEVER filtered out or artificially demoted before ranking.
 */
export function compareLiquidityFormations(a: LiquidityZone, b: LiquidityZone): number {
  // 1. Composite score comparison (rank by overall strength!)
  const aScore = calculateFormationRankScore(a);
  const bScore = calculateFormationRankScore(b);
  const scoreDiff = aScore - bScore;
  if (Math.abs(scoreDiff) >= 0.1) {
    return scoreDiff;
  }

  // 2. Tie-breaker: formation persistence / age
  const ageDiff = a.ageTicks - b.ageTicks;
  if (ageDiff !== 0) return ageDiff;

  // 3. Tie-breaker: dominant exhaustion
  const exhaustDiff = a.accumulators.dominantExhaustion - b.accumulators.dominantExhaustion;
  if (exhaustDiff !== 0) return exhaustDiff;

  // 4. Tie-breaker: delivery
  return a.accumulators.delivery - b.accumulators.delivery;
}

/**
 * Evaluate whether a candidate formation is MATERIALLY SUPERIOR to the current selection.
 *
 * Strict anti-churn criteria:
 * - Candidate MUST be an active eligible formation.
 * - Candidate MUST have sufficient formation persistence (not a 1-tick flash).
 * - Candidate score MUST exceed current score by at least SUPERIORITY_MARGIN (+7.0 points).
 *   OR candidate reached confirmed structural release (CONFIRMED/RELEASE) with at least +4.0 advantage.
 */
export function isMateriallySuperior(
  candidate: LiquidityZone,
  current: LiquidityZone,
): SuperiorityEvaluation {
  // Same zone cannot be superior to itself
  if (candidate.zoneId === current.zoneId) {
    return { isSuperior: false, scoreDelta: 0 };
  }

  // 1. Must be active and eligible
  if (candidate.isTerminal || candidate.lifecycleState === "INVALIDATED") {
    return {
      isSuperior: false,
      scoreDelta: 0,
      reason: "Candidate is invalidated or terminal",
    };
  }

  // 2. Minimum persistence requirement
  if (candidate.ageTicks < MIN_OVERRIDE_PERSISTENCE_TICKS) {
    return {
      isSuperior: false,
      scoreDelta: 0,
      reason: `Candidate has insufficient persistence (${candidate.ageTicks} < ${MIN_OVERRIDE_PERSISTENCE_TICKS} ticks)`,
    };
  }

  const currentScore = calculateFormationRankScore(current);
  const candidateScore = calculateFormationRankScore(candidate);
  const scoreDelta = Math.round((candidateScore - currentScore) * 10) / 10;

  // 3. Structural progression override:
  // If candidate is CONFIRMED or RELEASE and current is still in FORMING/BUILDING,
  // lower superiority margin to +4.0 points.
  const isCandidateAdvanced =
    candidate.lifecycleState === "CONFIRMED" || candidate.lifecycleState === "RELEASE";
  const isCurrentEarly =
    current.lifecycleState === "FORMING" ||
    current.lifecycleState === "BUILDING" ||
    current.lifecycleState === "MATURE";

  const effectiveMargin = isCandidateAdvanced && isCurrentEarly ? 4.0 : SUPERIORITY_MARGIN;

  if (scoreDelta >= effectiveMargin) {
    return {
      isSuperior: true,
      scoreDelta,
      reason: `Materially stronger liquidity formation (+${scoreDelta.toFixed(1)} pts, ${candidate.lifecycleState} with ${candidate.ageTicks} ticks persistence).`,
    };
  }

  return {
    isSuperior: false,
    scoreDelta,
    reason: `Difference (+${scoreDelta.toFixed(1)} pts) does not satisfy superiority threshold (+${effectiveMargin.toFixed(1)} pts required).`,
  };
}

/**
 * Compiles a full ScanResult object from a LiquidityZone.
 */
export function buildScanResult(
  zone: LiquidityZone,
  rank = 1,
  overrideMetadata?: {
    isOverride: boolean;
    overrideCount: number;
    previousZoneId?: string;
    previousMarketContract?: string;
    previousScore?: number;
    overrideReason?: string;
  },
): ScanResult {
  const acc = zone.accumulators;
  const psych = zone.currentPsychology;
  const qual = qualifyFormation(zone);
  const multiWin = calculateMultiWindowSupport(zone);
  const score = calculateFormationRankScore(zone);
  const now = Date.now();

  const psychologyScore = Math.round(acc.psychologyIntegrity);
  const conflictLevel: "LOW" | "MODERATE" | "HIGH" =
    acc.conflict < 30 ? "LOW" : acc.conflict < 55 ? "MODERATE" : "HIGH";

  const durationTicks = Math.max(1, zone.currentTick - zone.formationStartTick);

  return {
    zoneId: zone.zoneId,
    market: zone.market,
    symbol: zone.symbol,
    contract: zone.contract,
    contractId: zone.contractId,
    kind: zone.kind,
    barrier: zone.barrier,

    rank,
    rankingScore: score,
    score,
    scannedAt: now,
    formattedTime: formatScanTime(now),

    psychologyScore,
    psychologyValidity: psych.valid ? "VALID" : psych.outcome === "WATCH" ? "WATCH" : "REJECT",
    psychologyReasons: [...psych.reasons],
    liquidityScore: Math.round(acc.accumulatedLiquidity),
    formationScore: Math.round(acc.accumulatedLiquidity),
    formationAge: zone.ageTicks,
    formationDuration: durationTicks,
    formationAgeSeconds: zone.ageSeconds,

    reservoirScore: Math.round(acc.reservoirPersistence),
    reservoirRatio: multiWin.ratio,
    dominantExhaustion: Math.round(acc.dominantExhaustion),
    deliveryScore: Math.round(acc.delivery),
    migrationScore: Math.round(acc.migration),
    absorptionScore: Math.round(acc.absorption),
    releaseReadiness: Math.round(
      clamp(acc.delivery * 0.6 + Math.max(0, acc.deliveryAcceleration) * 0.4),
    ),
    conflictLevel,
    conflictScore: Math.round(acc.conflict),

    lifecycleState: zone.lifecycleState,
    multiWindowSupport: multiWin.ratio,
    trajectory: determineTrajectory(zone),

    qualified: qual.isQualified,
    qualificationStatus: qual.status,
    qualificationReasons: [...qual.reasons],
    qualificationReason: qual.isQualified
      ? "QUALIFIED — Passed all hard Sentinel psychology and structural evidence gates"
      : qual.reasons.join("; ") || "Did not pass structural qualification gates",

    isOverride: overrideMetadata?.isOverride ?? false,
    overrideCount: overrideMetadata?.overrideCount ?? 0,
    previousZoneId: overrideMetadata?.previousZoneId,
    previousMarketContract: overrideMetadata?.previousMarketContract,
    previousScore: overrideMetadata?.previousScore,
    overrideReason: overrideMetadata?.overrideReason,
    overrideAt: overrideMetadata?.isOverride ? now : undefined,

    isInvalidated: zone.isTerminal || zone.lifecycleState === "INVALIDATED",
    invalidationReason: zone.invalidationReason,
  };
}

/**
 * Scan all persistent zones in the registry:
 * 1. Read current persistent formations
 * 2. Calculate ranking for all rankable formations (RANK FIRST, QUALIFY SECOND)
 * 3. Sort all formations -> #1 is the best ranked formation (regardless of qualification)
 * 4. Separately identify the best qualified formation
 */
export function scanBestLiquidityFormation(registry: ZoneRegistry): {
  bestRanked: ScanResult | null;
  bestQualified: ScanResult | null;
  allRanked: ScanResult[];
  qualifiedCount: number;
  totalActiveCount: number;
} {
  const activeZones = registry.snapshot.activeZones.filter(isEligibleFormation);

  if (activeZones.length === 0) {
    return {
      bestRanked: null,
      bestQualified: null,
      allRanked: [],
      qualifiedCount: 0,
      totalActiveCount: 0,
    };
  }

  // 1. Sort all formations by overall strength (Descending: highest score first)
  const sorted = [...activeZones].sort((a, b) => compareLiquidityFormations(b, a));

  // 2. Build scan results with their individual ranks (1, 2, 3...)
  const allRanked: ScanResult[] = sorted.map((z, idx) => buildScanResult(z, idx + 1));

  // 3. Best ranked is ALWAYS #1
  const bestRanked = allRanked[0] ?? null;

  // 4. Best qualified is the highest-ranked qualified formation (or null if none qualify)
  const qualifiedList = allRanked.filter((res) => res.qualified);
  const bestQualified = qualifiedList[0] ?? null;

  return {
    bestRanked,
    bestQualified,
    allRanked,
    qualifiedCount: qualifiedList.length,
    totalActiveCount: activeZones.length,
  };
}

/**
 * Singleton Scanner Controller.
 * Connects user manual scans, 60s cooldown timer, live background formation tracking,
 * and the Smart Superiority Override mechanism.
 */
export class BestLiquidityScanner {
  private listeners = new Set<() => void>();
  private currentSelection: ScanResult | null = null; // #1 Ranked formation
  private bestQualified: ScanResult | null = null; // Best qualified formation (or null if none)
  private allRanked: ScanResult[] = [];
  private lastScanTimestamp: number | null = null;
  private isScanning = false;
  private noRankedFound = false;
  private noQualifiedFound = false;
  private overrideCount = 0;
  private lastOverride: ScannerState["lastOverride"] = null;
  private totalScansPerformed = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  private snapshot: ScannerState = {
    currentSelection: null,
    bestQualified: null,
    allRanked: [],
    lastScanTimestamp: null,
    cooldownRemainingSeconds: 0,
    cooldownActive: false,
    isScanning: false,
    noRankedFound: false,
    noQualifiedFound: false,
    totalScansPerformed: 0,
    overrideCount: 0,
    lastOverride: null,
  };

  constructor() {
    this.updateSnapshot();
    // Only run interval in browser
    if (typeof window !== "undefined") {
      this.timer = setInterval(() => this.tickTimer(), 1000);
    }
  }

  private updateSnapshot() {
    const now = Date.now();
    const elapsed = this.lastScanTimestamp ? now - this.lastScanTimestamp : Infinity;
    const cooldownActive = elapsed < COOLDOWN_MS;
    const cooldownRemainingSeconds = cooldownActive
      ? Math.max(0, Math.ceil((COOLDOWN_MS - elapsed) / 1000))
      : 0;

    this.snapshot = {
      currentSelection: this.currentSelection,
      bestQualified: this.bestQualified,
      allRanked: this.allRanked,
      lastScanTimestamp: this.lastScanTimestamp,
      cooldownRemainingSeconds,
      cooldownActive,
      isScanning: this.isScanning,
      noRankedFound: this.noRankedFound,
      noQualifiedFound: this.noQualifiedFound,
      totalScansPerformed: this.totalScansPerformed,
      overrideCount: this.overrideCount,
      lastOverride: this.lastOverride,
    };
  }

  getState = (): ScannerState => {
    if (this.lastScanTimestamp) {
      const now = Date.now();
      const elapsed = now - this.lastScanTimestamp;
      const cooldownActive = elapsed < COOLDOWN_MS;
      const cooldownRemainingSeconds = cooldownActive
        ? Math.max(0, Math.ceil((COOLDOWN_MS - elapsed) / 1000))
        : 0;
      if (
        cooldownActive !== this.snapshot.cooldownActive ||
        cooldownRemainingSeconds !== this.snapshot.cooldownRemainingSeconds
      ) {
        this.updateSnapshot();
      }
    }
    return this.snapshot;
  };

  getSnapshot = (): ScannerState => this.getState();

  getServerSnapshot = (): ScannerState => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.updateSnapshot();
    for (const fn of this.listeners) {
      fn();
    }
  }

  private tickTimer() {
    // If cooldown is running, emit notification each second so UI button updates smoothly
    if (this.lastScanTimestamp && Date.now() - this.lastScanTimestamp <= COOLDOWN_MS + 1000) {
      this.notify();
    }
  }

  /**
   * User-triggered Scan.
   * Performs an intentional scan of already-accumulated liquidity formations in the registry.
   * Always selects and displays the #1 ranked formation, even if not qualified.
   */
  scan(registry: ZoneRegistry): ScanResult | null {
    this.isScanning = true;
    this.notify();

    const now = Date.now();
    const { bestRanked, bestQualified, allRanked, qualifiedCount } =
      scanBestLiquidityFormation(registry);

    this.lastScanTimestamp = now;
    this.totalScansPerformed++;
    this.isScanning = false;

    if (bestRanked) {
      this.currentSelection = bestRanked;
      this.bestQualified = bestQualified;
      this.allRanked = allRanked;
      this.noRankedFound = false;
      this.noQualifiedFound = qualifiedCount === 0;
    } else {
      this.currentSelection = null;
      this.bestQualified = null;
      this.allRanked = [];
      this.noRankedFound = true;
      this.noQualifiedFound = true;
    }

    this.notify();
    return this.currentSelection;
  }

  /**
   * Continuous background engine evaluation:
   * 1. Updates live metrics of currentSelection (#1) if still active (preserving zoneId identity!).
   * 2. Checks if currentSelection became invalidated.
   * 3. Evaluates if ANY other persistent zone is MATERIALLY SUPERIOR. If so, overrides immediately.
   */
  onEngineCycle(registry: ZoneRegistry) {
    if (!this.currentSelection) return;

    const activeZones = registry.snapshot.activeZones.filter(isEligibleFormation);
    const currentZoneId = this.currentSelection.zoneId;
    const liveCurrentZone = activeZones.find((z) => z.zoneId === currentZoneId);

    // 1. Live zone update or invalidation tracking
    if (liveCurrentZone) {
      const isTerminal =
        liveCurrentZone.isTerminal || liveCurrentZone.lifecycleState === "INVALIDATED";
      if (isTerminal) {
        this.currentSelection.isInvalidated = true;
        this.currentSelection.invalidationReason =
          liveCurrentZone.invalidationReason || "Formation invalidated by structural rules";
        this.currentSelection.lifecycleState = "INVALIDATED";
        this.notify();
      } else {
        // Update live metrics while preserving original scan timestamp and stable zoneId
        const updated = buildScanResult(liveCurrentZone, 1, {
          isOverride: this.currentSelection.isOverride,
          overrideCount: this.currentSelection.overrideCount,
          previousZoneId: this.currentSelection.previousZoneId,
          previousMarketContract: this.currentSelection.previousMarketContract,
          previousScore: this.currentSelection.previousScore,
          overrideReason: this.currentSelection.overrideReason,
        });
        updated.scannedAt = this.currentSelection.scannedAt;
        updated.formattedTime = this.currentSelection.formattedTime;
        this.currentSelection = updated;
        this.notify();
      }
    } else {
      // Zone might be in historical zones (invalidated)
      const hist = registry.snapshot.historicalZones.find((z) => z.zoneId === currentZoneId);
      if (hist) {
        this.currentSelection.isInvalidated = true;
        this.currentSelection.invalidationReason =
          hist.invalidationReason || "Formation retired from active registry";
        this.currentSelection.lifecycleState = "INVALIDATED";
        this.notify();
      }
    }

    // 2. Also keep bestQualified updated if active
    if (this.bestQualified) {
      const bestQualZone = activeZones.find((z) => z.zoneId === this.bestQualified?.zoneId);
      if (bestQualZone) {
        const qual = qualifyFormation(bestQualZone);
        if (qual.isQualified) {
          this.bestQualified = buildScanResult(bestQualZone, this.bestQualified.rank);
        } else {
          // Re-evaluate best qualified
          const remainingQualified = activeZones
            .map((z) => buildScanResult(z, 0))
            .filter((r) => r.qualified)
            .sort((a, b) => b.score - a.score);
          this.bestQualified = remainingQualified[0] ?? null;
          this.noQualifiedFound = this.bestQualified === null;
        }
      } else {
        const remainingQualified = activeZones
          .map((z) => buildScanResult(z, 0))
          .filter((r) => r.qualified)
          .sort((a, b) => b.score - a.score);
        this.bestQualified = remainingQualified[0] ?? null;
        this.noQualifiedFound = this.bestQualified === null;
      }
    } else {
      // Check if a qualified formation emerged
      const remainingQualified = activeZones
        .map((z) => buildScanResult(z, 0))
        .filter((r) => r.qualified)
        .sort((a, b) => b.score - a.score);
      if (remainingQualified.length > 0) {
        this.bestQualified = remainingQualified[0] ?? null;
        this.noQualifiedFound = false;
      }
    }

    // 3. Smart Superiority Override evaluation
    if (liveCurrentZone) {
      for (const candidate of activeZones) {
        if (candidate.zoneId === currentZoneId) continue;

        const evalResult = isMateriallySuperior(candidate, liveCurrentZone);
        if (evalResult.isSuperior) {
          // Perform Immediate Superiority Override!
          const prevZone = liveCurrentZone;
          const prevScore = this.currentSelection.score;
          const prevLabel = `${prevZone.symbol} ${prevZone.contract}`;
          this.overrideCount++;

          const newSelection = buildScanResult(candidate, 1, {
            isOverride: true,
            overrideCount: this.overrideCount,
            previousZoneId: prevZone.zoneId,
            previousMarketContract: prevLabel,
            previousScore: prevScore,
            overrideReason: evalResult.reason,
          });

          this.lastOverride = {
            at: Date.now(),
            previous: `${prevLabel} (${prevScore.toFixed(1)})`,
            next: `${candidate.symbol} ${candidate.contract} (${newSelection.score.toFixed(1)})`,
            reason: evalResult.reason || "Materially superior formation detected",
            scoreDelta: evalResult.scoreDelta,
          };

          this.currentSelection = newSelection;
          this.noRankedFound = false;
          this.notify();
          break;
        }
      }
    }
  }

  // Clear / reset for testing or maintenance
  reset() {
    this.currentSelection = null;
    this.bestQualified = null;
    this.allRanked = [];
    this.lastScanTimestamp = null;
    this.isScanning = false;
    this.noRankedFound = false;
    this.noQualifiedFound = false;
    this.overrideCount = 0;
    this.lastOverride = null;
    this.totalScansPerformed = 0;
    this.notify();
  }
}

let scannerSingleton: BestLiquidityScanner | null = null;

export function getLiquidityScanner(): BestLiquidityScanner {
  if (!scannerSingleton) {
    scannerSingleton = new BestLiquidityScanner();
  }
  return scannerSingleton;
}
