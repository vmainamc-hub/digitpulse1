/**
 * Persistent Opportunity Intelligence (PHASES 3-9).
 *
 * OBSERVATION -> MEMORY -> FORMATION -> MATURATION -> TRAJECTORY -> RELEASE -> CONFIRMATION
 *
 * An opportunity is a first-class object with a stable identity that survives
 * successive analysis cycles. It is never rebuilt from scratch per tick: each
 * cycle updates its evidence, lifecycle state (with hysteresis), trajectory
 * derivatives and event ledger.
 *
 * Scientific boundary: every score is a model output measured on public tick
 * sequences. Nothing here is a calibrated real-world probability, and nothing
 * claims order-book liquidity, hidden orders or trader manipulation.
 */

import { clamp, mean } from "./math";
import type { ContractAnalysis, MarketAnalysis } from "./engine";
import type {
  DigitTemporal,
  LiquidityOpportunity,
  Psychology1000,
  TransitionEvidence,
} from "./liquidity-v3";

export const PHASES = [
  "NO_LIQUIDITY",
  "ABSENT",
  "FORMING",
  "BUILDING",
  "MATURE",
  "EXHAUSTION_WATCH",
  "EXHAUSTION_CONFIRMED",
  "DELIVERY",
  "DELIVERY_ACCELERATING",
  "ABSORBING",
  "EXHAUSTING",
  "RELEASE_WATCH",
  "RELEASE",
  "DIRECTIONAL MOVE",
  "RIPE",
  "CONFIRMED",
] as const;

export type Phase = (typeof PHASES)[number] | "CONFLICTED" | "BLOCKED" | "INVALIDATED";

const PHASE_RANK: Record<string, number> = {
  NO_LIQUIDITY: 0,
  ABSENT: 0,
  FORMING: 1,
  BUILDING: 2,
  MATURE: 3,
  EXHAUSTION_WATCH: 4,
  EXHAUSTION_CONFIRMED: 5,
  DELIVERY: 6,
  DELIVERY_ACCELERATING: 7,
  ABSORBING: 8,
  EXHAUSTING: 9,
  RELEASE_WATCH: 10,
  RELEASE: 11,
  "DIRECTIONAL MOVE": 12,
  RIPE: 13,
  CONFIRMED: 14,
  CONFLICTED: -1,
  BLOCKED: -2,
  INVALIDATED: -3,
};

export const phaseRank = (p: Phase) => PHASE_RANK[p] ?? 0;

export type EventType =
  | "FORMATION STARTED"
  | "PHASE ADVANCE"
  | "PHASE DETERIORATION"
  | "CONCENTRATION INCREASED"
  | "BOUNDARY PRESSURE DETECTED"
  | "PERSISTENCE INCREASED"
  | "PRESSURE ACCELERATING"
  | "ABSORPTION DETECTED"
  | "EXHAUSTION ACCELERATING"
  | "REGIME CHANGE DETECTED"
  | "SWEEP SEQUENCE OBSERVED"
  | "RELEASE STRUCTURE DEVELOPING"
  | "STRUCTURAL BREAK DETECTED"
  | "CONFIRMATION WATCH"
  | "CONFIRMED"
  | "INVALIDATED"
  | "BLOCKED"
  | "CONFLICTED";

export interface OpportunityEvent {
  id: string;
  at: number;
  tickEpoch: number;
  symbol: string;
  market: string;
  opportunityId: string;
  contract: string;
  type: EventType;
  evidence: string;
  metric: string;
  previous: number | null;
  next: number | null;
}

export interface TrajectorySeries {
  maturity: number[];
  creation: number[];
  persistence: number[];
  pressure: number[];
  accumulation: number[];
  absorption: number[];
  exhaustion: number[];
  danger: number[];
  release: number[];
  confirmation: number[];
  integrity: number[];
}

const SERIES_KEYS: (keyof TrajectorySeries)[] = [
  "maturity",
  "creation",
  "persistence",
  "pressure",
  "accumulation",
  "absorption",
  "exhaustion",
  "danger",
  "release",
  "confirmation",
  "integrity",
];

