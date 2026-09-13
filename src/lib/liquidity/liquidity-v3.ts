/**
 * Liquidity Intelligence V3
 *
 * HARD ARCHITECTURAL RULE:
 * - Sentinel psychology is derived ONLY from the latest 1000 ticks.
 * - Short windows NEVER redefine Green/2nd Green/Red/2nd Red/Purple.
 * - Short windows describe the temporal behaviour of that fixed 1000-tick map.
 *
 * This is an observable statistical model over tick sequences. It makes no
 * claim about hidden order books, trader intent, manipulation, or certainty.
 */

export const V3_WINDOWS = [10, 20, 30, 60, 120, 240, 500, 1000] as const;
export const PSYCHOLOGY_WINDOW = 1000 as const;

export type Side = "OVER" | "UNDER";
export type Lifecycle =
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
  | "INVALIDATED"
  | "BLOCKED"
  | "CONFLICTED";

export interface V3Tick { d: number; t?: number; q?: number }

export interface Psychology1000 {
  window: 1000;
  green: number;
  secondGreen: number;
  red: number;
  secondRed: number;
  purple: number | null;
  pct: number[];
  pressure: number[];
  winners: number[];
  losers: number[];
  valid: boolean;
  outcome: "ACCEPT" | "WATCH" | "REJECT";
  reasons: string[];
}

export interface WindowStats {
  window: number;
  pct: number[];
  counts: number[];
  entropy: number;
  even: number;
  odd: number;
  low: number;
  high: number;
  dominantRate: number;
  reservoirRate: Record<number, number>;
}

export interface DigitTemporal {
  digit: number;
  rates: Record<number, number>;
  slope20_60: number;
  slope60_120: number;
  slope120_240: number;
  slope240_500: number;
  shortLongDivergence: number;
  ewma: number;
  ewmaSlope: number;
  cusum: number;
  changePoint: number;
  dormant: boolean;
  delivering: boolean;
  accelerating: boolean;
}

export interface TransitionEvidence {
  from: number[];
  to: number[];
  recent: number;
  baseline: number;
  delta: number;
  strength: number;
}

export interface LiquidityOpportunity {
  key: string;
  market: string;
  contract: string;
  side: Side;
  barrier: number;
  psychology: Psychology1000;
  reservoirDigits: number[];
  dominantDigits: number[];
  reservoirScore: number;
  exhaustionScore: number;
  deliveryScore: number;
  migrationScore: number;
  absorptionScore: number;
  confirmationScore: number;
  conflictScore: number;
  ageTicks: number;
  lifecycle: Lifecycle;
  previousLifecycle: Lifecycle | null;
  birthTick: number;
  lastTick: number;
  trajectory: number[];
  evidence: string[];
  vetoes: string[];
  temporal: Record<number, DigitTemporal>;
  transitions: TransitionEvidence[];
  entropyVelocity: number;
  entropyAcceleration: number;
  jsd: number;
}

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const pct = (ds: number[]) => {
  const c = Array(10).fill(0);
  for (const d of ds) if (d >= 0 && d <= 9) c[d]++;
  const n = Math.max(1, ds.length);
  return c.map(x => x / n);
};
const counts = (ds: number[]) => {
  const c = Array(10).fill(0);
  for (const d of ds) if (d >= 0 && d <= 9) c[d]++;
  return c;
};
const entropy = (p: number[]) => -p.reduce((s, x) => s + (x > 0 ? x * Math.log2(x) : 0), 0) / Math.log2(10);
const jsd = (a: number[], b: number[]) => {
  const m = a.map((x, i) => (x + b[i]) / 2);
  const kl = (x: number[], y: number[]) => x.reduce((s, v, i) => s + (v > 0 ? v * Math.log2(v / Math.max(y[i], 1e-9)) : 0), 0);
  return Math.max(0, (kl(a, m) + kl(b, m)) / 2);
};
const signSlope = (a: number, b: number) => b - a;

