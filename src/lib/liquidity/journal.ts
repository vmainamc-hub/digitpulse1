/**
 * Research / observation journal.
 *
 * Immutable observation records keyed by observation ID. Persisted locally so a
 * continuous monitoring session survives a reload. Nothing is auto-traded and
 * nothing is fed back into the engine.
 */

import { ANALYSIS_VERSION } from "./universe";
import type { ContractAnalysis, MarketAnalysis } from "./engine";

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
    /* storage unavailable — journal stays in memory */
  }
  for (const fn of listeners) fn();
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
    return [];
  },
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