export interface Opportunity {
  opportunityId: string;
  key: string;
  symbol: string;
  market: string;
  marketGroup: string;
  contract: string;
  contractId: string;
  kind: "OVER" | "UNDER";
  barrier: number;

  bornAt: number;
  birthTick: number;
  currentTick: number;
  ageTicks: number;
  ageSeconds: number;
  originEvent: string;
  formationEvidence: string[];

  creation: number;
  persistence: number;
  accumulation: number;
  concentration: number;
  pressure: number;
  boundaryPressure: number;
  transitionStructure: number;
  entropy: number;
  surprise: number;
  regime: string;
  momentum: number;
  maturity: number;
  absorption: number;
  exhaustion: number;
  releaseProximity: number;
  danger: number;
  conflict: number;
  confirmation: number;
  integrity: number;
  supportCount: number;

  reservoirScore?: number;
  exhaustionScore?: number;
  deliveryScore?: number;
  migrationScore?: number;
  absorptionScore?: number;
  confirmationScore?: number;
  conflictScore?: number;
  evidence?: string[];
  vetoes?: string[];
  psychology1000?: Psychology1000;
  temporal?: Record<number, DigitTemporal>;
  transitions?: TransitionEvidence[];
  entropyVelocity?: number;
  entropyAcceleration?: number;
  jsdScore?: number;

  phase: Phase;
  previousPhase: Phase;
  phaseSince: number;
  phaseDurationTicks: number;

  trajectory: number;
  velocity: Record<string, number>;
  acceleration: Record<string, number>;
  series: TrajectorySeries;

  lastStructuralChange: { at: number; what: string } | null;
  invalidationReason: string | null;
  confirmationReason: string | null;
  rank: number;
  events: OpportunityEvent[];
  terminal: boolean;
}

const SERIES_CAP = 160;
const EVENT_CAP_PER_OPP = 40;
const LEDGER_CAP = 300;
const MIN_DWELL_TICKS = 6;
const DETERIORATION_THRESHOLD = 16;
const FORMATION_FLOOR = 25;
const INVALIDATION_FLOOR = 12;

function push(series: number[], v: number) {
  series.push(v);
  if (series.length > SERIES_CAP) series.shift();
}

/** Least-squares slope per sample over the tail of a series. */
function slope(series: number[], window = 12): number {
  const s = series.slice(-window);
  const n = s.length;
  if (n < 3) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(s);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * ((s[i] ?? 0) - ym);
    den += (i - xm) ** 2;
  }
  return den ? num / den : 0;
}

function accelerationOf(series: number[], window = 12): number {
  if (series.length < window * 2) return 0;
  const recent = slope(series.slice(-window), window);
  const prior = slope(series.slice(-window * 2, -window), window);
  return recent - prior;
}

function ids(symbol: string, contractId: string, at: number) {
  const d = new Date(at);
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(
    2,
    "0",
  )}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `OPP-${symbol}-${contractId}-${stamp}`;
}

export interface OpportunitySnapshot {
  version: number;
  opportunities: Opportunity[];
  radar: Opportunity[];
  formation: Opportunity[];
  releaseWatch: Opportunity[];
  conflicted: Opportunity[];
  ledger: OpportunityEvent[];
  born: number;
  invalidated: number;
  confirmed: number;
}

const EMPTY_SNAPSHOT: OpportunitySnapshot = {
  version: 0,
  opportunities: [],
  radar: [],
  formation: [],
  releaseWatch: [],
  conflicted: [],
  ledger: [],
  born: 0,
  invalidated: 0,
  confirmed: 0,
};

export class OpportunityStore {
  private live = new Map<string, Opportunity>();
  private ledger: OpportunityEvent[] = [];
  private eventSeq = 0;
  private born = 0;
  private invalidated = 0;
  private confirmed = 0;
  private version = 0;

  snapshot: OpportunitySnapshot = EMPTY_SNAPSHOT;