function stats(ds: number[], w: number, fixedDominant?: number[]): WindowStats {
  const x = ds.slice(-w);
  const p = pct(x);
  const dom = fixedDominant?.length ? mean(fixedDominant.map(d => p[d] ?? 0)) : Math.max(...p);
  const reservoirRate: Record<number, number> = {};
  for (let d = 0; d < 10; d++) reservoirRate[d] = p[d];
  return {
    window: w,
    pct: p,
    counts: counts(x),
    entropy: entropy(p),
    even: p.filter((_, d) => d % 2 === 0).reduce((a, b) => a + b, 0),
    odd: p.filter((_, d) => d % 2 !== 0).reduce((a, b) => a + b, 0),
    low: p.slice(0, 5).reduce((a, b) => a + b, 0),
    high: p.slice(5).reduce((a, b) => a + b, 0),
    dominantRate: dom,
    reservoirRate,
  };
}

/** Exact Sentinel bar construction, but anchored exclusively to 1000 ticks. */
export function buildPsychology1000(allTicks: V3Tick[], side: Side, barrier: number): Psychology1000 {
  const ds = allTicks.slice(-1000).map(x => x.d);
  const p = pct(ds);
  const half = Math.max(1, Math.floor(ds.length / 2));
  const first = pct(ds.slice(0, half));
  const second = pct(ds.slice(half));
  // Pressure is measured entirely inside the 1000-tick psychology window:
  // second-half share minus first-half share. No 10/20/60/120/etc window
  // participates in identifying the psychological bars.
  const pressure = p.map((_, d) => (second[d] ?? 0) - (first[d] ?? 0));
  const byFreq = [...Array(10).keys()].sort((a, b) => p[b] - p[a] || a - b);
  const green = byFreq[0];
  const secondGreen = byFreq[1];
  const red = byFreq[9];
  const secondRed = byFreq[8];
  let purple: number | null = null;
  let best = 0.005;
  for (let d = 0; d < 10; d++) {
    if (pressure[d] > best) { best = pressure[d]; purple = d; }
  }
  const winners = [...Array(10).keys()].filter(d => side === "OVER" ? d > barrier : d < barrier);
  const losers = [...Array(10).keys()].filter(d => !winners.includes(d));
  const reasons: string[] = [];
  const bars = [green, secondGreen, red, secondRed, purple].filter((x): x is number => x !== null);
  const losingBars = bars.filter(d => losers.includes(d)).length;
  if (losingBars > 2) reasons.push(`${losingBars}/5 psychological bars are in the losing zone`);
  if (losers.includes(red)) reasons.push(`Red d${red} is in the losing zone`);
  if (losers.includes(secondRed)) reasons.push(`2nd Red d${secondRed} is in the losing zone`);
  if (losers.includes(secondGreen)) reasons.push(`2nd Green d${secondGreen} is in the losing zone`);
  if (purple !== null && losers.includes(purple)) reasons.push(`Purple d${purple} is growing in the losing zone`);
  const gp = p[green];
  if (losers.includes(green)) {
    const elevated = gp >= 0.105;
    const releasing = pressure[green] <= 0.005;
    if (!elevated) reasons.push(`Green d${green} losing-side share ${(gp*100).toFixed(1)}% is below exhaustion threshold`);
    else if (!releasing) reasons.push(`Green d${green} is elevated but still increasing`);
  }
  if (!losers.includes(green)) {
    if (side === "UNDER" && green % 2 === 0) reasons.push(`UNDER Green d${green} is not odd`);
    if (side === "OVER" && green % 2 !== 0) reasons.push(`OVER Green d${green} is not even`);
  }
  if (!losers.includes(red)) {
    if (side === "UNDER" && (red % 2 !== 0 || red === 8)) reasons.push(`UNDER Red d${red} violates even/never-8 rule`);
    if (side === "OVER" && (red % 2 === 0 || red === 1)) reasons.push(`OVER Red d${red} violates odd/never-1 rule`);
  }
  // Sentinel anchor exceptions for 9 under / 0 over.
  if (side === "UNDER" && p[9] >= 0.105 && pressure[9] > 0.005) reasons.push(`UNDER digit 9 is elevated but not releasing`);
  if (side === "OVER" && p[0] >= 0.105 && pressure[0] > 0.005) reasons.push(`OVER digit 0 is elevated but not releasing`);
  return {
    window: 1000, green, secondGreen, red, secondRed, purple, pct: p, pressure,
    winners, losers,
    valid: reasons.length === 0 && ds.length >= 1000,
    outcome: reasons.length === 0 && ds.length >= 1000 ? "ACCEPT" : reasons.length <= 1 && ds.length >= 1000 ? "WATCH" : "REJECT",
    reasons,
  };
}

