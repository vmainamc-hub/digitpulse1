/**
 * AUTHORITATIVE PRODUCTION ADAPTER
 *
 * V4 remains the source of Sentinel psychology, reservoir detection and structural
 * metrics. This module is the single production contract boundary: it supplies the
 * real cumulative feed tick count, owns formation age/accumulation progression,
 * enforces the production qualification gates, and prevents lifecycle skipping.
 *
 * Production path:
 * DERIV FEED -> V4 MODEL -> PRODUCTION CONTRACT -> RANK / VET -> UI
 */

import {
  analyzeAuthoritativeMarket as analyzeV4,
  type AuthoritativeContract,
  type AuthoritativeLifecycle,
  type AuthoritativeMarketAnalysis,
} from "./authoritative-v4";
import { clamp } from "./math";
import type { V3Tick } from "./liquidity-v3";

const LIFECYCLE_ORDER: AuthoritativeLifecycle[] = [
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
  "CONFIRMED",
];

const STRICT = {
  age: 12,
  accumulatedLiquidity: 65,
  maturity: 62,
  exhaustion: 65,
  delivery: 62,
  conflictMaxExclusive: 60,
};

function lifecycleIndex(state?: string): number {
  return state ? LIFECYCLE_ORDER.indexOf(state as AuthoritativeLifecycle) : -1;
}

function strictLifecycle(
  contract: AuthoritativeContract,
  previous: AuthoritativeContract | undefined,
  psychologyBlocked: boolean,
): AuthoritativeLifecycle {
  if (psychologyBlocked) return "BLOCKED";
  if (contract.conflict >= STRICT.conflictMaxExclusive) return "CONFLICTED";
  if (contract.reservoirs.length === 0) return "NO_LIQUIDITY";

  let target: AuthoritativeLifecycle = "FORMING";
  if (contract.confirmation >= 82 && contract.age >= STRICT.age && contract.vetoes.length === 0) {
    target = "CONFIRMED";
  } else if (contract.confirmation >= 75 && contract.age >= STRICT.age) {
    target = "RIPE";
  } else if (contract.release >= 75 && contract.exhaustion >= 75 && contract.delivery >= 75) {
    target = "RELEASE";
  } else if (contract.exhaustion >= 70 && contract.delivery >= 70) {
    target = "RELEASE_WATCH";
  } else if (contract.absorption >= 65) {
    target = "ABSORBING";
  } else if (contract.delivery >= 75 && contract.confirmation >= 60) {
    target = "DELIVERY_ACCELERATING";
  } else if (contract.delivery >= STRICT.delivery) {
    target = "DELIVERY";
  } else if (contract.exhaustion >= 70) {
    target = "EXHAUSTION_CONFIRMED";
  } else if (contract.exhaustion >= 55) {
    target = "EXHAUSTION_WATCH";
  } else if (contract.maturity >= STRICT.maturity && contract.accumulatedLiquidity >= 50) {
    target = "MATURE";
  } else if (contract.accumulatedLiquidity >= 35 || contract.reservoirScore >= 50) {
    target = "BUILDING";
  }

  const previousIndex = lifecycleIndex(previous?.state);
  const targetIndex = lifecycleIndex(target);

  if (previousIndex >= 0 && targetIndex > previousIndex + 1) {
    return LIFECYCLE_ORDER[previousIndex + 1];
  }
  if (previousIndex >= 0 && targetIndex < previousIndex && contract.confirmation >= 50) {
    return LIFECYCLE_ORDER[previousIndex];
  }

  return target;
}

