/**
 * Deriv public WebSocket market-data feed — canonical tick state (PHASE 1).
 *
 * Read-only: `active_symbols` validation, `ticks_history` bootstrap and `ticks`
 * live subscriptions for the 15-market universe. No authentication, no trading.
 *
 * Request correlation uses `req_id` (echo_req is only a fallback). The feed owns
 * bounded canonical tick state and is exposed as an external store; React
 * subscribes and never writes back.
 */

import {
  HISTORY_CAP,
  UNIVERSE,
  WS_LEGACY,
  WS_PRIMARY,
  getMarketPipSize,
  type MarketDef,
} from "./universe";
import { lastDigit } from "./math";
import type { Tick } from "./engine";

export type ConnectionState = "IDLE" | "CONNECTING" | "LIVE" | "DEGRADED" | "RECONNECTING";
export type MarketStatus = "WAITING" | "SEEDING" | "LIVE" | "STALE" | "UNAVAILABLE";
export type FeedHealth =
  "LIVE" | "ANALYSIS LAG" | "FEED STALE" | "ENGINE BUSY" | "BACKEND DEGRADED";

export interface MarketState extends MarketDef {
  history: Tick[];
  status: MarketStatus;
  last: number | null;
  epoch: number | null;
  ticks: number;
  lastTickAt: number | null;
  validated: boolean | null;
}

export interface FeedSnapshot {
  version: number;
  connection: ConnectionState;
  health: FeedHealth;
  endpoint: string;
  markets: MarketState[];
  seeded: number;
  live: number;
  stale: number;
  unavailable: number;
  validatedCount: number;
  ticksReceived: number;
  lastMessageAt: number | null;
  reconnects: number;
  symbolsChecked: boolean;
}

const EMIT_INTERVAL = 500;
const POLL_INTERVAL = 2_500;
const TICK_SILENCE_MS = 3_000;
const MARKET_STALE_MS = 20_000;

type PendingKind = "ACTIVE_SYMBOLS" | "HISTORY" | "SUBSCRIBE" | "PING";
interface Pending {
  kind: PendingKind;
  symbol?: string;
  at: number;
}

class DerivFeed {
  private socket: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private states = new Map<string, MarketState>();
  private connection: ConnectionState = "IDLE";
  private endpoint = WS_PRIMARY;
  private useLegacy = false;
  private reqId = 1000;
  private pending = new Map<number, Pending>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;
  private version = 0;
  private ticksReceived = 0;
  private reconnects = 0;
  private lastMessageAt: number | null = null;
  private started = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private lastStreamingTickAt = 0;
  private symbolsChecked = false;
  private engineBusy = false;
  private analysisLagMs = 0;
  private snapshot: FeedSnapshot;

  constructor() {
    for (const m of UNIVERSE) {
      this.states.set(m.symbol, {
        ...m,
        history: [],
        status: "WAITING",
        last: null,
        epoch: null,
        ticks: 0,
        lastTickAt: null,
        validated: null,
      });
    }
    this.snapshot = this.build();
  }

  /** The intelligence layer reports its own cycle cost so the UI can show honest health. */
  reportEngine(busy: boolean, lagMs: number) {
    this.engineBusy = busy;
    this.analysisLagMs = lagMs;
  }

  private health(markets: MarketState[]): FeedHealth {
    if (this.connection === "DEGRADED" || this.connection === "RECONNECTING")
      return "BACKEND DEGRADED";
    if (this.engineBusy) return "ENGINE BUSY";
    const alive = markets.filter((m) => m.status === "LIVE").length;
    if (!alive) return "FEED STALE";
    if (markets.filter((m) => m.status === "STALE").length > markets.length / 2)
      return "FEED STALE";
    if (this.analysisLagMs > 2_500) return "ANALYSIS LAG";
    return "LIVE";
  }

