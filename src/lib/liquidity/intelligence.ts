/**
 * Production intelligence coordinator.
 *
 * Canonical production decision path:
 * DERIV FEED -> AUTHORITATIVE V4 -> RANK / QUALIFY -> UI
 *
 * Legacy opportunity/zone projections are retained only as read-only compatibility
 * data for the existing research tabs; they are not used for production ranking,
 * qualification, or selection.
 */

import { getFeed, type FeedSnapshot, type MarketState } from "./feed";
import { analyzeMarket, type MarketAnalysis } from "./engine";
import {
  EMPTY_OPPORTUNITY_SNAPSHOT,
  OpportunityStore,
  type OpportunitySnapshot,
} from "./opportunity";
import { getZoneRegistry, ZoneRegistry, type ZoneRegistrySnapshot } from "./zones";
import { analyzeAuthoritativeMarket, type AuthoritativeMarketAnalysis } from "./authoritative-v4";

export interface ComputedMarket extends MarketState {
  analysis: MarketAnalysis | null;
  authoritative: AuthoritativeMarketAnalysis | null;
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
  private cache = new Map<
    string,
    {
      stamp: string;
      analysis: MarketAnalysis | null;
      authoritative: AuthoritativeMarketAnalysis | null;
    }
  >();
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
  getZoneRegistry = (): ZoneRegistry => this.zoneRegistry;

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
    // The feed is owned by this production intelligence coordinator. When the
    // last UI subscriber disappears, stop all WebSocket/interval activity too.
    getFeed().stop();
    this.started = false;
  }

  private cycle() {
    const feed = getFeed();
    const t0 = performance.now();
    feed.reportEngine(true, this.cycleMs);
    const snap = this.pendingFeed;
    const markets: ComputedMarket[] = [];
    const activeKeys = new Set<string>();

    for (const m of snap.markets) {
      const latest = m.history[m.history.length - 1];
      const stamp = `${m.history.length}:${latest?.t ?? 0}:${latest?.q ?? 0}:${m.ticks}`;
      const cached = this.cache.get(m.symbol);
      const prevV3 = cached?.analysis?.v3Opportunities ?? {};
      const prevAuth = cached?.authoritative?.contracts
        ? Object.fromEntries(cached.authoritative.contracts.map((c) => [c.id, c]))
        : {};

      // Authoritative V4 is the production intelligence calculation. The legacy
      // analysis is retained solely to keep older research views operational.
      const analysis = cached?.stamp === stamp ? cached.analysis : analyzeMarket(m.history, m.symbol, prevV3);
      const authoritative =
        cached?.stamp === stamp
          ? cached.authoritative
          : analyzeAuthoritativeMarket(m.history, m.symbol, prevAuth, m.ticks);

      if (cached?.stamp !== stamp) this.cache.set(m.symbol, { stamp, analysis, authoritative });

      if (analysis && authoritative) analysis.authoritativeContracts = authoritative.contracts;
      markets.push({ ...m, analysis, authoritative });

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