  private log(
    o: Opportunity,
    type: EventType,
    evidence: string,
    metric: string,
    prev: number | null,
    next: number | null,
  ) {
    const ev: OpportunityEvent = {
      id: `EV-${++this.eventSeq}`,
      at: Date.now(),
      tickEpoch: o.currentTick,
      symbol: o.symbol,
      market: o.market,
      opportunityId: o.opportunityId,
      contract: o.contract,
      type,
      evidence,
      metric,
      previous: prev === null ? null : Math.round(prev * 10) / 10,
      next: next === null ? null : Math.round(next * 10) / 10,
    };
    o.events.push(ev);
    if (o.events.length > EVENT_CAP_PER_OPP) o.events.shift();
    this.ledger.unshift(ev);
    if (this.ledger.length > LEDGER_CAP) this.ledger.length = LEDGER_CAP;
  }

  /**
   * One analysis cycle for one market. Existing opportunities are updated in
   * place; new ones are only born when formation is actually observed.
   */
  ingest(
    symbol: string,
    marketName: string,
    group: string,
    analysis: MarketAnalysis,
    tickEpoch: number,
  ) {
    for (const c of analysis.contracts) {
      const key = `${symbol}:${c.id}`;
      const existing = this.live.get(key);
      const formed = c.law && c.creation >= FORMATION_FLOOR;

      if (!existing) {
        if (!formed) continue;
        this.live.set(key, this.birth(symbol, marketName, group, analysis, c, tickEpoch));
        this.born++;
        continue;
      }
      this.update(existing, analysis, c, tickEpoch);
    }
  }

  private measure(a: MarketAnalysis, c: ContractAnalysis) {
    const concentration = clamp(Math.abs(c.winShare - 50) * 2);
    const accumulation = clamp(
      c.creation * 0.4 + concentration * 0.3 + Math.abs(c.drift) * 2.2 + c.run * 4,
    );
    const integrity = clamp(
      100 -
        (c.conflict * 0.4 +
          a.anomaly * 0.2 +
          Math.max(0, a.changePoint - 40) * 0.3 +
          c.danger * 0.15),
    );
    return { concentration, accumulation, integrity };
  }

  private birth(
    symbol: string,
    marketName: string,
    group: string,
    a: MarketAnalysis,
    c: ContractAnalysis,
    tickEpoch: number,
  ): Opportunity {
    const now = Date.now();
    const m = this.measure(a, c);
    const trigger =
      c.boundaryAttack >= 55
        ? `Boundary pressure at digit ${c.kind === "OVER" ? c.barrier + 1 : c.barrier - 1} (${c.boundaryAttack.toFixed(0)})`
        : m.concentration >= 45
          ? `Digit concentration toward the ${c.label} side (${m.concentration.toFixed(0)})`
          : c.run >= 4
            ? `Persistent ${c.run}-tick ${c.label} run`
            : `Creation threshold crossed (${c.creation.toFixed(0)})`;

    const o: Opportunity = {
      opportunityId: ids(symbol, c.id, now),
      key: `${symbol}:${c.id}`,
      symbol,
      market: marketName,
      marketGroup: group,
      contract: c.label,
      contractId: c.id,
      kind: c.kind,
      barrier: c.barrier,

      bornAt: now,
      birthTick: tickEpoch,
      currentTick: tickEpoch,
      ageTicks: 1,
      ageSeconds: 0,
      originEvent: trigger,
      formationEvidence: [
        trigger,
        `Win share ${c.winShare.toFixed(1)}% (Wilson ${c.wilsonLo.toFixed(1)}-${c.wilsonHi.toFixed(1)})`,
        `Regime ${a.regime.state} · entropy ${a.entropy.toFixed(1)}`,
        `Bayesian posterior ${c.bayesian.toFixed(1)}`,
      ],

      creation: c.creation,
      persistence: clamp(c.run * 8 + c.maturity * 0.2),
      accumulation: m.accumulation,
      concentration: m.concentration,
      pressure: c.pressure,
      boundaryPressure: c.boundaryAttack,
      transitionStructure: a.transitionStability,
      entropy: a.entropy,
      surprise: clamp(a.jsd * 170),
      regime: a.regime.state,
      momentum: c.drift,
      maturity: c.maturity,
      absorption: c.absorption,
      exhaustion: c.exhaustion,
      releaseProximity: c.release,
      danger: c.danger,
      conflict: c.conflict,
      confirmation: c.confirmation,
      integrity: m.integrity,
      supportCount: c.supportCount,

      reservoirScore: c.reservoirScore ?? c.creation,
      exhaustionScore: c.exhaustionScore ?? c.exhaustion,
      deliveryScore: c.deliveryScore ?? c.release,
      migrationScore: c.migrationScore ?? 0,
      absorptionScore: c.absorptionScore ?? c.absorption,
      confirmationScore: c.confirmationScore ?? c.confirmation,
      conflictScore: c.conflictScore ?? c.conflict,
      evidence: c.evidence ?? [],
      vetoes: c.vetoes ?? [],
      psychology1000: c.psychology1000,
      temporal: c.temporal,
      transitions: c.transitions,
      entropyVelocity: c.entropyVelocity ?? 0,
      entropyAcceleration: c.entropyAcceleration ?? 0,
      jsdScore: c.jsdScore ?? 0,

      phase: "FORMING",
      previousPhase: "ABSENT",
      phaseSince: now,
      phaseDurationTicks: 1,

      trajectory: 0,
      velocity: {},
      acceleration: {},
      series: {
        maturity: [c.maturity],
        creation: [c.creation],
        persistence: [clamp(c.run * 8)],
        pressure: [c.pressure],
        accumulation: [m.accumulation],
        absorption: [c.absorption],
        exhaustion: [c.exhaustion],
        danger: [c.danger],
        release: [c.release],
        confirmation: [c.confirmation],
        integrity: [m.integrity],
      },

      lastStructuralChange: { at: now, what: "Formation observed" },
      invalidationReason: null,
      confirmationReason: null,
      rank: 0,
      events: [],
      terminal: false,
    };
    this.log(o, "FORMATION STARTED", trigger, "creation", null, c.creation);
    return o;
  }

