import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { clamp } from "@/lib/liquidity/math";
import { Note, Panel, Meter, StateTag } from "@/components/li/primitives";
import type {
  LiquidityZone,
  ZoneEvent,
  ZoneRegistrySnapshot,
  ZoneLifecycleState,
} from "@/lib/liquidity/zones";
import type { OpportunitySnapshot } from "@/lib/liquidity/opportunity";

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function qualitativeTone(label: string): string {
  if (["HIGH", "CONFIRMED", "ACCELERATING", "ACTIVE", "VALID", "LOW"].includes(label)) {
    return "text-calm font-medium";
  }
  if (["BUILDING", "MODERATE", "DEVELOPING", "RECEIVING", "FLATTENING", "WATCH"].includes(label)) {
    return "text-caution font-medium";
  }
  if (["DORMANT", "REJECT", "HIGH (CONFLICT)", "CONTRADICTION"].includes(label)) {
    return "text-danger font-medium";
  }
  return "text-muted-foreground";
}

function getQualitativeLevels(z: LiquidityZone) {
  const acc = z.accumulators;
  const psych = z.currentPsychology;

  const resPers =
    acc.reservoirPersistence >= 65
      ? "HIGH"
      : acc.reservoirPersistence >= 40
        ? "MODERATE"
        : "BUILDING";

  const domExh =
    acc.dominantExhaustion >= 70
      ? "CONFIRMED"
      : acc.dominantExhaustion >= 50
        ? "BUILDING"
        : acc.dominantExhaustion >= 35
          ? "FLATTENING"
          : "CONTINUING";

  const delivery =
    acc.deliveryAcceleration > 12
      ? "ACCELERATING"
      : acc.delivery >= 55
        ? "DELIVERING"
        : acc.delivery >= 35
          ? "RECEIVING"
          : "DORMANT";

  const deliveryAccel =
    acc.deliveryAcceleration > 10
      ? "ACCELERATING"
      : acc.deliveryAcceleration > 0
        ? "DEVELOPING"
        : "FLAT";

  const migration = acc.migration >= 60 ? "CONFIRMED" : acc.migration >= 35 ? "DEVELOPING" : "LOW";

  const absorption = acc.absorption >= 60 ? "ACTIVE" : acc.absorption >= 35 ? "MODERATE" : "LOW";

  const purpleAligned =
    psych.purple !== null && z.reservoirDigits.includes(psych.purple)
      ? "ALIGNED"
      : psych.purple !== null && z.dominantDigits.includes(psych.purple)
        ? "DOMINANT"
        : psych.purple !== null
          ? "LOSING SIDE"
          : "DISTRIBUTED";

  const psychology = psych.valid ? "VALID" : psych.outcome === "WATCH" ? "WATCH" : "REJECT";

  const conflict = acc.conflict < 30 ? "LOW" : acc.conflict < 60 ? "MODERATE" : "HIGH";

  return {
    resPers,
    domExh,
    delivery,
    deliveryAccel,
    migration,
    absorption,
    purpleAligned,
    psychology,
    conflict,
  };
}

