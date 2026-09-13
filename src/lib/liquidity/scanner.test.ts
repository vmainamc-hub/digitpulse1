import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  qualifyFormation,
  calculateFormationRankScore,
  isMateriallySuperior,
  compareLiquidityFormations,
  BestLiquidityScanner,
  SUPERIORITY_MARGIN,
} from "./scanner.ts";
import type {
  LiquidityZone,
  SentinelPsychologySnapshot,
  EvidenceAccumulators,
  ZoneLifecycleState,
  ZoneRegistry,
} from "./zones.ts";

function createMockRegistry(
  activeZones: LiquidityZone[],
  historicalZones: LiquidityZone[] = [],
): ZoneRegistry {
  return {
    snapshot: {
      activeZones,
      historicalZones,
      activeCount: activeZones.length,
      releaseWatchCount: 0,
      qualifiedCount: activeZones.filter((z) => z.qualified).length,
      historicalCount: historicalZones.length,
      ledger: [],
      lastUpdated: Date.now(),
      slots: [],
    },
  } as unknown as ZoneRegistry;
}

function createMockPsychology(
  valid = true,
  red = 2,
  green = 3,
  secondRed = 4,
): SentinelPsychologySnapshot {
  return {
    green,
    secondGreen: 5,
    red,
    secondRed,
    purple: 1,
    valid,
    outcome: valid ? "ACCEPT" : "REJECT",
    reasons: valid ? [] : ["Sentinel psychology rejection"],
    pct: [0.1, 0.1, 0.1, 0.14, 0.1, 0.12, 0.08, 0.09, 0.08, 0.09],
    pressure: [0, 0, 0, 0.01, 0.02, 0, 0, 0, 0, 0],
  };
}

function createMockAccumulators(
  overrides: Partial<EvidenceAccumulators> = {},
): EvidenceAccumulators {
  return {
    reservoirPersistence: 75,
    dominantPersistence: 40,
    dominantExhaustion: 78,
    delivery: 75,
    deliveryAcceleration: 15,
    migration: 70,
    absorption: 65,
    structuralDeparture: 50,
    psychologyIntegrity: 90,
    conflict: 15,
    contradiction: 10,
    evidenceDecay: 0,
    accumulatedLiquidity: 80,
    ...overrides,
  };
}

function createMockZone(
  symbol: string,
  contract: string,
  zoneId: string,
  options: {
    validPsych?: boolean;
    accumulatedLiquidity?: number;
    dominantExhaustion?: number;
    delivery?: number;
    reservoirPersistence?: number;
    migration?: number;
    absorption?: number;
    conflict?: number;
    ageTicks?: number;
    lifecycleState?: ZoneLifecycleState;
    green?: number;
    red?: number;
  } = {},
): LiquidityZone {
  const isUnder = contract.startsWith("UNDER");
  const barrier = parseInt(contract.split(" ")[1] || "7", 10);
  const green = options.green ?? (isUnder ? 3 : 2);
  const red = options.red ?? (isUnder ? 2 : 3); // Valid red digit for UNDER is even and != 8

  const psych = createMockPsychology(options.validPsych ?? true, red, green);
  const accumulators = createMockAccumulators({
    accumulatedLiquidity: options.accumulatedLiquidity ?? 80,
    dominantExhaustion: options.dominantExhaustion ?? 75,
    delivery: options.delivery ?? 75,
    reservoirPersistence: options.reservoirPersistence ?? 70,
    migration: options.migration ?? 65,
    absorption: options.absorption ?? 60,
    conflict: options.conflict ?? 15,
  });

  return {
    zoneId,
    market: `Market ${symbol}`,
    symbol,
    marketGroup: "STANDARD",
    contract,
    contractId: contract.replace(/\s+/g, ""),
    kind: isUnder ? "UNDER" : "OVER",
    barrier,
    creationTick: 100,
    creationTimestamp: Date.now() - 50_000,
    currentTick: 100 + (options.ageTicks ?? 45),
    currentTimestamp: Date.now(),
    ageTicks: options.ageTicks ?? 45,
    ageSeconds: 50,
    formationStartTick: 80,
    formationStartTimestamp: Date.now() - 70_000,
    lastMeaningfulEvidenceTick: 140,
    lastStructuralChangeTick: 130,
    lastStructuralChangeTimestamp: Date.now() - 10_000,
    initialPsychology: psych,
    currentPsychology: psych,
    reservoirDigits: [red, 4],
    dominantDigits: [green, 5],
    accumulators,
    lifecycleState: options.lifecycleState ?? "RIPE",
    previousLifecycleState: "EXHAUSTING",
    stateEnteredAt: Date.now() - 10_000,
    stateEnteredTick: 130,
    stateDurationTicks: 15,
    releaseEvidence: [],
    confirmationEvidence: [],
    invalidationReason: null,
    qualified: true,
    qualificationReason: null,
    ledger: [],
    trajectoryHistory: [70, 72, 75, 78, 80],
    isTerminal: false,
  };
}

