/**
 * Shared quantitative engine.
 *
 * Pipeline: canonical bounded tick state -> market features -> psychology ->
 * contract projection -> liquidity lifecycle -> danger -> confirmation.
 *
 * The engine is pure. The UI never feeds data back into it.
 *
 * Scientific boundary: every output is an observable statistical/psychological
 * pattern measured on public tick data. Nothing here claims hidden order flow,
 * trader intent, or manipulation.
 */

import {
  ANALYSIS_VERSION,
  CONTRACTS,
  WINDOWS,
  type ContractDef,
  type ContractKind,
  type LiquidityState,
} from "./universe";
import {
  autocorr,
  bayes,
  changePoint,
  clamp,
  conditionalEntropy,
  contractMask,
  entropy,
  freq,
  hazardFunction,
  isEven,
  isHigh,
  isLow,
  jsd,
  mean,
  mutualInformation,
  normalizedEntropy,
  pageHinkley,
  runs,
  sigmoid,
  transition,
  wilson,
  type HazardPoint,
} from "./math";

export interface Tick {
  q: number;
  d: number;
  t: number;
}

export interface DigitPsychology {
  freq: number[];
  baseline: number[];
  momentum: number[];
  pressure: number[];
}

export interface BoundaryStat {
  pair: string;
  share: number;
  imbalance: number;
  attack: number;
  rejection: number;
}

export interface RegimeInfo {
  state: "STABLE" | "CONCENTRATED" | "DEPENDENT" | "SHIFT";
  change: number;
  entropy: number;
  autocorr: number;
}

export interface HmmInfo {
  low: number;
  high: number;
  confidence: number;
}

export interface SweepInfo {
  active: boolean;
  side: "LOW" | "HIGH" | "NONE";
  intensity: number;
  boundaryBurst: number;
  reversion: number;
  note: string;
}

export interface ConfirmationComponent {
  key: string;
  label: string;
  value: number;
  weight: number;
  supports: boolean;
}

export interface ContractAnalysis {
  id: string;
  label: string;
  kind: ContractKind;
  barrier: number;
  winShare: number;
  recentWin: number;
  wilsonLo: number;
  wilsonHi: number;
  bayesian: number;
  creation: number;
  maturity: number;
  absorption: number;
  exhaustion: number;
  release: number;
  danger: number;
  conflict: number;
  confirmation: number;
  pressure: number;
  boundaryAttack: number;
  drift: number;
  run: number;
  opposingRun: number;
  hazard: HazardPoint[];
  dimensions: ConfirmationComponent[];
  supportCount: number;
  state: LiquidityState;
  law: boolean;
  ripe: boolean;
  confirmed: boolean;
}

export interface ParityAnalysis {
  even: { share: number; recent: number; pressure: number; danger: number };
  odd: { share: number; recent: number; pressure: number; danger: number };
  low: { share: number; recent: number; pressure: number };
  high: { share: number; recent: number; pressure: number };
  zones: Record<string, number>;
}

export interface MarketAnalysis {
  sample: number;
  last: number;
  observationId: string;
  f1000: number[];
  f20: number[];
  f50: number[];
  entropy: number;
  entropyFast: number;
  entropyShock: number;
  jsd: number;
  low1000: number;
  high1000: number;
  low20: number;
  high20: number;
  even20: number;
  odd20: number;
  zoneMomentum: number;
  transition: number[][];
  mi: number;
  conditionalEntropy: number;
  changePoint: number;
  pageHinkley: number;
  fluctuation: number;
  anomaly: number;
  persistence: number;
  transitionStability: number;
  autocorr: number;
  regime: RegimeInfo;
  regimeDanger: number;
  hmm: HmmInfo;
  sweep: SweepInfo;
  adversarial: number;
  boundaries: BoundaryStat[];
  psychology: DigitPsychology;
  digitMomentum: number[];
  lowHazard: HazardPoint[];
  highHazard: HazardPoint[];
  parity: ParityAnalysis;
  contracts: ContractAnalysis[];
  top: ContractAnalysis;
  bayesian: Record<string, number>;
}

interface Features {
  f1000: number[];
  f20: number[];
  f50: number[];
  entropy: number;
  entropyFast: number;
  entropyShock: number;
  jsd: number;
  zoneMomentum: number;
  fluctuation: number;
  anomaly: number;
  persistence: number;
  transitionStability: number;
  changePoint: number;
  regimeDanger: number;
  digitMomentum: number[];
  bayesian: Record<string, number>;
  baseline: Record<ContractKind, Record<number, number>>;
  sweep: SweepInfo;
}

