/**
 * LIQUIDITY INTELLIGENCE V3 — FORMATION MEMORY + EVIDENCE TIMELINE + TRAJECTORY + STABLE LIFECYCLE
 *
 * Layer B: Canonical Formation Memory & Zone Registry.
 *
 * Core Architecture & Constraints:
 * 1. A TICK IS AN OBSERVATION. A TICK IS NOT LIQUIDITY.
 * 2. OBSERVATIONS ACCUMULATE EVIDENCE OVER TIME.
 * 3. ACCUMULATED EVIDENCE CREATES LIQUIDITY FORMATION (STABLE IDENTITY + MEMORY).
 * 4. DETERMINISTIC FORMATION IDENTITIES (e.g. R_50-UNDER7-GEN-01) SURVIVE ACROSS TICKS.
 * 5. EVIDENCE TIMELINE LOGS REAL FORMATION EVENTS (DEBOUNCED, NOT FABRICATED).
 * 6. MULTI-WINDOW TRAJECTORY MEASURES QUALITY & MOMENTUM (1000 down to 10).
 * 7. HYSTERESIS + MINIMUM DWELL PREVENT TICK-BY-TICK LIFECYCLE FLAPPING.
 * 8. RANKING AND QUALIFICATION REMAIN STRICTLY SEPARATE.
 */

import { clamp, mean } from "./math";
import type { MarketAnalysis, ContractAnalysis } from "./engine";
import type { Side, DigitTemporal, TransitionEvidence } from "./liquidity-v3";

export type LiquidityPhase =
  | "NO_LIQUIDITY"
  | "CANDIDATE"
  | "FORMING"
  | "BUILDING"
  | "MATURE"
  | "EXHAUSTION_WATCH"
  | "EXHAUSTION_CONFIRMED"
  | "EXHAUSTING"
  | "DELIVERY"
  | "DELIVERY_ACCELERATING"
  | "ABSORBING"
  | "RELEASE_WATCH"
  | "RELEASE"
  | "RIPE"
  | "DIRECTIONAL_MOVE"
  | "CONFIRMED"
  | "INVALIDATED"
  | "BLOCKED"
  | "CONFLICTED";

export type ZoneLifecycleState = LiquidityPhase;

export type FormationEventType =
  | "FORMATION_CREATED"
  | "RESERVOIR_FORMED"
  | "RESERVOIR_STRENGTHENED"
  | "DOMINANT_STRENGTHENED"
  | "DOMINANT_WEAKENED"
  | "EXHAUSTION_STARTED"
  | "EXHAUSTION_CONFIRMED"
  | "DELIVERY_STARTED"
  | "DELIVERY_STRENGTHENED"
  | "MIGRATION_DETECTED"
  | "PURPLE_ALIGNMENT"
  | "ABSORPTION_STARTED"
  | "ABSORPTION_STRENGTHENED"
  | "STRUCTURAL_SHIFT"
  | "RELEASE_WATCH"
  | "RELEASE_DETECTED"
  | "QUALIFICATION_CHANGED"
  | "RANK_CHANGED"
  | "CONFLICT_DETECTED"
  | "FORMATION_WEAKENED"
  | "FORMATION_INVALIDATED"
  | "FORMATION_REACTIVATED";

export interface FormationTimelineEvent {
  id: string;
  at: number;
  timeStr: string;
  tick: number;
  type: FormationEventType;
  title: string;
  description: string;
  phase: ZoneLifecycleState;
  score?: number;
}

export interface SentinelPsychologySnapshot {
  green: number;
  secondGreen: number;
  red: number;
  secondRed: number;
  purple: number | null;
  valid: boolean;
  outcome: "ACCEPT" | "WATCH" | "REJECT";
  reasons: string[];
  pct: number[];
  pressure: number[];
}

export interface EvidenceAccumulators {
  reservoirPersistence: number;
  dominantPersistence: number;
  dominantExhaustion: number;
  delivery: number;
  deliveryAcceleration: number;
  migration: number;
  absorption: number;
  structuralDeparture: number;
  psychologyIntegrity: number;
  conflict: number;
  contradiction: number;
  evidenceDecay: number;
  accumulatedLiquidity: number;
}

export interface EvidenceSnapshot {
  timestamp: number;
  tickIndex: number;
  phase: ZoneLifecycleState;

  reservoirScore: number;
  exhaustionScore: number;
  deliveryScore: number;
  migrationScore: number;
  absorptionScore: number;

  psychologyValidity: boolean;

  dominantDigits: number[];
  reservoirDigits: number[];

  dominantRate: number;
  reservoirRate: number;

  dominantPressure: number;
  reservoirPressure: number;

  transitionDelta: number;

  entropy: number;
  jsd: number;

  rankingScore: number;
  qualificationStatus: string;

  // Restored signal indicators
  liquidityLevel: number;
  psychologyAdherence: number;
}

export interface FormationTrajectoryData {
  direction: "STRENGTHENING" | "STABLE" | "WEAKENING" | "REVERSING" | "CONFLICTED";
  scoreSlope: number;
  reservoirTrend: number;
  exhaustionTrend: number;
  deliveryTrend: number;
  migrationTrend: number;
  absorptionTrend: number;
  evidenceMomentum: number;
  persistence: number;
  acceleration: number;
  consistency: number;
  lastMeaningfulChange: number;
}

export interface PhaseTransition {
  from: ZoneLifecycleState;
  to: ZoneLifecycleState;
  tick: number;
  at: number;
  reason: string;
}

export interface PsychologyComplianceDetails {
  greenCompliant: boolean;
  greenPass?: boolean;
  secondGreenCompliant: boolean;
  secondGreenPass?: boolean;
  redCompliant: boolean;
  redPass?: boolean;
  secondRedCompliant: boolean;
  secondRedPass?: boolean;
  purpleCompliant: boolean;
  purplePass?: boolean;
  sentinelStatus: "ACCEPT" | "WATCH" | "REJECT";
  adherenceScore: number;
  reasons: string[];
}

export interface LiquidityComposition {
  reservoir: number;
  maturation: number;
  exhaustion: number;
  delivery: number;
  persistence: number;
  structure: number;
}

export interface ZoneEvent {
  id: string;
  at: number;
  tick: number;
  zoneId: string;
  market: string;
  symbol: string;
  contract: string;
  type: string;
  description: string;
  state: ZoneLifecycleState;
  evidenceSummary: string;
  liquidityLevel?: number;
  psychologyAdherence?: number;
  rankScore?: number;
}

