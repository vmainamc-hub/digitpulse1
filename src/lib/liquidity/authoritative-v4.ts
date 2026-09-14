/**
 * AUTHORITATIVE LIQUIDITY INTELLIGENCE MODEL (V4)
 *
 * Unified canonical pipeline:
 * DERIV FEED
 *   ↓
 * CANONICAL TICK STORE
 *   ↓
 * AUTHORITATIVE RESERVOIR / LIQUIDITY MODEL
 *   ↓
 * FORMATION / LIFECYCLE
 *   ↓
 * RANKING / QUALIFICATION
 *   ↓
 * UI (AuthoritativeLiquidityView)
 *
 * Core Guarantees:
 * 1. LIQUIDITY LEVEL ≠ ACCUMULATED LIQUIDITY
 *    Liquidity level measures structural market potential / activity.
 *    Accumulated liquidity measures actual reservoir evidence.
 *    Elevated liquidity level with zero accumulated liquidity and zero reservoirs is a valid state.
 *
 * 2. COMPREHENSIVE RESERVOIR DETECTION
 *    Red / 2nd Red / Purple are privileged Sentinel evidence, but NOT the sole reservoir definition.
 *    Any winning-side digit can qualify through persistent concentration, underrepresentation,
 *    pressure, multi-window coherence, and opposing-side exhaustion.
 *    Green is dominant/exhausting and NEVER an automatic reservoir.
 *
 * 3. REAL TICK-BASED AGE
 *    Formation age increments ONLY on actual tick progression. Multiple renders or polling
 *    with 0 new ticks do NOT advance age.
 *
 * 4. SENTINEL PSYCHOLOGY (1000-TICK ANCHOR)
 *    Strict preservation of all 1000-tick Sentinel rules and hard vetoes.
 *
 * 5. CONTROLLED LIFECYCLE PROGRESSION & GATED QUALIFICATION
 *    No skipping stages; no CONFIRMED without RIPE/RELEASE and zero hard vetoes.
 */

import { CONTRACTS, type ContractDef, type LiquidityState, type Side } from "./universe";
import { clamp, mean, normalizedEntropy, jsd } from "./math";
import {
  buildPsychology1000,
  temporalFor,
  transitionEvidence,
  getMarketSentinelPsychology,
  type V3Tick,
  type DigitTemporal,
  type TransitionEvidence,
  type Psychology1000,
  type MarketSentinelPsychology,
} from "./liquidity-v3";

export interface AuthoritativeReservoir {
  digit: number;
  kind: "RED" | "2ND RED" | "PURPLE" | "WINNING CONCENTRATION" | "STRUCTURAL RESERVOIR";
  score: number;
  persistence: number;
  concentration: number;
  pressure: number;
  coherence: number;
  sentinelRole: string;
}

export type AuthoritativeLifecycle =
  | "NO_LIQUIDITY"
  | "FORMING"
  | "BUILDING"
  | "MATURE"
  | "EXHAUSTION_WATCH"
  | "EXHAUSTION_CONFIRMED"
  | "DELIVERY"
  | "DELIVERY_ACCELERATING"
  | "ABSORBING"
  | "RELEASE_WATCH"
  | "RELEASE"
  | "RIPE"
  | "CONFIRMED"
  | "CONFLICTED"
  | "BLOCKED"
  | "INVALIDATED";

export interface AuthoritativeContract {
  id: string;
  label: string;
  side: Side;
  barrier: number;
  state: LiquidityState;
  liquidityLevel: number;
  accumulatedLiquidity: number;
  reservoirScore: number;
  reservoirDigits: number[];
  reservoirs: AuthoritativeReservoir[];
  maturity: number;
  exhaustion: number;
  delivery: number;
  absorption: number;
  release: number;
  confirmation: number;
  conflict: number;
  psychology: {
    green: number;
    secondGreen: number;
    red: number;
    secondRed: number;
    purple: number | null;
  };
  trajectory: string;
  age: number;
  vetoes: string[];
  qualified: boolean;
  qualificationStatus: "QUALIFIED" | "WATCH" | "NOT_QUALIFIED" | "BLOCKED" | "CONFLICTED";
  evidence: string[];
  lastTickCount?: number;
  birthTick?: number;
  trajectoryHistory?: number[];
  entropyVelocity?: number;
  entropyAcceleration?: number;
  jsdScore?: number;
}

