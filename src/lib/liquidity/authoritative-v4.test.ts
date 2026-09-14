import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeAuthoritativeContract,
  analyzeAuthoritativeMarket,
  detectReservoirs,
  calculateStructuralLiquidityLevel,
  type AuthoritativeContract,
} from "./authoritative-v4";
import { CONTRACTS, type Side } from "./universe";
import { buildPsychology1000, type V3Tick } from "./liquidity-v3";

/**
 * Creates a synthetic 1000-tick series with controllable digit distribution and pressure.
 */
function createSyntheticTicks(
  length = 1000,
  distribution?: Record<number, number>,
  pressureDigit?: number,
): V3Tick[] {
  const ticks: V3Tick[] = [];
  const baseWeights = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]; // uniform default
  if (distribution) {
    for (const [k, v] of Object.entries(distribution)) {
      baseWeights[Number(k)] = v;
    }
  }

  const sum = baseWeights.reduce((a, b) => a + b, 0);
  const cdf: number[] = [];
  let running = 0;
  for (const w of baseWeights) {
    running += w / sum;
    cdf.push(running);
  }

  const now = Date.now();
  for (let i = 0; i < length; i++) {
    // If pressureDigit is specified, boost its rate in the second half of ticks
    let digit = 0;
    if (pressureDigit !== undefined && i >= length / 2 && Math.random() < 0.25) {
      digit = pressureDigit;
    } else {
      const r = Math.random();
      digit = cdf.findIndex((threshold) => r <= threshold);
      if (digit === -1) digit = 9;
    }

    ticks.push({
      t: now - (length - i) * 1000,
      p: 100 + i * 0.01,
      q: 100 + i * 0.01,
      d: digit,
    });
  }

  return ticks;
}