export interface LiquidityZone {
  // Deterministic stable identity e.g. R_50-UNDER7-GEN-01
  zoneId: string;
  id: string; // alias
  generation: number;
  market: string;
  marketId: string; // alias
  symbol: string;
  marketGroup: string;
  contract: string;
  contractId: string;
  kind: "OVER" | "UNDER";
  side: "OVER" | "UNDER";
  barrier: number;

  creationTick: number;
  creationTimestamp: number;
  currentTick: number;
  currentTimestamp: number;
  ageTicks: number;
  ageSeconds: number;
  formationStartTick: number;
  formationStartTimestamp: number;

  lastMeaningfulEvidenceTick: number;
  lastStructuralChangeTick: number;
  lastStructuralChangeTimestamp: number;

  initialPsychology: SentinelPsychologySnapshot;
  currentPsychology: SentinelPsychologySnapshot;

  // Restored First-Class Signal Indicators
  liquidityLevel: number;
  liquidityTrend: number;
  liquidityAcceleration: number;
  psychologyAdherence: number;
  psychologyDetails: PsychologyComplianceDetails;
  liquidityComposition: LiquidityComposition;

  reservoirDigits: number[];
  dominantDigits: number[];

  accumulators: EvidenceAccumulators;

  lifecycleState: ZoneLifecycleState;
  phase: ZoneLifecycleState; // alias
  previousLifecycleState: ZoneLifecycleState;
  previousPhase?: ZoneLifecycleState;
  stateEnteredAt: number;
  phaseSince: number;
  stateEnteredTick: number;
  phaseAgeTicks: number;
  stateDurationTicks: number;

  releaseEvidence: string[];
  confirmationEvidence: string[];
  invalidationReason: string | null;

  qualified: boolean;
  qualificationReason: string | null;

  // Formation Memory & Timeline
  evidenceHistory: EvidenceSnapshot[];
  phaseHistory: PhaseTransition[];
  timeline: FormationTimelineEvent[];
  ledger: ZoneEvent[];
  trajectory: FormationTrajectoryData;
  trajectoryHistory: number[];
  rankingScore: number;
  isTerminal: boolean;

  // Milestone deduplication set
  milestones?: Set<string>;

  // Multi-window telescope from underlying analysis
  temporal?: Record<number, DigitTemporal>;
  transitions?: TransitionEvidence[];
}

export type Formation = LiquidityZone;

export interface ZoneCandidate {
  candidateId: string;
  symbol: string;
  contractId: string;
  kind: "OVER" | "UNDER";
  barrier: number;
  firstSeenTick: number;
  firstSeenTimestamp: number;
  persistenceTicks: number;
  consecutiveQualifiedTicks: number;
  initialPsychology: SentinelPsychologySnapshot;
  reasons: string[];
}

export interface ZoneRegistrySnapshot {
  version: number;
  activeZones: LiquidityZone[];
  releaseWatch: LiquidityZone[];
  formationWatch: LiquidityZone[];
  conflictedZones: LiquidityZone[];
  historicalZones: LiquidityZone[];
  ledger: ZoneEvent[];
  candidateCount: number;
  activeCount: number;
  qualifiedCount: number;
  invalidatedCount: number;
  historicalCount: number;
}

const MIN_CANDIDATE_PERSISTENCE_TICKS = 12;
const MIN_DWELL_TICKS = 8;
const MIN_EVIDENCE_FOR_PROMOTION = 36;
const DECAY_HALF_LIFE_TICKS = 60;
const TRAJECTORY_CAP = 120;
const SNAPSHOT_HISTORY_CAP = 80;
const TIMELINE_CAP = 40;
const LEDGER_CAP = 250;

let globalEventSeq = 1000;
let globalTimelineSeq = 5000;

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function generateDeterministicZoneId(
  symbol: string,
  contractId: string,
  generation: number,
): string {
  const shortSym = symbol.replace(/[^A-Za-z0-9]/g, "");
  const genStr = `GEN-${String(generation).padStart(2, "0")}`;
  return `${shortSym}-${contractId}-${genStr}`;
}

/**
 * Authoritatively calculates psychology adherence (0-100) and compliance breakdown
 * directly against Sentinel psychology rules.
 */
