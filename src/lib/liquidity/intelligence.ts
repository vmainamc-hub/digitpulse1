/**
 * Production intelligence coordinator.
 *
 * SINGLE CANONICAL PRODUCTION PATH:
 * DERIV FEED -> AUTHORITATIVE V4 -> PRODUCTION CONTRACT -> RANK / QUALIFY -> UI
 *
 * The legacy engine, scanner and opportunity/zone writers are deliberately not
 * executed from the live production cycle. Existing UI compatibility fields remain
 * present so research surfaces can migrate without creating a second decision path.
 */

import { getFeed, type FeedSnapshot, type MarketState } from "./feed";
import { EMPTY_OPPORTUNITY_SNAPSHOT, type OpportunitySnapshot } from "./opportunity";
import { getZoneRegistry, type ZoneRegistrySnapshot } from "./zones";
import { analyzeAuthoritativeProductionMarket } from "./authoritative-production";
import type { MarketAnalysis } from "./engine";
import type { AuthoritativeMarketAnalysis } from "./authoritative-v4";

export interface ComputedMarket extends MarketState {
  /** Compatibility-only field. Production decisions never read this legacy analysis. */
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
  private zoneRegistry = getZoneRegistry();
  private listeners = new Set<() => void>();
  private cache = new Map<
    string,
    { stamp: string; authoritative: AuthoritativeMarketAnalysis | null }
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
      markets: this.pendingFeed.markets.map((m) => ({ ...m, analysis: null, authoritative: null })),
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
    getFeed().stop();
    this.started = false;
  }

  private cycle() {
    const feed = getFeed();
    const t0 = performance.now();
    feed.reportEngine(true, this.cycleMs);
    const snap = this.pendingFeed;
    const markets: ComputedMarket[] = [];

    for (const m of snap.markets) {
      const latest = m.history[m.history.length - 1];
      const stamp = `${m.history.length}:${latest?.t ?? 0}:${latest?.q ?? 0}:${m.ticks}`;
      const cached = this.cache.get(m.symbol);
      const prevAuth = cached?.authoritative?.contracts
        ? Object.fromEntries(cached.authoritative.contracts.map((c) => [c.id, c]))
        : {};

      const authoritative =
        cached?.stamp === stamp
          ? cached.authoritative
          : analyzeAuthoritativeProductionMarket(m.history, m.symbol, m.ticks, prevAuth);

      if (cached?.stamp !== stamp) {
        this.cache.set(m.symbol, { stamp, authoritative });
      }

      markets.push({
        ...m,
        // Never run the legacy engine here. It is no longer a competing production path.
        analysis: null,
        authoritative,
      });
    }

    this.cycleMs = performance.now() - t0;
    this.cycles++;
    this.version++;
    feed.reportEngine(false, this.cycleMs);

    this.snapshot = {
      version: this.version,
      feed: snap,
      markets,
      opportunities: EMPTY_OPPORTUNITY_SNAPSHOT,
      zones: this.zoneRegistry.snapshot,
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
