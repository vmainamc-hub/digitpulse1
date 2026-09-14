/**
 * Stability/hardening facade around the authoritative liquidity engine.
 * It does not replace Sentinel psychology or ranking formulas. It adds
 * persistent observation bookkeeping, lifecycle hysteresis and scan policy.
 */
import {
  LiquidityIntelligenceEngine,
  type EngineSnapshot,
  type Lifecycle,
  type RankedFormation,
  type ScanSnapshot,
  type Tick,
} from './authoritative-engine';

const ORDER: Lifecycle[] = [
  'NO_LIQUIDITY','FORMING','BUILDING','MATURE','EXHAUSTION_WATCH',
  'EXHAUSTION_CONFIRMED','DELIVERY','DELIVERY_ACCELERATING','ABSORBING',
  'RELEASE_WATCH','RELEASE','RIPE','CONFIRMED'
];
const rankOf = (p: Lifecycle) => ORDER.indexOf(p);
const clamp = (x:number,a=0,b=100) => Math.max(a, Math.min(b, x));

export class HardenedLiquidityIntelligenceEngine {
  private readonly core = new LiquidityIntelligenceEngine();
  private lastSnapshot: EngineSnapshot = this.core.snapshot();
  private birthRaw = new Map<string, number>();
  private birthAt = new Map<string, number>();
  private phaseCandidate = new Map<string, { phase: Lifecycle; count: number }>();
  private selectedId: string | null = null;
  private selectedAt = 0;
  private scanHistory: ScanSnapshot[] = [];
  private version = 0;

  update(markets: Record<string, Tick[]>) {
    const raw = this.core.update(markets);
    const formations = raw.formations.map(f => this.hardenFormation(f, markets[f.market] || []));
    this.version++;
    const processed: EngineSnapshot = {
      ...raw, formations,
      scanned: this.lastSnapshot.scanned,
      scanHistory: this.scanHistory.slice(-30), version: this.version,
    };

    // Background observation never changes the selected scan merely because a tick arrived.
    // Only a deliberate scan or the 60-second superior-candidate rule may replace it.
    if (this.selectedId && this.selectedAt > 0) {
      const selected = formations.find(f => f.id === this.selectedId);
      const top = formations[0];
      if (selected && top && top.id !== selected.id && Date.now() - this.selectedAt >= 60000) {
        const a = this.quality(top), b = this.quality(selected);
        if (a - b >= 12) {
          const scan = this.makeScan(formations, true,
            `${top.id} materially exceeds the selected formation after 60s: quality ${a.toFixed(1)} vs ${b.toFixed(1)}`);
          this.selectedId = top.id; this.selectedAt = scan.scannedAt;
          this.scanHistory.push(scan); processed.scanned = scan;
          processed.scanHistory = this.scanHistory.slice(-30);
        }
      }
    }
    this.lastSnapshot = processed;
    return processed;
  }

  scan() {
    const raw = this.core.scan();
    const formations = raw.formations.map(f => this.hardenFormation(f, []));
    const scan = this.makeScan(formations, false, 'Manual scan: highest-ranked formation at scan time.');
    this.selectedId = scan.rank1?.id || null; this.selectedAt = scan.scannedAt;
    this.scanHistory.push(scan);
    const out: EngineSnapshot = {
      ...raw, formations, scanned: scan,
      scanHistory: this.scanHistory.slice(-30), version: ++this.version,
    };
    this.lastSnapshot = out;
    return out;
  }

  snapshot() { return this.lastSnapshot; }

  private hardenFormation(input: RankedFormation, ticks: Tick[]): RankedFormation {
    const f: RankedFormation = {
      ...input,
      trajectory: { ...input.trajectory },
      evidence: [...input.evidence],
      history: [...input.history],
    };
    const key = f.id, n = ticks.length;
    if (!this.birthRaw.has(key)) {
      this.birthRaw.set(key, Math.max(0, n - 1));
      const t = ticks[Math.max(0, n - 1)]?.t;
      this.birthAt.set(key, typeof t === 'number' && t > 0 ? t * 1000 : Date.now());
    }
    const born = this.birthRaw.get(key) ?? 0;
    f.ageTicks = Math.max(0, n ? n - born : f.ageTicks);
    f.birthTick = born;
    f.birthAt = this.birthAt.get(key) ?? f.birthAt;

    const prior = this.lastSnapshot.formations.find(x => x.id === key);
    if (!prior) return f;

    const prevRank = rankOf(prior.phase), nextRank = rankOf(f.phase);
    if (nextRank !== prevRank) {
      const state = this.phaseCandidate.get(key);
      const same = state?.phase === f.phase ? state.count + 1 : 1;
      this.phaseCandidate.set(key, { phase: f.phase, count: same });
      const scoreDrop = prior.confirmationScore - f.confirmationScore;
      const regression = nextRank >= 0 && prevRank >= 0 && nextRank < prevRank;
      const severe = regression && (scoreDrop >= 12 || f.conflictScore >= 80 || f.vetoes.length > prior.vetoes.length + 1);
      if (regression && !(severe && same >= 3)) f.phase = prior.phase;
      else if (!regression && same < 2) f.phase = prior.phase;
    } else this.phaseCandidate.delete(key);

    // Confirmation is deliberately harder than RIPE.
    if (prior.phase === 'CONFIRMED') {
      const canKeep = f.confirmationScore >= 72 && f.evidenceQuality >= 65 &&
        f.evidencePersistence >= 55 && f.structuralCoherence >= 60 &&
        f.conflictScore < 55 && f.trajectory.direction !== 'WEAKENING';
      if (canKeep || f.ageTicks < 3) f.phase = 'CONFIRMED';
    } else if (f.phase === 'RIPE') {
      const ready = f.confirmationScore >= 80 && f.evidenceQuality >= 70 &&
        f.evidencePersistence >= 60 && f.structuralCoherence >= 65 &&
        f.conflictScore < 35 && f.trajectory.direction !== 'WEAKENING' && f.vetoes.length === 0;
      const state = this.phaseCandidate.get(key);
      if (ready && state?.phase === 'RIPE' && state.count >= 3) f.phase = 'CONFIRMED';
    }
    return f;
  }

  private quality(f: RankedFormation) {
    return clamp(
      f.rankScore * .42 + f.evidenceQuality * .16 + f.evidencePersistence * .14 +
      f.structuralCoherence * .12 + f.trajectory.consistency * .07 +
      Math.min(100, f.ageTicks / 3) * .05 +
      (f.trajectory.direction === 'STRENGTHENING' ? 6 : f.trajectory.direction === 'WEAKENING' ? -8 : 0) -
      f.conflictScore * .10
    );
  }

  private makeScan(forms: RankedFormation[], override: boolean, reason: string): ScanSnapshot {
    const candidates = forms
      .filter(f => f.active && f.phase !== 'NO_LIQUIDITY')
      .sort((a,b) => b.rankScore - a.rankScore)
      .map((f,i) => ({ ...f, rank: i + 1 }));
    return {
      id: `SCAN-${Date.now()}-${this.scanHistory.length + 1}`,
      scannedAt: Date.now(), rank1: candidates[0] || null,
      bestQualified: candidates.find(f => f.qualified) || null,
      candidates, override, overrideReason: reason,
    };
  }
}
