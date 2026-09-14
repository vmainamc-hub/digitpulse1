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
): AuthoritativeLifecycle {
  if (contract.qualificationStatus === "BLOCKED") return "BLOCKED";
  if (contract.qualificationStatus === "CONFLICTED") return "CONFLICTED";
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

  // A formation may advance by at most one production stage per newly observed
  // tick window. This prevents a strong metric snapshot from jumping straight
  // from FORMING/BUILDING to RELEASE/CONFIRMED.
  if (previousIndex >= 0 && targetIndex > previousIndex + 1) {
    return LIFECYCLE_ORDER[previousIndex + 1];
  }

  // Never move backwards merely because one analysis cycle is noisy. Explicit
  // conflict/block/no-liquidity states above are allowed to interrupt the track.
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

  // V4's raw target is retained as evidence, but accumulation is advanced using
  // the feed's cumulative tick counter rather than the capped 1000-tick history length.
  let accumulatedLiquidity = 0;
  if (contract.reservoirs.length > 0) {
    const rawTarget = clamp(
      contract.reservoirScore * 0.45 +
        contract.delivery * 0.25 +
        contract.reservoirs.reduce((sum, r) => sum + r.persistence, 0) /
          contract.reservoirs.length * 0.2 +
        contract.reservoirs.reduce((sum, r) => sum + r.coherence, 0) /
          contract.reservoirs.length * 0.1,
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

  const passesPsychology = contract.psychology !== undefined &&
    !contract.vetoes.some((v) => /psychology|sentinel/i.test(v));
  const passesAge = age >= STRICT.age;
  const passesAccumulation = accumulatedLiquidity >= STRICT.accumulatedLiquidity;
  const passesMaturity = contract.maturity >= STRICT.maturity;
  const passesExhaustion = contract.exhaustion >= STRICT.exhaustion;
  const passesDelivery = contract.delivery >= STRICT.delivery;
  const passesConflict = contract.conflict < STRICT.conflictMaxExclusive;

  // Preserve genuine Sentinel/model vetoes while removing only the old V4 adapter
  // threshold messages that are superseded by the production gates above.
  const vetoes = contract.vetoes.filter(
    (v) =>
      !/Insufficient formation age|Insufficient accumulated liquidity|Elevated structural conflict/i.test(v),
  );
  if (!passesAge) vetoes.push(`Insufficient formation age (${age}/${STRICT.age} ticks)`);
  if (!passesAccumulation) {
    vetoes.push(`Insufficient accumulated liquidity (${Math.round(accumulatedLiquidity)}/${STRICT.accumulatedLiquidity})`);
  }
  if (contract.conflict >= STRICT.conflictMaxExclusive) {
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

  const state = strictLifecycle({ ...contract, accumulatedLiquidity, age, vetoes, qualificationStatus: qualified ? "QUALIFIED" : contract.qualificationStatus }, previous);

  let qualificationStatus: AuthoritativeContract["qualificationStatus"] = "NOT_QUALIFIED";
  if (qualified) qualificationStatus = "QUALIFIED";
  else if (state === "BLOCKED") qualificationStatus = "BLOCKED";
  else if (state === "CONFLICTED") qualificationStatus = "CONFLICTED";
  else if (contract.psychology && contract.vetoes.some((v) => /WATCH/i.test(v))) qualificationStatus = "WATCH";

  return {
    ...contract,
    state,
    age,
    accumulatedLiquidity,
    vetoes: [...new Set(vetoes)],
    qualified,
    qualificationStatus,
    lastTickCount: safeTickCount,
    birthTick: previous?.birthTick ?? safeTickCount,
  };
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