function strictify(
  contract: AuthoritativeContract,
  cumulativeTickCount: number,
  previous?: AuthoritativeContract,
): AuthoritativeContract {
  const safeTickCount = Math.max(0, Math.floor(cumulativeTickCount));
  const previousTickCount = previous?.lastTickCount ?? safeTickCount;
  const deltaTicks = previous ? Math.max(0, safeTickCount - previousTickCount) : 0;
  const age = previous ? previous.age + deltaTicks : 1;

  let accumulatedLiquidity = 0;
  if (contract.reservoirs.length > 0) {
    const rawTarget = clamp(
      contract.reservoirScore * 0.45 +
        contract.delivery * 0.25 +
        (contract.reservoirs.reduce((sum, r) => sum + r.persistence, 0) /
          contract.reservoirs.length) * 0.2 +
        (contract.reservoirs.reduce((sum, r) => sum + r.coherence, 0) /
          contract.reservoirs.length) * 0.1,
    );
    const previousAccum = previous?.accumulatedLiquidity ?? 0;
    if (previousAccum === 0) {
      accumulatedLiquidity = Math.min(rawTarget, 25 + rawTarget * 0.3);
    } else if (deltaTicks > 0) {
      accumulatedLiquidity = clamp(previousAccum * 0.85 + rawTarget * 0.15);
    } else {
      accumulatedLiquidity = previousAccum;
    }
  }

  // V4 exposes Sentinel reasons but does not expose the boolean psychology outcome.
  // Its BLOCKED status is the authoritative indication of a hard psychology reject.
  const psychologyBlocked = contract.qualificationStatus === "BLOCKED";
  const psychologyVetoes = contract.vetoes.some((v) => /psychology|sentinel/i.test(v));
  const passesPsychology = !psychologyBlocked && !psychologyVetoes;
  const passesAge = age >= STRICT.age;
  const passesAccumulation = accumulatedLiquidity >= STRICT.accumulatedLiquidity;
  const passesMaturity = contract.maturity >= STRICT.maturity;
  const passesExhaustion = contract.exhaustion >= STRICT.exhaustion;
  const passesDelivery = contract.delivery >= STRICT.delivery;
  const passesConflict = contract.conflict < STRICT.conflictMaxExclusive;

  const vetoes = contract.vetoes.filter(
    (v) =>
      !/Insufficient formation age|Insufficient accumulated liquidity|Elevated structural conflict/i.test(v),
  );
  if (!passesAge) vetoes.push(`Insufficient formation age (${age}/${STRICT.age} ticks)`);
  if (!passesAccumulation) {
    vetoes.push(`Insufficient accumulated liquidity (${Math.round(accumulatedLiquidity)}/${STRICT.accumulatedLiquidity})`);
  }
  if (!passesConflict) {
    vetoes.push(`Elevated structural conflict (${Math.round(contract.conflict)}/${STRICT.conflictMaxExclusive})`);
  }

  const qualified =
    passesPsychology &&
    passesAge &&
    passesAccumulation &&
    passesMaturity &&
    passesExhaustion &&
    passesDelivery &&
    passesConflict &&
    vetoes.length === 0;

  const provisional: AuthoritativeContract = {
    ...contract,
    age,
    accumulatedLiquidity,
    vetoes: [...new Set(vetoes)],
    qualified,
    qualificationStatus: qualified ? "QUALIFIED" : "NOT_QUALIFIED",
    lastTickCount: safeTickCount,
    birthTick: previous?.birthTick ?? safeTickCount,
  };
  const state = strictLifecycle(provisional, previous, psychologyBlocked);

  let qualificationStatus: AuthoritativeContract["qualificationStatus"] = "NOT_QUALIFIED";
  if (qualified) qualificationStatus = "QUALIFIED";
  else if (state === "BLOCKED") qualificationStatus = "BLOCKED";
  else if (state === "CONFLICTED") qualificationStatus = "CONFLICTED";
  else if (psychologyBlocked || psychologyVetoes) qualificationStatus = "WATCH";

  return { ...provisional, state, qualificationStatus };
}

export function analyzeAuthoritativeProductionMarket(
  history: V3Tick[],
  marketSymbol: string,
  cumulativeTickCount: number,
  previousContracts: Record<string, AuthoritativeContract> = {},
): AuthoritativeMarketAnalysis | null {
  const base = analyzeV4(history, marketSymbol, previousContracts);
  if (!base) return null;

  const contracts = base.contracts.map((contract) =>
    strictify(contract, cumulativeTickCount, previousContracts[contract.id]),
  );
  const qualified = contracts
    .filter((contract) => contract.qualified)
    .sort((a, b) => b.confirmation - a.confirmation);
  const top = [...contracts].sort((a, b) => b.confirmation - a.confirmation)[0]!;

  return {
    ...base,
    contracts,
    qualified,
    top,
    tickCount: Math.max(0, Math.floor(cumulativeTickCount)),
  };
}

export { STRICT as AUTHORITATIVE_PRODUCTION_GATES, LIFECYCLE_ORDER };