  private build(): FeedSnapshot {
    const now = Date.now();
    const markets = [...this.states.values()];
    for (const m of markets) {
      if (m.status === "LIVE" && m.lastTickAt && now - m.lastTickAt > MARKET_STALE_MS) {
        m.status = "STALE";
      }
    }
    return {
      version: this.version,
      connection: this.connection,
      health: this.health(markets),
      endpoint: this.endpoint,
      markets,
      seeded: markets.filter((m) => m.history.length > 0).length,
      live: markets.filter((m) => m.status === "LIVE").length,
      stale: markets.filter((m) => m.status === "STALE").length,
      unavailable: markets.filter((m) => m.status === "UNAVAILABLE").length,
      validatedCount: markets.filter((m) => m.validated === true).length,
      ticksReceived: this.ticksReceived,
      lastMessageAt: this.lastMessageAt,
      reconnects: this.reconnects,
      symbolsChecked: this.symbolsChecked,
    };
  }

  getSnapshot = (): FeedSnapshot => this.snapshot;

  getServerSnapshot = (): FeedSnapshot => this.snapshot;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    this.start();
    return () => {
      this.listeners.delete(fn);
    };
  };

  private emit(force = false) {
    if (!this.dirty && !force) return;
    this.dirty = false;
    this.version++;
    this.snapshot = this.build();
    for (const fn of this.listeners) fn();
  }

  private setConnection(state: ConnectionState) {
    this.connection = state;
    this.dirty = true;
    this.emit(true);
  }

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.emitTimer = setInterval(() => this.emit(true), EMIT_INTERVAL);
    // Keep WebSocket connection alive with periodic pings every 20 seconds
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === 1) {
        this.send(this.socket, { ping: 1 }, { kind: "PING", at: Date.now() });
      }
    }, 20_000);
    // Refresh history whenever live stream is silent so the analytics keep advancing
    this.pollTimer = setInterval(() => this.pollHistory(), POLL_INTERVAL);
    this.connect();
  }

  private send(socket: WebSocket, payload: Record<string, unknown>, pending: Pending) {
    const id = ++this.reqId;
    this.pending.set(id, pending);
    if (this.pending.size > 400) {
      // bounded correlation table — drop the oldest entries
      const cutoff = Date.now() - 60_000;
      for (const [k, v] of this.pending) if (v.at < cutoff) this.pending.delete(k);
    }
    try {
      socket.send(JSON.stringify({ ...payload, req_id: id }));
    } catch {
      /* socket closed mid-send */
    }
  }

  private pollHistory() {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return;
    if (Date.now() - this.lastTickAt < TICK_SILENCE_MS) return;
    this.requestHistory(socket, 20);
  }

  private requestHistory(socket: WebSocket, count = HISTORY_CAP) {
    for (const m of UNIVERSE) {
      const state = this.states.get(m.symbol);
      if (state?.status === "UNAVAILABLE") continue;
      const targetCount = state && state.history.length >= 100 ? count : HISTORY_CAP;
      this.send(
        socket,
        { ticks_history: m.symbol, count: targetCount, end: "latest", style: "ticks" },
        { kind: "HISTORY", symbol: m.symbol, at: Date.now() },
      );
    }
  }

  reconnect = () => {
    this.reconnects++;
    this.connect();
  };

  private connect() {
    if (typeof window === "undefined") return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      this.socket?.close();
    } catch {
      /* noop */
    }
    this.endpoint = this.useLegacy ? WS_LEGACY : WS_PRIMARY;
    this.setConnection("CONNECTING");

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.endpoint);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.setConnection("LIVE");
      this.send(
        socket,
        { active_symbols: "brief", product_type: "basic" },
        { kind: "ACTIVE_SYMBOLS", at: Date.now() },
      );
      this.requestHistory(socket);
      for (const m of UNIVERSE) {
        this.send(
          socket,
          { ticks: m.symbol, subscribe: 1 },
          { kind: "SUBSCRIBE", symbol: m.symbol, at: Date.now() },
        );
      }
      for (const s of this.states.values()) if (s.status === "WAITING") s.status = "SEEDING";
      this.dirty = true;
    };

    socket.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.lastMessageAt = Date.now();

      const reqId = Number(msg["req_id"] ?? 0);
      const pending = reqId ? this.pending.get(reqId) : undefined;
      if (reqId) this.pending.delete(reqId);

      if (msg["error"]) {
        // A rejected subscription must not freeze the market — history polling
        // continues to advance it.
        const symbol = pending?.symbol;
        if (symbol && pending?.kind === "HISTORY") {
          const state = this.states.get(symbol);
          if (state && !state.history.length) state.status = "UNAVAILABLE";
          this.dirty = true;
        }
        return;
      }

      if (msg["msg_type"] === "active_symbols") {
        const list = (msg["active_symbols"] as { symbol?: string }[] | undefined) ?? [];
        const available = new Set(list.map((x) => x.symbol));
        this.symbolsChecked = true;
        for (const state of this.states.values()) {
          // An empty/blocked active_symbols response must not disable the
          // universe — only mark validation when the response has content.
          state.validated = available.size ? available.has(state.symbol) : null;
        }
        this.dirty = true;
        return;
      }

      if (msg["msg_type"] === "history") {
        const echo = msg["echo_req"] as { ticks_history?: string } | undefined;
        const symbol = pending?.symbol ?? echo?.ticks_history;
        const history = msg["history"] as
          { prices?: (number | string)[]; times?: number[] } | undefined;
        const prices = history?.prices ?? [];
        const times = history?.times ?? [];
        if (!symbol || !prices.length) return;
        const state = this.states.get(symbol);
        if (!state) return;

        const pipSize =
          typeof msg["pip_size"] === "number"
            ? (msg["pip_size"] as number)
            : (state.pip_size ?? getMarketPipSize(symbol));
        state.pip_size = pipSize;

        const bootstrap: Tick[] = prices.map((q, i) => {
          const numQ = Number(q);
          return {
            q: numQ,
            d: lastDigit(numQ, pipSize),
            t: Number(times[i] ?? 0),
          };
        });
        const prevLastTime = state.history[state.history.length - 1]?.t ?? 0;
        const lastBootstrapTime = bootstrap[bootstrap.length - 1]?.t ?? 0;
        const newer = state.history.filter((t) => t.t > lastBootstrapTime);
        const merged = [...bootstrap, ...newer].slice(-HISTORY_CAP);
        const newTicks =
          prevLastTime === 0 ? merged.length : merged.filter((t) => t.t > prevLastTime).length;
        state.history = merged;
        const latest = merged[merged.length - 1];
        state.last = latest?.q ?? null;
        state.epoch = latest?.t ?? null;
        state.status = "LIVE";
        if (newTicks > 0) {
          state.ticks += newTicks;
          this.ticksReceived += newTicks;
          state.lastTickAt = Date.now();
          this.lastTickAt = Date.now();
        }
        this.dirty = true;
        return;
      }

      if (msg["msg_type"] === "tick") {
        const tick = msg["tick"] as
          | { symbol?: string; quote?: number | string; epoch?: number; pip_size?: number }
          | undefined;
        const symbol = tick?.symbol ?? pending?.symbol;
        if (!symbol || !tick) return;
        const state = this.states.get(symbol);
        if (!state) return;
        const q = Number(tick.quote);
        if (!Number.isFinite(q)) return;
        const pipSize =
          typeof tick.pip_size === "number"
            ? tick.pip_size
            : (state.pip_size ?? getMarketPipSize(symbol));
        state.pip_size = pipSize;
        const epoch = Number(tick.epoch ?? 0);
        if (state.history[state.history.length - 1]?.t === epoch) return;
        state.history = [
          ...state.history,
          { q, d: lastDigit(tick.quote ?? q, pipSize), t: epoch },
        ].slice(-HISTORY_CAP);
        state.last = q;
        state.epoch = epoch;
        state.status = "LIVE";
        state.ticks++;
        state.lastTickAt = Date.now();
        this.ticksReceived++;
        this.lastTickAt = Date.now();
        this.dirty = true;
      }
    };

    socket.onerror = () => {
      this.setConnection("DEGRADED");
    };

    socket.onclose = () => {
      this.useLegacy = !this.useLegacy; // fail over between endpoints
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    this.setConnection("RECONNECTING");
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 2500);
  }

  stop() {
    if (this.emitTimer) clearInterval(this.emitTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      this.socket?.close();
    } catch {
      /* noop */
    }
    this.started = false;
  }
}

let instance: DerivFeed | null = null;

export function getFeed(): DerivFeed {
  if (!instance) instance = new DerivFeed();
  return instance;
}
