/**
 * Deriv public WebSocket market-data feed.
 *
 * Read-only: `ticks_history` bootstrap (1000 ticks) + `ticks` live subscription
 * for the full 15-market universe. No authentication, no trading calls.
 *
 * The feed owns canonical bounded tick state. It is an external store; React
 * subscribes to it and never writes back.
 */

import { HISTORY_CAP, UNIVERSE, WS_LEGACY, WS_PRIMARY, type MarketDef } from "./universe";
import { lastDigit } from "./math";
import type { Tick } from "./engine";

export type ConnectionState = "IDLE" | "CONNECTING" | "LIVE" | "DEGRADED" | "RECONNECTING";
export type MarketStatus = "WAITING" | "SEEDING" | "LIVE" | "STALE";

export interface MarketState extends MarketDef {
  history: Tick[];
  status: MarketStatus;
  last: number | null;
  epoch: number | null;
  ticks: number;
}

export interface FeedSnapshot {
  version: number;
  connection: ConnectionState;
  endpoint: string;
  markets: MarketState[];
  seeded: number;
  live: number;
  ticksReceived: number;
  lastMessageAt: number | null;
  reconnects: number;
}

const EMIT_INTERVAL = 500;
const POLL_INTERVAL = 4_000;
const TICK_SILENCE_MS = 8_000;

class DerivFeed {
  private socket: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private states = new Map<string, MarketState>();
  private connection: ConnectionState = "IDLE";
  private endpoint = WS_PRIMARY;
  private useLegacy = false;
  private reqId = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;
  private version = 0;
  private ticksReceived = 0;
  private reconnects = 0;
  private lastMessageAt: number | null = null;
  private started = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
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
      });
    }
    this.snapshot = this.build();
  }

  private build(): FeedSnapshot {
    const markets = [...this.states.values()];
    return {
      version: this.version,
      connection: this.connection,
      endpoint: this.endpoint,
      markets,
      seeded: markets.filter((m) => m.history.length > 0).length,
      live: markets.filter((m) => m.status === "LIVE").length,
      ticksReceived: this.ticksReceived,
      lastMessageAt: this.lastMessageAt,
      reconnects: this.reconnects,
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
    this.emitTimer = setInterval(() => this.emit(), EMIT_INTERVAL);
    // Some networks/regions reject the streaming `ticks` subscription while
    // `ticks_history` still resolves. Refresh history on a timer whenever the
    // live stream is silent so the analytics keep advancing.
    this.pollTimer = setInterval(() => this.pollHistory(), POLL_INTERVAL);
    this.connect();
  }

  private pollHistory() {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return;
    if (Date.now() - this.lastTickAt < TICK_SILENCE_MS) return;
    this.requestHistory(socket);
  }

  private requestHistory(socket: WebSocket) {
    for (const m of UNIVERSE) {
      socket.send(
        JSON.stringify({
          ticks_history: m.symbol,
          count: HISTORY_CAP,
          end: "latest",
          style: "ticks",
          req_id: ++this.reqId,
        }),
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
      for (const m of UNIVERSE) {
        socket.send(
          JSON.stringify({
            ticks_history: m.symbol,
            count: HISTORY_CAP,
            end: "latest",
            style: "ticks",
            req_id: ++this.reqId,
          }),
        );
        socket.send(JSON.stringify({ ticks: m.symbol, subscribe: 1, req_id: ++this.reqId }));
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
      if (msg["error"]) return;

      if (msg["msg_type"] === "history") {
        const echo = msg["echo_req"] as { ticks_history?: string } | undefined;
        const symbol = echo?.ticks_history;
        const history = msg["history"] as { prices?: number[]; times?: number[] } | undefined;
        const prices = history?.prices ?? [];
        const times = history?.times ?? [];
        if (!symbol || !prices.length) return;
        const state = this.states.get(symbol);
        if (!state) return;
        const bootstrap: Tick[] = prices.map((q, i) => ({
          q: Number(q),
          d: lastDigit(q),
          t: Number(times[i] ?? 0),
        }));
        // Keep any live ticks that arrived before the bootstrap resolved.
        const lastBootstrapTime = bootstrap[bootstrap.length - 1]?.t ?? 0;
        const newer = state.history.filter((t) => t.t > lastBootstrapTime);
        state.history = [...bootstrap, ...newer].slice(-HISTORY_CAP);
        const latest = state.history[state.history.length - 1];
        state.last = latest?.q ?? null;
        state.epoch = latest?.t ?? null;
        state.status = "LIVE";
        this.dirty = true;
        return;
      }

      if (msg["msg_type"] === "tick") {
        const tick = msg["tick"] as { symbol?: string; quote?: number; epoch?: number } | undefined;
        if (!tick?.symbol) return;
        const state = this.states.get(tick.symbol);
        if (!state) return;
        const q = Number(tick.quote);
        if (!Number.isFinite(q)) return;
        state.history = [...state.history, { q, d: lastDigit(tick.quote ?? q), t: Number(tick.epoch ?? 0) }].slice(
          -HISTORY_CAP,
        );
        state.last = q;
        state.epoch = Number(tick.epoch ?? 0);
        state.status = "LIVE";
        state.ticks++;
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