describe("Authoritative Liquidity Model V4 Verification (12 Core Invariants)", () => {
  // Test 1: No reservoir = low/zero accumulated liquidity
  it("Test 1 — No reservoir = low/zero accumulated liquidity", () => {
    // Generate uniform noise where no single winning digit accumulates or concentrates
    const ticks = createSyntheticTicks(1000);
    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;
    const res = analyzeAuthoritativeContract(ticks, under7, "R_100");

    if (res.reservoirs.length === 0) {
      assert.equal(
        res.accumulatedLiquidity,
        0,
        "Accumulated liquidity must be strictly 0 when no reservoirs exist",
      );
      assert.equal(
        res.reservoirScore,
        0,
        "Reservoir score must be strictly 0 when no reservoirs exist",
      );
    }
  });

  // Test 2: Elevated liquidity level with zero accumulated liquidity and zero reservoirs is valid
  it("Test 2 — Elevated liquidity level with zero accumulated liquidity and zero reservoirs is valid", () => {
    const ticks = createSyntheticTicks(1000);
    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;
    const res = analyzeAuthoritativeContract(ticks, under7, "R_100");

    // Liquidity level measures market participation/entropy/sample adequacy (elevated >= 50)
    assert.ok(
      res.liquidityLevel >= 50,
      `Liquidity level should be elevated from healthy baseline sample (actual: ${res.liquidityLevel})`,
    );

    // If there are no reservoirs, accumulatedLiquidity is 0, showing separation
    if (res.reservoirs.length === 0) {
      assert.equal(res.accumulatedLiquidity, 0);
      assert.ok(
        res.liquidityLevel > res.accumulatedLiquidity,
        "Liquidity Level must be distinctly higher than zero accumulated liquidity",
      );
    }
  });

  // Test 3: High concentration without temporal persistence does not qualify as a mature reservoir
  it("Test 3 — High concentration without temporal persistence does not qualify as a mature reservoir", () => {
    // Digit 4 has normal baseline (10%) in general, but near zero between ticks 760-985
    const ticks = createSyntheticTicks(1000);
    for (let i = 760; i < 985; i++) {
      if (ticks[i]?.d === 4) {
        ticks[i] = { ...ticks[i]!, d: 5 };
      }
    }
    // Inject sudden short spike of d4 in the last 15 ticks only (no multi-window persistence)
    for (let i = 985; i < 1000; i++) {
      ticks[i] = { ...ticks[i]!, d: 4 };
    }

    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;
    const res = analyzeAuthoritativeContract(ticks, under7, "R_100");

    // A sudden 15-tick spike has high recent concentration, but lacks temporal maturity and persistence
    const d4Res = res.reservoirs.find((r) => r.digit === 4);
    if (d4Res) {
      assert.ok(
        d4Res.persistence < 75,
        `Short-term spike without multi-window persistence must not have high persistence (was ${d4Res.persistence})`,
      );
    }
    assert.notEqual(res.state, "MATURE", "A short-term spike must not qualify contract as MATURE");
    assert.notEqual(
      res.state,
      "CONFIRMED",
      "A short-term spike must not qualify contract as CONFIRMED",
    );
    assert.notEqual(res.state, "RIPE", "A short-term spike must not qualify contract as RIPE");
  });

  // Test 4: Persistent concentration on non-Red/non-2nd-Red winning digit produces a valid reservoir
  it("Test 4 — Persistent concentration on non-Red/non-2nd-Red winning digit produces a valid reservoir", () => {
    // Digit 3 is dominant Green (30%), Digit 8 is rare Red (3%), Digit 7 is 2nd Red (5%)
    // Digit 2 is initially low/normal (8%), but persistently concentrates across the last 150 ticks
    const distribution: Record<number, number> = {
      0: 8,
      1: 8,
      2: 8,
      3: 30, // Green
      4: 10,
      5: 10,
      6: 10,
      7: 5, // 2nd Red
      8: 3, // Red
      9: 8,
    };
    const ticks = createSyntheticTicks(1000, distribution);
    // Inject persistent concentration of digit 2 across the last 150 ticks (35% of those ticks)
    for (let i = 850; i < 1000; i++) {
      if ((i - 850) % 3 === 0) {
        ticks[i] = { ...ticks[i]!, d: 2 };
      }
    }

    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;
    const res = analyzeAuthoritativeContract(ticks, under7, "R_100");

    assert.equal(res.psychology.green, 3, "Digit 3 must remain Green");
    assert.notEqual(res.psychology.red, 2, "Digit 2 must not be Red");
    assert.notEqual(res.psychology.secondRed, 2, "Digit 2 must not be 2nd Red");

    const nonRedReservoir = res.reservoirs.find(
      (r) => r.digit !== res.psychology.red && r.digit !== res.psychology.secondRed,
    );
    assert.ok(
      nonRedReservoir !== undefined,
      "A non-Red, non-2nd-Red winning digit with sustained accumulation can qualify as a reservoir",
    );
  });

  // Test 5: Green on winning side is NOT an automatic reservoir
  it("Test 5 — Green on winning side is NOT an automatic reservoir", () => {
    // Force Green = 3 (which is < 7, so in UNDER 7 winning zone)
    const distribution: Record<number, number> = {
      3: 25, // Green is heavily dominant digit 3
      8: 3, // Red
      7: 5, // 2nd Red
    };
    const ticks = createSyntheticTicks(1000, distribution);
    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;
    const res = analyzeAuthoritativeContract(ticks, under7, "R_100");

    assert.equal(res.psychology.green, 3, "Green must be digit 3");
    const greenInReservoirs = res.reservoirs.some((r) => r.digit === 3);
    assert.equal(
      greenInReservoirs,
      false,
      "Green on the winning side must NEVER automatically become a reservoir",
    );
  });

  // Test 6: Multiple renders with zero new ticks DO NOT increment formation age
  it("Test 6 — Multiple renders with zero new ticks DO NOT increment formation age", () => {
    const ticks = createSyntheticTicks(1000);
    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;

    // Initial evaluation
    const firstRun = analyzeAuthoritativeContract(ticks, under7, "R_100");
    const initialAge = firstRun.age;

    // Simulate 5 consecutive renders or cycles with the EXACT same tick count
    let current = firstRun;
    for (let render = 0; render < 5; render++) {
      current = analyzeAuthoritativeContract(ticks, under7, "R_100", current);
    }

    assert.equal(
      current.age,
      initialAge,
      "Formation age must not increase when zero new ticks arrive",
    );
  });

  // Test 7: Advancing tick progression increases formation age proportionally
  it("Test 7 — Advancing tick progression increases formation age proportionally", () => {
    const ticks = createSyntheticTicks(1000);
    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;

    const firstRun = analyzeAuthoritativeContract(ticks, under7, "R_100");
    const initialAge = firstRun.age;

    // Add 15 new ticks
    const advancedTicks = [...ticks];
    const now = Date.now();
    for (let i = 0; i < 15; i++) {
      advancedTicks.push({
        t: now + i * 1000,
        p: 110 + i * 0.01,
        q: 110 + i * 0.01,
        d: i % 10,
      });
    }

    const secondRun = analyzeAuthoritativeContract(advancedTicks, under7, "R_100", firstRun);
    assert.equal(
      secondRun.age,
      initialAge + 15,
      `Formation age must advance by exactly 15 ticks (got ${secondRun.age})`,
    );
  });

  // Test 8: Invalid Sentinel psychology (e.g. Green parity violation) produces hard veto and blocks qualification
  it("Test 8 — Invalid Sentinel psychology produces hard veto and blocks qualification", () => {
    // For UNDER, Sentinel psychology requires Green to be ODD.
    // If Green is EVEN (e.g. d2), it is a parity violation and must be vetoed.
    const distribution: Record<number, number> = {
      2: 30, // Even digit 2 is Green
      1: 5,
    };
    const ticks = createSyntheticTicks(1000, distribution);
    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;
    const res = analyzeAuthoritativeContract(ticks, under7, "R_100");

    assert.equal(res.psychology.green, 2);
    const hasParityVeto = res.vetoes.some((v) => v.includes("UNDER Green d2 must be odd"));
    assert.ok(hasParityVeto, "Parity violation must generate a hard veto in psychology");
    assert.equal(res.qualified, false, "Contract with psychology veto must NOT be qualified");
  });

  // Test 9: Red in losing zone produces hard veto
  it("Test 9 — Red in losing zone produces hard veto", () => {
    // For UNDER 7, digits 7, 8, 9 are losing digits.
    // Make Red = 8 (losing zone for UNDER 7)
    const distribution: Record<number, number> = {
      8: 2, // Depleted digit 8 becomes Red
      3: 20, // Green
    };
    const ticks = createSyntheticTicks(1000, distribution);
    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;
    const res = analyzeAuthoritativeContract(ticks, under7, "R_100");

    assert.equal(res.psychology.red, 8);
    const hasLosingRedVeto = res.vetoes.some((v) => v.includes("Red d8 is in losing zone"));
    assert.ok(hasLosingRedVeto, "Red in losing zone must generate a hard veto");
    assert.equal(res.qualified, false, "Red in losing zone must prevent qualification");
  });

  // Test 10: Contract cannot jump from NO_LIQUIDITY directly to CONFIRMED
  it("Test 10 — Contract cannot jump from NO_LIQUIDITY directly to CONFIRMED", () => {
    const ticks = createSyntheticTicks(1000);
    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;

    // Initial state with no prior history
    const res = analyzeAuthoritativeContract(ticks, under7, "R_100");

    assert.notEqual(
      res.state,
      "CONFIRMED",
      "Contract cannot be born as CONFIRMED on initial observation",
    );
  });

  // Test 11: Qualification requires all gates
  it("Test 11 — Qualification requires all gates", () => {
    const ticks = createSyntheticTicks(1000);
    const under7 = CONTRACTS.find((c) => c.id === "UNDER7")!;
    const res = analyzeAuthoritativeContract(ticks, under7, "R_100");

    if (res.qualified) {
      assert.ok(res.age >= 8, "Qualified formation must have age >= 8 ticks");
      assert.ok(
        res.accumulatedLiquidity >= 35,
        "Qualified formation must have accumulated liquidity >= 35",
      );
      assert.ok(res.maturity >= 50, "Qualified formation must have maturity >= 50");
      assert.ok(res.exhaustion >= 55, "Qualified formation must have exhaustion >= 55");
      assert.ok(res.delivery >= 50, "Qualified formation must have delivery >= 50");
      assert.ok(res.conflict <= 55, "Qualified formation must have conflict <= 55");
      assert.equal(res.vetoes.length, 0, "Qualified formation must have 0 vetoes");
      assert.equal(res.qualificationStatus, "QUALIFIED", "Qualification status must be QUALIFIED");
    } else {
      assert.notEqual(
        res.qualificationStatus,
        "QUALIFIED",
        "Non-qualified formation must not have QUALIFIED status",
      );
    }
  });

  // Test 12: AuthoritativeLiquidityView receives and displays distinct liquidityLevel vs accumulatedLiquidity
  it("Test 12 — Authoritative model provides distinct liquidityLevel vs accumulatedLiquidity", () => {
    const ticks = createSyntheticTicks(1000);
    const marketAnalysis = analyzeAuthoritativeMarket(ticks, "R_100");
    assert.ok(marketAnalysis !== null, "Authoritative market analysis must be produced");

    const topContract = marketAnalysis.top;
    assert.ok(typeof topContract.liquidityLevel === "number");
    assert.ok(typeof topContract.accumulatedLiquidity === "number");

    // Properties are separate numbers with defined ranges
    assert.ok(topContract.liquidityLevel >= 0 && topContract.liquidityLevel <= 100);
    assert.ok(topContract.accumulatedLiquidity >= 0 && topContract.accumulatedLiquidity <= 100);

    // Verify all 18 UI attributes exist on the contract
    assert.ok("liquidityLevel" in topContract);
    assert.ok("accumulatedLiquidity" in topContract);
    assert.ok("reservoirScore" in topContract);
    assert.ok("reservoirDigits" in topContract);
    assert.ok("reservoirs" in topContract);
    assert.ok("state" in topContract);
    assert.ok("maturity" in topContract);
    assert.ok("exhaustion" in topContract);
    assert.ok("delivery" in topContract);
    assert.ok("absorption" in topContract);
    assert.ok("release" in topContract);
    assert.ok("confirmation" in topContract);
    assert.ok("conflict" in topContract);
    assert.ok("psychology" in topContract);
    assert.ok("qualified" in topContract);
    assert.ok("age" in topContract);
    assert.ok("trajectory" in topContract);
    assert.ok("vetoes" in topContract);
  });
});