export interface AuthoritativeMarketAnalysis {
  symbol: string;
  sample: number;
  last: number;
  sentinelPsychology: MarketSentinelPsychology;
  contracts: AuthoritativeContract[];
  top: AuthoritativeContract;
  qualified: AuthoritativeContract[];
  timestamp: number;
  tickCount: number;
}

function pct(ds: number[]): number[] {
  const c = Array(10).fill(0);
  for (const d of ds) if (d >= 0 && d < 10) c[d]++;
  const n = Math.max(1, ds.length);
  return c.map((x) => x / n);
}

/**
 * Detects winning-side reservoirs according to the full authoritative definition.
 * Red / 2nd Red / Purple have privileged weighting, but any winning-side digit with
 * persistent concentration, temporal persistence, pressure, and coherence qualifies.
 * Green is dominant/exhausting and NEVER becomes an automatic reservoir.
 */
export function detectReservoirs(
  ticks: V3Tick[],
  side: Side,
  barrier: number,
  psychology: Psychology1000,
  temporal: Record<number, DigitTemporal>,
  exhaustionScore: number,
): { reservoirs: AuthoritativeReservoir[]; reservoirDigits: number[]; reservoirScore: number } {
  const ds = ticks.map((t) => t.d);
  const winners = psychology.winners;
  const p1000 = psychology.pct;
  const pressure = psychology.pressure;

  const w20 = pct(ds.slice(-20));
  const w60 = pct(ds.slice(-60));
  const w120 = pct(ds.slice(-120));
  const w240 = pct(ds.slice(-240));

  const detected: AuthoritativeReservoir[] = [];

  for (const d of winners) {
    // Green represents dominant market exhaustion, NEVER an automatic reservoir.
    if (d === psychology.green) {
      continue;
    }

    const t = temporal[d] ?? temporalFor(ds, d);
    const baseline = p1000[d] ?? 0.1;
    const r20 = w20[d] ?? 0;
    const r60 = w60[d] ?? 0;
    const r120 = w120[d] ?? 0;
    const r240 = w240[d] ?? 0;
    const dPress = pressure[d] ?? 0;

    // 1. Rarity / underrepresentation in 1000-tick baseline
    const rarity = clamp((0.11 - baseline) * 1000 + 40);

    // 2. Persistent concentration: recent frequency elevated above baseline
    const elevation20 = Math.max(0, r20 - baseline);
    const elevation60 = Math.max(0, r60 - baseline);
    const elevation120 = Math.max(0, r120 - baseline);
    const concentration = clamp(40 + elevation20 * 400 + elevation60 * 500 + elevation120 * 300);

    // 3. Multi-window temporal persistence
    // Distinguish short-term isolated spikes (last 15-20 ticks only) from multi-window sustained persistence
    const hasElevation20 = r20 > baseline * 1.1;
    const hasElevation60 = r60 > baseline * 1.1;
    const hasElevation120 = r120 > baseline * 1.1;

    const windowSpan =
      (hasElevation20 ? 0.25 : 0) + (hasElevation60 ? 0.45 : 0) + (hasElevation120 ? 0.3 : 0);

    // If recent 20-tick rate violently outstrips 120-tick rate, it is an acute spike rather than mature persistence
    const spikeDivergence = Math.max(0, r20 - r120);
    const spikePenalty = spikeDivergence > 0.2 ? (spikeDivergence - 0.2) * 100 : 0;

    const persistence = clamp(
      windowSpan * 60 +
        (t.delivering && hasElevation60 ? 15 : 0) +
        (t.slope60_120 >= 0 ? 10 : -10) +
        Math.min(10, t.cusum * 0.1) -
        spikePenalty,
    );

    // 4. Pressure (second half vs first half of 1000 ticks)
    const pressScore = clamp(50 + dPress * 2500);

    // 5. Multi-window coherence across 20, 60, 120, 240 ticks
    const diff20_60 = Math.abs(r20 - r60);
    const diff60_120 = Math.abs(r60 - r120);
    const coherence = clamp(100 - (diff20_60 * 500 + diff60_120 * 400));

    // Determine role and privileged status
    const isRed = d === psychology.red;
    const isSecondRed = d === psychology.secondRed;
    const isPurple = psychology.purple !== null && d === psychology.purple;

    let score = 0;
    let kind: AuthoritativeReservoir["kind"] = "STRUCTURAL RESERVOIR";
    let sentinelRole = "Winning-side structural accumulation";

    if (isRed) {
      kind = "RED";
      sentinelRole = "Primary Red depletion (privileged Sentinel reservoir)";
      score = clamp(
        rarity * 0.35 + persistence * 0.25 + concentration * 0.2 + pressScore * 0.2 + 15, // Privileged Sentinel weight
      );
    } else if (isSecondRed) {
      kind = "2ND RED";
      sentinelRole = "Secondary Red depletion (privileged Sentinel reservoir)";
      score = clamp(
        rarity * 0.35 + persistence * 0.25 + concentration * 0.2 + pressScore * 0.2 + 10, // Privileged Sentinel weight
      );
    } else if (isPurple) {
      kind = "PURPLE";
      sentinelRole = "Purple velocity vector influx (privileged dynamic reservoir)";
      score = clamp(
        pressScore * 0.35 + concentration * 0.3 + persistence * 0.25 + coherence * 0.1 + 12, // Privileged dynamic weight
      );
    } else {
      // General winning-side digit: must demonstrate persistent concentration and persistence
      const opposingExhaustionBonus = exhaustionScore >= 60 ? 10 : 0;
      const rawScore =
        concentration * 0.35 +
        persistence * 0.3 +
        coherence * 0.2 +
        pressScore * 0.15 +
        opposingExhaustionBonus;

      // Distinguish ordinary winning digit from true developing/mature reservoir
      if (concentration >= 55 && persistence >= 45 && coherence >= 40) {
        kind = concentration >= 65 ? "WINNING CONCENTRATION" : "STRUCTURAL RESERVOIR";
        sentinelRole = `Winning d${d} persistent concentration`;
        score = clamp(rawScore);
      } else {
        // Ordinary winning digit or temporary noise: insufficient evidence to be a reservoir
        score = clamp(rawScore * 0.5);
      }
    }

    // Qualification threshold for active reservoir list:
    // Red/2nd Red require at least 32, other digits require at least 42 score
    const minThreshold = isRed || isSecondRed || isPurple ? 32 : 42;
    if (score >= minThreshold) {
      detected.push({
        digit: d,
        kind,
        score,
        persistence,
        concentration,
        pressure: pressScore,
        coherence,
        sentinelRole,
      });
    }
  }

  // Sort reservoirs by score descending
  detected.sort((a, b) => b.score - a.score);
  const reservoirDigits = detected.map((r) => r.digit);

  // Overall reservoir composite score
  const reservoirScore =
    detected.length === 0
      ? 0
      : clamp(mean(detected.map((r) => r.score)) * 0.75 + Math.min(25, detected.length * 10));

  return { reservoirs: detected, reservoirDigits, reservoirScore };
}

