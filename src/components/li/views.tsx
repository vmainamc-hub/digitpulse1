import { Fragment } from "react";

import { cn } from "@/lib/utils";
import { LIQUIDITY_LAWS, ANALYSIS_VERSION } from "@/lib/liquidity/universe";
import { makeExplanation, type ContractAnalysis, type MarketAnalysis } from "@/lib/liquidity/engine";
import type { ComputedMarket } from "@/lib/liquidity/useIntelligence";
import type { Observation } from "@/lib/liquidity/journal";

import { Meter, Metric, Note, Panel, StateTag } from "./primitives";

/* ------------------------------------------------------------------ */
/* Liquidity lifecycle                                                  */
/* ------------------------------------------------------------------ */

const LIFECYCLE = [
  "FORMING",
  "BUILDING",
  "MATURE",
  "ABSORBING",
  "EXHAUSTING",
  "RIPE",
  "RELEASED",
  "CONFIRMED",
] as const;

function LifecycleTrack({ contract }: { contract: ContractAnalysis }) {
  const idx = LIFECYCLE.indexOf(contract.state as (typeof LIFECYCLE)[number]);
  const offTrack = idx === -1;
  return (
    <div>
      <div className="flex gap-0.5">
        {LIFECYCLE.map((s, i) => (
          <div key={s} className="flex-1">
            <div
              className={cn(
                "h-1 rounded-full",
                !offTrack && i <= idx ? "bg-signal" : "bg-muted",
                !offTrack && i === idx && "bg-accent",
              )}
            />
            <span className="mono-label mt-1 block truncate text-[8px]">{s.slice(0, 4)}</span>
          </div>
        ))}
      </div>
      {offTrack ? (
        <p className="mono-label mt-1.5 text-conflict">
          Off-lifecycle · {contract.state}
        </p>
      ) : null}
    </div>
  );
}

function ContractCard({
  c,
  active,
  onSelect,
}: {
  c: ContractAnalysis;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "panel flex flex-col gap-2 p-3 text-left transition-colors",
        active ? "border-signal/60 bg-signal/5" : "hover:border-border-strong",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="tabular text-sm text-foreground">{c.label}</strong>
        <StateTag state={c.state} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-2xl leading-none text-foreground">
          {Math.round(c.confirmation)}
        </span>
        <span className="mono-label">confirmation · {c.supportCount}/7 dims</span>
      </div>
      <LifecycleTrack contract={c} />
      <div className="mt-1">
        <Meter label="Creation" value={c.creation} />
        <Meter label="Maturity" value={c.maturity} />
        <Meter label="Absorption" value={c.absorption} tone="calm" />
        <Meter label="Exhaustion" value={c.exhaustion} tone="caution" />
        <Meter label="Release" value={c.release} />
        <Meter label="Danger" value={c.danger} tone="danger" />
        <Meter label="Conflict" value={c.conflict} tone="conflict" />
      </div>
      <div className="tabular grid grid-cols-2 gap-x-3 text-[10px] text-muted-foreground">
        <span>base {c.winShare.toFixed(1)}%</span>
        <span>recent {c.recentWin.toFixed(1)}%</span>
        <span>
          wilson {c.wilsonLo.toFixed(1)}–{c.wilsonHi.toFixed(1)}%
        </span>
        <span>drift {c.drift.toFixed(1)}%</span>
      </div>
    </button>
  );
}

