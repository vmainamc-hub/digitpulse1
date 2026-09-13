/**
 * Persistent Liquidity Intelligence Engine (Layer B).
 *
 * Core Principles:
 * 1. A TICK IS AN OBSERVATION. A TICK IS NOT LIQUIDITY.
 * 2. OBSERVATIONS ACCUMULATE EVIDENCE.
 * 3. ACCUMULATED EVIDENCE CREATES LIQUIDITY FORMATION.
 * 4. LIQUIDITY FORMATION DEVELOPS OVER TIME.
 * 5. MATURATION + STRUCTURAL CHANGE PRODUCES RELEASE.
 * 6. RELEASE + FINAL GATES PRODUCES TRADE QUALIFICATION.
 *
 * Persistent LiquidityZone entities maintain stable identity, accumulated evidence,
 * historical ledgers, and hysteresis-protected lifecycle states.
 */

import { clamp, mean } from "./math";
import type { MarketAnalysis, ContractAnalysis } from "./engine";
import type { Side, DigitTemporal, TransitionEvidence } from "./liquidity-v3";

export type ZoneLifecycleState =
  | "NO_LIQUIDITY"
  | "CANDIDATE"
  | "FORMING"
  | "BUILDING"
  | "MATURE"
  | "ABSORBING"
  | "EXHAUSTING"
  | "RIPE"
  | "RELEASE_WATCH"
  | "RELEASE"
  | "DIRECTIONAL_MOVE"
  | "CONFIRMED"
  | "INVALIDATED"
  | "BLOCKED"
  | "CONFLICTED";

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
}

export interface LiquidityZone {
  zoneId: string;
  market: string;
  symbol: string;
  marketGroup: string;
  contract: string;
  contractId: string;
  kind: "OVER" | "UNDER";
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

  reservoirDigits: number[];
  dominantDigits: number[];

  accumulators: EvidenceAccumulators;

  lifecycleState: ZoneLifecycleState;
  previousLifecycleState: ZoneLifecycleState;
  stateEnteredAt: number;
  stateEnteredTick: number;
  stateDurationTicks: number;

  releaseEvidence: string[];
  confirmationEvidence: string[];
  invalidationReason: string | null;

  qualified: boolean;
  qualificationReason: string | null;

  ledger: ZoneEvent[];
  trajectoryHistory: number[];
  isTerminal: boolean;
}

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
}

const MIN_CANDIDATE_PERSISTENCE_TICKS = 12;
const MIN_DWELL_TICKS = 8;
const MIN_EVIDENCE_FOR_PROMOTION = 38;
const DECAY_HALF_LIFE_TICKS = 60;
const TRAJECTORY_CAP = 120;
const LEDGER_CAP = 250;

let globalZoneSeq = 100;
let globalEventSeq = 1000;

function generateZoneId(symbol: string, contractId: string, timestamp: number): string {
  const d = new Date(timestamp);
  const dateStr = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
  const shortSym = symbol.replace(/[^A-Za-z0-9]/g, "");
  const seq = ++globalZoneSeq;
  return `LIQ-${dateStr}-${shortSym}-${contractId}-${seq}`;
}

export class ZoneRegistry {
  private candidates = new Map<string, ZoneCandidate>();
  private zones = new Map<string, LiquidityZone>();
  private historical: LiquidityZone[] = [];
  private globalLedger: ZoneEvent[] = [];
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
    const zoneId = generateZoneId(symbol, contract.id, now);
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

    const zone: LiquidityZone = {
      zoneId,
      market: marketName,
      symbol,
      marketGroup: group,
      contract: contract.label,
      contractId: contract.id,
      kind: contract.kind,
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

      reservoirDigits,
      dominantDigits,

      accumulators: initialAccumulators,

      lifecycleState: "FORMING",
      previousLifecycleState: "CANDIDATE",
      stateEnteredAt: now,
      stateEnteredTick: currentTick,
      stateDurationTicks: 1,

      releaseEvidence: [],
      confirmationEvidence: [],
      invalidationReason: null,

      qualified: false,
      qualificationReason: null,

      ledger: [],
      trajectoryHistory: [initialAccumulators.accumulatedLiquidity],
      isTerminal: false,
    };

