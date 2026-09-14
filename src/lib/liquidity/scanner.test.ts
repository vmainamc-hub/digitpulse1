import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  qualifyFormation,
  calculateFormationRankScore,
  isMateriallySuperior,
  compareLiquidityFormations,
  BestLiquidityScanner,
  scanBestLiquidityFormation,
  SUPERIORITY_MARGIN,
} from "./scanner.ts";
import {
  ZoneRegistry,
  type LiquidityZone,
  type SentinelPsychologySnapshot,
  type EvidenceAccumulators,
  type ZoneLifecycleState,
  calculateLiquidityLevel,
  calculatePsychologyAdherence,
} from "./zones.ts";
import { correlateFeedMessage, type Pending } from "./feed.ts";
import type { MarketAnalysis, ContractAnalysis } from "./engine.ts";

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
    deliveryAcceleration?: number;
    structuralDeparture?: number;
    contradiction?: number;
    generation?: number;
    liquidityLevel?: number;
    liquidityTrend?: number;
    liquidityAcceleration?: number;
    psychologyAdherence?: number;
  } = {},
): LiquidityZone {
  const isUnder = contract.startsWith("UNDER");
  const barrier = parseInt(contract.split(" ")[1] || "7", 10);
  const green = options.green ?? (isUnder ? 3 : 2);
  const red = options.red ?? (isUnder ? 2 : 3);

  const psych = createMockPsychology(options.validPsych ?? true, red, green);
  const accumulators = createMockAccumulators({
    accumulatedLiquidity: options.accumulatedLiquidity ?? 80,
    dominantExhaustion: options.dominantExhaustion ?? 75,
    delivery: options.delivery ?? 75,
    deliveryAcceleration: options.deliveryAcceleration ?? 15,
    reservoirPersistence: options.reservoirPersistence ?? 70,
    migration: options.migration ?? 65,
    absorption: options.absorption ?? 60,
    conflict: options.conflict ?? 15,
    contradiction: options.contradiction ?? 10,
    structuralDeparture: options.structuralDeparture ?? 50,
  });

  const ageTicks = options.ageTicks ?? 45;
  const liqCalc = calculateLiquidityLevel(accumulators, ageTicks, psych, undefined, 0);
  const psychCalc = calculatePsychologyAdherence(psych, isUnder ? "UNDER" : "OVER", barrier, [
    red,
    4,
  ]);

  return {
    zoneId,
    id: zoneId,
    generation: options.generation ?? 1,
    market: `Market ${symbol}`,
    marketId: symbol,
    symbol,
    marketGroup: "STANDARD",
    contract,
    contractId: contract.replace(/\s+/g, ""),
    kind: isUnder ? "UNDER" : "OVER",
    side: isUnder ? "UNDER" : "OVER",
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
    phase: options.lifecycleState ?? "RIPE",
    previousLifecycleState: "EXHAUSTING",
    stateEnteredAt: Date.now() - 10_000,
    phaseSince: Date.now() - 10_000,
    stateEnteredTick: 130,
    stateDurationTicks: 15,
    phaseAgeTicks: 15,
    releaseEvidence: [],
    confirmationEvidence: [],
    invalidationReason: null,
    qualified: options.lifecycleState === "CONFIRMED",
    qualificationReason: null,
    evidenceHistory: [],
    phaseHistory: [],
    timeline: [],
    ledger: [],
    trajectory: {
      direction: "STRENGTHENING",
      scoreSlope: 0.5,
      reservoirTrend: 2,
      exhaustionTrend: 3,
      deliveryTrend: 4,
      migrationTrend: 2,
      absorptionTrend: 1,
      evidenceMomentum: 12,
      persistence: 80,
      acceleration: 5,
      consistency: 85,
      lastMeaningfulChange: Date.now(),
    },
    trajectoryHistory: [70, 72, 75, 78, 80],
    rankingScore: options.accumulatedLiquidity ?? 80,
    isTerminal: false,
    milestones: new Set<string>(),
    liquidityLevel: options.liquidityLevel ?? liqCalc.level,
    liquidityTrend: options.liquidityTrend ?? liqCalc.trend,
    liquidityAcceleration: options.liquidityAcceleration ?? liqCalc.acceleration,
    psychologyAdherence: options.psychologyAdherence ?? psychCalc.adherence,
    psychologyDetails: psychCalc.details,
    liquidityComposition: liqCalc.composition,
  };
}

