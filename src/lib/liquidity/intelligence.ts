/**
 * Intelligence store (PHASE 2 + 12).
 *
 * DERIV TICK -> CANONICAL MARKET STATE -> SHARED FEATURE SNAPSHOT ->
 * CONTRACT PROJECTIONS -> OPPORTUNITY ENGINE -> UI
 *
 * Shared features are computed once per market per changed tick and reused by
 * every consumer. The UI subscribes read-only and never feeds data back.
 */

import { getFeed, type FeedSnapshot, type MarketState } from "./feed";
import { analyzeMarket, type MarketAnalysis } from "./engine";
import {
  EMPTY_OPPORTUNITY_SNAPSHOT,
  OpportunityStore,
  type OpportunitySnapshot,
} from "./opportunity";
import { getZoneRegistry, ZoneRegistry, type ZoneRegistrySnapshot } from "./zones";

export interface ComputedMarket extends MarketState {
  analysis: MarketAnalysis | null;
}

export interface IntelligenceSnapshot {
  version: number;
  feed: FeedSnapshot;
  markets: ComputedMarket[];
  opportunities: OpportunitySnapshot;
  zones: ZoneRegistrySnapshot;
  cycleMs: number;
  cycles: number;
}

const CYCLE_INTERVAL = 900;

class Intelligence {
  private store = new OpportunityStore();
  private zoneRegistry = getZoneRegistry();
  private listeners = new Set<() => void>();
  private cache = new Map<string, { stamp: string; analysis: MarketAnalysis | null }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private version = 0;
  private cycles = 0;
  private cycleMs = 0;
  private unsubscribeFeed: (() => void) | null = null;
  private pendingFeed: FeedSnapshot;
  snapshot: IntelligenceSnapshot;

  constructor() {
    const feed = getFeed();
    this.pendingFeed = feed.getSnapshot();
    this.snapshot = {
      version: 0,
      feed: this.pendingFeed,
      markets: this.pendingFeed.markets.map((m) => ({ ...m, analysis: null })),
      opportunities: EMPTY_OPPORTUNITY_SNAPSHOT,
      zones: this.zoneRegistry.snapshot,
      cycleMs: 0,
      cycles: 0,
    };
  }

  getSnapshot = (): IntelligenceSnapshot => this.snapshot;

  getServerSnapshot = (): IntelligenceSnapshot => this.snapshot;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    this.start();
    return () => {
      this.listeners.delete(fn);
      if (!this.listeners.size) this.stop();
    };
  };

  private start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    const feed = getFeed();
    this.unsubscribeFeed = feed.subscribe(() => {
      this.pendingFeed = feed.getSnapshot();
    });
    this.pendingFeed = feed.getSnapshot();
    this.timer = setInterval(() => this.cycle(), CYCLE_INTERVAL);
    this.cycle();
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubscribeFeed?.();
    this.unsubscribeFeed = null;
    this.started = false;
  }

  /** One analysis cycle over the whole universe. */
  private cycle() {
    const feed = getFeed();
    const t0 = performance.now();
    feed.reportEngine(true, this.cycleMs);
    const snap = this.pendingFeed;
    const markets: ComputedMarket[] = [];
    const activeKeys = new Set<string>();

    for (const m of snap.markets) {
      const latest = m.history[m.history.length - 1];
      const stamp = `${m.history.length}:${latest?.t ?? 0}:${latest?.q ?? 0}`;
      const cached = this.cache.get(m.symbol);
      // Shared feature computation is skipped entirely when the market has not
      // advanced since the previous cycle.
      const prevV3 = cached?.analysis?.v3Opportunities ?? {};
      const analysis =
        cached?.stamp === stamp ? cached.analysis : analyzeMarket(m.history, m.symbol, prevV3);
      if (cached?.stamp !== stamp) this.cache.set(m.symbol, { stamp, analysis });
      markets.push({ ...m, analysis });

      if (analysis) {
        this.store.ingest(m.symbol, m.name, m.group, analysis, latest?.t ?? 0);
        for (const c of analysis.contracts) {
          activeKeys.add(`${m.symbol}:${c.id}`);
          this.zoneRegistry.ingest(m.symbol, m.name, m.group, analysis, c, latest?.t ?? 0);
        }
      }
    }

    const opportunities = this.store.finalize(activeKeys);
    const zones = this.zoneRegistry.finalize();
    this.cycleMs = performance.now() - t0;
    this.cycles++;
    this.version++;
    feed.reportEngine(false, this.cycleMs);

    this.snapshot = {
      version: this.version,
      feed: snap,
      markets,
      opportunities,
      zones,
      cycleMs: this.cycleMs,
      cycles: this.cycles,
    };
    for (const fn of this.listeners) fn();
  }
}

let instance: Intelligence | null = null;

export function getIntelligence(): Intelligence {
  if (!instance) instance = new Intelligence();
  return instance;
}
