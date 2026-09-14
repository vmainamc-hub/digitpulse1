/**
 * Hardened Liquidity Intelligence Engine (Invariants & Guarantees).
 *
 * Enforces:
 * 1. Stable formation identity across cycles
 * 2. Real tick-driven age (never incrementing on tick stagnation)
 * 3. Separation of Ranking (#1 ranked) and Qualification (structural rules)
 * 4. Hysteresis guarding against rapid state flapping
 * 5. Multi-dimensional confirmation before CONFIRMED state
 * 6. Evidence timeline deduplication
 * 7. Smart Superiority Override with minimum persistence and +7.0 to +12.0 point margin
 */

import type { LiquidityZone, ZoneLifecycleState } from "./zones";
import { calculateFormationRankScore, qualifyFormation, isMateriallySuperior } from "./scanner";

export interface FormationIntegrityReport {
  zoneId: string;
  generation: number;
  lifecycleState: ZoneLifecycleState;
  score: number;
  qualified: boolean;
  qualificationReasons: string[];
  ageTicks: number;
  hasStableIdentity: boolean;
  hasNonNegativeScores: boolean;
}

export function inspectFormationIntegrity(zone: LiquidityZone): FormationIntegrityReport {
  const score = calculateFormationRankScore(zone);
  const qual = qualifyFormation(zone);

  return {
    zoneId: zone.zoneId,
    generation: zone.generation,
    lifecycleState: zone.lifecycleState,
    score,
    qualified: qual.isQualified,
    qualificationReasons: qual.reasons,
    ageTicks: zone.ageTicks,
    hasStableIdentity: Boolean(zone.zoneId && zone.zoneId.includes("GEN-")),
    hasNonNegativeScores: score >= 0 && zone.accumulators.accumulatedLiquidity >= 0,
  };
}

export { calculateFormationRankScore, qualifyFormation, isMateriallySuperior };