describe("Best Liquidity Scanner & Smart Override Engine", () => {
  // Test 1 — Initial Scan: Three qualified formations (R_10 = 71, R_50 = 89, R_100 = 77) -> selects R_50
  it("Test 1: Initial Scan selects highest ranked qualified formation", () => {
    const r10 = createMockZone("R_10", "UNDER 7", "Z-R10", {
      accumulatedLiquidity: 65,
      dominantExhaustion: 60,
      delivery: 60,
      ageTicks: 40,
    });
    const r50 = createMockZone("R_50", "UNDER 7", "Z-R50", {
      accumulatedLiquidity: 88,
      dominantExhaustion: 86,
      delivery: 84,
      ageTicks: 90,
      lifecycleState: "CONFIRMED",
    });
    const r100 = createMockZone("R_100", "UNDER 7", "Z-R100", {
      accumulatedLiquidity: 72,
      dominantExhaustion: 70,
      delivery: 70,
      ageTicks: 50,
    });

    const score10 = calculateFormationRankScore(r10);
    const score50 = calculateFormationRankScore(r50);
    const score100 = calculateFormationRankScore(r100);

    assert.ok(score50 > score10, `R_50 (${score50}) must outrank R_10 (${score10})`);
    assert.ok(score50 > score100, `R_50 (${score50}) must outrank R_100 (${score100})`);

    const scanner = new BestLiquidityScanner();
    const mockRegistry = createMockRegistry([r10, r50, r100]);

    const result = scanner.scan(mockRegistry);
    assert.ok(result !== null, "Result should not be null");
    assert.equal(result.symbol, "R_50", "Best initial scan must be R_50");
    assert.equal(result.zoneId, "Z-R50");
  });

  // Test 2 — Small improvement during cooldown: R_50 = 89, R_100 = 90 -> KEEP R_50
  it("Test 2: Minor fluctuation during cooldown does NOT replace current selection", () => {
    const r50 = createMockZone("R_50", "UNDER 7", "Z-R50", {
      accumulatedLiquidity: 86,
      dominantExhaustion: 85,
      delivery: 82,
      ageTicks: 80,
    });

    const r100 = createMockZone("R_100", "UNDER 7", "Z-R100", {
      accumulatedLiquidity: 87, // only fractionally higher
      dominantExhaustion: 86,
      delivery: 83,
      ageTicks: 30,
    });

    const evalResult = isMateriallySuperior(r100, r50);
    assert.equal(
      evalResult.isSuperior,
      false,
      `Minor improvement (${evalResult.scoreDelta} delta) must NOT be superior (threshold is ${SUPERIORITY_MARGIN})`,
    );

    const scanner = new BestLiquidityScanner();
    const mockRegistry1 = createMockRegistry([r50, r100]);

    scanner.scan(mockRegistry1);
    assert.equal(scanner.getState().currentSelection?.symbol, "R_50");

    // Engine cycle runs:
    scanner.onEngineCycle(mockRegistry1);
    // Selection must remain R_50!
    assert.equal(scanner.getState().currentSelection?.symbol, "R_50");
  });

  // Test 3 — Strong superior formation: R_50 = 89, R_75 = 96 with stronger persistence -> OVERRIDE R_75
  it("Test 3: Strong superior formation overrides current selection inside cooldown", () => {
    const r50 = createMockZone("R_50", "UNDER 7", "Z-R50", {
      accumulatedLiquidity: 80,
      dominantExhaustion: 75,
      delivery: 75,
      reservoirPersistence: 70,
      ageTicks: 50,
      lifecycleState: "MATURE",
    });

    const r75 = createMockZone("R_75", "UNDER 6", "Z-R75", {
      accumulatedLiquidity: 95,
      dominantExhaustion: 94,
      delivery: 92,
      reservoirPersistence: 90,
      migration: 88,
      absorption: 85,
      conflict: 5,
      ageTicks: 110,
      lifecycleState: "CONFIRMED",
    });

    const evalResult = isMateriallySuperior(r75, r50);
    assert.equal(
      evalResult.isSuperior,
      true,
      `Materially stronger formation must trigger override (+${evalResult.scoreDelta} pts)`,
    );

    const scanner = new BestLiquidityScanner();
    const mockRegistry = createMockRegistry([r50]);

    // User initially scans R_50
    scanner.scan(mockRegistry);
    assert.equal(scanner.getState().currentSelection?.symbol, "R_50");

    // Later, R_75 arrives in registry as a materially superior formation
    mockRegistry.snapshot.activeZones = [r50, r75];
    scanner.onEngineCycle(mockRegistry);

    const stateAfter = scanner.getState();
    assert.equal(
      stateAfter.currentSelection?.symbol,
      "R_75",
      "Selection should be overridden to R_75",
    );
    assert.equal(
      stateAfter.currentSelection?.isOverride,
      true,
      "Selection should mark isOverride: true",
    );
    assert.equal(stateAfter.overrideCount, 1, "Override count should be 1");
    assert.ok(
      stateAfter.lastOverride?.reason.includes("Materially stronger"),
      "Override reason must be recorded",
    );
  });

  // Test 4 — "Rank First, Qualify Second":
  // Formation A has score ~95 but is NOT qualified (e.g. losing purple digit).
  // Formation B has score ~88 and IS qualified.
  // Scan MUST return Formation A as #1 Ranked formation, and identify Formation B as Best Qualified!
  it("Test 4: Rank First, Qualify Second — #1 Ranked is selected even when not qualified", () => {
    // Formation A (R_100): High score, but has invalid psychology / losing digit
    const r100 = createMockZone("R_100", "UNDER 7", "Z-R100", {
      validPsych: false,
      accumulatedLiquidity: 95,
      dominantExhaustion: 94,
      delivery: 92,
      reservoirPersistence: 90,
      migration: 88,
      absorption: 85,
      conflict: 8,
      ageTicks: 120,
      lifecycleState: "RELEASE",
    });

    // Formation B (R_50): Slightly lower score, fully qualified
    const r50 = createMockZone("R_50", "UNDER 7", "Z-R50", {
      validPsych: true,
      accumulatedLiquidity: 84,
      dominantExhaustion: 80,
      delivery: 78,
      reservoirPersistence: 76,
      migration: 72,
      absorption: 70,
      conflict: 12,
      ageTicks: 70,
      lifecycleState: "CONFIRMED",
    });

    const score100 = calculateFormationRankScore(r100);
    const score50 = calculateFormationRankScore(r50);
    assert.ok(
      score100 > score50,
      `Formation A (${score100}) must have higher score than Formation B (${score50})`,
    );

    const qual100 = qualifyFormation(r100);
    const qual50 = qualifyFormation(r50);
    assert.equal(qual100.isQualified, false, "Formation A must NOT be qualified");
    assert.equal(qual50.isQualified, true, "Formation B must BE qualified");

    const scanner = new BestLiquidityScanner();
    const mockRegistry = createMockRegistry([r50, r100]);

    // Perform intentional scan:
    const result = scanner.scan(mockRegistry);
    assert.ok(result !== null, "Result must not be null");

    const state = scanner.getState();

    // 1. Current selection (#1 ranked) MUST BE Formation A (R_100)
    assert.equal(
      state.currentSelection?.symbol,
      "R_100",
      "#1 ranked formation must be R_100 even though it is not qualified",
    );
    assert.equal(
      state.currentSelection?.qualified,
      false,
      "#1 ranked formation must report qualified = false",
    );
    assert.equal(state.currentSelection?.rank, 1, "#1 ranked formation must have rank = 1");

    // 2. Best Qualified formation MUST BE Formation B (R_50)
    assert.ok(state.bestQualified !== null, "bestQualified must not be null");
    assert.equal(state.bestQualified?.symbol, "R_50", "bestQualified must be Formation B (R_50)");
    assert.equal(
      state.bestQualified?.qualified,
      true,
      "bestQualified must report qualified = true",
    );
  });

  // Test 5 — When no formations are qualified in the universe:
  // Scanner STILL displays #1 Ranked formation (with qualified = false), and bestQualified is null.
  it("Test 5: When no formations qualify, #1 ranked formation is still displayed with bestQualified = null", () => {
    const r10 = createMockZone("R_10", "UNDER 7", "Z-R10", {
      validPsych: false, // invalid
      accumulatedLiquidity: 90,
      ageTicks: 80,
    });
    const r25 = createMockZone("R_25", "UNDER 7", "Z-R25", {
      validPsych: false, // invalid
      conflict: 85, // severe conflict
      accumulatedLiquidity: 70,
      ageTicks: 30,
    });

    const scanner = new BestLiquidityScanner();
    const mockRegistry = createMockRegistry([r10, r25]);

    const result = scanner.scan(mockRegistry);
    assert.ok(result !== null, "Scanner must return the #1 ranked formation");

    const state = scanner.getState();
    assert.equal(
      state.currentSelection?.symbol,
      "R_10",
      "#1 ranked formation must be R_10 (highest score)",
    );
    assert.equal(state.currentSelection?.qualified, false, "Must report qualified = false");
    assert.equal(state.bestQualified, null, "bestQualified must be null when none qualify");
    assert.equal(state.noQualifiedFound, true, "noQualifiedFound must be true");
  });

  // Test 6 — Same formation improves: R_50 UNDER 7 86% -> 91% -> KEEP SAME ZONE ID, update strength
  it("Test 6: Same formation updates in-place preserving stable zone ID", () => {
    const r50 = createMockZone("R_50", "UNDER 7", "LIQ-20260913-R50-U7-101", {
      accumulatedLiquidity: 86,
      dominantExhaustion: 80,
      delivery: 78,
      ageTicks: 60,
    });

    const scanner = new BestLiquidityScanner();
    const mockRegistry = createMockRegistry([r50]);

    scanner.scan(mockRegistry);
    const initialSelection = scanner.getState().currentSelection;
    assert.equal(initialSelection?.zoneId, "LIQ-20260913-R50-U7-101");
    const initialScore = initialSelection?.score ?? 0;

    // Next tick: same zone strengthens
    r50.accumulators.accumulatedLiquidity = 94;
    r50.accumulators.dominantExhaustion = 90;
    r50.accumulators.delivery = 88;
    r50.ageTicks = 65;

    scanner.onEngineCycle(mockRegistry);

    const updatedSelection = scanner.getState().currentSelection;
    assert.equal(
      updatedSelection?.zoneId,
      "LIQ-20260913-R50-U7-101",
      "Zone ID must remain identical",
    );
    assert.ok(
      (updatedSelection?.score ?? 0) > initialScore,
      "Score must reflect improved strength",
    );
    assert.equal(updatedSelection?.formationAge, 65, "Age ticks must update");
  });

  // Test 7 — Tick noise: small fluctuations must NOT cause A -> B -> A -> C -> A churn
  it("Test 7: Hysteresis prevents selection churn from small tick fluctuations", () => {
    const r50 = createMockZone("R_50", "UNDER 7", "Z-R50", {
      accumulatedLiquidity: 85,
      dominantExhaustion: 82,
      delivery: 80,
      ageTicks: 70,
    });

    const r25 = createMockZone("R_25", "UNDER 7", "Z-R25", {
      accumulatedLiquidity: 85.5, // 0.5 difference
      dominantExhaustion: 82.5,
      delivery: 80,
      ageTicks: 40,
    });

    const scanner = new BestLiquidityScanner();
    const mockRegistry = createMockRegistry([r50, r25]);

    scanner.scan(mockRegistry);
    const selectedSymbol = scanner.getState().currentSelection?.symbol;

    // Simulate 10 noisy ticks fluctuating by ±1%
    for (let i = 0; i < 10; i++) {
      r50.accumulators.accumulatedLiquidity = 85 + (i % 2 === 0 ? 1 : -1);
      r25.accumulators.accumulatedLiquidity = 85.5 + (i % 2 === 0 ? -1 : 1);
      scanner.onEngineCycle(mockRegistry);
    }

    assert.equal(
      scanner.getState().currentSelection?.symbol,
      selectedSymbol,
      "Selection must not flap back and forth across 10 noisy ticks",
    );
    assert.equal(
      scanner.getState().overrideCount,
      0,
      "No override should have triggered for minor noise",
    );
  });
});