  private update(o: Opportunity, a: MarketAnalysis, c: ContractAnalysis, tickEpoch: number) {
    const now = Date.now();
    const m = this.measure(a, c);
    const advanced = tickEpoch !== o.currentTick;
    if (advanced) {
      o.ageTicks++;
      o.phaseDurationTicks++;
    }
    o.currentTick = tickEpoch;
    o.ageSeconds = Math.max(0, Math.round((now - o.bornAt) / 1000));

    const prev = {
      pressure: o.pressure,
      absorption: o.absorption,
      exhaustion: o.exhaustion,
      release: o.releaseProximity,
      concentration: o.concentration,
      regime: o.regime,
      persistence: o.persistence,
    };

    o.creation = c.creation;
    o.persistence = clamp(c.run * 8 + c.maturity * 0.2);
    o.accumulation = m.accumulation;
    o.concentration = m.concentration;
    o.pressure = c.pressure;
    o.boundaryPressure = c.boundaryAttack;
    o.transitionStructure = a.transitionStability;
    o.entropy = a.entropy;
    o.surprise = clamp(a.jsd * 170);
    o.regime = a.regime.state;
    o.momentum = c.drift;
    o.maturity = c.maturity;
    o.absorption = c.absorption;
    o.exhaustion = c.exhaustion;
    o.releaseProximity = c.release;
    o.danger = c.danger;
    o.conflict = c.conflict;
    o.confirmation = c.confirmation;
    o.integrity = m.integrity;
    o.supportCount = c.supportCount;

    o.reservoirScore = c.reservoirScore ?? c.creation;
    o.exhaustionScore = c.exhaustionScore ?? c.exhaustion;
    o.deliveryScore = c.deliveryScore ?? c.release;
    o.migrationScore = c.migrationScore ?? 0;
    o.absorptionScore = c.absorptionScore ?? c.absorption;
    o.confirmationScore = c.confirmationScore ?? c.confirmation;
    o.conflictScore = c.conflictScore ?? c.conflict;
    o.evidence = c.evidence ?? [];
    o.vetoes = c.vetoes ?? [];
    o.psychology1000 = c.psychology1000;
    o.temporal = c.temporal;
    o.transitions = c.transitions;
    o.entropyVelocity = c.entropyVelocity ?? 0;
    o.entropyAcceleration = c.entropyAcceleration ?? 0;
    o.jsdScore = c.jsdScore ?? 0;

    if (advanced) {
      push(o.series.maturity, c.maturity);
      push(o.series.creation, c.creation);
      push(o.series.persistence, o.persistence);
      push(o.series.pressure, c.pressure);
      push(o.series.accumulation, m.accumulation);
      push(o.series.absorption, c.absorption);
      push(o.series.exhaustion, c.exhaustion);
      push(o.series.danger, c.danger);
      push(o.series.release, c.release);
      push(o.series.confirmation, c.confirmation);
      push(o.series.integrity, m.integrity);
    }

    // PHASE 6 — trajectory engine.
    for (const k of SERIES_KEYS) {
      o.velocity[k] = slope(o.series[k]);
      o.acceleration[k] = accelerationOf(o.series[k]);
    }
    o.trajectory =
      (o.velocity["maturity"] ?? 0) * 0.4 +
      (o.velocity["creation"] ?? 0) * 0.15 +
      (o.velocity["accumulation"] ?? 0) * 0.15 +
      (o.velocity["release"] ?? 0) * 0.2 +
      (o.velocity["integrity"] ?? 0) * 0.1 -
      (o.velocity["danger"] ?? 0) * 0.2;

    this.detectEvents(o, a, c, prev);
    this.transition(o, c, now);
  }