export function calculatePsychologyAdherence(
  psych: SentinelPsychologySnapshot,
  side: "OVER" | "UNDER",
  barrier: number,
  reservoirDigits: number[] = [],
): { adherence: number; details: PsychologyComplianceDetails } {
  const resDigits = Array.isArray(reservoirDigits) ? reservoirDigits : [];
  const winners = [...Array(10).keys()].filter((d) =>
    side === "OVER" ? d > barrier : d < barrier,
  );
  const losers = [...Array(10).keys()].filter((d) => !winners.includes(d));

  const reasons: string[] = [];

  // 1. Red Compliance (max 25 pts)
  const redInWinners = winners.includes(psych.red);
  let redParityCompliant = true;
  if (side === "UNDER") {
    if (psych.red % 2 !== 0 || psych.red === 8) {
      redParityCompliant = false;
    }
  } else {
    if (psych.red % 2 === 0 || psych.red === 1) {
      redParityCompliant = false;
    }
  }
  const redCompliant = redInWinners && redParityCompliant;
  let redScore = 0;
  if (redInWinners) {
    redScore += 15;
    if (redParityCompliant) redScore += 10;
  } else {
    reasons.push(`Red d${psych.red} is losing-side`);
  }
  if (redInWinners && !redParityCompliant) {
    reasons.push(
      side === "UNDER"
        ? `UNDER Red d${psych.red} must be even and never 8`
        : `OVER Red d${psych.red} must be odd and never 1`,
    );
  }

  // 2. Green Compliance (max 20 pts)
  const greenInWinners = winners.includes(psych.green);
  let greenCompliant = false;
  let greenScore = 0;
  const gp = psych.pct[psych.green] ?? 0.1;
  const gPressure = psych.pressure[psych.green] ?? 0;

  if (greenInWinners) {
    const parityOk = side === "UNDER" ? psych.green % 2 !== 0 : psych.green % 2 === 0;
    if (parityOk) {
      greenCompliant = true;
      greenScore = 20;
    } else {
      greenScore = 10;
      reasons.push(
        side === "UNDER"
          ? `UNDER Green d${psych.green} must be odd`
          : `OVER Green d${psych.green} must be even`,
      );
    }
  } else {
    // Conditional Green on losing side
    if (gp >= 0.105 && gPressure <= 0.005) {
      greenCompliant = true;
      greenScore = 18;
    } else if (gp >= 0.105) {
      greenScore = 12;
      reasons.push(`Green d${psych.green} is elevated but still increasing on losing side`);
    } else {
      greenScore = 4;
      reasons.push(`Green d${psych.green} is losing-side and below 10.5% exhaustion`);
    }
  }

  // 3. Second Red Compliance (max 15 pts)
  const secondRedCompliant = winners.includes(psych.secondRed);
  const secondRedScore = secondRedCompliant ? 15 : 0;
  if (!secondRedCompliant) {
    reasons.push(`2nd Red d${psych.secondRed} is in losing zone`);
  }

  // 4. Second Green Compliance (max 10 pts)
  const secondGreenCompliant = winners.includes(psych.secondGreen);
  const secondGreenScore = secondGreenCompliant ? 10 : 2;
  if (!secondGreenCompliant) {
    reasons.push(`2nd Green d${psych.secondGreen} is in losing zone`);
  }

  // 5. Purple Compliance (max 15 pts)
  let purpleCompliant = true;
  let purpleScore = 10;
  if (psych.purple !== null) {
    const purpleInWinners = winners.includes(psych.purple);
    purpleCompliant = purpleInWinners;
    if (purpleInWinners) {
      const alignsReservoir = resDigits.includes(psych.purple);
      purpleScore = alignsReservoir ? 15 : 12;
    } else {
      purpleScore = 0;
      reasons.push(`Purple d${psych.purple} is growing in losing zone`);
    }
  } else {
    purpleScore = 12; // Distributed, neutral
  }

  // 6. Losing Bars Count (max 15 pts)
  const bars = [
    psych.green,
    psych.secondGreen,
    psych.red,
    psych.secondRed,
    ...(psych.purple !== null ? [psych.purple] : []),
  ];
  const losingBarsCount = bars.filter((d) => losers.includes(d)).length;
  let losingBarsScore = 15;
  if (losingBarsCount === 1) losingBarsScore = 11;
  else if (losingBarsCount === 2) losingBarsScore = 7;
  else if (losingBarsCount >= 3) {
    losingBarsScore = 0;
    reasons.push(`${losingBarsCount}/5 psychological bars in losing zone`);
  }

  let rawTotal =
    redScore + greenScore + secondRedScore + secondGreenScore + purpleScore + losingBarsScore;

  if (psych.valid) {
    rawTotal = Math.max(82, rawTotal);
  } else if (psych.outcome === "REJECT") {
    rawTotal = Math.min(64, rawTotal);
  } else if (psych.outcome === "WATCH") {
    rawTotal = Math.min(84, rawTotal);
  }

  const adherence = clamp(Math.round(rawTotal), 0, 100);

  return {
    adherence,
    details: {
      greenCompliant,
      greenPass: greenCompliant,
      secondGreenCompliant,
      secondGreenPass: secondGreenCompliant,
      redCompliant,
      redPass: redCompliant,
      secondRedCompliant,
      secondRedPass: secondRedCompliant,
      purpleCompliant,
      purplePass: purpleCompliant,
      sentinelStatus: psych.outcome ?? (psych.valid ? "ACCEPT" : "REJECT"),
      adherenceScore: adherence,
      reasons: reasons.length > 0 ? reasons : ["All Sentinel psychological constraints verified"],
    },
  };
}

/**
 * Calculates continuous formation-specific liquidity level (0-100),
 * trend, and multi-dimensional composition.
 */
export function calculateLiquidityLevel(
  acc: EvidenceAccumulators,
  ageTicks: number,
  psych: SentinelPsychologySnapshot,
  previousLevel?: number,
  previousTrend = 0,
): {
  level: number;
  trend: number;
  acceleration: number;
  composition: LiquidityComposition;
} {
  const reservoir = clamp(acc.reservoirPersistence);
  const maturation = clamp(ageTicks * 3.5, 5, 100);
  const exhaustion = clamp(acc.dominantExhaustion);
  const delivery = clamp(acc.delivery);
  const persistence = clamp(
    (ageTicks >= 16 ? 75 : (ageTicks / 16) * 75) + (acc.delivery > 40 ? 25 : 0),
    10,
    100,
  );
  const structure = clamp(100 - acc.conflict * 0.7 - (psych.valid ? 0 : 25), 10, 100);

  const composition: LiquidityComposition = {
    reservoir: Math.round(reservoir),
    maturation: Math.round(maturation),
    exhaustion: Math.round(exhaustion),
    delivery: Math.round(delivery),
    persistence: Math.round(persistence),
    structure: Math.round(structure),
  };

  // Lifecycle progression:
  // Reservoir creation (0.20) -> Maturation (0.16) -> Exhaustion (0.20) -> Delivery (0.20) -> Persistence (0.12) -> Structure (0.12)
  const weighted =
    reservoir * 0.2 +
    maturation * 0.16 +
    exhaustion * 0.2 +
    delivery * 0.2 +
    persistence * 0.12 +
    structure * 0.12;

  // Single-tick / early formation damping:
  // A single high-score tick must NOT create a high liquidity level.
  let maturationDamping = 1.0;
  if (ageTicks <= 1) {
    maturationDamping = 0.25;
  } else if (ageTicks < 6) {
    maturationDamping = 0.45 + (ageTicks / 6) * 0.25;
  } else if (ageTicks < 14) {
    maturationDamping = 0.7 + ((ageTicks - 6) / 8) * 0.3;
  }

  const rawLevel = clamp(weighted * maturationDamping, 0, 100);

  // Smooth update if previous level exists
  const level =
    previousLevel !== undefined
      ? Math.round(clamp(previousLevel * 0.85 + rawLevel * 0.15, 0, 100))
      : Math.round(rawLevel);

  const trend = Number((level - (previousLevel ?? level)).toFixed(2));
  const acceleration = Number((trend - previousTrend).toFixed(2));

  return {
    level,
    trend,
    acceleration,
    composition,
  };
}

export class ZoneRegistry {
  private candidates = new Map<string, ZoneCandidate>();
  private zones = new Map<string, LiquidityZone>();
  private historical: LiquidityZone[] = [];
  private globalLedger: ZoneEvent[] = [];
  private generationMap = new Map<string, number>();
  private version = 0;
  private creationOrder: string[] = [];

  snapshot: ZoneRegistrySnapshot = {
    version: 0,
    activeZones: [],
    releaseWatch: [],
    formationWatch: [],
    conflictedZones: [],
    historicalZones: [],
    ledger: [],
    candidateCount: 0,
    activeCount: 0,
    qualifiedCount: 0,
    invalidatedCount: 0,
  };