function psychologicalDigits(ds: number[], base: number[]): DigitPsychology {
  const f = freq(ds);
  const fb = freq(base);
  const momentum = f.map((x, i) => (x - (fb[i] ?? 0)) * 100);
  const pressure = f.map((_, i) => clamp(50 + (momentum[i] ?? 0) * 4));
  return { freq: f, baseline: fb, momentum, pressure };
}

/** Lower / upper / extreme boundary psychology. */
function boundaryStats(ds: number[]): BoundaryStat[] {
  const f = freq(ds);
  const pairs: [number, number][] = [
    [0, 1],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [0, 9],
  ];
  return pairs.map(([a, b]) => {
    const fa = f[a] ?? 0;
    const fb = f[b] ?? 0;
    return {
      pair: `${a}/${b}`,
      share: (fa + fb) * 100,
      imbalance: (fa - fb) * 100,
      attack: clamp((fa + fb) * 350),
      rejection: clamp(Math.abs(fa - fb) * 500),
    };
  });
}

function regimeOf(ds: number[]): RegimeInfo {
  const z = changePoint(ds.map((d) => (isLow(d) ? 0 : 1)));
  const ent = entropy(freq(ds)) / Math.log2(10);
  const ac = Math.abs(autocorr(ds.map((d) => d % 2)));
  const state: RegimeInfo["state"] =
    z.score > 65 ? "SHIFT" : ent < 0.88 ? "CONCENTRATED" : ac > 0.18 ? "DEPENDENT" : "STABLE";
  return { state, change: z.score, entropy: ent * 100, autocorr: ac };
}

/** HMM-inspired two-state (LOW / HIGH) regime inference. */
function hmmProxy(ds: number[]): HmmInfo {
  if (ds.length < 30) return { low: 0.5, high: 0.5, confidence: 0 };
  const x = ds.map((d) => (isLow(d) ? 0 : 1));
  const p = mean(x);
  const r = mean(x.slice(-20));
  const high = sigmoid((r - p) * 8);
  return { low: 1 - high, high, confidence: clamp(Math.abs(r - p) * 250) };
}

/**
 * Liquidity sweep detection.
 * A sweep is an observed burst of extreme boundary digits followed by an
 * opposite-zone reversion inside the same short window.
 */
function detectSweep(recent: number[], baseline: number[]): SweepInfo {
  if (recent.length < 20)
    return { active: false, side: "NONE", intensity: 0, boundaryBurst: 0, reversion: 0, note: "Insufficient sample." };
  const fr = freq(recent);
  const fb = freq(baseline);
  const lowExtreme = ((fr[0] ?? 0) + (fr[1] ?? 0)) - ((fb[0] ?? 0) + (fb[1] ?? 0));
  const highExtreme = ((fr[8] ?? 0) + (fr[9] ?? 0)) - ((fb[8] ?? 0) + (fb[9] ?? 0));
  const half = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, half);
  const secondHalf = recent.slice(half);
  const firstHigh = mean(firstHalf.map((d) => (isHigh(d) ? 1 : 0)));
  const secondHigh = mean(secondHalf.map((d) => (isHigh(d) ? 1 : 0)));
  const swing = secondHigh - firstHigh;

  const highSweep = clamp(highExtreme * 400) * clamp(Math.max(0, -swing) * 300, 0, 100);
  const lowSweep = clamp(lowExtreme * 400) * clamp(Math.max(0, swing) * 300, 0, 100);
  const side = highSweep > lowSweep ? "HIGH" : lowSweep > 0 ? "LOW" : "NONE";
  const intensity = clamp(Math.sqrt(Math.max(highSweep, lowSweep)));
  const boundaryBurst = clamp(Math.max(highExtreme, lowExtreme) * 400);
  const reversion = clamp(Math.abs(swing) * 200);
  return {
    active: intensity >= 45,
    side: side as SweepInfo["side"],
    intensity,
    boundaryBurst,
    reversion,
    note:
      intensity >= 45
        ? `Observed ${side} boundary burst followed by opposite-zone reversion.`
        : "No sweep signature in the recent window.",
  };
}

