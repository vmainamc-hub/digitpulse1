import { strict as assert } from "node:assert";

import {
  analyzeAuthoritativeProductionMarket,
  AUTHORITATIVE_PRODUCTION_GATES,
  LIFECYCLE_ORDER,
} from "./authoritative-production";
import { CONTRACTS } from "./universe";
import type { V3Tick } from "./liquidity-v3";

assert.deepEqual(AUTHORITATIVE_PRODUCTION_GATES, {
  age: 12,
  accumulatedLiquidity: 65,
  maturity: 62,
  exhaustion: 65,
  delivery: 62,
  conflictMaxExclusive: 60,
});

assert.deepEqual(LIFECYCLE_ORDER, [
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
]);

const history: V3Tick[] = Array.from({ length: 40 }, (_, i) => ({
  d: i % 10,
  t: i + 1,
  q: i + 1,
}));

const first = analyzeAuthoritativeProductionMarket(history, "TEST", 100);
assert.ok(first, "40 ticks should be enough to produce an analysis");

const previous = Object.fromEntries(first!.contracts.map((c) => [c.id, c]));
const sameTickCount = analyzeAuthoritativeProductionMarket(history, "TEST", 100, previous);
assert.ok(sameTickCount);
assert.equal(sameTickCount!.contracts[0].age, first!.contracts[0].age, "age must not advance without new ticks");

const advanced = analyzeAuthoritativeProductionMarket(history, "TEST", 105, previous);
assert.ok(advanced);
assert.equal(advanced!.contracts[0].age, first!.contracts[0].age + 5, "age must use cumulative feed ticks");
assert.equal(advanced!.tickCount, 105, "market tickCount must remain cumulative");

for (const c of advanced!.contracts) {
  if (c.qualified) {
    assert.ok(c.age >= 12);
    assert.ok(c.accumulatedLiquidity >= 65);
    assert.ok(c.maturity >= 62);
    assert.ok(c.exhaustion >= 65);
    assert.ok(c.delivery >= 62);
    assert.ok(c.conflict < 60);
    assert.equal(c.vetoes.length, 0);
  }
}

assert.equal(CONTRACTS.length, advanced!.contracts.length, "all canonical contracts must be ranked by the same authority");

console.log("authoritative-production tests passed");