    this.logEvent(
      zone,
      "ZONE CREATED",
      `Liquidity zone registered after ${candidate.consecutiveQualifiedTicks} ticks of persistent formation.`,
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
      z.currentTick = currentTick;
    }
    z.currentTimestamp = now;
    z.ageSeconds = Math.max(0, Math.round((now - z.creationTimestamp) / 1000));
    z.currentPsychology = psych;
    z.reservoirDigits = reservoirDigits;
    z.dominantDigits = dominantDigits;

    // --- ACCUMULATE INDEPENDENT EVIDENCE (LAYER B) ---
    const acc = z.accumulators;

    // 1. Reservoir Persistence (structural separation over time)
    const reservoirDepth = mean(
      reservoirDigits.map((d) => clamp((0.1 - (psych.pct[d] ?? 0.1)) * 900 + 45)),
    );
    acc.reservoirPersistence = clamp(acc.reservoirPersistence * 0.98 + reservoirDepth * 0.02);

    // 2. Dominant Persistence
    const dominantShare = mean(dominantDigits.map((d) => psych.pct[d] ?? 0.1));
    acc.dominantPersistence = clamp(acc.dominantPersistence * 0.98 + dominantShare * 400 * 0.02);

    // 3. Dominant Exhaustion (rate slopes, EWMA, CUSUM)
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

    // 6. Migration (Dominant -> Reservoir Markov transition + Purple)
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
    // ACCUMULATED LIQUIDITY(t) = ACCUMULATED LIQUIDITY(t-1) + NEW STRUCTURAL EVIDENCE - EVIDENCE DECAY - CONTRADICTION
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

    if (newStructuralEvidence > 55) {
      z.lastMeaningfulEvidenceTick = currentTick;
    }

    if (isNewTick) {
      z.trajectoryHistory.push(acc.accumulatedLiquidity);
      if (z.trajectoryHistory.length > TRAJECTORY_CAP) z.trajectoryHistory.shift();
    }

    // --- LIFECYCLE EVALUATION WITH HYSTERESIS ---
    this.evaluateLifecycle(z, a, c, currentTick, now);
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

    // Hard Sentinel Invalidation or irrecoverable decay
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

    // Hysteresis: enforce minimum dwell ticks before state transitions
    if (z.stateDurationTicks < MIN_DWELL_TICKS) {
      return;
    }

    let targetState: ZoneLifecycleState = z.lifecycleState;

    // Progressive Lifecycle Rules
    if (acc.accumulatedLiquidity >= 75 && acc.delivery >= 70 && acc.dominantExhaustion >= 70) {
      // Check Release Condition (observed structural change, NOT just a score)
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
    } else if (acc.accumulatedLiquidity >= 55) {
      targetState = "MATURE";
    } else if (acc.accumulatedLiquidity >= 35) {
      targetState = "BUILDING";
    } else {
      targetState = "FORMING";
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
    z.previousLifecycleState = z.lifecycleState;
    z.lifecycleState = next;
    z.stateEnteredAt = now;
    z.stateEnteredTick = tick;
    z.stateDurationTicks = 0;
    z.lastStructuralChangeTick = tick;
    z.lastStructuralChangeTimestamp = now;

    if (next === "INVALIDATED") {
      z.isTerminal = true;
      z.invalidationReason = reason;
    }

    this.logEvent(z, `STATE: ${next}`, reason, next);
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
      evidenceSummary: `Liq: ${z.accumulators.accumulatedLiquidity.toFixed(0)} | Exh: ${z.accumulators.dominantExhaustion.toFixed(0)} | Del: ${z.accumulators.delivery.toFixed(0)}`,
    };

    z.ledger.unshift(ev);
    if (z.ledger.length > 40) z.ledger.pop();

    this.globalLedger.unshift(ev);
    if (this.globalLedger.length > LEDGER_CAP) this.globalLedger.pop();
  }

  /**
   * Finalizes the analysis cycle and compiles a stable snapshot.
   * CRITICAL: Persistent zones maintain their creation order / stable identity
   * and DO NOT randomly jump positions every tick based on a volatile score!
   */
  finalize(): ZoneRegistrySnapshot {
    this.version++;

    const activeList: LiquidityZone[] = [];
    const historicalList: LiquidityZone[] = [...this.historical];

    for (const key of this.creationOrder) {
      const z = this.zones.get(key);
      if (!z) continue;

      if (z.isTerminal) {
        historicalList.unshift(z);
      } else {
        activeList.push(z);
      }
    }

    // Keep historical cap bounded
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