  /**
   * Evaluates Layer A market observation for a single contract.
   * Discovers candidates and feeds persistent zones with cumulative evidence.
   */
  ingest(
    symbol: string,
    marketName: string,
    group: string,
    analysis: MarketAnalysis,
    contract: ContractAnalysis,
    currentTick: number,
  ) {
    const key = `${symbol}:${contract.id}`;
    const now = Date.now();
    const existingZone = this.zones.get(key);

    const psych = contract.psychology1000 ?? analysis.sentinelPsychology;
    const psychSnapshot: SentinelPsychologySnapshot = {
      green: psych.green,
      secondGreen: psych.secondGreen,
      red: psych.red,
      secondRed: psych.secondRed,
      purple: psych.purple ?? null,
      valid: psych.valid,
      outcome: psych.outcome,
      reasons: [...psych.reasons],
      pct: [...psych.pct],
      pressure: [...psych.pressure],
    };

    // Reservoir digits (Red / 2nd Red on winning side)
    const reservoirDigits = [psych.red, psych.secondRed].filter((d) =>
      contract.kind === "OVER" ? d > contract.barrier : d < contract.barrier,
    );
    const dominantDigits = [psych.green, psych.secondGreen];

    // Check candidate eligibility
    const candidateEligible =
      psych.valid &&
      reservoirDigits.length > 0 &&
      contract.creation >= 28 &&
      contract.conflict < 65;

    if (!existingZone) {
      this.handleCandidate(
        key,
        symbol,
        marketName,
        group,
        contract,
        psychSnapshot,
        candidateEligible,
        currentTick,
        now,
      );
      return;
    }

    // Existing zone: update with cumulative evidence (Memory + Accumulation + Decay)
    this.updateZone(
      existingZone,
      analysis,
      contract,
      psychSnapshot,
      reservoirDigits,
      dominantDigits,
      currentTick,
      now,
    );
  }

  private handleCandidate(
    key: string,
    symbol: string,
    marketName: string,
    group: string,
    contract: ContractAnalysis,
    psych: SentinelPsychologySnapshot,
    eligible: boolean,
    currentTick: number,
    now: number,
  ) {
    let candidate = this.candidates.get(key);

    if (!eligible) {
      if (candidate) {
        candidate.consecutiveQualifiedTicks = Math.max(0, candidate.consecutiveQualifiedTicks - 2);
        if (candidate.consecutiveQualifiedTicks === 0) {
          this.candidates.delete(key);
        }
      }
      return;
    }

    if (!candidate) {
      candidate = {
        candidateId: `CAND-${key}-${currentTick}`,
        symbol,
        contractId: contract.id,
        kind: contract.kind,
        barrier: contract.barrier,
        firstSeenTick: currentTick,
        firstSeenTimestamp: now,
        persistenceTicks: 1,
        consecutiveQualifiedTicks: 1,
        initialPsychology: psych,
        reasons: [`Initial reservoir separation observed for ${contract.label}`],
      };
      this.candidates.set(key, candidate);
      return;
    }

    candidate.persistenceTicks++;
    candidate.consecutiveQualifiedTicks++;

    // PROMOTION TEST: requires sustained persistence across multiple ticks
    if (
      candidate.consecutiveQualifiedTicks >= MIN_CANDIDATE_PERSISTENCE_TICKS &&
      contract.creation >= MIN_EVIDENCE_FOR_PROMOTION
    ) {
      this.createZone(key, symbol, marketName, group, contract, candidate, psych, currentTick, now);
      this.candidates.delete(key);
    }
  }

  private createZone(
    key: string,
    symbol: string,
    marketName: string,
    group: string,
    contract: ContractAnalysis,
    candidate: ZoneCandidate,
    psych: SentinelPsychologySnapshot,
    currentTick: number,
    now: number,
  ) {
    const gen = (this.generationMap.get(key) ?? 0) + 1;
    this.generationMap.set(key, gen);
    const zoneId = generateDeterministicZoneId(symbol, contract.id, gen);

    const reservoirDigits = [psych.red, psych.secondRed].filter((d) =>
      contract.kind === "OVER" ? d > contract.barrier : d < contract.barrier,
    );
    const dominantDigits = [psych.green, psych.secondGreen];

    const initialAccumulators: EvidenceAccumulators = {
      reservoirPersistence: clamp(contract.run * 6 + 30),
      dominantPersistence: clamp(40),
      dominantExhaustion: clamp(contract.exhaustionScore ?? contract.exhaustion ?? 30),
      delivery: clamp(contract.deliveryScore ?? contract.release ?? 25),
      deliveryAcceleration: 0,
      migration: clamp(contract.migrationScore ?? 0),
      absorption: clamp(contract.absorptionScore ?? contract.absorption ?? 20),
      structuralDeparture: clamp((contract.jsdScore ?? 0) * 150),
      psychologyIntegrity: psych.valid ? 90 : 30,
      conflict: clamp(contract.conflictScore ?? contract.conflict ?? 15),
      contradiction: 0,
      evidenceDecay: 0,
      accumulatedLiquidity: clamp(candidate.consecutiveQualifiedTicks * 2.5 + 15),
    };

    const initialTrajectory: FormationTrajectoryData = {
      direction: "STABLE",
      scoreSlope: 0,
      reservoirTrend: 0,
      exhaustionTrend: 0,
      deliveryTrend: 0,
      migrationTrend: 0,
      absorptionTrend: 0,
      evidenceMomentum: 0,
      persistence: 30,
      acceleration: 0,
      consistency: 50,
      lastMeaningfulChange: now,
    };

    const psychAdherenceRes = calculatePsychologyAdherence(
      psych,
      candidate.kind,
      candidate.barrier,
      reservoirDigits,
    );
    const liquidityRes = calculateLiquidityLevel(initialAccumulators, 1, psych, undefined, 0);

    const zone: LiquidityZone = {
      zoneId,
      id: zoneId,
      generation: gen,
      market: marketName,
      marketId: symbol,
      symbol,
      marketGroup: group,
      contract: contract.label,
      contractId: contract.id,
      kind: contract.kind,
      side: contract.kind,
      barrier: contract.barrier,

      creationTick: currentTick,
      creationTimestamp: now,
      currentTick,
      currentTimestamp: now,
      ageTicks: 1,
      ageSeconds: 0,
      formationStartTick: candidate.firstSeenTick,
      formationStartTimestamp: candidate.firstSeenTimestamp,

      lastMeaningfulEvidenceTick: currentTick,
      lastStructuralChangeTick: currentTick,
      lastStructuralChangeTimestamp: now,

      initialPsychology: psych,
      currentPsychology: psych,

      liquidityLevel: liquidityRes.level,
      liquidityTrend: liquidityRes.trend,
      liquidityAcceleration: liquidityRes.acceleration,
      psychologyAdherence: psychAdherenceRes.adherence,
      psychologyDetails: psychAdherenceRes.details,
      liquidityComposition: liquidityRes.composition,

      reservoirDigits,
      dominantDigits,

      accumulators: initialAccumulators,

      lifecycleState: "FORMING",
      phase: "FORMING",
      previousLifecycleState: "CANDIDATE",
      previousPhase: "CANDIDATE",
      stateEnteredAt: now,
      phaseSince: now,
      stateEnteredTick: currentTick,
      phaseAgeTicks: 1,
      stateDurationTicks: 1,

      releaseEvidence: [],
      confirmationEvidence: [],
      invalidationReason: null,

      qualified: false,
      qualificationReason: null,

      evidenceHistory: [],
      phaseHistory: [
        {
          from: "CANDIDATE",
          to: "FORMING",
          tick: currentTick,
          at: now,
          reason: `Formation registered after ${candidate.consecutiveQualifiedTicks} ticks persistent candidate evidence.`,
        },
      ],
      timeline: [],
      ledger: [],
      trajectory: initialTrajectory,
      trajectoryHistory: [initialAccumulators.accumulatedLiquidity],
      rankingScore: initialAccumulators.accumulatedLiquidity,
      isTerminal: false,
      temporal: contract.temporal,
      transitions: contract.transitions,
    };

    this.logTimelineEvent(
      zone,
      "FORMATION_CREATED",
      "Formation Registered",
      `Liquidity formation ${zone.zoneId} initialized after ${candidate.consecutiveQualifiedTicks} ticks candidate persistence.`,
      "FORMING",
    );

    this.logEvent(
      zone,
      "ZONE CREATED",
      `Liquidity formation registered: ${zone.zoneId}`,
      "FORMING",
    );

    this.zones.set(key, zone);
    this.creationOrder.push(key);
  }