function ewma(values: number[], lambda = 0.2) {
  if (!values.length) return 0;
  let z = values[0];
  for (let i = 1; i < values.length; i++) z = lambda * values[i] + (1 - lambda) * z;
  return z;
}

function cusum(values: number[], target: number) {
  let pos = 0, neg = 0, peak = 0;
  const k = Math.max(0.0005, Math.abs(target) * 0.08);
  for (const v of values) {
    pos = Math.max(0, pos + v - target - k);
    neg = Math.min(0, neg + v - target + k);
    peak = Math.max(peak, pos, -neg);
  }
  return clamp(peak * 900);
}

function changePoint(values: number[]) {
  if (values.length < 12) return 0;
  const h = Math.floor(values.length / 2);
  const a = mean(values.slice(0, h));
  const b = mean(values.slice(h));
  const variance = mean(values.map(v => (v - mean(values)) ** 2));
  return clamp(Math.abs(b - a) / Math.sqrt(variance + 1e-7) * 18);
}

function rateSeries(ds: number[], digit: number) {
  const out: Record<number, number> = {};
  for (const w of V3_WINDOWS) out[w] = pct(ds.slice(-w))[digit] ?? 0;
  return out;
}

function temporalFor(ds: number[], digit: number): DigitTemporal {
  const rates = rateSeries(ds, digit);
  const ordered = V3_WINDOWS.map(w => rates[w]);
  const shortSeries = ds.slice(-Math.min(120, ds.length)).map((_, i, a) => {
    const end = ds.length - a.length + i + 1;
    return pct(ds.slice(Math.max(0, end - 20), end))[digit] ?? 0;
  });
  const target = rates[120] ?? rates[1000];
  const e = ewma(shortSeries);
  const cp = changePoint(shortSeries);
  const c = cusum(shortSeries, target);
  const slope20_60 = signSlope(rates[60], rates[20]);
  const slope60_120 = signSlope(rates[120], rates[60]);
  const slope120_240 = signSlope(rates[240], rates[120]);
  const slope240_500 = signSlope(rates[500], rates[240]);
  const shortLongDivergence = (rates[20] ?? 0) - (rates[500] ?? 0);
  const ewmaSlope = e - (rates[120] ?? e);
  const dormant = Math.abs(shortLongDivergence) < 0.012 && Math.abs(slope20_60) < 0.006;
  const delivering = slope20_60 > 0.004 && slope60_120 > 0;
  const accelerating = delivering && slope20_60 > slope60_120 * 0.85;
  void ordered;
  return { digit, rates, slope20_60, slope60_120, slope120_240, slope240_500, shortLongDivergence, ewma: e, ewmaSlope, cusum: c, changePoint: cp, dormant, delivering, accelerating };
}

function transitionEvidence(ds: number[], from: number[], to: number[]): TransitionEvidence {
  const seq = ds.slice(-500);
  const base = ds.slice(-1000, -500);
  const trans = (x: number[]) => {
    let n = 0, hit = 0;
    for (let i = 0; i < x.length - 1; i++) if (from.includes(x[i])) { n++; if (to.includes(x[i + 1])) hit++; }
    return n ? hit / n : 0;
  };
  const recent = trans(seq), baseline = trans(base);
  return { from, to, recent, baseline, delta: recent - baseline, strength: clamp((recent - baseline) * 700) };
}

function reservoirScore(p: Psychology1000, temporal: Record<number, DigitTemporal>) {
  const values = p.res
  void values;
}