function analyzeContract(ds: number[], f: Features, c: ContractDef): ContractAnalysis {
  const win = (d: number) => contractMask(c.kind, c.barrier, d);
  const n = Math.max(1, ds.length);
  const wins = ds.filter(win).length;
  const wf = wins / n;
  const recent = ds.slice(-50);
  const rf = recent.filter(win).length / Math.max(1, recent.length);
  const w = wilson(wins, n);
  const drift = rf - wf;

  const winningDigits = ds.filter(win);
  const losingDigits = ds.filter((d) => !win(d));
  const wr = runs(ds, win);
  const lr = runs(ds, (d) => !win(d));
  const hazard = hazardFunction(ds, win);

  const boundary = c.kind === "OVER" ? c.barrier + 1 : c.barrier - 1;
  const boundaryAttack = clamp((f.f1000[boundary] ?? 0) * 500);

  const winMomentum = mean(winningDigits.slice(-20).map((d) => f.digitMomentum[d] ?? 0));
  const loseMomentum = mean(losingDigits.slice(-20).map((d) => f.digitMomentum[d] ?? 0));
  const pressure = clamp(50 + (winMomentum - loseMomentum) * 3);

  const concentration = clamp(Math.abs(wf - 0.5) * 200);
  const persistence = clamp(wr.current * 8 + wr.max * 3);
  const opposingExhaustion = clamp(
    Math.max(0, lr.max - 2) * 10 + Math.max(0, -loseMomentum) * 2,
  );

  // LAW 1 — liquidity only exists where creation was observed.
  const creation = clamp(
    concentration * 0.34 +
      persistence * 0.18 +
      Math.abs(drift) * 240 * 0.2 +
      Math.abs(pressure - 50) * 0.18 +
      (100 - f.fluctuation) * 0.1,
  );
  const maturity = clamp(
    creation * 0.55 +
      concentration * 0.2 +
      Math.min(100, f.persistence) * 0.15 +
      Math.max(0, 50 - f.changePoint) * 0.1,
  );
  const absorption = clamp(
    opposingExhaustion * 0.35 + boundaryAttack * 0.25 + f.sweep.boundaryBurst * 0.2 + Math.max(0, -drift) * 200 * 0.2,
  );
  const exhaustion = clamp(
    opposingExhaustion * 0.45 +
      f.fluctuation * 0.28 +
      Math.max(0, f.entropyShock) * 0.45 +
      boundaryAttack * 0.18,
  );
  // LAW 3 — release requires observed structural change.
  const release = clamp(
    Math.max(0, exhaustion - 35) * 1.1 +
      Math.max(0, drift) * 220 * 0.3 +
      Math.max(0, pressure - 50) * 0.35 +
      (100 - f.transitionStability) * 0.15,
  );
  const conflict = clamp(
    Math.abs(rf - wf) * 180 + Math.abs(f.zoneMomentum) * 0.7 + f.changePoint * 0.2,
  );
  const danger = clamp(
    f.anomaly * 0.25 +
      f.fluctuation * 0.18 +
      boundaryAttack * 0.12 +
      conflict * 0.18 +
      Math.max(0, exhaustion - 70) * 0.32 +
      f.regimeDanger * 0.15 +
      (f.sweep.active ? 12 : 0),
  );

  // LAW 4 — decomposable multi-dimensional confirmation.
  const dimensions: ConfirmationComponent[] = [
    { key: "creation", label: "Observed creation", value: creation, weight: 0.15, supports: creation >= 45 },
    { key: "maturity", label: "Maturation", value: maturity, weight: 0.16, supports: maturity >= 55 },
    { key: "release", label: "Structural release", value: release, weight: 0.22, supports: release >= 60 },
    { key: "pressure", label: "Digit pressure", value: pressure, weight: 0.15, supports: pressure >= 56 },
    { key: "safety", label: "Danger clearance", value: 100 - danger, weight: 0.14, supports: danger < 55 },
    { key: "coherence", label: "Evidence coherence", value: 100 - conflict, weight: 0.08, supports: conflict < 55 },
    { key: "posterior", label: "Bayesian posterior", value: f.bayesian[c.id] ?? 0, weight: 0.1, supports: (f.bayesian[c.id] ?? 0) >= 55 },
  ];
  const confirmation = clamp(dimensions.reduce((s, d) => s + d.value * d.weight, 0));
  const supportCount = dimensions.filter((d) => d.supports).length;

  const law = creation >= 25;
  const ripe = release >= 65 && maturity >= 62;
  // LAW 5 — RIPE is never CONFIRMED. LAW 4 — a single indicator never qualifies.
  const confirmed =
    ripe && confirmation >= 78 && supportCount >= 5 && danger < 48 && conflict < 55;

  let state: LiquidityState = "ABSENT";
  if (creation >= 25) state = "FORMING";
  if (creation >= 45) state = "BUILDING";
  if (maturity >= 62) state = "MATURE";
  if (absorption >= 55) state = "ABSORBING";
  if (exhaustion >= 68) state = "EXHAUSTING";
  if (ripe) state = "RIPE";
  if (release >= 78 && maturity >= 62) state = "RELEASED";
  if (confirmed) state = "CONFIRMED";
  // LAW 6 — conflicting evidence stays CONFLICTED, never forced.
  if (!confirmed && conflict >= 60 && law) state = "CONFLICTED";
  if (danger >= 78 || conflict >= 82) state = "BLOCKED";
  if (!law) state = "ABSENT";

  return {
    id: c.id,
    label: c.label,
    kind: c.kind,
    barrier: c.barrier,
    winShare: wf * 100,
    recentWin: rf * 100,
    wilsonLo: w.lo,
    wilsonHi: w.hi,
    bayesian: f.bayesian[c.id] ?? 0,
    creation,
    maturity,
    absorption,
    exhaustion,
    release,
    danger,
    conflict,
    confirmation,
    pressure,
    boundaryAttack,
    drift: drift * 100,
    run: wr.current,
    opposingRun: lr.current,
    hazard,
    dimensions,
    supportCount,
    state,
    law,
    ripe,
    confirmed,
  };
}