  private updateZone(
    z: LiquidityZone,
    a: MarketAnalysis,
    c: ContractAnalysis,
    psych: SentinelPsychologySnapshot,
    reservoirDigits: number[],
    dominantDigits: number[],
    currentTick: number,
    now: number,
  ) {
    const isNewTick = currentTick !== z.currentTick;
    if (isNewTick) {
      z.ageTicks++;
      z.stateDurationTicks++;
      z.phaseAgeTicks = z.stateDurationTicks;
      z.currentTick = currentTick;
    }
    z.currentTimestamp = now;
    z.ageSeconds = Math.max(0, Math.round((now - z.creationTimestamp) / 1000));
    z.currentPsychology = psych;
    z.reservoirDigits = reservoirDigits;
    z.dominantDigits = dominantDigits;
    z.temporal = c.temporal;
    z.transitions = c.transitions;

    // --- ACCUMULATE INDEPENDENT EVIDENCE (LAYER B) ---
    const acc = z.accumulators;

    // 1. Reservoir Persistence
    const reservoirDepth = mean(
      reservoirDigits.map((d) => clamp((0.1 - (psych.pct[d] ?? 0.1)) * 900 + 45)),
    );
    acc.reservoirPersistence = clamp(acc.reservoirPersistence * 0.98 + reservoirDepth * 0.02);

    // 2. Dominant Persistence
    const dominantShare = mean(dominantDigits.map((d) => psych.pct[d] ?? 0.1));
    acc.dominantPersistence = clamp(acc.dominantPersistence * 0.98 + dominantShare * 400 * 0.02);

    // 3. Dominant Exhaustion
    const instantExhaustion = c.exhaustionScore ?? c.exhaustion ?? 30;
    acc.dominantExhaustion = clamp(acc.dominantExhaustion * 0.95 + instantExhaustion * 0.05);

    // 4. Delivery (Dormancy vs Delivery distinction)
    const instantDelivery = c.deliveryScore ?? c.release ?? 20;
    const isDormant = reservoirDigits.every((d) => (c.temporal?.[d]?.slope20_60 ?? 0) <= 0);
    const effectiveDelivery = isDormant ? Math.max(0, instantDelivery - 15) : instantDelivery;
    acc.delivery = clamp(acc.delivery * 0.94 + effectiveDelivery * 0.06);

    // 5. Delivery Acceleration
    const temporalAccelerating = reservoirDigits.some(
      (d) => (c.temporal?.[d]?.slope20_60 ?? 0) > 0.005 && (c.temporal?.[d]?.slope60_120 ?? 0) > 0,
    );
    acc.deliveryAcceleration = clamp(
      acc.deliveryAcceleration * 0.92 + (temporalAccelerating ? 25 : -8),
    );

    // 6. Migration
    const purpleInReservoir = psych.purple !== null && reservoirDigits.includes(psych.purple);
    const instantMigration = clamp((c.migrationScore ?? 0) * 0.7 + (purpleInReservoir ? 35 : 0));
    acc.migration = clamp(acc.migration * 0.94 + instantMigration * 0.06);

    // 7. Absorption
    const instantAbsorption = c.absorptionScore ?? c.absorption ?? 20;
    acc.absorption = clamp(acc.absorption * 0.95 + instantAbsorption * 0.05);

    // 8. Structural Departure
    const departure = clamp((c.jsdScore ?? a.jsd * 100) * 1.8);
    acc.structuralDeparture = clamp(acc.structuralDeparture * 0.95 + departure * 0.05);

    // 9. Psychology Integrity
    const integrity = psych.valid ? 100 : psych.outcome === "WATCH" ? 55 : 10;
    acc.psychologyIntegrity = clamp(acc.psychologyIntegrity * 0.95 + integrity * 0.05);

    // 10. Conflict
    const instantConflict = clamp((c.conflictScore ?? c.conflict ?? 15) + (psych.valid ? 0 : 40));
    acc.conflict = clamp(acc.conflict * 0.92 + instantConflict * 0.08);

    // 11. Contradiction & Evidence Decay
    const dominantRebounding = instantExhaustion < 35 && acc.dominantExhaustion > 60;
    const deliveryCollapsing = effectiveDelivery < 20 && acc.delivery > 50;
    acc.contradiction = clamp(
      (dominantRebounding ? 40 : 0) + (deliveryCollapsing ? 35 : 0) + (!psych.valid ? 50 : 0),
    );

    const idleFactor = Math.max(0, currentTick - z.lastMeaningfulEvidenceTick);
    acc.evidenceDecay = clamp((idleFactor / DECAY_HALF_LIFE_TICKS) * 40);

    // --- CUMULATIVE LIQUIDITY CALCULATION ---
    const newStructuralEvidence =
      acc.reservoirPersistence * 0.15 +
      acc.dominantExhaustion * 0.22 +
      acc.delivery * 0.25 +
      acc.migration * 0.18 +
      acc.absorption * 0.1 +
      acc.structuralDeparture * 0.1;

    const netAddition = (newStructuralEvidence - 40) * 0.08;
    const decayPenalty = acc.evidenceDecay * 0.04;
    const contradictionPenalty = acc.contradiction * 0.06;

    acc.accumulatedLiquidity = clamp(
      acc.accumulatedLiquidity * 0.985 + netAddition - decayPenalty - contradictionPenalty,
    );

    // Update Psychology Adherence
    const psychAdherenceRes = calculatePsychologyAdherence(
      psych,
      z.kind,
      z.barrier,
      reservoirDigits,
    );
    z.psychologyAdherence = psychAdherenceRes.adherence;
    z.psychologyDetails = psychAdherenceRes.details;

    // Update continuous Liquidity Level & Composition
    const liquidityRes = calculateLiquidityLevel(
      acc,
      z.ageTicks,
      psych,
      z.liquidityLevel,
      z.liquidityTrend,
    );
    z.liquidityLevel = liquidityRes.level;
    z.liquidityTrend = liquidityRes.trend;
    z.liquidityAcceleration = liquidityRes.acceleration;
    z.liquidityComposition = liquidityRes.composition;

    if (newStructuralEvidence > 55) {
      z.lastMeaningfulEvidenceTick = currentTick;
    }

    if (isNewTick) {
      z.trajectoryHistory.push(acc.accumulatedLiquidity);
      if (z.trajectoryHistory.length > TRAJECTORY_CAP) z.trajectoryHistory.shift();

      // Record compact evidence snapshot
      const snapshot: EvidenceSnapshot = {
        timestamp: now,
        tickIndex: currentTick,
        phase: z.lifecycleState,
        reservoirScore: Math.round(acc.reservoirPersistence),
        exhaustionScore: Math.round(acc.dominantExhaustion),
        deliveryScore: Math.round(acc.delivery),
        migrationScore: Math.round(acc.migration),
        absorptionScore: Math.round(acc.absorption),
        psychologyValidity: psych.valid,
        liquidityLevel: z.liquidityLevel,
        psychologyAdherence: z.psychologyAdherence,
        dominantDigits: [...dominantDigits],
        reservoirDigits: [...reservoirDigits],
        dominantRate: mean(dominantDigits.map((d) => psych.pct[d] ?? 0.1)),
        reservoirRate: mean(reservoirDigits.map((d) => psych.pct[d] ?? 0.1)),
        dominantPressure: mean(dominantDigits.map((d) => psych.pressure[d] ?? 0)),
        reservoirPressure: mean(reservoirDigits.map((d) => psych.pressure[d] ?? 0)),
        transitionDelta: c.transitions?.[0]?.delta ?? 0,
        entropy: a.entropy ?? 0,
        jsd: a.jsd ?? 0,
        rankingScore: z.rankingScore,
        qualificationStatus: z.qualified ? "QUALIFIED" : "NOT_QUALIFIED",
      };

      z.evidenceHistory.push(snapshot);
      if (z.evidenceHistory.length > SNAPSHOT_HISTORY_CAP) z.evidenceHistory.shift();

      // Update trajectory data
      this.updateTrajectory(z, now);

      // Check for timeline milestone events
      this.checkMilestones(z, now);
    }

    // --- LIFECYCLE EVALUATION WITH HYSTERESIS ---
    this.evaluateLifecycle(z, a, c, currentTick, now);
  }

