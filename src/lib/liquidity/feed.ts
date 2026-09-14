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

export type PendingKind = "ACTIVE_SYMBOLS" | "HISTORY" | "SUBSCRIBE" | "PING";
export interface Pending {
  kind: PendingKind;
  symbol?: string;
  at: number;
}

export interface CorrelationMatch {
  matchedBy: "req_id" | "echo_req" | "none";
  reqId?: number;
  symbol?: string;
  kind?: PendingKind;
}

/**
 * Pure request correlation: prefers req_id over assuming echo_req is always available.
 */
export function correlateFeedMessage(
  msg: Record<string, unknown>,
  pending: Map<number, Pending>,
): CorrelationMatch {
  const reqId = Number(msg["req_id"] ?? 0);
  if (reqId && pending.has(reqId)) {
    const item = pending.get(reqId)!;
    return {
      matchedBy: "req_id",
      reqId,
      symbol: item.symbol,
      kind: item.kind,
    };
  }

  const echo = msg["echo_req"] as Record<string, unknown> | undefined;
  if (echo) {
    const symbol =
      (typeof echo["ticks_history"] === "string" ? echo["ticks_history"] : undefined) ??
      (typeof echo["ticks"] === "string" ? echo["ticks"] : undefined);
    return {
      matchedBy: "echo_req",
      symbol,
    };
  }

  return { matchedBy: "none" };
}

/**
 * Validates a tick payload from the WebSocket stream.
 */
export function validateFeedTick(raw: unknown): {
  valid: boolean;
  symbol?: string;
  quote?: number;
  epoch?: number;
  pipSize?: number;
} {
  if (!raw || typeof raw !== "object") return { valid: false };
  const t = raw as Record<string, unknown>;
  const symbol = typeof t["symbol"] === "string" ? t["symbol"] : undefined;
  const quote = Number(t["quote"]);
  const epoch = Number(t["epoch"] ?? 0);
  const pipSize = typeof t["pip_size"] === "number" ? t["pip_size"] : undefined;

  if (!symbol || !UNIVERSE.some((m) => m.symbol === symbol)) {
    return { valid: false };
  }
  if (!Number.isFinite(quote) || !Number.isFinite(epoch) || epoch <= 0) {
    return { valid: false };
  }

  return { valid: true, symbol, quote, epoch, pipSize };
}

/**
 * Validates a history payload from the WebSocket stream.
 */
export function validateHistoryPayload(raw: unknown): {
  valid: boolean;
  prices: number[];
  times: number[];
} {
  if (!raw || typeof raw !== "object") return { valid: false, prices: [], times: [] };
  const h = raw as Record<string, unknown>;
  const rawPrices = Array.isArray(h["prices"]) ? h["prices"] : [];
  const rawTimes = Array.isArray(h["times"]) ? h["times"] : [];

  if (rawPrices.length === 0 || rawPrices.length !== rawTimes.length) {
    return { valid: false, prices: [], times: [] };
  }

  const prices: number[] = [];
  const times: number[] = [];
  let lastTime = -1;

  for (let i = 0; i < rawPrices.length; i++) {
    const p = Number(rawPrices[i]);
    const tm = Number(rawTimes[i]);
    if (Number.isFinite(p) && Number.isFinite(tm) && tm > 0) {
      if (tm > lastTime) {
        prices.push(p);
        times.push(tm);
        lastTime = tm;
      }
    }
  }

  if (prices.length === 0) return { valid: false, prices: [], times: [] };
  return { valid: true, prices, times };
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

      const correlation = correlateFeedMessage(msg, this.pending);
      if (correlation.reqId) {
        this.pending.delete(correlation.reqId);
      }

      if (msg["error"]) {
        // A rejected subscription must not freeze the market — history polling
        // continues to advance it.
        const symbol = correlation.symbol;
        if (symbol && correlation.kind === "HISTORY") {
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
        const historyValidation = validateHistoryPayload(msg["history"]);
        const symbol = correlation.symbol;
        if (!symbol || !historyValidation.valid) return;
        const state = this.states.get(symbol);
        if (!state) return;

        const pipSize =
          typeof msg["pip_size"] === "number"
            ? (msg["pip_size"] as number)
            : (state.pip_size ?? getMarketPipSize(symbol));
        state.pip_size = pipSize;

        const { prices, times } = historyValidation;
        const bootstrap: Tick[] = prices.map((q, i) => ({
          q,
          d: lastDigit(q, pipSize),
          t: times[i],
        }));

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
        const tickValidation = validateFeedTick(msg["tick"]);
        const symbol = tickValidation.symbol ?? correlation.symbol;
        if (!symbol || !tickValidation.valid) return;
        const state = this.states.get(symbol);
        if (!state) return;

        const q = tickValidation.quote!;
        const epoch = tickValidation.epoch!;
        const pipSize = tickValidation.pipSize ?? state.pip_size ?? getMarketPipSize(symbol);
        state.pip_size = pipSize;

        const prevEpoch = state.history[state.history.length - 1]?.t ?? 0;
        // Strictly ignore duplicate or out-of-order ticks
        if (epoch <= prevEpoch) return;

        state.history = [...state.history, { q, d: lastDigit(q, pipSize), t: epoch }].slice(
          -HISTORY_CAP,
        );
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
    // Exponential backoff with ceiling to prevent runaway reconnect loops
    const backoffMs = Math.min(15_000, 1500 * Math.pow(1.5, Math.min(6, this.reconnects)));
    this.reconnectTimer = setTimeout(() => this.connect(), backoffMs);
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