function createMockContract(kind: "OVER" | "UNDER" = "UNDER", barrier = 7): ContractAnalysis {
  const psych = createMockPsychology(true, 2, 3);
  return {
    id: `${kind}${barrier}`,
    label: `${kind} ${barrier}`,
    kind,
    barrier,
    psychology1000: psych,
    creation: 65,
    exhaustion: 75,
    exhaustionScore: 75,
    release: 75,
    deliveryScore: 75,
    migrationScore: 70,
    absorption: 60,
    absorptionScore: 60,
    conflict: 10,
    conflictScore: 10,
    jsdScore: 40,
    temporal: {
      2: { slope20_60: 0.02, slope60_120: 0.01 },
      4: { slope20_60: 0.02, slope60_120: 0.01 },
    },
    transitions: [{ delta: 25 }],
  } as unknown as ContractAnalysis;
}

function createMockAnalysis(contract: ContractAnalysis): MarketAnalysis {
  const psych = createMockPsychology(true, 2, 3);
  return {
    symbol: "R_50",
    entropy: 2.1,
    jsd: 0.08,
    psychology1000: psych,
    sentinelPsychology: psych,
    contracts: [contract],
  } as unknown as MarketAnalysis;
}

describe("Section 25 Mandatory Unit Test Suite (Tests 1 - 12)", () => {
  // Test 1 — Real age: If no new tick arrives: ageTicks does not increase
  it("Test 1 — Real age: If no new tick arrives: ageTicks does not increase", () => {
    const registry = new ZoneRegistry();
    const contract = createMockContract("UNDER", 7);
    const analysis = createMockAnalysis(contract);

    // Promote a formation by feeding required candidate ticks
    for (let t = 1; t <= 15; t++) {
      registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, t);
    }
    registry.finalize();

    const snapshot1 = registry.snapshot;
    assert.equal(snapshot1.activeCount, 1, "Formation should be created");
    const zone = snapshot1.activeZones[0];
    const initialAge = zone.ageTicks;
    assert.ok(initialAge >= 1, "Formation must have ageTicks >= 1");

    // Engine cycle runs again with NO new tick (same tick number 15)
    registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, 15);
    registry.finalize();

    const ageAfterSameTick = registry.snapshot.activeZones[0].ageTicks;
    assert.equal(
      ageAfterSameTick,
      initialAge,
      "ageTicks must NOT increase when no new tick arrives",
    );

    // Now a genuine new tick arrives (tick 16)
    registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, 16);
    registry.finalize();

    const ageAfterNewTick = registry.snapshot.activeZones[0].ageTicks;
    assert.equal(
      ageAfterNewTick,
      initialAge + 1,
      "ageTicks MUST increment by 1 when a genuine new tick arrives",
    );
  });

  // Test 2 — Stable identity: Multiple updates do not create a new formation ID
  it("Test 2 — Stable identity: Multiple updates do not create a new formation ID", () => {
    const registry = new ZoneRegistry();
    const contract = createMockContract("UNDER", 7);
    const analysis = createMockAnalysis(contract);

    for (let t = 1; t <= 25; t++) {
      registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, t);
    }
    registry.finalize();

    const zone = registry.snapshot.activeZones[0];
    const stableZoneId = zone.zoneId;
    assert.ok(stableZoneId.includes("R50-UNDER7-GEN-01"));

    // Run 10 more ticks of updates
    for (let t = 26; t <= 35; t++) {
      registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, t);
    }
    registry.finalize();

    assert.equal(registry.snapshot.activeZones.length, 1);
    assert.equal(
      registry.snapshot.activeZones[0].zoneId,
      stableZoneId,
      "Formation ID must remain permanently stable across multiple updates",
    );
  });

  // Test 3 — Formation birth: A single high score does not create a mature formation
  it("Test 3 — Formation birth: A single high score does not create a mature formation", () => {
    const registry = new ZoneRegistry();
    const contract = createMockContract("UNDER", 7);
    contract.creation = 99;
    contract.exhaustionScore = 98;
    contract.deliveryScore = 97;
    const analysis = createMockAnalysis(contract);

    // Only 1 tick
    registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, 1);
    registry.finalize();

    // A single high score tick must NOT create an active mature formation
    assert.equal(
      registry.snapshot.activeCount,
      0,
      "Single tick must not create an active formation (requires candidate persistence)",
    );
    assert.equal(registry.snapshot.candidateCount, 1, "Should be recorded as candidate only");
  });

  // Test 4 — Hysteresis: One weak tick does not destroy a mature formation
  it("Test 4 — Hysteresis: One weak tick does not destroy a mature formation", () => {
    const matureZone = createMockZone("R_50", "UNDER 7", "R50-UNDER7-GEN-01", {
      lifecycleState: "MATURE",
      accumulatedLiquidity: 75,
      delivery: 65,
      reservoirPersistence: 70,
      dominantExhaustion: 70,
      ageTicks: 60,
    });
    matureZone.stateDurationTicks = 20;

    const registry = createMockRegistry([matureZone]);

    // Simulate 1 noisy/weak tick with drop in metrics
    matureZone.accumulators.accumulatedLiquidity = 58;
    matureZone.accumulators.delivery = 45;

    const scanner = new BestLiquidityScanner();
    scanner.scan(registry);
    scanner.onEngineCycle(registry);

    assert.equal(
      registry.snapshot.activeZones[0].lifecycleState,
      "MATURE",
      "One weak tick must NOT destroy or demote a mature formation",
    );
  });

  // Test 5 — Ranking vs qualification: A NOT QUALIFIED #1 formation remains BEST RANKED
  it("Test 5 — Ranking vs qualification: A NOT QUALIFIED #1 formation remains BEST RANKED", () => {
    // Formation A: Very high raw metrics, but fails qualification due to Sentinel psychology rejection
    const formA = createMockZone("R_100", "UNDER 7", "R100-U7-01", {
      validPsych: false,
      accumulatedLiquidity: 98,
      dominantExhaustion: 96,
      delivery: 95,
      reservoirPersistence: 95,
      migration: 90,
      absorption: 90,
      ageTicks: 80,
      lifecycleState: "RELEASE",
    });

    // Formation B: Lower metrics, but passes qualification
    const formB = createMockZone("R_50", "UNDER 7", "R50-U7-01", {
      validPsych: true,
      accumulatedLiquidity: 75,
      dominantExhaustion: 72,
      delivery: 70,
      reservoirPersistence: 70,
      migration: 65,
      absorption: 60,
      ageTicks: 45,
      lifecycleState: "CONFIRMED",
    });

    const scoreA = calculateFormationRankScore(formA);
    const scoreB = calculateFormationRankScore(formB);
    assert.ok(scoreA > scoreB, `Formation A (${scoreA}) must outscore Formation B (${scoreB})`);

    const qualA = qualifyFormation(formA);
    const qualB = qualifyFormation(formB);
    assert.equal(qualA.isQualified, false, "Formation A must be NOT qualified");
    assert.equal(qualB.isQualified, true, "Formation B must be qualified");

    const registry = createMockRegistry([formA, formB]);
    const scanOut = scanBestLiquidityFormation(registry);

    assert.ok(scanOut.bestRanked !== null);
    assert.equal(
      scanOut.bestRanked.zoneId,
      "R100-U7-01",
      "Formation A must be #1 ranked despite not being qualified",
    );
    assert.equal(scanOut.bestRanked.qualified, false, "Best ranked must report qualified: false");
  });

  // Test 6 — Best qualified: A lower-ranked qualified formation is separately returned
  it("Test 6 — Best qualified: A lower-ranked qualified formation is separately returned", () => {
    const formA = createMockZone("R_100", "UNDER 7", "R100-U7-01", {
      validPsych: false,
      accumulatedLiquidity: 98,
      dominantExhaustion: 96,
      delivery: 95,
      reservoirPersistence: 95,
      migration: 90,
      absorption: 90,
      ageTicks: 80,
      lifecycleState: "RELEASE",
    });
    const formB = createMockZone("R_50", "UNDER 7", "R50-U7-01", {
      validPsych: true,
      accumulatedLiquidity: 75,
      dominantExhaustion: 72,
      delivery: 70,
      reservoirPersistence: 70,
      migration: 65,
      absorption: 60,
      ageTicks: 45,
      lifecycleState: "CONFIRMED",
    });

    const registry = createMockRegistry([formA, formB]);
    const scanner = new BestLiquidityScanner();
    scanner.scan(registry);

    const state = scanner.getState();
    assert.equal(state.currentSelection?.zoneId, "R100-U7-01", "Rank #1 is Form A");
    assert.equal(state.bestQualified?.zoneId, "R50-U7-01", "Best qualified is Form B");
    assert.equal(state.bestQualified?.qualified, true, "Best qualified is confirmed qualified");
  });

  // Test 7 — Confirmation: RIPE does not immediately become CONFIRMED without evidence
  it("Test 7 — Confirmation: RIPE does not immediately become CONFIRMED without evidence", () => {
    const registry = new ZoneRegistry();
    const contract = createMockContract("UNDER", 7);
    // Exhaustion and delivery below confirmation gates (72 and 68)
    contract.exhaustionScore = 55;
    contract.deliveryScore = 50;
    contract.creation = 50;
    const analysis = createMockAnalysis(contract);

    // Ingest ticks to promote to active formation
    for (let t = 1; t <= 16; t++) {
      registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, t);
    }
    registry.finalize();

    const zone = registry.snapshot.activeZones[0];
    assert.ok(zone !== undefined, "Zone should exist");
    // Zone should NOT be CONFIRMED because multi-dimensional confirmation gates have not been met
    assert.notEqual(
      zone.lifecycleState,
      "CONFIRMED",
      "Zone must not prematurely become CONFIRMED without meeting all independent dimensional gates",
    );
    assert.equal(
      zone.qualified,
      false,
      "Zone must report qualified = false prior to full multi-window confirmation",
    );
  });

  // Test 8 — Evidence: Identical repeated observations do not generate duplicate evidence events
  it("Test 8 — Evidence: Identical repeated observations do not generate duplicate evidence events", () => {
    const registry = new ZoneRegistry();
    const contract = createMockContract("UNDER", 7);
    const analysis = createMockAnalysis(contract);

    // Build zone
    for (let t = 1; t <= 16; t++) {
      registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, t);
    }
    registry.finalize();

    // Run identical observations across 6 ticks
    for (let t = 17; t <= 22; t++) {
      registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, t);
    }
    registry.finalize();

    const events = registry.snapshot.activeZones[0].timeline;
    // Check that there are no consecutive duplicate events with identical type and description
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      assert.notEqual(
        `${curr.type}-${curr.description}`,
        `${prev.type}-${prev.description}`,
        "Identical repeated observations must not create duplicate consecutive timeline events",
      );
    }
  });

  // Test 9 — Generation: Invalidation followed by a new formation produces a new generation
  it("Test 9 — Generation: Invalidation followed by a new formation produces a new generation", () => {
    const registry = new ZoneRegistry();
    const contract = createMockContract("UNDER", 7);
    const analysis = createMockAnalysis(contract);

    // 1. First formation (GEN-01)
    for (let t = 1; t <= 15; t++) {
      registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, t);
    }
    registry.finalize();

    const zone1 = registry.snapshot.activeZones[0];
    assert.ok(zone1.zoneId.includes("GEN-01"), "First formation must be GEN-01");
    assert.equal(zone1.generation, 1);

    // 2. Invalidate formation 1
    zone1.lifecycleState = "INVALIDATED";
    zone1.isTerminal = true;
    registry.finalize();

    assert.equal(registry.snapshot.activeCount, 0, "Formation 1 retired from active");
    assert.equal(registry.snapshot.historicalCount, 1, "Formation 1 stored in history");

    // 3. New structural activity leads to new candidate and birth
    for (let t = 50; t <= 65; t++) {
      registry.ingest("R_50", "Volatility 50 Index", "STANDARD", analysis, contract, t);
    }
    registry.finalize();

    assert.equal(registry.snapshot.activeCount, 1, "New formation created");
    const zone2 = registry.snapshot.activeZones[0];
    assert.ok(
      zone2.zoneId.includes("GEN-02"),
      `Second formation must have incremented generation ID: got ${zone2.zoneId}`,
    );
    assert.equal(zone2.generation, 2, "Second generation must equal 2");
  });

  // Test 10 — Scan stability: Normal ticks do not automatically replace the selected scan result
  it("Test 10 — Scan stability: Normal ticks do not automatically replace the selected scan result", () => {
    const formA = createMockZone("R_50", "UNDER 7", "R50-U7-STABLE", {
      accumulatedLiquidity: 82,
      dominantExhaustion: 80,
      delivery: 78,
      ageTicks: 60,
    });
    const formB = createMockZone("R_100", "UNDER 7", "R100-U7-OTHER", {
      accumulatedLiquidity: 82.5,
      dominantExhaustion: 80,
      delivery: 78,
      ageTicks: 40,
    });

    const registry = createMockRegistry([formA, formB]);
    const scanner = new BestLiquidityScanner();
    scanner.scan(registry);

    const initialSelectedId = scanner.getState().currentSelection?.zoneId;
    assert.equal(initialSelectedId, "R50-U7-STABLE");

    // 10 cycles with small score oscillations
    for (let i = 0; i < 10; i++) {
      formA.accumulators.accumulatedLiquidity = 82 + (i % 2 === 0 ? 0.4 : -0.4);
      formB.accumulators.accumulatedLiquidity = 82.5 + (i % 2 === 0 ? -0.4 : 0.4);
      scanner.onEngineCycle(registry);
    }

    const finalSelectedId = scanner.getState().currentSelection?.zoneId;
    assert.equal(
      finalSelectedId,
      initialSelectedId,
      "Normal ticks must not replace the selected scan result",
    );
    assert.equal(scanner.getState().overrideCount, 0, "No override triggered");
  });

  // Test 11 — Superior override: A genuinely superior formation can replace the selected result after the intended override interval
  it("Test 11 — Superior override: A genuinely superior formation can replace the selected result after the intended override interval", () => {
    const formA = createMockZone("R_50", "UNDER 7", "R50-U7-CURRENT", {
      accumulatedLiquidity: 78,
      dominantExhaustion: 75,
      delivery: 72,
      ageTicks: 50,
      lifecycleState: "MATURE",
    });

    const registry = createMockRegistry([formA]);
    const scanner = new BestLiquidityScanner();
    scanner.scan(registry);
    assert.equal(scanner.getState().currentSelection?.zoneId, "R50-U7-CURRENT");

    // Superior candidate arrives with +14 pts advantage, high persistence, confirmed state
    const superiorFormB = createMockZone("R_75", "UNDER 6", "R75-U6-SUPERIOR", {
      accumulatedLiquidity: 95,
      dominantExhaustion: 94,
      delivery: 92,
      ageTicks: 90,
      lifecycleState: "CONFIRMED",
    });

    const superiority = isMateriallySuperior(superiorFormB, formA);
    assert.equal(superiority.isSuperior, true, "Must be evaluated as materially superior");
    assert.ok(superiority.scoreDelta >= SUPERIORITY_MARGIN);

    registry.snapshot.activeZones = [formA, superiorFormB];
    scanner.onEngineCycle(registry);

    const state = scanner.getState();
    assert.equal(
      state.currentSelection?.zoneId,
      "R75-U6-SUPERIOR",
      "Superior formation must override the current selection",
    );
    assert.equal(state.currentSelection?.isOverride, true, "Must record isOverride: true");
    assert.equal(state.overrideCount, 1, "Override count must equal 1");
    assert.ok(state.lastOverride?.reason.includes("Materially stronger"));
  });

  // Test 12 — Feed correlation: Responses are matched using req_id
  it("Test 12 — Feed correlation: Responses are matched using req_id", () => {
    const pendingMap = new Map<number, Pending>();
    pendingMap.set(1042, {
      kind: "HISTORY",
      symbol: "R_50",
      at: Date.now(),
    });

    // Message arrives with req_id matching the pending entry
    const messageWithReqId = {
      req_id: 1042,
      msg_type: "history",
      history: { prices: [100.1, 100.2], times: [1700000000, 1700000002] },
    };

    const correlation = correlateFeedMessage(messageWithReqId, pendingMap);
    assert.equal(correlation.matchedBy, "req_id", "Must match using req_id");
    assert.equal(correlation.reqId, 1042);
    assert.equal(correlation.symbol, "R_50", "Must correlate to symbol R_50 from pending map");
    assert.equal(correlation.kind, "HISTORY");

    // Even if echo_req has another symbol or none, req_id takes precedence
    const messageWithConflictingEcho = {
      req_id: 1042,
      echo_req: { ticks_history: "R_10" },
      msg_type: "history",
    };
    const correlation2 = correlateFeedMessage(messageWithConflictingEcho, pendingMap);
    assert.equal(
      correlation2.matchedBy,
      "req_id",
      "req_id must take precedence over echo_req fallback",
    );
    assert.equal(correlation2.symbol, "R_50");
  });
});