  private updateTrajectory(z: LiquidityZone, now: number) {
    const history = z.evidenceHistory;
    if (history.length < 3) return;

    const count = Math.min(15, history.length);
    const recent = history.slice(-count);
    const oldest = recent[0];
    const newest = recent[recent.length - 1];

    const scoreSlope = (newest.rankingScore - oldest.rankingScore) / Math.max(1, count);
    const reservoirTrend = newest.reservoirScore - oldest.reservoirScore;
    const exhaustionTrend = newest.exhaustionScore - oldest.exhaustionScore;
    const deliveryTrend = newest.deliveryScore - oldest.deliveryScore;
    const migrationTrend = newest.migrationScore - oldest.migrationScore;
    const absorptionTrend = newest.absorptionScore - oldest.absorptionScore;

    // Evidence momentum: weighted composite of evidence direction
    const evidenceMomentum = clamp(
      reservoirTrend * 0.18 +
        exhaustionTrend * 0.26 +
        deliveryTrend * 0.28 +
        migrationTrend * 0.18 +
        absorptionTrend * 0.1,
      -50,
      50,
    );

    // Persistence: percentage of recent observations with strong structural backing
    const persistentCount = recent.filter(
      (s) => s.deliveryScore >= 35 && s.exhaustionScore >= 40 && s.psychologyValidity,
    ).length;
    const persistence = Math.round((persistentCount / count) * 100);

    // Direction classification
    let direction: FormationTrajectoryData["direction"] = "STABLE";
    if (z.accumulators.conflict >= 60) {
      direction = "CONFLICTED";
    } else if (evidenceMomentum >= 3.0 && deliveryTrend >= 0) {
      direction = "STRENGTHENING";
    } else if (evidenceMomentum <= -3.5 || deliveryTrend <= -5) {
      direction = "WEAKENING";
    } else if (scoreSlope < -1.5 && exhaustionTrend < -4) {
      direction = "REVERSING";
    } else {
      direction = "STABLE";
    }

    z.trajectory = {
      direction,
      scoreSlope: Number(scoreSlope.toFixed(2)),
      reservoirTrend: Math.round(reservoirTrend),
      exhaustionTrend: Math.round(exhaustionTrend),
      deliveryTrend: Math.round(deliveryTrend),
      migrationTrend: Math.round(migrationTrend),
      absorptionTrend: Math.round(absorptionTrend),
      evidenceMomentum: Number(evidenceMomentum.toFixed(1)),
      persistence,
      acceleration: Math.round(z.accumulators.deliveryAcceleration),
      consistency: Math.round(clamp(100 - z.accumulators.conflict * 1.2)),
      lastMeaningfulChange: now,
    };
  }