  /** PHASE 9 — meaningful structural events only, never per-tick noise. */
  private detectEvents(
    o: Opportunity,
    a: MarketAnalysis,
    c: ContractAnalysis,
    prev: {
      pressure: number;
      absorption: number;
      exhaustion: number;
      release: number;
      concentration: number;
      regime: string;
      persistence: number;
    },
  ) {
    if (o.concentration - prev.concentration >= 10)
      this.log(
        o,
        "CONCENTRATION INCREASED",
        `${o.kind === "OVER" ? "High" : "Low"}-side digit concentration rising.`,
        "concentration",
        prev.concentration,
        o.concentration,
      );
    if (o.boundaryPressure >= 60 && prev.pressure < o.pressure && o.pressure - prev.pressure >= 6)
      this.log(
        o,
        "BOUNDARY PRESSURE DETECTED",
        `Boundary digit activity at ${c.barrier}.`,
        "boundaryPressure",
        prev.pressure,
        o.pressure,
      );
    if (o.persistence - prev.persistence >= 12)
      this.log(
        o,
        "PERSISTENCE INCREASED",
        `Winning-side run extended to ${c.run}.`,
        "persistence",
        prev.persistence,
        o.persistence,
      );
    if ((o.acceleration["pressure"] ?? 0) > 0.6)
      this.log(
        o,
        "PRESSURE ACCELERATING",
        "Digit pressure is accelerating, not merely elevated.",
        "pressure accel",
        prev.pressure,
        o.pressure,
      );
    if (o.absorption >= 55 && prev.absorption < 55)
      this.log(
        o,
        "ABSORPTION DETECTED",
        "Opposing-side pressure is being absorbed.",
        "absorption",
        prev.absorption,
        o.absorption,
      );
    if ((o.velocity["exhaustion"] ?? 0) > 0.8 && o.exhaustion >= 55)
      this.log(
        o,
        "EXHAUSTION ACCELERATING",
        "Opposing structure is exhausting.",
        "exhaustion",
        prev.exhaustion,
        o.exhaustion,
      );
    if (a.regime.state !== prev.regime)
      this.log(
        o,
        "REGIME CHANGE DETECTED",
        `Regime ${prev.regime} → ${a.regime.state}.`,
        "regime change",
        null,
        a.regime.change,
      );
    if (a.sweep.active && a.sweep.intensity >= 55 && (o.velocity["release"] ?? 0) > 0)
      this.log(
        o,
        "SWEEP SEQUENCE OBSERVED",
        `${a.sweep.side} boundary burst with opposite-zone reversion.`,
        "sweep",
        null,
        a.sweep.intensity,
      );
    if (o.releaseProximity >= 60 && prev.release < 60)
      this.log(
        o,
        "RELEASE STRUCTURE DEVELOPING",
        "Maturation plus exhaustion with observed structural change.",
        "release",
        prev.release,
        o.releaseProximity,
      );
    if (a.changePoint >= 70 && (o.velocity["integrity"] ?? 0) < 0)
      this.log(
        o,
        "STRUCTURAL BREAK DETECTED",
        "Change-point detector fired against the structure.",
        "changePoint",
        null,
        a.changePoint,
      );
  }

