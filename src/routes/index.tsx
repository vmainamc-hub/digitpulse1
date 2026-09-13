import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { ANALYSIS_VERSION } from "@/lib/liquidity/universe";
import { useIntelligence, useJournal } from "@/lib/liquidity/useIntelligence";
import { getFeed } from "@/lib/liquidity/feed";
import { journal } from "@/lib/liquidity/journal";
import { MarketRail } from "@/components/li/MarketRail";
import { StateTag } from "@/components/li/primitives";
import { LedgerView, RadarView } from "@/components/li/radar";
import {
  DangerView,
  LiquidityView,
  MatrixView,
  PsychologyView,
  ResearchView,
} from "@/components/li/views";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Deriv Liquidity Intelligence — Live Digit Microstructure Research" },
      {
        name: "description",
        content:
          "Read-only research console measuring observable digit psychology, entropy, regime and liquidity-lifecycle structure across 15 live Deriv synthetic markets.",
      },
      { property: "og:title", content: "Deriv Liquidity Intelligence" },
      {
        property: "og:description",
        content:
          "Live statistical and psychological liquidity-formation analysis across 15 Deriv synthetic markets. Observation only — no trading logic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Console,
});

const TABS = [
  ["RADAR", "Opportunity radar"],
  ["LEDGER", "Event ledger"],
  ["LIQUIDITY", "Liquidity"],
  ["PSYCHOLOGY", "Psychology"],
  ["DANGER", "Danger lab"],
  ["MATRIX", "Contract matrix"],
  ["RESEARCH", "Research core"],
] as const;

type Tab = (typeof TABS)[number][0];