export function ZoneCard({
  zone,
  active,
  onSelect,
}: {
  zone: LiquidityZone;
  active: boolean;
  onSelect: () => void;
}) {
  const q = getQualitativeLevels(zone);
  const acc = zone.accumulators;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "panel flex flex-col justify-between p-3.5 text-left transition-all",
        active
          ? "border-signal bg-signal/5 ring-1 ring-signal/50"
          : "hover:border-border-strong hover:bg-muted/30",
        zone.isTerminal && "opacity-60",
      )}
    >
      <div>
        {/* Header: Identity & Contract */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-2">
              <strong className="text-base font-semibold tracking-tight text-foreground">
                {zone.symbol}
              </strong>
              <span className="mono-label text-muted-foreground">{zone.market}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs font-medium text-foreground/90">
              <span>{zone.contract}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-[10px] text-muted-foreground">
                {zone.zoneId.split("-").slice(-2).join("-")}
              </span>
            </div>
          </div>
          <StateTag state={zone.lifecycleState} />
        </div>

        {/* Formation Timing & Identity */}
        <div className="mt-2.5 grid grid-cols-2 gap-2 border-y border-border/60 py-2 font-mono text-[11px]">
          <div>
            <span className="mono-label block text-[9px] text-muted-foreground">AGE</span>
            <span className="tabular font-medium text-foreground">
              {zone.ageTicks} ticks ({zone.ageSeconds}s)
            </span>
          </div>
          <div>
            <span className="mono-label block text-[9px] text-muted-foreground">
              FORMATION DURATION
            </span>
            <span className="tabular font-medium text-foreground">
              {Math.max(1, zone.currentTick - zone.formationStartTick)} ticks
            </span>
          </div>
        </div>

        {/* Cumulative Liquidity Level & Psychology Adherence */}
        <div className="mt-2.5 space-y-2">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="mono-label text-[10px] text-muted-foreground">Liquidity Level</span>
              <span className="tabular font-mono text-xs font-semibold text-signal">
                {zone.liquidityLevel ?? Math.round(acc.accumulatedLiquidity)}% (
                {zone.liquidityTrend !== undefined && zone.liquidityTrend >= 0 ? "+" : ""}
                {zone.liquidityTrend ?? 0})
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-signal transition-all duration-500"
                style={{
                  width: `${Math.max(4, zone.liquidityLevel ?? acc.accumulatedLiquidity)}%`,
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <span className="mono-label text-[10px] text-muted-foreground">
                Psychology Adherence
              </span>
              <span className="tabular font-mono text-xs font-semibold text-calm">
                {zone.psychologyAdherence ?? 50}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-calm transition-all duration-500"
                style={{ width: `${Math.max(4, zone.psychologyAdherence ?? 50)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Structural Evidence Accumulators (Qualitative Indicators) */}
        <div className="mt-3 space-y-1 font-mono text-[11px]">
          <div className="flex justify-between border-b border-border/40 py-0.5">
            <span className="text-muted-foreground">Reservoir persistence:</span>
            <span className={qualitativeTone(q.resPers)}>{q.resPers}</span>
          </div>
          <div className="flex justify-between border-b border-border/40 py-0.5">
            <span className="text-muted-foreground">Dominant exhaustion:</span>
            <span className={qualitativeTone(q.domExh)}>{q.domExh}</span>
          </div>
          <div className="flex justify-between border-b border-border/40 py-0.5">
            <span className="text-muted-foreground">Delivery:</span>
            <span className={qualitativeTone(q.delivery)}>{q.delivery}</span>
          </div>
          <div className="flex justify-between border-b border-border/40 py-0.5">
            <span className="text-muted-foreground">Delivery acceleration:</span>
            <span className={qualitativeTone(q.deliveryAccel)}>{q.deliveryAccel}</span>
          </div>
          <div className="flex justify-between border-b border-border/40 py-0.5">
            <span className="text-muted-foreground">Migration:</span>
            <span className={qualitativeTone(q.migration)}>{q.migration}</span>
          </div>
          <div className="flex justify-between border-b border-border/40 py-0.5">
            <span className="text-muted-foreground">Absorption:</span>
            <span className={qualitativeTone(q.absorption)}>{q.absorption}</span>
          </div>
          <div className="flex justify-between border-b border-border/40 py-0.5">
            <span className="text-muted-foreground">Purple alignment:</span>
            <span className={qualitativeTone(q.purpleAligned)}>{q.purpleAligned}</span>
          </div>
          <div className="flex justify-between border-b border-border/40 py-0.5">
            <span className="text-muted-foreground">Psychology:</span>
            <span className={qualitativeTone(q.psychology)}>{q.psychology}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-muted-foreground">Conflict:</span>
            <span className={qualitativeTone(q.conflict)}>{q.conflict}</span>
          </div>
        </div>
      </div>

      {/* Footer Timestamps */}
      <div className="mt-3.5 flex items-center justify-between border-t border-border/60 pt-2 font-mono text-[10px] text-muted-foreground">
        <span>Created {clock(zone.creationTimestamp)}</span>
        <span>Last change {clock(zone.lastStructuralChangeTimestamp)}</span>
      </div>
    </button>
  );
}

export function ZoneProvenance({ zone }: { zone: LiquidityZone }) {
  const acc = zone.accumulators;
  const psych = zone.currentPsychology;
  const q = getQualitativeLevels(zone);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {/* Identity & Origin Panel */}
      <Panel title="ZONE IDENTITY & ORIGIN" subtitle={zone.zoneId}>
        <dl className="space-y-1.5 font-mono text-[11px]">
          <div className="flex justify-between border-b border-border/50 py-1">
            <dt className="text-muted-foreground">Market</dt>
            <dd className="font-medium text-foreground">
              {zone.market} ({zone.symbol})
            </dd>
          </div>
          <div className="flex justify-between border-b border-border/50 py-1">
            <dt className="text-muted-foreground">Contract</dt>
            <dd className="font-medium text-foreground">{zone.contract}</dd>
          </div>
          <div className="flex justify-between border-b border-border/50 py-1">
            <dt className="text-muted-foreground">Born At</dt>
            <dd>
              {clock(zone.creationTimestamp)} · tick {zone.creationTick}
            </dd>
          </div>
          <div className="flex justify-between border-b border-border/50 py-1">
            <dt className="text-muted-foreground">Formation Start</dt>
            <dd>
              {clock(zone.formationStartTimestamp)} · tick {zone.formationStartTick}
            </dd>
          </div>
          <div className="flex justify-between border-b border-border/50 py-1">
            <dt className="text-muted-foreground">Age</dt>
            <dd className="font-semibold">
              {zone.ageTicks} ticks ({zone.ageSeconds}s)
            </dd>
          </div>
          <div className="flex justify-between border-b border-border/50 py-1">
            <dt className="text-muted-foreground">Current State</dt>
            <dd className="flex items-center gap-1.5">
              <StateTag state={zone.lifecycleState} />
              <span className="text-[10px] text-muted-foreground">
                ({zone.stateDurationTicks}t)
              </span>
            </dd>
          </div>
          <div className="flex justify-between border-b border-border/50 py-1">
            <dt className="text-muted-foreground">Trade Qualification</dt>
            <dd className={zone.qualified ? "text-calm font-bold" : "text-caution font-medium"}>
              {zone.qualified ? "TRADE QUALIFIED" : "ZONE EXISTS (NOT QUALIFIED)"}
            </dd>
          </div>
          {zone.qualificationReason ? (
            <p className="mt-1 text-[10px] text-muted-foreground border-l-2 border-signal/60 pl-2">
              {zone.qualificationReason}
            </p>
          ) : null}
          {zone.invalidationReason ? (
            <div className="mt-1 rounded bg-danger/10 p-2 text-[10px] text-danger">
              Invalidation: {zone.invalidationReason}
            </div>
          ) : null}
        </dl>
      </Panel>

      {/* Independent Evidence Accumulators */}
      <Panel
        title="ACCUMULATED STRUCTURAL EVIDENCE"
        subtitle="Independent accumulators build over time — never a volatile tick score"
      >
        <div className="space-y-2">
          <Meter
            label="Liquidity Level (Continuous)"
            value={zone.liquidityLevel ?? acc.accumulatedLiquidity}
            tone="signal"
          />
          <Meter
            label="Psychology Adherence (Sentinel Rules)"
            value={zone.psychologyAdherence ?? 50}
            tone="calm"
          />
          <Meter
            label="Accumulated Liquidity Formation"
            value={acc.accumulatedLiquidity}
            tone="signal"
          />
          <Meter label="Reservoir Persistence" value={acc.reservoirPersistence} tone="calm" />
          <Meter label="Dominant Exhaustion" value={acc.dominantExhaustion} tone="caution" />
          <Meter label="Delivery (Dormancy vs Flow)" value={acc.delivery} tone="signal" />
          <Meter
            label="Delivery Acceleration"
            value={clamp(acc.deliveryAcceleration * 2 + 50)}
            tone="signal"
          />
          <Meter label="Markov Migration" value={acc.migration} tone="calm" />
          <Meter label="Absorption" value={acc.absorption} tone="caution" />
          <Meter label="Structural Departure (JSD)" value={acc.structuralDeparture} tone="signal" />
          <Meter
            label="Sentinel Psychology Integrity"
            value={acc.psychologyIntegrity}
            tone="calm"
          />
          <Meter label="Conflict / Opposition" value={acc.conflict} tone="conflict" />
          <Meter label="Contradiction Penalty" value={acc.contradiction} tone="danger" />
          <Meter label="Evidence Decay" value={acc.evidenceDecay} tone="danger" />
        </div>
      </Panel>

      {/* Sentinel Psychology & Attached Ledger */}
      <div className="flex flex-col gap-3">
        <Panel
          title="1000-TICK SENTINEL BASELINE"
          subtitle={`Dominant: Green d${psych.green}, 2nd d${psych.secondGreen} · Reservoir: Red d${psych.red}, 2nd d${psych.secondRed}`}
        >
          <div className="font-mono text-[11px] space-y-1.5">
            <div className="flex justify-between border-b border-border/40 py-0.5">
              <span className="text-muted-foreground">Dominant Digits:</span>
              <span className="text-foreground">
                d{psych.green}, d{psych.secondGreen}
              </span>
            </div>
            <div className="flex justify-between border-b border-border/40 py-0.5">
              <span className="text-muted-foreground">Reservoir Digits:</span>
              <span className="text-foreground">
                d{psych.red}, d{psych.secondRed}
              </span>
            </div>
            <div className="flex justify-between border-b border-border/40 py-0.5">
              <span className="text-muted-foreground">Purple Growth Digit:</span>
              <span className="text-foreground">
                {psych.purple !== null ? `d${psych.purple}` : "None"} ({q.purpleAligned})
              </span>
            </div>
            <div className="flex justify-between border-b border-border/40 py-0.5">
              <span className="text-muted-foreground">Sentinel Validity:</span>
              <span className={qualitativeTone(q.psychology)}>
                {q.psychology} ({psych.outcome})
              </span>
            </div>
            {psych.reasons.length > 0 && (
              <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                {psych.reasons.map((r, i) => (
                  <li key={i} className="border-l-2 border-border-strong pl-1.5">
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel title="ZONE EVENT LEDGER" subtitle="Historical transitions on this identity">
          <ul className="max-h-56 space-y-1.5 overflow-y-auto font-mono text-[11px]">
            {zone.ledger.length ? (
              zone.ledger.map((ev) => (
                <li key={ev.id} className="border-b border-border/40 pb-1.5 last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {clock(ev.at)} · t{ev.tick}
                    </span>
                    <StateTag state={ev.state} className="text-[9px]" />
                  </div>
                  <p className="mt-0.5 text-xs text-foreground/90">
                    {ev.type}: {ev.description}
                  </p>
                </li>
              ))
            ) : (
              <li className="py-2 text-muted-foreground">Initial formation recorded.</li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export function RadarView({
  zones,
  snap,
  onSelectMarket,
}: {
  zones?: ZoneRegistrySnapshot;
  snap?: OpportunitySnapshot;
  onSelectMarket: (symbol: string) => void;
}) {
  const activeZones = useMemo(() => zones?.activeZones ?? [], [zones?.activeZones]);
  const releaseZones = useMemo(() => zones?.releaseWatch ?? [], [zones?.releaseWatch]);
  const [selectedId, setSelectedId] = useState<string>("");

  const selectedZone = useMemo(() => {
    if (selectedId) {
      const found = activeZones.find((z) => z.zoneId === selectedId);
      if (found) return found;
      const hist = zones?.historicalZones?.find((z) => z.zoneId === selectedId);
      if (hist) return hist;
    }
    return activeZones[0] ?? zones?.historicalZones?.[0] ?? null;
  }, [activeZones, zones?.historicalZones, selectedId]);

  const handleSelect = (z: LiquidityZone) => {
    setSelectedId(z.zoneId);
    onSelectMarket(z.symbol);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: Architecture Principle & Legacy Warning */}
      <div className="rounded border border-warning/40 bg-warning/5 px-3.5 py-2.5 font-mono text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                LEGACY RESEARCH VIEW · NON-AUTHORITATIVE
              </span>
              <strong className="text-foreground font-semibold">ZONE RADAR</strong>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Live production intelligence is strictly powered by the Authoritative Sentinel
              Pipeline (Liquidity Structure / Best Liquidity). This view is an isolated
              historical/legacy research model and does not participate in production intelligence.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded border border-border bg-background px-2 py-0.5">
              {activeZones.length} Active Zones
            </span>
            <span className="rounded border border-border bg-background px-2 py-0.5">
              {releaseZones.length} in Release Watch
            </span>
            <span className="rounded border border-border bg-background px-2 py-0.5">
              {zones?.qualifiedCount ?? 0} Trade Qualified
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Active Persistent Zones */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="mono-label text-foreground font-semibold">ACTIVE LIQUIDITY ZONES</h2>
          <span className="mono-label text-[10px] text-muted-foreground">
            Slots persist as evidence accumulates · No tick-by-tick reordering
          </span>
        </div>

        {activeZones.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeZones.map((z) => (
              <ZoneCard
                key={z.zoneId}
                zone={z}
                active={selectedZone?.zoneId === z.zoneId}
                onSelect={() => handleSelect(z)}
              />
            ))}
          </div>
        ) : (
          <div className="panel p-8 text-center font-mono text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">NO LIQUIDITY FORMED YET</p>
            <p className="mt-1">
              Observing live ticks. Formations require sustained multi-tick candidate persistence
              and valid Sentinel psychology before a zone is born.
            </p>
          </div>
        )}
      </div>

      {/* Release Watch Section */}
      {releaseZones.length > 0 && (
        <div className="panel p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="mono-label text-foreground font-semibold">RELEASE WATCH</h3>
              <p className="text-[11px] text-muted-foreground">
                Persistent formations approaching or reaching structural release. RIPE ≠ CONFIRMED.
              </p>
            </div>
            <span className="mono-label text-xs text-caution">{releaseZones.length} Maturing</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {releaseZones.map((z) => {
              const q = getQualitativeLevels(z);
              return (
                <button
                  key={z.zoneId}
                  type="button"
                  onClick={() => handleSelect(z)}
                  className={cn(
                    "flex flex-col justify-between rounded border border-border/80 bg-surface-raised p-2.5 text-left transition-colors font-mono text-[11px]",
                    selectedZone?.zoneId === z.zoneId
                      ? "border-signal bg-signal/10"
                      : "hover:border-border-strong",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">
                      {z.symbol} · {z.contract}
                    </span>
                    <StateTag state={z.lifecycleState} />
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dominant exhaustion:</span>
                      <span className={qualitativeTone(q.domExh)}>{q.domExh}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reservoir delivery:</span>
                      <span className={qualitativeTone(q.delivery)}>{q.delivery}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Migration:</span>
                      <span className={qualitativeTone(q.migration)}>{q.migration}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Purple:</span>
                      <span className={qualitativeTone(q.purpleAligned)}>{q.purpleAligned}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Zone Detail Inspector */}
      {selectedZone && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="mono-label text-foreground font-semibold">
              PERSISTENT ZONE INSPECTOR · {selectedZone.zoneId}
            </h3>
            <span className="mono-label text-[10px] text-muted-foreground">
              Formed {clock(selectedZone.creationTimestamp)}
            </span>
          </div>
          <ZoneProvenance zone={selectedZone} />
        </div>
      )}
    </div>
  );
}

export function LedgerView({
  zones,
  snap,
}: {
  zones?: ZoneRegistrySnapshot;
  snap?: OpportunitySnapshot;
}) {
  const [filter, setFilter] = useState("");
  const events = useMemo(() => {
    const list = zones?.ledger ?? [];
    const f = filter.trim().toUpperCase();
    if (!f) return list;
    return list.filter(
      (e) =>
        e.symbol.toUpperCase().includes(f) ||
        e.market.toUpperCase().includes(f) ||
        e.contract.toUpperCase().includes(f) ||
        e.type.toUpperCase().includes(f) ||
        e.zoneId.toUpperCase().includes(f),
    );
  }, [zones?.ledger, filter]);

  return (
    <div className="space-y-3">
      <div className="rounded border border-warning/40 bg-warning/5 px-3.5 py-2 font-mono text-xs">
        <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
          LEGACY RESEARCH VIEW · NON-AUTHORITATIVE
        </span>
        <span className="ml-2 text-[11px] text-muted-foreground">
          Historical formation transitions from the legacy experimental zone ledger. Does not
          participate in production intelligence.
        </span>
      </div>
      <Panel
        title="FORMATION LEDGER"
        subtitle="Historical structural transitions attached to persistent identities — no tick noise"
        actions={
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter market / contract / state..."
            className="mono-label w-52 rounded border border-border bg-transparent px-2 py-1 outline-none focus:border-signal text-xs"
          />
        }
      >
        <ul className="max-h-[72vh] space-y-2 overflow-y-auto font-mono text-[11px]">
          {events.length ? (
            events.map((ev) => (
              <li key={ev.id} className="border-b border-border/50 pb-2 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{clock(ev.at)}</span>
                    <span className="text-[10px] text-muted-foreground">tick {ev.tick}</span>
                    <span className="font-semibold text-foreground">
                      {ev.symbol} · {ev.contract}
                    </span>
                  </div>
                  <StateTag state={ev.state} className="text-[9px]" />
                </div>
                <p className="mt-1 text-xs text-foreground/90 font-medium">
                  {ev.type}: {ev.description}
                </p>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{ev.zoneId}</span>
                  <span>{ev.evidenceSummary}</span>
                </div>
              </li>
            ))
          ) : (
            <li className="py-8 text-center text-muted-foreground">
              No formation events recorded yet. Formations accumulate over time.
            </li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