export function analyzeLiquidity(
  market: string,
  allTicks: V3Tick[],
  side: Side,
  barrier: number,
  previous?: LiquidityOpportunity,
): LiquidityOpportunity {
  const ds = allTicks.slice(-1000).map(x => x.d);
  const psychology = buildPsychology1000(allTicks, side, barrier);
  const temporal: Record<number, DigitTemporal> = {};
  for (let d = 0; d < 10; d++) temporal[d] = temporalFor(allTicks.map(x => x.d), d);
  const reservoirDigits = [psychology.red, psychology.secondRed].filter(d => psychology.winners.includes(d));
  const dominantDigits = [psychology.green, psychology.secondGreen].filter(d => psychology.losers.includes(d) || psychology.winners.includes(d));
  const rDepth = mean(reservoirDigits.map(d => clamp((0.10 - psychology.pct[d]) * 900 + 45)));
  const persistence = mean(reservoirDigits.map(d => temporal[d].dormant ? 90 : 55));
  const reservoir = clamp(rDepth * 0.55 + persistence * 0.25 + (reservoirDigits.length === 2 ? 20 : 5));
  const exhaustion = clamp(mean(dominantDigits.map(d => {
    const x = temporal[d];
    return clamp(50 - x.slope20_60 * 7000 + Math.max(0, -x.ewmaSlope) * 3000 + x.cusum * 0.45 + x.changePoint * 0.35);
  })));
  const delivery = clamp(mean(reservoirDigits.map(d => {
    const x = temporal[d];
    return clamp(x.slope20_60 * 7000 + x.slope60_120 * 4000 + Math.max(0, x.ewmaSlope) * 3000 + x.cusum * 0.35 + x.changePoint * 0.2 + 35);
  })));
  const transitions = [transitionEvidence(allTicks.map(x => x.d), dominantDigits, reservoirDigits)];
  const migration = clamp(transitions[0].strength * 0.8 + (psychology.purple !== null && reservoirDigits.includes(psychology.purple) ? 35 : 0));
  const w20 = stats(allTicks.map(x => x.d), 20, dominantDigits);
  const w120 = stats(allTicks.map(x => x.d), 120, dominantDigits);
  const w500 = stats(allTicks.map(x => x.d), 500, dominantDigits);
  const h20 = w20.entropy, h120 = w120.entropy, h500 = w500.entropy;
  const entropyVelocity = h20 - h120;
  const entropyAcceleration = (h20 - h120) - (h120 - h500);
  const p20 = pct(allTicks.slice(-20).map(x => x.d));
  const p500 = pct(allTicks.slice(-500).map(x => x.d));
  const divergence = jsd(p20, p500);
  const absorption = clamp(delivery * 0.45 + exhaustion * 0.3 + migration * 0.25);
  const conflict = clamp((psychology.valid ? 0 : 65) + (psychology.outcome === "WATCH" ? 18 : 0) + Math.max(0, 55 - migration) * 0.25);
  const confirmation = clamp(
    reservoir * 0.18 + exhaustion * 0.2 + delivery * 0.24 + migration * 0.16 + absorption * 0.12 + clamp(divergence * 220) * 0.1,
  );
  const vetoes = [...psychology.reasons];
  if (!reservoirDigits.length) vetoes.push("No Sentinel-valid Red/2nd-Red winning-side reservoir");
  if (psychology.outcome === "REJECT") vetoes.push("1000-tick Sentinel psychology rejected");
  let lifecycle: Lifecycle = "NO_LIQUIDITY";
  if (reservoir >= 35) lifecycle = "FORMING";
  if (reservoir >= 55) lifecycle = "BUILDING";
  if (reservoir >= 70) lifecycle = "MATURE";
  if (exhaustion >= 62) lifecycle = "EXHAUSTION_WATCH";
  if (exhaustion >= 75) lifecycle = "EXHAUSTION_CONFIRMED";
  if (delivery >= 62) lifecycle = "DELIVERY";
  if (delivery >= 78 && migration >= 60) lifecycle = "DELIVERY_ACCELERATING";
  if (absorption >= 70) lifecycle = "ABSORBING";
  if (exhaustion >= 75 && delivery >= 72) lifecycle = "RELEASE_WATCH";
  if (exhaustion >= 80 && delivery >= 80 && migration >= 65) lifecycle = "RELEASE";
  if (confirmation >= 76 && lifecycle === "RELEASE") lifecycle = "RIPE";
  if (confirmation >= 84 && lifecycle === "RIPE" && vetoes.length === 0) lifecycle = "CONFIRMED";
  if (!psychology.valid && psychology.outcome === "REJECT") lifecycle = "BLOCKED";
  if (conflict >= 70 && lifecycle !== "BLOCKED") lifecycle = "CONFLICTED";
  const tickNow = allTicks.length;
  const previousState = previous?.lifecycle ?? null;
  const backward = previous && previousState && lifecycle !== previousState;
  // Hysteresis: do not allow a one-cycle weaker measurement to erase a mature
  // opportunity unless the psychology itself has been invalidated.
  const ordered: Lifecycle[] = ["NO_LIQUIDITY","FORMING","BUILDING","MATURE","EXHAUSTION_WATCH","EXHAUSTION_CONFIRMED","DELIVERY","DELIVERY_ACCELERATING","ABSORBING","RELEASE_WATCH","RELEASE","RIPE","CONFIRMED"];
  if (previous && psychology.valid && backward) {
    const pi = ordered.indexOf(previousState as Lifecycle), ni = ordered.indexOf(lifecycle);
    if (pi >= 0 && ni >= 0 && ni < pi && pi - ni <= 2 && confirmation >= 45) lifecycle = previousState as Lifecycle;
  }
  const ageTicks = previous ? Math.max(0, previous.ageTicks + Math.max(1, tickNow - previous.lastTick)) : 1;
  const trajectory = [...(previous?.trajectory ?? []), confirmation].slice(-80);
  const evidence: string[] = [];
  if (reservoir >= 65) evidence.push(`Sentinel-valid reservoir depth ${Math.round(reservoir)}`);
  if (exhaustion >= 65) evidence.push(`Dominant structure exhaustion ${Math.round(exhaustion)}`);
  if (delivery >= 65) evidence.push(`Reservoir delivery ${Math.round(delivery)}`);
  if (migration >= 60) evidence.push(`Observed dominant→reservoir migration ${Math.round(migration)}`);
  if (psychology.purple !== null && reservoirDigits.includes(psychology.purple)) evidence.push(`Purple d${psychology.purple} aligned with reservoir`);
  if (divergence > 0.04) evidence.push(`Recent distribution departed from 500-tick structure (JSD ${divergence.toFixed(3)})`);
  if (entropyVelocity > 0.02 && delivery > 60) evidence.push(`Entropy broadening accompanies reservoir delivery`);
  return {
    key: `${market}:${side}${barrier}`,
    market,
    contract: `${side}${barrier}`,
    side,
    barrier,
    psychology,
    reservoirDigits,
    dominantDigits,
    reservoirScore: reservoir,
    exhaustionScore: exhaustion,
    deliveryScore: delivery,
    migrationScore: migration,
    absorptionScore: absorption,
    confirmationScore: confirmation,
    conflictScore: conflict,
    ageTicks,
    lifecycle,
    previousLifecycle: previousState,
    birthTick: previous?.birthTick ?? tickNow,
    lastTick: tickNow,
    trajectory,
    evidence,
    vetoes,
    temporal,
    transitions,
    entropyVelocity,
    entropyAcceleration,
    jsd: divergence,
  };
}

export function analyzeMarketV3(market: string, allTicks: V3Tick[], previous: Record<string, LiquidityOpportunity> = {}) {
  const out: LiquidityOpportunity[] = [];
  for (const side of ["OVER", "UNDER"] as const) {
    for (let barrier = side === "OVER" ? 1 : 5; barrier <= (side === "OVER" ? 4 : 8); barrier++) {
      const key = `${market}:${side}${barrier}`;
      out.push(analyzeLiquidity(market, allTicks, side, barrier, previous[key]));
    }
  }
  return out;
}