describe("Section 26 Restored Indicators Suite — Liquidity Level & Psychology Adherence", () => {
  // Test 1: Existence of both indicators on valid formations
  it("Test 1 — Liquidity level and Psychology adherence exist on valid formations", () => {
    const zone = createMockZone("R_100", "UNDER 7", "R100-U7-TEST1", {
      validPsych: true,
      accumulatedLiquidity: 82,
      dominantExhaustion: 79,
      delivery: 75,
      reservoirPersistence: 86,
      ageTicks: 25,
    });

    assert.ok(zone.liquidityLevel !== undefined, "liquidityLevel must be defined");
    assert.equal(typeof zone.liquidityLevel, "number");
    assert.ok(
      zone.liquidityLevel >= 0 && zone.liquidityLevel <= 100,
      "liquidityLevel must be 0-100",
    );

    assert.ok(zone.psychologyAdherence !== undefined, "psychologyAdherence must be defined");
    assert.equal(typeof zone.psychologyAdherence, "number");
    assert.ok(
      zone.psychologyAdherence >= 0 && zone.psychologyAdherence <= 100,
      "psychologyAdherence must be 0-100",
    );

    assert.ok(zone.liquidityComposition !== undefined, "liquidityComposition must be defined");
    assert.ok(zone.psychologyDetails !== undefined, "psychologyDetails must be defined");
  });

  // Test 2: Independence from rankScore
  it("Test 2 — Independence from rankScore", () => {
    const zoneA = createMockZone("R_100", "UNDER 7", "R100-U7-A", {
      validPsych: true,
      accumulatedLiquidity: 85,
      conflict: 10,
      ageTicks: 40,
    });

    const zoneB = createMockZone("R_50", "UNDER 7", "R50-U7-B", {
      validPsych: false, // Psychology violated
      accumulatedLiquidity: 85, // Same liquidity
      conflict: 50,
      ageTicks: 40,
    });

    const rankScoreA = calculateFormationRankScore(zoneA);
    const rankScoreB = calculateFormationRankScore(zoneB);

    // psychology adherence is distinct from rankScore
    assert.notEqual(
      zoneA.psychologyAdherence,
      rankScoreA,
      "Psychology adherence must not be a mere copy of rankScore",
    );
    assert.notEqual(
      zoneA.liquidityLevel,
      rankScoreA,
      "Liquidity level must not be a mere copy of rankScore",
    );

    // When psychology is violated, adherence drops significantly
    assert.ok(
      zoneA.psychologyAdherence > zoneB.psychologyAdherence,
      `Zone A adherence (${zoneA.psychologyAdherence}) must exceed Zone B adherence (${zoneB.psychologyAdherence})`,
    );
  });

  // Test 3: Psychology violation lowers adherence
  it("Test 3 — Psychology violation lowers adherence", () => {
    const compliantZone = createMockZone("R_100", "UNDER 7", "R100-U7-COMPLIANT", {
      validPsych: true,
      conflict: 5,
    });

    const violatedZone = createMockZone("R_100", "UNDER 7", "R100-U7-VIOLATED", {
      validPsych: false,
      conflict: 45,
    });

    assert.ok(
      compliantZone.psychologyAdherence >= 85,
      `Compliant zone adherence (${compliantZone.psychologyAdherence}) must be >= 85`,
    );
    assert.ok(
      violatedZone.psychologyAdherence <= 70,
      `Violated zone adherence (${violatedZone.psychologyAdherence}) must be <= 70`,
    );
    assert.equal(violatedZone.psychologyDetails?.sentinelStatus, "REJECT");
  });

  // Test 4: Strong Sentinel-compliant formations receive higher adherence
  it("Test 4 — Strong Sentinel-compliant formations receive higher adherence", () => {
    const strongZone = createMockZone("R_75", "UNDER 7", "R75-U7-STRONG", {
      validPsych: true,
      green: 3,
      red: 2,
      conflict: 0,
    });

    assert.ok(
      strongZone.psychologyAdherence >= 85,
      `Strong zone must achieve strong or exceptional adherence (got ${strongZone.psychologyAdherence})`,
    );
    assert.equal(strongZone.psychologyDetails?.sentinelStatus, "ACCEPT");
    assert.equal(strongZone.psychologyDetails?.greenPass, true);
    assert.equal(strongZone.psychologyDetails?.redPass, true);
  });

  // Test 5: Liquidity increases with persistent evidence
  it("Test 5 — Liquidity increases with persistent evidence", () => {
    const youngZone = createMockZone("R_100", "UNDER 7", "R100-U7-YOUNG", {
      accumulatedLiquidity: 30,
      dominantExhaustion: 35,
      delivery: 30,
      reservoirPersistence: 25,
      ageTicks: 2,
    });

    const matureZone = createMockZone("R_100", "UNDER 7", "R100-U7-MATURE", {
      accumulatedLiquidity: 88,
      dominantExhaustion: 85,
      delivery: 80,
      reservoirPersistence: 90,
      ageTicks: 60,
    });

    assert.ok(
      matureZone.liquidityLevel > youngZone.liquidityLevel,
      `Mature zone liquidity level (${matureZone.liquidityLevel}) must exceed young zone (${youngZone.liquidityLevel})`,
    );
    assert.ok(
      matureZone.liquidityComposition.persistence > youngZone.liquidityComposition.persistence,
      "Persistence dimension must increase with ageTicks",
    );
  });

  // Test 6: Scanned rank #1 exposes both values
  it("Test 6 — Scanned rank #1 exposes both values", () => {
    const formA = createMockZone("R_100", "UNDER 7", "R100-U7-TOP", {
      validPsych: true,
      accumulatedLiquidity: 90,
      dominantExhaustion: 85,
      delivery: 85,
      reservoirPersistence: 88,
      ageTicks: 50,
      lifecycleState: "RIPE",
    });

    const formB = createMockZone("R_50", "UNDER 7", "R50-U7-LOW", {
      validPsych: true,
      accumulatedLiquidity: 60,
      dominantExhaustion: 55,
      delivery: 50,
      reservoirPersistence: 50,
      ageTicks: 20,
      lifecycleState: "BUILDING",
    });

    const registry = createMockRegistry([formA, formB]);
    const scanResult = scanBestLiquidityFormation(registry);

    assert.ok(scanResult.bestRanked !== null, "bestRanked must exist");
    const best = scanResult.bestRanked;

    assert.equal(
      typeof best.liquidityLevel,
      "number",
      "bestRanked.liquidityLevel must be a number",
    );
    assert.ok(best.liquidityLevel >= 0 && best.liquidityLevel <= 100, "liquidityLevel in [0, 100]");
    assert.equal(
      typeof best.liquidityTrend,
      "number",
      "bestRanked.liquidityTrend must be a number",
    );

    assert.equal(
      typeof best.psychologyAdherence,
      "number",
      "bestRanked.psychologyAdherence must be a number",
    );
    assert.ok(
      best.psychologyAdherence >= 0 && best.psychologyAdherence <= 100,
      "psychologyAdherence in [0, 100]",
    );

    assert.ok(best.liquidityComposition !== undefined, "bestRanked.liquidityComposition exists");
    assert.ok(best.psychologyDetails !== undefined, "bestRanked.psychologyDetails exists");
  });
});
