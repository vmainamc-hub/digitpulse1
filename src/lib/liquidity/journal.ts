/**
 * Research / observation journal.
 *
 * Immutable observation records keyed by observation ID. Persisted locally so a
 * continuous monitoring session survives a reload. Nothing is auto-traded and
 * nothing is fed back into production intelligence.
 */

import { ANALYSIS_VERSION } from "./universe";
import type { ContractAnalysis, MarketAnalysis } from "./engine";
import type { AuthoritativeContract, AuthoritativeMarketAnalysis } from "./authoritative-v4";

export interface Observation {
  id: string;
  createdAt: number;
  symbol: string;
  market: string;
  contract: string;
  state: string;
  confirmation: number;
  creation: number;
  maturity: number;
  release: number;
  danger: number;
  conflict: number;
  supportCount: number;
  regime: string;
  sweep: string;
  entropy: number;
  sample: number;
  note: string;
  version: string;
}

const KEY = "li.journal.v1";
const CAP = 400;

let cache: Observation[] | null = null;
const listeners = new Set<() => void>();
const EMPTY_OBSERVATIONS: Observation[] = [];
let snapshot: Observation[] = [];

function load(): Observation[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Observation[]) : [];
  } catch {
    cache = [];
  }
  snapshot = cache;
  return cache;
}

function persist(next: Observation[]) {
  cache = next.slice(0, CAP);
  snapshot = cache;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* memory-only fallback */
  }
  for (const fn of listeners) fn();
}

function makeObservation(
  symbol: string,
  market: string,
  analysisId: string,
  sample: number,
  contract: Pick<
    AuthoritativeContract,
    | "id"
    | "label"
    | "state"
    | "confirmation"
    | "maturity"
    | "release"
    | "danger"
    | "conflict"
    | "liquidityLevel"
    | "accumulatedLiquidity"
    | "supportCount"
  > &
    Partial<Pick<AuthoritativeContract, "creation">>,
  note: string,
  extra: { regime: string; sweep: string; entropy: number },
): Observation {
  return {
    id: `${analysisId}-${contract.id}`,
    createdAt: Date.now(),
    symbol,
    market,
    contract: contract.label,
    state: contract.state,
    confirmation: Math.round(contract.confirmation),
    creation: Math.round(contract.creation ?? 0),
    maturity: Math.round(contract.maturity),
    release: Math.round(contract.release),
    danger: Math.round(contract.danger),
    conflict: Math.round(contract.conflict),
    supportCount: contract.supportCount ?? 0,
    regime: extra.regime,
    sweep: extra.sweep,
    entropy: Math.round(extra.entropy),
    sample,
    note,
    version: ANALYSIS_VERSION,
  };
}

export const journal = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    load();
    return () => listeners.delete(fn);
  },
  getSnapshot(): Observation[] {
    load();
    return snapshot;
  },
  getServerSnapshot(): Observation[] {
    return EMPTY_OBSERVATIONS;
  },

  /** Legacy compatibility only; no live production caller uses this path. */
  record(
    symbol: string,
    market: string,
    analysis: MarketAnalysis,
    contract: ContractAnalysis,
    note: string,
  ): Observation | null {
    const existing = load();
    const id = `${analysis.observationId}-${contract.id}`;
    if (existing.some((o) => o.id === id)) return null;
    const obs: Observation = {
      id,
      createdAt: Date.now(),
      symbol,
      market,
      contract: contract.label,
      state: contract.state,
      confirmation: Math.round(contract.confirmation),
      creation: Math.round(contract.creation),
      maturity: Math.round(contract.maturity),
      release: Math.round(contract.release),
      danger: Math.round(contract.danger),
      conflict: Math.round(contract.conflict),
      supportCount: contract.supportCount,
      regime: analysis.regime.state,
      sweep: analysis.sweep.active ? analysis.sweep.side : "NONE",
      entropy: Math.round(analysis.entropy),
      sample: analysis.sample,
      note,
      version: ANALYSIS_VERSION,
    };
    persist([obs, ...existing]);
    return obs;
  },

  /** Canonical UI journal entry sourced only from the authoritative production contract. */
  recordAuthoritative(
    symbol: string,
    market: string,
    analysis: AuthoritativeMarketAnalysis,
    contract: AuthoritativeContract,
    note: string,
  ): Observation | null {
    const existing = load();
    const id = `${symbol}:${analysis.tickCount}:${contract.id}`;
    if (existing.some((o) => o.id === id)) return null;
    const obs = makeObservation(symbol, market, id, analysis.sample, contract, note, {
      regime: contract.qualificationStatus,
      sweep:
        contract.state === "RELEASE" || contract.state === "RELEASE_WATCH" ? "RELEASE" : "NONE",
      entropy: contract.entropyVelocity ?? 0,
    });
    persist([obs, ...existing]);
    return obs;
  },

  clear() {
    persist([]);
  },
  toCsv(): string {
    const rows = load();
    const head = [
      "id",
      "createdAt",
      "symbol",
      "market",
      "contract",
      "state",
      "confirmation",
      "creation",
      "maturity",
      "release",
      "danger",
      "conflict",
      "supportCount",
      "regime",
      "sweep",
      "entropy",
      "sample",
      "note",
      "version",
    ];
    const body = rows.map((r) =>
      head
        .map((k) => {
          const v = (r as unknown as Record<string, unknown>)[k];
          const s = k === "createdAt" ? new Date(r.createdAt).toISOString() : String(v ?? "");
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(","),
    );
    return [head.join(","), ...body].join("\n");
  },
};