export function LiquidityView({
  a,
  selectedContract,
  onSelectContract,
}: {
  a: MarketAnalysis;
  selectedContract: string;
  onSelectContract: (id: string) => void;
}) {
  const focus = a.contracts.find((c) => c.id === selectedContract) ?? a.top;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {a.contracts.map((c) => (
          <ContractCard
            key={c.id}
            c={c}
            active={c.id === focus.id}
            onSelect={() => onSelectContract(c.id)}
          />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          title="Liquidity decision"
          subtitle="Decomposable, multi-dimensional — never a single indicator"
          className="lg:col-span-2"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-raised px-3 py-2">
            <div className="flex items-center gap-3">
              <div>
                <div className="mono-label">Focus contract</div>
                <strong className="tabular text-lg">{focus.label}</strong>
              </div>
              <StateTag state={focus.state} />
              {focus.ripe && !focus.confirmed ? (
                <span className="mono-label text-caution">RIPE ≠ CONFIRMED</span>
              ) : null}
            </div>
            <div className="tabular text-3xl leading-none">{Math.round(focus.confirmation)}</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              {focus.dimensions.map((d) => (
                <div key={d.key} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      d.supports ? "bg-calm" : "bg-muted-foreground/40",
                    )}
                    aria-hidden
                  />
                  <div className="flex-1">
                    <Meter
                      label={`${d.label} · w${d.weight.toFixed(2)}`}
                      value={d.value}
                      tone={d.supports ? "signal" : "caution"}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div>
              {makeExplanation(focus, a).map((line, i) => (
                <p key={i} className="mb-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Live market structure" subtitle={`${a.sample} ticks in canonical state`}>
          <Metric label="LOW 0–6 · 1000" value={a.low1000} suffix="%" />
          <Metric label="HIGH 7–9 · 1000" value={a.high1000} suffix="%" />
          <Metric label="LOW · 20" value={a.low20} suffix="%" />
          <Metric label="EVEN · 20" value={a.even20} suffix="%" />
          <Metric label="Normalized entropy" value={a.entropy} suffix="%" />
          <Metric label="Entropy shock" value={a.entropyShock} />
          <Metric label="Fluctuation" value={a.fluctuation} tone="caution" />
          <Metric label="Anomaly" value={a.anomaly} tone="danger" />
          <Metric label="Zone momentum" value={a.zoneMomentum} />
          <Note>
            Structure is measured on observed ticks only. No claim is made about hidden order flow.
          </Note>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Psychology                                                           */
/* ------------------------------------------------------------------ */

export function PsychologyView({ a }: { a: MarketAnalysis }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="10-digit psychology" subtitle="50-tick distribution vs 1000-tick baseline">
        <div className="grid grid-cols-10 gap-1">
          {a.psychology.freq.map((v, i) => {
            const m = a.digitMomentum[i] ?? 0;
            return (
              <div
                key={i}
                className="flex flex-col items-center rounded border border-border bg-surface-raised p-1"
              >
                <b className="tabular text-sm">{i}</b>
                <span className="tabular text-[10px] text-muted-foreground">
                  {(v * 100).toFixed(1)}
                </span>
                <em
                  className={cn(
                    "tabular text-[10px] not-italic",
                    m >= 0 ? "text-calm" : "text-danger",
                  )}
                >
                  {m >= 0 ? "+" : ""}
                  {m.toFixed(1)}
                </em>
                <div className="mt-1 h-8 w-full rounded-sm bg-muted">
                  <div
                    className="w-full rounded-sm bg-signal/70"
                    style={{ height: `${Math.min(100, v * 400)}%`, marginTop: "auto" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <Note>
          Momentum is the percentage-point shift of each digit against its own long baseline.
        </Note>
      </Panel>

      <Panel title="Boundary psychology" subtitle="Lower, upper and extreme boundary pressure">
        {a.boundaries.map((b) => (
          <div key={b.pair} className="mb-2 last:mb-0">
            <div className="flex items-baseline justify-between">
              <strong className="tabular text-xs">{b.pair}</strong>
              <span className="tabular text-[10px] text-muted-foreground">
                share {b.share.toFixed(1)}% · imbalance {b.imbalance.toFixed(1)} · rejection{" "}
                {b.rejection.toFixed(0)}
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-accent" style={{ width: `${b.attack}%` }} />
            </div>
          </div>
        ))}
        <div className="mt-3 grid grid-cols-2 gap-x-4">
          <Metric label="Zone momentum" value={a.zoneMomentum} />
          <Metric label="Parity autocorr" value={a.autocorr} digits={3} />
          <Metric label="Mutual information" value={a.mi} digits={3} />
          <Metric label="Conditional entropy" value={a.conditionalEntropy} digits={3} />
        </div>
      </Panel>

      <Panel title="Parity & LOW/HIGH camps" subtitle="Psychological camp pressure">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Meter label="EVEN pressure" value={a.parity.even.pressure} />
            <Meter label="ODD pressure" value={a.parity.odd.pressure} />
            <Meter label="LOW pressure" value={a.parity.low.pressure} tone="calm" />
            <Meter label="HIGH pressure" value={a.parity.high.pressure} tone="caution" />
          </div>
          <div>
            {Object.entries(a.parity.zones).map(([k, v]) => (
              <Metric key={k} label={k} value={v} suffix="%" />
            ))}
          </div>
        </div>
        <Note>
          Camp pressure contrasts a 50-tick recent share against the full canonical baseline.
        </Note>
      </Panel>

      <Panel title="Run & hazard analysis" subtitle="Observed run-termination frequencies">
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["LOW 0–6", a.lowHazard],
              ["HIGH 7–9", a.highHazard],
            ] as const
          ).map(([label, hz]) => (
            <div key={label}>
              <div className="mono-label mb-1">{label} run hazard</div>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="mono-label">
                    <th className="text-left font-normal">len</th>
                    <th className="text-right font-normal">reached</th>
                    <th className="text-right font-normal">hazard</th>
                    <th className="text-right font-normal">survival</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {hz.map((h) => (
                    <tr key={h.length} className="border-t border-border/60">
                      <td className="py-0.5">{h.length}</td>
                      <td className="text-right text-muted-foreground">{h.reached}</td>
                      <td className="text-right">{h.hazard.toFixed(0)}%</td>
                      <td className="text-right text-muted-foreground">{h.survival.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <Note>
          Hazard is a descriptive frequency of observed run terminations, not a forward probability.
        </Note>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Danger                                                               */
/* ------------------------------------------------------------------ */

export function DangerView({ a }: { a: MarketAnalysis }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Panel
        title="Contract-specific danger"
        subtitle="Danger is projected per contract, never market-wide only"
        className="lg:col-span-2"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="mono-label border-b border-border">
                <th className="py-1 text-left font-normal">Contract</th>
                <th className="py-1 text-right font-normal">Danger</th>
                <th className="py-1 text-right font-normal">Conflict</th>
                <th className="py-1 text-right font-normal">Boundary</th>
                <th className="py-1 text-right font-normal">Exhaust</th>
                <th className="py-1 text-left font-normal">State</th>
                <th className="py-1 text-right font-normal">Confirm</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {a.contracts.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0">
                  <td className="py-1">{c.label}</td>
                  <td className={cn("py-1 text-right", c.danger > 70 && "text-danger")}>
                    {Math.round(c.danger)}
                  </td>
                  <td className={cn("py-1 text-right", c.conflict > 60 && "text-conflict")}>
                    {Math.round(c.conflict)}
                  </td>
                  <td className="py-1 text-right">{Math.round(c.boundaryAttack)}</td>
                  <td className="py-1 text-right">{Math.round(c.exhaustion)}</td>
                  <td className="py-1">
                    <StateTag state={c.state} />
                  </td>
                  <td className="py-1 text-right">{Math.round(c.confirmation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel title="Structural-adversarial proxy" subtitle="Observable patterns only">
          <div className="tabular mb-2 text-4xl leading-none text-accent">
            {Math.round(a.adversarial)}
          </div>
          <Meter label="Distribution shock (JSD)" value={a.jsd * 100} />
          <Meter label="Change-point" value={a.changePoint} tone="caution" />
          <Meter label="Page-Hinkley drift" value={a.pageHinkley} tone="caution" />
          <Meter label="Fluctuation" value={a.fluctuation} />
          <Meter label="Regime danger" value={a.regimeDanger} tone="danger" />
          <Note>
            Combines divergence, change-point, dependence and instability. It does not claim hidden
            trader intent, manipulation, or order flow.
          </Note>
        </Panel>

        <Panel title="Liquidity sweep detection" subtitle="Boundary burst followed by reversion">
          <div className="mb-2 flex items-center gap-2">
            <StateTag state={a.sweep.active ? "RELEASED" : "ABSENT"} />
            <span className="tabular text-xs">
              {a.sweep.active ? `${a.sweep.side} sweep` : "No sweep"}
            </span>
          </div>
          <Meter label="Intensity" value={a.sweep.intensity} tone="caution" />
          <Meter label="Boundary burst" value={a.sweep.boundaryBurst} />
          <Meter label="Reversion" value={a.sweep.reversion} />
          <Note>{a.sweep.note}</Note>
        </Panel>

        <Panel title="Regime inference" subtitle="Change-point + HMM-inspired states">
          <div className="mb-2 flex items-center gap-2">
            <StateTag state={a.regime.state === "SHIFT" ? "BLOCKED" : "MATURE"} />
            <strong className="tabular text-sm">{a.regime.state}</strong>
          </div>
          <Metric label="Change-point score" value={a.changePoint} />
          <Metric label="Page-Hinkley" value={a.pageHinkley} />
          <Metric label="HMM high-state" value={a.hmm.high * 100} suffix="%" />
          <Metric label="HMM confidence" value={a.hmm.confidence} />
          <Metric label="Transition stability" value={a.transitionStability} />
          <Note>
            A regime shift raises conflict and danger until the new structure stabilizes.
          </Note>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cross-market contract matrix                                         */
/* ------------------------------------------------------------------ */

export function MatrixView({
  markets,
  onSelect,
}: {
  markets: ComputedMarket[];
  onSelect: (symbol: string) => void;
}) {
  const contractIds = markets.find((m) => m.analysis)?.analysis?.contracts.map((c) => c.id) ?? [];
  return (
    <Panel
      title="15 × 8 contract intelligence matrix"
      subtitle="Confirmation score per market and contract; colour encodes lifecycle state"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="mono-label border-b border-border">
              <th className="py-1 text-left font-normal">Market</th>
              {contractIds.map((id) => (
                <th key={id} className="py-1 text-right font-normal">
                  {id}
                </th>
              ))}
              <th className="py-1 text-left font-normal">Top</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {markets.map((m) => (
              <tr
                key={m.symbol}
                className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-surface-raised"
                onClick={() => onSelect(m.symbol)}
              >
                <td className="py-1 whitespace-nowrap">{m.name}</td>
                {contractIds.map((id) => {
                  const c = m.analysis?.contracts.find((x) => x.id === id);
                  if (!c)
                    return (
                      <td key={id} className="py-1 text-right text-muted-foreground">
                        —
                      </td>
                    );
                  return (
                    <td
                      key={id}
                      title={`${c.label} · ${c.state} · danger ${Math.round(c.danger)}`}
                      className={cn(
                        "py-1 text-right",
                        c.state === "CONFIRMED" && "text-state-confirmed",
                        c.state === "RIPE" && "text-state-ripe",
                        c.state === "CONFLICTED" && "text-state-conflicted",
                        c.state === "BLOCKED" && "text-state-blocked",
                      )}
                    >
                      {Math.round(c.confirmation)}
                    </td>
                  );
                })}
                <td className="py-1">
                  {m.analysis ? <StateTag state={m.analysis.top.state} /> : <StateTag state="WAITING" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Research core                                                        */
/* ------------------------------------------------------------------ */

export function ResearchView({
  a,
  observations,
  onRecord,
  onClear,
  onExport,
}: {
  a: MarketAnalysis;
  observations: Observation[];
  onRecord: () => void;
  onClear: () => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Information theory">
          <Metric label="Jensen-Shannon (20 vs 1000)" value={a.jsd} digits={4} />
          <Metric label="Mutual information" value={a.mi} digits={4} />
          <Metric label="Conditional entropy" value={a.conditionalEntropy} digits={4} />
          <Metric label="Normalized entropy" value={a.entropy} suffix="%" />
          <Metric label="Fast entropy (20)" value={a.entropyFast} suffix="%" />
          <Metric label="Entropy shock" value={a.entropyShock} />
        </Panel>

        <Panel title="Markov transition engine" subtitle="10×10 conditional structure" className="lg:col-span-2">
          <div className="grid grid-cols-[auto_repeat(10,minmax(0,1fr))] gap-px text-[9px]">
            <div />
            {Array.from({ length: 10 }, (_, j) => (
              <div key={j} className="mono-label text-center">
                {j}
              </div>
            ))}
            {a.transition.map((row, i) => (
              <Fragment key={`r${i}`}>
                <div className="mono-label pr-1 text-right">
                  {i}
                </div>
                {row.map((v, j) => (
                  <div
                    key={`${i}-${j}`}
                    title={`${i} → ${j} · ${(v * 100).toFixed(1)}%`}
                    className="tabular flex aspect-square items-center justify-center rounded-[2px] text-[8px] text-foreground"
                    style={{
                      background: `color-mix(in oklch, var(--color-signal) ${Math.min(100, v * 420)}%, var(--color-muted))`,
                    }}
                  >
                    {v > 0.16 ? Math.round(v * 100) : ""}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
          <Note>Cell intensity is the conditional probability P(next = j | current = i).</Note>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Liquidity laws">
          <ul className="flex flex-col gap-1">
            {LIQUIDITY_LAWS.map((l) => (
              <li key={l} className="mono-label text-[10px] text-foreground/80">
                · {l}
              </li>
            ))}
          </ul>
          <Note>
            Engine {ANALYSIS_VERSION}. Scores are research measurements, not validated
            probabilities; calibrate thresholds against the journal before any use.
          </Note>
        </Panel>

        <Panel
          title="Observation journal"
          subtitle={`${observations.length} immutable records`}
          className="lg:col-span-2"
          actions={
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onRecord}
                className="rounded border border-signal/50 bg-signal/10 px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-signal hover:bg-signal/20"
              >
                RECORD
              </button>
              <button
                type="button"
                onClick={onExport}
                className="rounded border border-border-strong px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-muted-foreground hover:text-foreground"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={onClear}
                className="rounded border border-border-strong px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-muted-foreground hover:text-danger"
              >
                CLEAR
              </button>
            </div>
          }
        >
          <div className="mono-label mb-2 break-all">Current observation ID · {a.observationId}</div>
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full min-w-[640px] text-[11px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="mono-label border-b border-border">
                  <th className="py-1 text-left font-normal">Time</th>
                  <th className="py-1 text-left font-normal">Market</th>
                  <th className="py-1 text-left font-normal">Contract</th>
                  <th className="py-1 text-left font-normal">State</th>
                  <th className="py-1 text-right font-normal">Conf</th>
                  <th className="py-1 text-right font-normal">Danger</th>
                  <th className="py-1 text-right font-normal">Dims</th>
                  <th className="py-1 text-left font-normal">Regime</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {observations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-3 text-center text-muted-foreground">
                      No observations recorded yet.
                    </td>
                  </tr>
                ) : (
                  observations.map((o) => (
                    <tr key={o.id} className="border-b border-border/50 last:border-0">
                      <td className="py-1 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-1">{o.symbol}</td>
                      <td className="py-1">{o.contract}</td>
                      <td className="py-1">
                        <StateTag state={o.state} />
                      </td>
                      <td className="py-1 text-right">{o.confirmation}</td>
                      <td className="py-1 text-right">{o.danger}</td>
                      <td className="py-1 text-right">{o.supportCount}/7</td>
                      <td className="py-1">{o.regime}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