  private checkMilestones(z: LiquidityZone, now: number) {
    if (!z.milestones) z.milestones = new Set<string>();
    const acc = z.accumulators;
    const psych = z.currentPsychology;

    // Reservoir Formed
    if (acc.reservoirPersistence >= 55 && !z.milestones.has("RESERVOIR_FORMED")) {
      z.milestones.add("RESERVOIR_FORMED");
      this.logTimelineEvent(
        z,
        "RESERVOIR_FORMED",
        "Reservoir Established",
        `Neglected-digit reservoir formed with ${acc.reservoirPersistence.toFixed(0)}% persistence depth.`,
        z.lifecycleState,
      );
    }

    // Dominant Side Weakened
    if (acc.dominantExhaustion >= 55 && !z.milestones.has("DOMINANT_WEAKENED")) {
      z.milestones.add("DOMINANT_WEAKENED");
      this.logTimelineEvent(
        z,
        "DOMINANT_WEAKENED",
        "Dominant Side Weakening",
        `Dominant side digits showing exhaustion divergence (${acc.dominantExhaustion.toFixed(0)}%).`,
        z.lifecycleState,
      );
    }

    // Exhaustion Confirmed
    if (acc.dominantExhaustion >= 72 && !z.milestones.has("EXHAUSTION_CONFIRMED")) {
      z.milestones.add("EXHAUSTION_CONFIRMED");
      this.logTimelineEvent(
        z,
        "EXHAUSTION_CONFIRMED",
        "Exhaustion Confirmed",
        `Dominant frequency collapse confirmed across multi-window telescope.`,
        z.lifecycleState,
      );
    }

    // Delivery Started
    if (acc.delivery >= 45 && !z.milestones.has("DELIVERY_STARTED")) {
      z.milestones.add("DELIVERY_STARTED");
      this.logTimelineEvent(
        z,
        "DELIVERY_STARTED",
        "Delivery Begun",
        `Observed digit movement entering previously dormant reservoir.`,
        z.lifecycleState,
      );
    }

    // Delivery Strengthened
    if (acc.delivery >= 68 && !z.milestones.has("DELIVERY_STRENGTHENED")) {
      z.milestones.add("DELIVERY_STRENGTHENED");
      this.logTimelineEvent(
        z,
        "DELIVERY_STRENGTHENED",
        "Delivery Strengthened",
        `Sustained delivery into winning reservoir with ${acc.delivery.toFixed(0)}% strength.`,
        z.lifecycleState,
      );
    }

    // Migration Detected
    if (acc.migration >= 45 && !z.milestones.has("MIGRATION_DETECTED")) {
      z.milestones.add("MIGRATION_DETECTED");
      this.logTimelineEvent(
        z,
        "MIGRATION_DETECTED",
        "Migration Detected",
        `Markov transition probability shifted toward reservoir (+${acc.migration.toFixed(0)}% above baseline).`,
        z.lifecycleState,
      );
    }

    // Purple Alignment
    if (
      psych.purple !== null &&
      z.reservoirDigits.includes(psych.purple) &&
      !z.milestones.has("PURPLE_ALIGNMENT")
    ) {
      z.milestones.add("PURPLE_ALIGNMENT");
      this.logTimelineEvent(
        z,
        "PURPLE_ALIGNMENT",
        "Purple Digit Aligned",
        `Fastest-growing digit d${psych.purple} aligned with reservoir structure.`,
        z.lifecycleState,
      );
    }
  }

  private hasRecentEvent(z: LiquidityZone, type: FormationEventType): boolean {
    const recent = z.timeline.slice(-8);
    return recent.some((ev) => ev.type === type);
  }

  private evaluateLifecycle(
    z: LiquidityZone,
    a: MarketAnalysis,
    c: ContractAnalysis,
    currentTick: number,
    now: number,
  ) {
    const acc = z.accumulators;
    const psych = z.currentPsychology;

    // Hard Sentinel Invalidation
    if (!psych.valid && psych.outcome === "REJECT" && z.stateDurationTicks >= 4) {
      this.transitionState(
        z,
        "INVALIDATED",
        `Hard Sentinel psychology rejection: ${psych.reasons.join(", ")}`,
        currentTick,
        now,
      );
      return;
    }

    if (acc.accumulatedLiquidity < 12 && z.ageTicks >= 30) {
      this.transitionState(
        z,
        "INVALIDATED",
        "Formation evidence decayed below structural baseline threshold.",
        currentTick,
        now,
      );
      return;
    }

    // Hard Conflicted / Blocked
    if (acc.conflict >= 75 && acc.psychologyIntegrity < 45) {
      if (z.lifecycleState !== "CONFLICTED") {
        this.transitionState(
          z,
          "CONFLICTED",
          "Conflicting structural dimensions detected — standing aside.",
          currentTick,
          now,
        );
      }
      return;
    }

    // Hysteresis: enforce minimum dwell ticks before progressive/regressive transitions
    if (z.stateDurationTicks < MIN_DWELL_TICKS) {
      return;
    }

    let targetState: ZoneLifecycleState = z.lifecycleState;

    // Hysteretic State Transitions
    if (acc.accumulatedLiquidity >= 75 && acc.delivery >= 70 && acc.dominantExhaustion >= 70) {
      const hasStructuralRelease =
        acc.deliveryAcceleration > 15 &&
        acc.migration >= 50 &&
        acc.structuralDeparture >= 40 &&
        psych.valid;

      if (hasStructuralRelease) {
        targetState = "RELEASE";
      } else {
        targetState = "RIPE";
      }
    } else if (acc.dominantExhaustion >= 68 && acc.delivery >= 55) {
      targetState = "RELEASE_WATCH";
    } else if (acc.dominantExhaustion >= 62) {
      targetState = "EXHAUSTING";
    } else if (acc.absorption >= 60) {
      targetState = "ABSORBING";
    } else if (
      acc.accumulatedLiquidity >= 55 &&
      z.ageTicks >= 20 &&
      acc.reservoirPersistence >= 50
    ) {
      targetState = "MATURE";
    } else if (acc.accumulatedLiquidity >= 35) {
      targetState = "BUILDING";
    } else {
      // Evidence-based regression: only regress to FORMING if accumulated evidence drops below 26
      if (z.lifecycleState === "BUILDING" && acc.accumulatedLiquidity < 26) {
        targetState = "FORMING";
      } else if (
        z.lifecycleState === "MATURE" &&
        acc.accumulatedLiquidity < 42 &&
        acc.delivery < 30
      ) {
        targetState = "BUILDING";
      }
    }

    // FINAL QUALIFICATION GATES (TRADE QUALIFIED vs ZONE EXISTS BUT NOT QUALIFIED)
    if (targetState === "RELEASE" || targetState === "RIPE") {
      const passesFinalGates =
        psych.valid &&
        acc.conflict < 35 &&
        acc.contradiction < 25 &&
        acc.dominantExhaustion >= 72 &&
        acc.delivery >= 68 &&
        acc.migration >= 45 &&
        z.ageTicks >= 40;

      if (passesFinalGates) {
        targetState = "CONFIRMED";
        z.qualified = true;
        z.qualificationReason = `All 6 independent structural dimensions confirmed: Reservoir (${acc.reservoirPersistence.toFixed(0)}), Exhaustion (${acc.dominantExhaustion.toFixed(0)}), Delivery (${acc.delivery.toFixed(0)}), Migration (${acc.migration.toFixed(0)}), Absorption (${acc.absorption.toFixed(0)}), Psychology (VALID).`;
      } else {
        z.qualified = false;
        z.qualificationReason = "Zone exists but has not passed all final confirmation gates.";
      }
    }

    if (targetState !== z.lifecycleState) {
      this.transitionState(
        z,
        targetState,
        `Structural state progressed: ${z.lifecycleState} → ${targetState}`,
        currentTick,
        now,
      );
    }
  }