  /** PHASE 5 — lifecycle state machine with hysteresis and dwell time. */
  private transition(o: Opportunity, c: ContractAnalysis, now: number) {
    const raw = this.rawPhase(o, c);
    if (raw === o.phase) return;

    const forward = phaseRank(raw) > phaseRank(o.phase);
    const terminalRaw =
      raw === "CONFIRMED" || raw === "BLOCKED" || raw === "INVALIDATED" || raw === "CONFLICTED";

    if (!forward && !terminalRaw) {
      // Backward movement demands dwell time AND material deterioration —
      // a single weak tick must never erase accumulated formation history.
      if (o.phaseDurationTicks < MIN_DWELL_TICKS) return;
      const base = o.series;
      const peakMaturity = Math.max(...base.maturity.slice(-40), o.maturity);
      const deterioration =
        peakMaturity -
        o.maturity +
        Math.max(0, 60 - o.integrity) * 0.4 +
        Math.max(0, o.danger - 50) * 0.3;
      if (deterioration < DETERIORATION_THRESHOLD) return;
    }
    if (forward && o.phaseDurationTicks < 2 && phaseRank(raw) - phaseRank(o.phase) > 1) return;

    o.previousPhase = o.phase;
    o.phase = raw;
    o.phaseSince = now;
    o.phaseDurationTicks = 0;
    o.lastStructuralChange = { at: now, what: `${o.previousPhase} → ${raw}` };

    if (raw === "CONFIRMED") {
      o.confirmationReason = `Multi-dimensional support (${c.supportCount}/7) with release ${c.release.toFixed(0)}, danger ${c.danger.toFixed(0)}, conflict ${c.conflict.toFixed(0)}.`;
      o.terminal = true;
      this.confirmed++;
      this.log(o, "CONFIRMED", o.confirmationReason, "confirmation", null, c.confirmation);
    } else if (raw === "INVALIDATED") {
      o.invalidationReason = `Formation evidence decayed below floor (creation ${c.creation.toFixed(0)}, integrity ${o.integrity.toFixed(0)}).`;
      o.terminal = true;
      this.invalidated++;
      this.log(o, "INVALIDATED", o.invalidationReason, "creation", null, c.creation);
    } else if (raw === "BLOCKED") {
      this.log(
        o,
        "BLOCKED",
        `Danger ${c.danger.toFixed(0)} / conflict ${c.conflict.toFixed(0)} blocks this structure.`,
        "danger",
        null,
        c.danger,
      );
    } else if (raw === "CONFLICTED") {
      this.log(
        o,
        "CONFLICTED",
        "Dimensions disagree materially — no direction is forced.",
        "conflict",
        null,
        c.conflict,
      );
    } else if (raw === "RIPE" || raw === "RELEASE" || raw === "DIRECTIONAL MOVE") {
      this.log(
        o,
        "CONFIRMATION WATCH",
        "RIPE is not CONFIRMED — release evidence under observation.",
        "release",
        null,
        c.release,
      );
    } else {
      this.log(
        o,
        forward ? "PHASE ADVANCE" : "PHASE DETERIORATION",
        `${o.previousPhase} → ${raw}`,
        "maturity",
        null,
        o.maturity,
      );
    }
  }