function analyzeParity(ds: number[], anomaly: number, fluctuation: number): ParityAnalysis {
  const n = Math.max(1, ds.length);
  const e = ds.filter(isEven).length / n;
  const o = 1 - e;
  const l = ds.filter(isLow).length / n;
  const h = 1 - l;
  const rec = ds.slice(-50);
  const rn = Math.max(1, rec.length);
  const er = rec.filter(isEven).length / rn;
  const lr = rec.filter(isLow).length / rn;
  const danger = clamp(anomaly * 0.4 + fluctuation * 0.3 + Math.abs(er - (1 - er)) * 120);
  return {
    even: { share: e * 100, recent: er * 100, pressure: clamp(50 + (er - e) * 250), danger },
    odd: { share: o * 100, recent: (1 - er) * 100, pressure: clamp(50 + (1 - er - o) * 250), danger },
    low: { share: l * 100, recent: lr * 100, pressure: clamp(50 + (lr - l) * 250) },
    high: { share: h * 100, recent: (1 - lr) * 100, pressure: clamp(50 + (1 - lr - h) * 250) },
    zones: {
      "LOW-EVEN": (ds.filter((d) => isLow(d) && isEven(d)).length / n) * 100,
      "LOW-ODD": (ds.filter((d) => isLow(d) && !isEven(d)).length / n) * 100,
      "HIGH-EVEN": (ds.filter((d) => isHigh(d) && isEven(d)).length / n) * 100,
      "HIGH-ODD": (ds.filter((d) => isHigh(d) && !isEven(d)).length / n) * 100,
    },
  };
}