  private transitionState(
    z: LiquidityZone,
    next: ZoneLifecycleState,
    reason: string,
    tick: number,
    now: number,
  ) {
    const from = z.lifecycleState;
    z.previousLifecycleState = from;
    z.previousPhase = from;
    z.lifecycleState = next;
    z.phase = next;
    z.stateEnteredAt = now;
    z.phaseSince = now;
    z.stateEnteredTick = tick;
    z.stateDurationTicks = 0;
    z.phaseAgeTicks = 0;
    z.lastStructuralChangeTick = tick;
    z.lastStructuralChangeTimestamp = now;

    z.phaseHistory.push({
      from,
      to: next,
      tick,
      at: now,
      reason,
    });

    if (next === "INVALIDATED") {
      z.isTerminal = true;
      z.invalidationReason = reason;
      this.logTimelineEvent(z, "FORMATION_INVALIDATED", "Formation Invalidated", reason, next);
    } else {
      this.logTimelineEvent(z, "STRUCTURAL_SHIFT", `Phase: ${next}`, reason, next);
    }

    this.logEvent(z, `STATE: ${next}`, reason, next);
  }

  private logTimelineEvent(
    z: LiquidityZone,
    type: FormationEventType,
    title: string,
    description: string,
    phase: ZoneLifecycleState,
  ) {
    // Prevent duplicate consecutive timeline events
    const last = z.timeline[z.timeline.length - 1];
    if (last && last.type === type && last.phase === phase && last.description === description) {
      return;
    }

    const ev: FormationTimelineEvent = {
      id: `FTL-${++globalTimelineSeq}`,
      at: Date.now(),
      timeStr: formatClock(Date.now()),
      tick: z.currentTick,
      type,
      title,
      description,
      phase,
      score: z.rankingScore,
    };

    z.timeline.push(ev);
    if (z.timeline.length > TIMELINE_CAP) z.timeline.shift();
  }

  private logEvent(z: LiquidityZone, type: string, description: string, state: ZoneLifecycleState) {
    const ev: ZoneEvent = {
      id: `ZEV-${++globalEventSeq}`,
      at: Date.now(),
      tick: z.currentTick,
      zoneId: z.zoneId,
      market: z.market,
      symbol: z.symbol,
      contract: z.contract,
      type,
      description,
      state,
      evidenceSummary: `Liq: ${z.liquidityLevel ?? Math.round(z.accumulators.accumulatedLiquidity)}% (${(z.liquidityTrend ?? 0) >= 0 ? "+" : ""}${z.liquidityTrend ?? 0}) | Psych: ${z.psychologyAdherence ?? 50}% | Exh: ${z.accumulators.dominantExhaustion.toFixed(0)}% · Del: ${z.accumulators.delivery.toFixed(0)}%`,
      liquidityLevel: z.liquidityLevel,
      psychologyAdherence: z.psychologyAdherence,
      rankScore: z.rankingScore,
    };

    z.ledger.unshift(ev);
    if (z.ledger.length > 40) z.ledger.pop();

    this.globalLedger.unshift(ev);
    if (this.globalLedger.length > LEDGER_CAP) this.globalLedger.pop();
  }

  /**
   * Finalizes the analysis cycle and compiles a stable snapshot.
   * Persistent zones maintain stable identity and DO NOT randomly jump positions.
   */
  finalize(): ZoneRegistrySnapshot {
    this.version++;

    const activeList: LiquidityZone[] = [];
    const historicalList: LiquidityZone[] = [...this.historical];
    const newCreationOrder: string[] = [];

    for (const key of this.creationOrder) {
      const z = this.zones.get(key);
      if (!z) continue;

      if (z.isTerminal || z.lifecycleState === "INVALIDATED") {
        historicalList.unshift(z);
        this.zones.delete(key);
      } else {
        activeList.push(z);
        newCreationOrder.push(key);
      }
    }
    this.creationOrder = newCreationOrder;

    if (historicalList.length > 60) historicalList.length = 60;
    this.historical = historicalList;

    const releaseWatch = activeList.filter((z) =>
      [
        "ABSORBING",
        "EXHAUSTING",
        "RIPE",
        "RELEASE_WATCH",
        "RELEASE",
        "DIRECTIONAL_MOVE",
        "CONFIRMED",
      ].includes(z.lifecycleState),
    );

    const formationWatch = activeList.filter((z) =>
      ["FORMING", "BUILDING", "MATURE"].includes(z.lifecycleState),
    );

    const conflictedZones = activeList.filter((z) =>
      ["CONFLICTED", "BLOCKED"].includes(z.lifecycleState),
    );

    this.snapshot = {
      version: this.version,
      activeZones: activeList,
      releaseWatch,
      formationWatch,
      conflictedZones,
      historicalZones: this.historical,
      ledger: this.globalLedger,
      candidateCount: this.candidates.size,
      activeCount: activeList.length,
      qualifiedCount: activeList.filter((z) => z.qualified).length,
      invalidatedCount: this.historical.length,
      historicalCount: this.historical.length,
    };

    return this.snapshot;
  }
}

let registryInstance: ZoneRegistry | null = null;

export function getZoneRegistry(): ZoneRegistry {
  if (!registryInstance) {
    registryInstance = new ZoneRegistry();
  }
  return registryInstance;
}

// Canonical Aliases
export type LiquidityFormation = LiquidityZone;
export type FormationRegistry = ZoneRegistry;
export { getZoneRegistry as getFormationRegistry };