  private rawPhase(o: Opportunity, c: ContractAnalysis): Phase {
    if (c.state) {
      if (c.state === "BLOCKED") return "BLOCKED";
      if (c.state === "CONFLICTED") return "CONFLICTED";
      if (c.state === "CONFIRMED") return "CONFIRMED";
      if (c.state === "RIPE") return "RIPE";
      if (c.state === "NO_LIQUIDITY") return "NO_LIQUIDITY";
      if (c.state in PHASE_RANK) return c.state as Phase;
    }
    if (!c.law || (c.creation < INVALIDATION_FLOOR && o.ageTicks > MIN_DWELL_TICKS))
      return "INVALIDATED";
    if (c.danger >= 78 || c.conflict >= 82) return "BLOCKED";
    if (c.confirmed) return "CONFIRMED";
    // LAW — conflicting evidence is never forced into a direction.
    if (c.conflict >= 60 && o.integrity < 55) return "CONFLICTED";
    if (c.release >= 78 && c.maturity >= 62 && (o.velocity["release"] ?? 0) > 0.2)
      return "DIRECTIONAL MOVE";
    if (c.release >= 72 && c.maturity >= 62) return "RELEASE";
    if (c.ripe) return "RIPE";
    if (c.exhaustion >= 68) return "EXHAUSTING";
    if (c.absorption >= 55) return "ABSORBING";
    if (c.maturity >= 62) return "MATURE";
    if (c.creation >= 45) return "BUILDING";
    if (c.creation >= FORMATION_FLOOR) return "FORMING";
    return "ABSENT";
  }

  /** PHASE 7 — ranking uses history and trajectory, never a single score. */
  private score(o: Opportunity): number {
    const ageWeight = Math.min(1, o.ageTicks / 120);
    const diversity = o.supportCount / 7;
    const trajectory = clamp(50 + o.trajectory * 22, 0, 100);
    const raw =
      o.maturity * 0.2 +
      o.creation * 0.1 +
      o.accumulation * 0.08 +
      o.persistence * 0.07 +
      o.integrity * 0.1 +
      trajectory * 0.14 +
      clamp(50 + (o.acceleration["maturity"] ?? 0) * 30, 0, 100) * 0.06 +
      o.pressure * 0.05 +
      o.releaseProximity * 0.1 +
      diversity * 100 * 0.06 +
      ageWeight * 100 * 0.04 -
      o.danger * 0.18 -
      o.conflict * 0.1;
    const penalty =
      o.phase === "BLOCKED" || o.phase === "INVALIDATED" ? 45 : o.phase === "CONFLICTED" ? 18 : 0;
    return clamp(raw - penalty);
  }

  /** Retire terminal / abandoned identities so memory stays bounded. */
  private prune(activeKeys: Set<string>, now: number) {
    for (const [key, o] of this.live) {
      const stale =
        now - (o.lastStructuralChange?.at ?? o.bornAt) > 10 * 60_000 && o.phase === "ABSENT";
      const gone = !activeKeys.has(key);
      if (
        (o.terminal && now - o.phaseSince > 3 * 60_000) ||
        stale ||
        (gone && now - o.bornAt > 5 * 60_000)
      ) {
        this.live.delete(key);
      }
    }
  }

  finalize(activeKeys: Set<string>) {
    const now = Date.now();
    this.prune(activeKeys, now);
    const all = [...this.live.values()];
    for (const o of all) o.rank = this.score(o);
    // Stable slot order: sorted primarily by birthTick (formation order) so identities keep their position
    const stableOrder = [...all].sort((a, b) => a.birthTick - b.birthTick);

    this.version++;
    this.snapshot = {
      version: this.version,
      opportunities: stableOrder,
      radar: stableOrder
        .filter((o) => o.phase !== "INVALIDATED" && o.phase !== "ABSENT")
        .slice(0, 18),
      formation: stableOrder
        .filter((o) => ["FORMING", "BUILDING", "MATURE"].includes(o.phase))
        .slice(0, 14),
      releaseWatch: stableOrder
        .filter((o) =>
          ["ABSORBING", "EXHAUSTING", "RIPE", "RELEASE", "DIRECTIONAL MOVE"].includes(o.phase),
        )
        .slice(0, 14),
      conflicted: stableOrder
        .filter((o) => o.phase === "CONFLICTED" || o.phase === "BLOCKED")
        .slice(0, 10),
      ledger: this.ledger,
      born: this.born,
      invalidated: this.invalidated,
      confirmed: this.confirmed,
    };
    return this.snapshot;
  }
}

export const EMPTY_OPPORTUNITY_SNAPSHOT = EMPTY_SNAPSHOT;

export function releaseProximityLabel(v: number): "LOW" | "MODERATE" | "ELEVATED" | "HIGH" {
  if (v >= 75) return "HIGH";
  if (v >= 60) return "ELEVATED";
  if (v >= 40) return "MODERATE";
  return "LOW";
}