function Console() {
  const { snapshot, markets, opportunities, cycleMs } = useIntelligence();
  const observations = useJournal();
  const [selected, setSelected] = useState("R_75");
  const [tab, setTab] = useState<Tab>("RADAR");
  const [contractFocus, setContractFocus] = useState("");
  const [railOpen, setRailOpen] = useState(false);

  const current = markets.find((m) => m.symbol === selected) ?? markets[0];
  const analysis = current?.analysis ?? null;

  const confirmed = useMemo(
    () =>
      markets
        .flatMap((m) =>
          (m.analysis?.contracts ?? []).map((c) => ({ ...c, market: m.name, symbol: m.symbol })),
        )
        .filter((c) => c.state === "CONFIRMED")
        .sort((a, b) => b.confirmation - a.confirmation)
        .slice(0, 6),
    [markets],
  );

  const record = () => {
    if (!analysis || !current) return;
    const c = analysis.contracts.find((x) => x.id === contractFocus) ?? analysis.top;
    journal.record(current.symbol, current.name, analysis, c, "Manual observation");
  };

  const exportCsv = () => {
    const blob = new Blob([journal.toCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liquidity-observations-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded bg-signal/15 font-mono text-xs font-semibold text-signal">
              LI
            </div>
            <div>
              <h1 className="text-sm leading-tight font-semibold tracking-tight">
                Deriv Liquidity Intelligence
              </h1>
              <p className="mono-label">Observable microstructure research · read-only</p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="mono-label flex items-center gap-1.5 rounded border border-border px-2 py-1">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  snapshot.connection === "LIVE" ? "live-dot bg-calm" : "bg-caution",
                )}
                aria-hidden
              />
              {snapshot.connection}
            </span>
            <span className="mono-label rounded border border-border px-2 py-1">
              {snapshot.seeded}/15 seeded
            </span>
            <span className="mono-label rounded border border-border px-2 py-1">
              {snapshot.ticksReceived} live ticks
            </span>
            <span className="mono-label rounded border border-border px-2 py-1">
              {snapshot.health}
            </span>
            <span className="mono-label rounded border border-border px-2 py-1">
              cycle {cycleMs.toFixed(0)}ms
            </span>
            <span className="mono-label rounded border border-border px-2 py-1">
              engine {ANALYSIS_VERSION}
            </span>
            <button
              type="button"
              onClick={() => getFeed().reconnect()}
              className="mono-label rounded border border-border-strong px-2 py-1 hover:text-foreground"
            >
              Reconnect
            </button>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-3 py-1.5">
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            className="mono-label rounded border border-border px-2 py-1 lg:hidden"
          >
            Markets
          </button>
          {TABS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "rounded px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] whitespace-nowrap transition-colors",
                tab === k
                  ? "bg-signal/15 text-signal"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex">
        <aside
          className={cn(
            "w-full shrink-0 overflow-y-auto border-r border-border bg-background p-3 lg:block lg:max-h-[calc(100vh-84px)] lg:w-72 lg:sticky lg:top-[84px]",
            railOpen ? "block" : "hidden",
          )}
        >
          <MarketRail
            markets={markets}
            selected={selected}
            onSelect={(s) => {
              setSelected(s);
              setRailOpen(false);
            }}
          />
        </aside>

        <main className={cn("min-w-0 flex-1 p-3", railOpen && "hidden lg:block")}>
          <div className="panel mb-3 flex flex-wrap items-center gap-4 px-3 py-2">
            <div>
              <div className="mono-label">{current?.symbol}</div>
              <h2 className="text-base font-semibold">{current?.name}</h2>
            </div>
            <div className="tabular flex flex-wrap items-center gap-4 text-xs">
              <span>
                <span className="mono-label mr-1">quote</span>
                {current?.last ?? "—"}
              </span>
              <span>
                <span className="mono-label mr-1">last digit</span>
                <b className="text-signal">{analysis?.last ?? "—"}</b>
              </span>
              <span>
                <span className="mono-label mr-1">sample</span>
                {analysis?.sample ?? current?.history.length ?? 0}
              </span>
              <span>
                <span className="mono-label mr-1">regime</span>
                {analysis?.regime.state ?? "—"}
              </span>
            </div>
            {analysis ? (
              <div className="ml-auto flex items-center gap-2">
                <span className="mono-label">top structure</span>
                <span className="tabular text-xs">{analysis.top.label}</span>
                <StateTag state={analysis.top.state} />
              </div>
            ) : null}
          </div>

          {confirmed.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-state-confirmed/40 bg-state-confirmed/5 px-3 py-2">
              <span className="mono-label text-state-confirmed">Universe confirmations</span>
              {confirmed.map((c) => (
                <button
                  key={`${c.symbol}-${c.id}`}
                  type="button"
                  onClick={() => setSelected(c.symbol)}
                  className="tabular rounded border border-border-strong px-2 py-0.5 text-[11px] hover:border-signal"
                >
                  {c.symbol} · {c.label} · {Math.round(c.confirmation)}
                </button>
              ))}
            </div>
          ) : null}

          {tab === "RADAR" && (
            <RadarView snap={opportunities} onSelectMarket={setSelected} />
          )}
          {tab === "LEDGER" && <LedgerView snap={opportunities} />}

          {tab === "RADAR" || tab === "LEDGER" ? null : !analysis ? (
            <div className="panel flex h-64 items-center justify-center text-sm text-muted-foreground">
              Seeding the 15-market reservoir from Deriv public market data…
            </div>
          ) : (
            <>
              {tab === "LIQUIDITY" && (
                <LiquidityView
                  a={analysis}
                  selectedContract={contractFocus}
                  onSelectContract={setContractFocus}
                />
              )}
              {tab === "PSYCHOLOGY" && <PsychologyView a={analysis} />}
              {tab === "DANGER" && <DangerView a={analysis} />}
              {tab === "MATRIX" && <MatrixView markets={markets} onSelect={setSelected} />}
              {tab === "RESEARCH" && (
                <ResearchView
                  a={analysis}
                  observations={observations}
                  onRecord={record}
                  onClear={() => journal.clear()}
                  onExport={exportCsv}
                />
              )}
            </>
          )}

          <footer className="mono-label mt-4 border-t border-border pt-3 leading-relaxed">
            Research instrument. Outputs are observed statistical and psychological patterns in
            public tick data — not validated probabilities, not order-book liquidity, and not a
            claim of trader manipulation or hidden order flow. RIPE is not CONFIRMED.
          </footer>
        </main>
      </div>
    </div>
  );
}