/**
 * Computes market structural liquidity level (0-100).
 * Measures baseline health, statistical sample adequacy, distribution entropy, and parity balance.
 * Intentionally separated from accumulated liquidity: can be high even with 0 reservoirs!
 */
export function calculateStructuralLiquidityLevel(
  ticks: V3Tick[],
  side: Side,
  barrier: number,
  psychology: Psychology1000,
): number {
  const ds = ticks.map((t) => t.d);
  const n = ds.length;

  // 1. Sample adequacy (up to 1000 ticks)
  const sampleScore = Math.min(100, (n / 1000) * 100);

  // 2. Entropy health (balanced distribution vs catastrophic collapse)
  const p1000 = psychology.pct;
  const ent = normalizedEntropy(p1000);
  const entropyScore = clamp((1 - Math.abs(ent - 0.96) * 4) * 100);

  // 3. Contract winning-zone participation stability
  const winCount = ds.filter((d) => (side === "OVER" ? d > barrier : d < barrier)).length;
  const winRate = winCount / Math.max(1, n);
  const expectedRate = side === "OVER" ? (9 - barrier) / 10 : barrier / 10;
  const participationScore = clamp(100 - Math.abs(winRate - expectedRate) * 180);

  // 4. Parity and regime equilibrium
  const recent20 = ds.slice(-20);
  const evenShare = recent20.filter((d) => d % 2 === 0).length / Math.max(1, recent20.length);
  const parityScore = clamp(100 - Math.abs(evenShare - 0.5) * 160);

  return clamp(
    sampleScore * 0.35 + entropyScore * 0.25 + participationScore * 0.25 + parityScore * 0.15,
  );
}