export function analyzeMarket(history: Tick[]): MarketAnalysis | null {
  const ds = history.map((x) => x.d);
  if (ds.length < 30) return null;

  const w = Object.fromEntries(WINDOWS.map((n) => [n, ds.slice(-n)])) as Record<number, number[]>;
  const w1000 = w[1000] ?? ds;
  const w200 = w[200] ?? ds;
  const w50 = w[50] ?? ds;
  const w20 = w[20] ?? ds;

  const f1000 = freq(w1000);
  const f50 = freq(w50);
  const f20 = freq(w20);
  const ent1000 = normalizedEntropy(f1000);
  const ent20 = normalizedEntropy(f20);
  const js = jsd(f20, f1000);

  const low20 = mean(w20.map((x) => (isLow(x) ? 1 : 0)));
  const low1000 = mean(w1000.map((x) => (isLow(x) ? 1 : 0)));
  const zoneMomentum = (low20 - low1000) * 100;
  const parity20 = mean(w20.map((x) => (isEven(x) ? 1 : 0)));

  const trans = transition(w1000);
  const mi = mutualInformation(w1000);
  const ch = changePoint(w200.map((x) => (isLow(x) ? 0 : 1))).score;
  const ph = pageHinkley(w200.map((x) => (isLow(x) ? 0 : 1)));

  const fluctuation = clamp(
    Math.abs(ent20 - ent1000) * 2 +
      Math.abs(zoneMomentum) * 0.75 +
      Math.abs(parity20 - 0.5) * 100 +
      js * 120,
  );
  const ac = autocorr(ds.map((x) => x % 2));
  const anomaly = clamp(js * 170 + ch * 0.45 + ph * 0.25 + Math.abs(ac) * 80);
  const persistence = clamp((runs(ds, isLow).max + runs(ds, isHigh).max) * 3);
  const transitionStability = clamp(100 - mi * 80);
  const entropyShock = ent20 - ent1000;
  const regime = regimeOf(w200);
  const hmm = hmmProxy(w200);
  const psychology = psychologicalDigits(w50, w1000);
  const boundaries = boundaryStats(w1000);
  const sweep = detectSweep(ds.slice(-40), w1000);

  const regimeDanger = clamp(
    regime.change * 0.45 + (regime.state === "SHIFT" ? 35 : 0) + (100 - regime.entropy) * 0.2,
  );
  /** Structural-adversarial observable-pattern proxy (no intent claim). */
  const adversarial = clamp(
    js * 150 + sweep.intensity * 0.3 + regimeDanger * 0.25 + Math.abs(ac) * 70 + ph * 0.2,
  );

  const bayesian: Record<string, number> = {};
  const baseline: Record<ContractKind, Record<number, number>> = { OVER: {}, UNDER: {} };
  for (const c of CONTRACTS) {
    const k = w1000.filter((d) => contractMask(c.kind, c.barrier, d)).length;
    const post = bayes(k, w1000.length);
    bayesian[c.id] = post.mean * 100;
    baseline[c.kind][c.barrier] = post.mean;
  }

  const features: Features = {
    f1000,
    f20,
    f50,
    entropy: ent1000,
    entropyFast: ent20,
    entropyShock,
    jsd: js,
    zoneMomentum,
    fluctuation,
    anomaly,
    persistence,
    transitionStability,
    changePoint: ch,
    regimeDanger,
    digitMomentum: psychology.momentum,
    bayesian,
    baseline,
    sweep,
  };

  const contracts = CONTRACTS.map((c) => analyzeContract(ds, features, c));
  const parity = analyzeParity(ds, anomaly, fluctuation);
  const qualified = contracts.filter((x) => x.law).sort((a, b) => b.confirmation - a.confirmation);
  const top = qualified[0] ?? contracts[0]!;
  const lastTick = history[history.length - 1];
  const observationId = `${lastTick?.t ?? 0}-${lastTick?.q ?? 0}-${top.id}-${ANALYSIS_VERSION}`;

  return {
    sample: ds.length,
    last: ds[ds.length - 1] ?? 0,
    observationId,
    f1000,
    f20,
    f50,
    entropy: ent1000,
    entropyFast: ent20,
    entropyShock,
    jsd: js,
    low1000: low1000 * 100,
    high1000: (1 - low1000) * 100,
    low20: low20 * 100,
    high20: (1 - low20) * 100,
    even20: parity20 * 100,
    odd20: (1 - parity20) * 100,
    zoneMomentum,
    transition: trans,
    mi,
    conditionalEntropy: conditionalEntropy(w1000),
    changePoint: ch,
    pageHinkley: ph,
    fluctuation,
    anomaly,
    persistence,
    transitionStability,
    autocorr: ac,
    regime,
    regimeDanger,
    hmm,
    sweep,
    adversarial,
    boundaries,
    psychology,
    digitMomentum: psychology.momentum,
    lowHazard: hazardFunction(ds, isLow),
    highHazard: hazardFunction(ds, isHigh),
    parity,
    contracts,
    top,
    bayesian,
  };
}

export function makeExplanation(c: ContractAnalysis, a: MarketAnalysis): string[] {
  return [
    `Liquidity law: ${c.law ? "formation observed" : "no formation observed — no liquidity claimed"}.`,
    `Creation ${c.creation.toFixed(0)} · maturity ${c.maturity.toFixed(0)} · absorption ${c.absorption.toFixed(0)} · exhaustion ${c.exhaustion.toFixed(0)} · release ${c.release.toFixed(0)}.`,
    `Digit pressure ${c.pressure.toFixed(0)} with ${c.drift.toFixed(1)}% recent-vs-baseline drift; current run ${c.run} vs opposing ${c.opposingRun}.`,
    `Danger ${c.danger.toFixed(0)} · conflict ${c.conflict.toFixed(0)} · regime ${a.regime.state} · sweep ${a.sweep.active ? a.sweep.side : "none"}.`,
    `${c.supportCount}/7 independent dimensions support this structure. ${c.ripe && !c.confirmed ? "RIPE is not CONFIRMED." : ""}`.trim(),
    `Read as observed statistical structure only — not hidden order flow, not trader intent.`,
  ];
}