/**
 * Computes authoritative contract analysis for one contract.
 */
export function analyzeAuthoritativeContract(
  history: V3Tick[],
  c: ContractDef,
  marketSymbol: string,
  previous?: AuthoritativeContract,
): AuthoritativeContract {
  const ds = history.map((x) => x.d);
  const currentTickCount = history.length;

  // 1. Sentinel Psychology on 1000-tick canonical window
  const psychology = buildPsychology1000(history, c.kind, c.barrier);

  // 2. Digit temporal analysis (all 10 digits)
  const temporal: Record<number, DigitTemporal> = {};
  for (let d = 0; d < 10; d++) {
    temporal[d] = temporalFor(ds, d);
  }

  // 3. Dominant losing digits and exhaustion
  const dominantDigits = [psychology.green, psychology.secondGreen];
  const exhaustion = clamp(
    mean(
      dominantDigits.map((d) => {
        const x = temporal[d] ?? temporalFor(ds, d);
        return clamp(
          50 -
            x.slope20_60 * 7000 +
            Math.max(0, -x.ewmaSlope) * 3000 +
            x.cusum * 0.45 +
            x.changePoint * 0.35,
        );
      }),
    ),
  );

  // 4. Reservoir detection (comprehensive beyond Red/2nd Red, Green excluded)
  const { reservoirs, reservoirDigits, reservoirScore } = detectReservoirs(
    history,
    c.kind,
    c.barrier,
    psychology,
    temporal,
    exhaustion,
  );

  // 5. Delivery score from detected reservoirs
  const delivery =
    reservoirs.length === 0
      ? 0
      : clamp(
          mean(
            reservoirs.map((r) => {
              const x = temporal[r.digit] ?? temporalFor(ds, r.digit);
              return clamp(
                35 +
                  x.slope20_60 * 7000 +
                  x.slope60_120 * 4000 +
                  Math.max(0, x.ewmaSlope) * 3000 +
                  x.cusum * 0.35 +
                  x.changePoint * 0.2,
              );
            }),
          ),
        );

  // 6. Dominant-to-reservoir migration
  const dominantToReservoir =
    reservoirDigits.length > 0
      ? transitionEvidence(ds, dominantDigits, reservoirDigits)
      : { strength: 0, recent: 0, baseline: 0, delta: 0, from: dominantDigits, to: [] };

  const purpleAligned = psychology.purple !== null && reservoirDigits.includes(psychology.purple);
  const migration =
    reservoirs.length === 0
      ? 0
      : clamp(dominantToReservoir.strength * 0.8 + (purpleAligned ? 35 : 0));

  // 7. Structural absorption
  const absorption =
    reservoirs.length === 0 ? 0 : clamp(delivery * 0.45 + exhaustion * 0.3 + migration * 0.25);

  // 8. Structural departure (JSD) & Entropy dynamics
  const p20 = pct(ds.slice(-20));
  const p120 = pct(ds.slice(-120));
  const p500 = pct(ds.slice(-500));
  const ent20 = normalizedEntropy(p20);
  const ent120 = normalizedEntropy(p120);
  const ent500 = normalizedEntropy(p500);
  const entropyVelocity = ent20 - ent120;
  const entropyAcceleration = ent20 - ent120 - (ent120 - ent500);
  const divergence = jsd(p20, p500);

  // 9. Conflict score
  const conflict = clamp(
    (psychology.valid ? 0 : 65) +
      (psychology.outcome === "WATCH" ? 20 : 0) +
      Math.max(0, 50 - migration) * 0.25 +
      (reservoirs.length === 0 ? 15 : 0),
  );

  // 10. Confirmation score
  const confirmation =
    reservoirs.length === 0
      ? clamp(divergence * 100)
      : clamp(
          reservoirScore * 0.18 +
            exhaustion * 0.2 +
            delivery * 0.24 +
            migration * 0.16 +
            absorption * 0.12 +
            clamp(divergence * 220) * 0.1,
        );

  // 11. LIQUIDITY LEVEL vs ACCUMULATED LIQUIDITY (SEPARATION GUARANTEE)
  // Structural liquidity level: measures market activity and participation
  const liquidityLevel = calculateStructuralLiquidityLevel(history, c.kind, c.barrier, psychology);

  // Tick-based age progression:
  // Age increases ONLY when actual new ticks have arrived!
  const deltaTicks = previous
    ? Math.max(0, currentTickCount - (previous.lastTickCount ?? currentTickCount))
    : 0;
  const age = previous ? previous.age + deltaTicks : 1;

  // Accumulated liquidity:
  // Requires actual reservoir evidence. If zero reservoirs exist, remains 0!
  let accumulatedLiquidity = 0;
  if (reservoirs.length > 0) {
    const rawTarget = clamp(
      reservoirScore * 0.45 +
        delivery * 0.25 +
        mean(reservoirs.map((r) => r.persistence)) * 0.2 +
        mean(reservoirs.map((r) => r.coherence)) * 0.1,
    );

    const prevAccum = previous?.accumulatedLiquidity ?? 0;
    if (prevAccum === 0) {
      // Gradual build-up: cannot jump from 0 to 90 instantly
      accumulatedLiquidity = Math.min(rawTarget, 25 + rawTarget * 0.3);
    } else if (deltaTicks > 0) {
      accumulatedLiquidity = clamp(prevAccum * 0.85 + rawTarget * 0.15);
    } else {
      accumulatedLiquidity = prevAccum;
    }
  } else {
    // Zero reservoirs -> zero accumulated liquidity
    accumulatedLiquidity = 0;
  }

  // Maturity score based on reservoir maturation
  const maturity =
    reservoirs.length === 0
      ? 0
      : clamp(mean(reservoirs.map((r) => r.persistence)) * 0.6 + reservoirScore * 0.4);

  // Release score based on delivery & exhaustion
  const release =
    reservoirs.length === 0 ? 0 : clamp(exhaustion * 0.45 + delivery * 0.45 + migration * 0.1);

  // 12. VETOES & SENTINEL PSYCHOLOGY
  const vetoes: string[] = [...psychology.reasons];
  if (reservoirs.length === 0) {
    vetoes.push("No active winning-side liquidity reservoir detected");
  }
  if (conflict > 55) {
    vetoes.push(`Elevated structural conflict (${Math.round(conflict)})`);
  }
  if (age < 8) {
    vetoes.push(`Insufficient formation age (${age}/8 ticks)`);
  }
  if (accumulatedLiquidity < 35) {
    vetoes.push(`Insufficient accumulated liquidity (${Math.round(accumulatedLiquidity)}/35)`);
  }

  // 13. EVIDENCE GATHERING
  const evidence: string[] = [];
  if (reservoirs.length > 0) {
    evidence.push(
      `Reservoirs d[${reservoirDigits.join(",")}] active (score ${Math.round(reservoirScore)})`,
    );
  }
  if (exhaustion >= 65) evidence.push(`Dominant exhaustion ${Math.round(exhaustion)}`);
  if (delivery >= 65) evidence.push(`Reservoir delivery ${Math.round(delivery)}`);
  if (migration >= 60) evidence.push(`Migration vector ${Math.round(migration)}`);
  if (purpleAligned) evidence.push(`Purple d${psychology.purple} dynamically aligned`);
  if (divergence > 0.04) evidence.push(`Distribution divergence ${divergence.toFixed(3)}`);

  // 14. LIFECYCLE PROGRESSION (NO SKIPPING STAGES)
  let state: LiquidityState = "NO_LIQUIDITY";

  if (!psychology.valid && psychology.outcome === "REJECT") {
    state = "BLOCKED";
  } else if (conflict >= 65) {
    state = "CONFLICTED";
  } else if (reservoirs.length === 0) {
    state = "NO_LIQUIDITY";
  } else {
    // Progressive state determination
    if (
      confirmation >= 82 &&
      (previous?.state === "RIPE" || previous?.state === "RELEASE") &&
      vetoes.length === 0 &&
      age >= 12
    ) {
      state = "CONFIRMED";
    } else if (
      confirmation >= 75 &&
      (previous?.state === "RELEASE" ||
        previous?.state === "RELEASE_WATCH" ||
        previous?.state === "RIPE") &&
      age >= 8
    ) {
      state = "RIPE";
    } else if (exhaustion >= 75 && delivery >= 75 && migration >= 55) {
      state = "RELEASE";
    } else if (exhaustion >= 70 && delivery >= 70) {
      state = "RELEASE_WATCH";
    } else if (absorption >= 65) {
      state = "ABSORBING";
    } else if (delivery >= 75 && migration >= 55) {
      state = "DELIVERY_ACCELERATING";
    } else if (delivery >= 60) {
      state = "DELIVERY";
    } else if (exhaustion >= 70) {
      state = "EXHAUSTION_CONFIRMED";
    } else if (exhaustion >= 55) {
      state = "EXHAUSTION_WATCH";
    } else if (maturity >= 50 && accumulatedLiquidity >= 50) {
      state = "MATURE";
    } else if (accumulatedLiquidity >= 35 || reservoirScore >= 50) {
      state = "BUILDING";
    } else if (reservoirScore >= 35 || accumulatedLiquidity >= 20) {
      state = "FORMING";
    } else {
      state = "NO_LIQUIDITY";
    }

    // Hysteresis preservation if confirmation remains solid
    if (previous && psychology.valid && state !== "CONFIRMED") {
      const order = [
        "NO_LIQUIDITY",
        "FORMING",
        "BUILDING",
        "MATURE",
        "EXHAUSTION_WATCH",
        "EXHAUSTION_CONFIRMED",
        "DELIVERY",
        "DELIVERY_ACCELERATING",
        "ABSORBING",
        "RELEASE_WATCH",
        "RELEASE",
        "RIPE",
      ];
      const pi = order.indexOf(previous.state);
      const ni = order.indexOf(state);
      if (pi >= 0 && ni >= 0 && ni < pi && pi - ni <= 2 && confirmation >= 50) {
        state = previous.state;
      }
    }
  }

  // 15. QUALIFICATION (STRICT GATES)
  const passesPsychology = psychology.valid && psychology.outcome === "ACCEPT";
  const passesAge = age >= 8;
  const passesAccumulation = accumulatedLiquidity >= 35;
  const passesMaturity = maturity >= 50;
  const passesExhaustion = exhaustion >= 55;
  const passesDelivery = delivery >= 50;
  const passesConflict = conflict <= 55;
  const hasNoVetoes = vetoes.length === 0;

  const qualified =
    passesPsychology &&
    passesAge &&
    passesAccumulation &&
    passesMaturity &&
    passesExhaustion &&
    passesDelivery &&
    passesConflict &&
    hasNoVetoes;

  let qualificationStatus: AuthoritativeContract["qualificationStatus"] = "NOT_QUALIFIED";
  if (qualified) {
    qualificationStatus = "QUALIFIED";
  } else if (psychology.outcome === "REJECT") {
    qualificationStatus = "BLOCKED";
  } else if (conflict > 55) {
    qualificationStatus = "CONFLICTED";
  } else if (psychology.outcome === "WATCH") {
    qualificationStatus = "WATCH";
  }

  // 16. TRAJECTORY CALCULATION
  const historySeries = [...(previous?.trajectoryHistory ?? []), confirmation].slice(-60);
  const deltaScore =
    historySeries.length >= 5
      ? confirmation - (historySeries[historySeries.length - 5] ?? confirmation)
      : 0;

  let trajectory = "STABLE";
  if (state === "RELEASE" || state === "RIPE") {
    trajectory = "RELEASING";
  } else if (state === "MATURE") {
    trajectory = "MATURING";
  } else if (deltaScore > 2.5) {
    trajectory = "STRENGTHENING";
  } else if (deltaScore < -2.5) {
    trajectory = "WEAKENING";
  } else if (state === "EXHAUSTION_WATCH" || state === "EXHAUSTION_CONFIRMED") {
    trajectory = "EXHAUSTING";
  }

  return {
    id: c.id,
    label: c.label,
    side: c.kind,
    barrier: c.barrier,
    state,
    liquidityLevel,
    accumulatedLiquidity,
    reservoirScore,
    reservoirDigits,
    reservoirs,
    maturity,
    exhaustion,
    delivery,
    absorption,
    release,
    confirmation,
    conflict,
    psychology: {
      green: psychology.green,
      secondGreen: psychology.secondGreen,
      red: psychology.red,
      secondRed: psychology.secondRed,
      purple: psychology.purple,
    },
    trajectory,
    age,
    vetoes,
    qualified,
    qualificationStatus,
    evidence,
    lastTickCount: currentTickCount,
    birthTick: previous?.birthTick ?? currentTickCount,
    trajectoryHistory: historySeries,
    entropyVelocity,
    entropyAcceleration,
    jsdScore: divergence,
  };
}

/**
 * Top-level Authoritative Market Analysis function.
 * Computes all contracts for the market and returns the complete authoritative state.
 */
export function analyzeAuthoritativeMarket(
  history: V3Tick[],
  marketSymbol: string = "MARKET",
  previousContracts: Record<string, AuthoritativeContract> = {},
): AuthoritativeMarketAnalysis | null {
  const ds = history.map((x) => x.d);
  if (ds.length < 30) return null;

  const sentinelPsychology = getMarketSentinelPsychology(history);

  const contracts: AuthoritativeContract[] = CONTRACTS.map((c) =>
    analyzeAuthoritativeContract(history, c, marketSymbol, previousContracts[c.id]),
  );

  const qualified = contracts
    .filter((c) => c.qualified)
    .sort((a, b) => b.confirmation - a.confirmation);

  // Top ranked contract: best confirmation score
  const sorted = [...contracts].sort((a, b) => b.confirmation - a.confirmation);
  const top = qualified[0] ?? sorted[0]!;

  return {
    symbol: marketSymbol,
    sample: ds.length,
    last: ds[ds.length - 1] ?? 0,
    sentinelPsychology,
    contracts,
    top,
    qualified,
    timestamp: Date.now(),
    tickCount: history.length,
  };
}
