import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { Note, Panel, Meter, StateTag } from "@/components/li/primitives";
import {
  releaseProximityLabel,
  type Opportunity,
  type OpportunityEvent,
  type OpportunitySnapshot,
} from "@/lib/liquidity/opportunity";

function trajectoryGlyph(v: number) {
  if (v > 6) return "▲▲";
  if (v > 1.5) return "▲";
  if (v < -6) return "▼▼";
  if (v < -1.5) return "▼";
  return "→";
}

function trajectoryTone(v: number) {
  if (v > 1.5) return "text-calm";
  if (v < -1.5) return "text-danger";
  return "text-muted-foreground";
}

function age(o: Opportunity) {
  const s = Math.max(0, Math.round(o.ageSeconds));
  const t = s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  return `${o.ageTicks}t · ${t}`;
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function OpportunityRow({
  o,
  active,
  onSelect,
}: {
  o: Opportunity;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(o.opportunityId)}
      className={cn(
        "grid w-full min-w-[720px] grid-cols-[1.35fr_1.1fr_0.85fr_0.95fr_0.6fr_0.7fr_0.8fr_0.6fr] items-center gap-2 border-b border-border/60 px-2 py-1.5 text-left text-[11px] transition-colors last:border-0 hover:bg-muted/40",
        active && "bg-signal/10",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{o.market}</span>
        <span className="mono-label block truncate">{o.opportunityId}</span>
      </span>
      <span className="tabular min-w-0 truncate">{o.contract}</span>
      <span className="tabular text-muted-foreground">{age(o)}</span>
      <span>
        <StateTag state={o.phase} />
      </span>
      <span className={cn("tabular", trajectoryTone(o.trajectory))}>
        {trajectoryGlyph(o.trajectory)} {o.trajectory > 0 ? "+" : ""}
        {o.trajectory.toFixed(1)}
      </span>
      <span className="tabular">{Math.round(o.maturity)}</span>
      <span className="tabular">
        {Math.round(o.releaseProximity)}{" "}
        <span className="mono-label">{releaseProximityLabel(o.releaseProximity)}</span>
      </span>
      <span className={cn("tabular", o.danger >= 55 ? "text-danger" : "text-muted-foreground")}>
        {Math.round(o.danger)}
      </span>
    </button>
  );
}

function RadarTable({
  rows,
  selected,
  onSelect,
  empty,
}: {
  rows: Opportunity[];
  selected: string;
  onSelect: (id: string) => void;
  empty: string;
}) {
  if (!rows.length) {
    return <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="-mx-3 overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="mono-label grid min-w-[720px] grid-cols-[1.35fr_1.1fr_0.85fr_0.95fr_0.6fr_0.7fr_0.8fr_0.6fr] gap-2 border-b border-border px-2 pb-1">
          <span>Market</span>
          <span>Structure</span>
          <span>Age</span>
          <span>Phase</span>
          <span>Traj</span>
          <span>Matur</span>
          <span>Release</span>
          <span>Danger</span>
        </div>
        {rows.map((o) => (
          <OpportunityRow
            key={o.opportunityId}
            o={o}
            active={o.opportunityId === selected}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function Provenance({ o }: { o: Opportunity }) {
  const vel = o.velocity ?? {};
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Panel title="Identity & origin" subtitle={o.opportunityId}>
        <dl className="space-y-1 text-[11px]">
          <Row k="Market" v={`${o.market} (${o.marketGroup})`} />
          <Row k="Structure" v={o.contract} />
          <Row k="Born" v={`${clock(o.bornAt)} · tick ${o.birthTick}`} />
          <Row k="Age" v={age(o)} />
          <Row k="Phase" v={`${o.phase} for ${o.phaseDurationTicks} ticks`} />
          <Row k="Previous phase" v={o.previousPhase} />
          <Row k="Regime" v={o.regime} />
          <Row k="Origin event" v={o.originEvent} />
          <Row
            k="Last structural change"
            v={o.lastStructuralChange ? o.lastStructuralChange.what : "—"}
          />
          {o.invalidationReason ? <Row k="Invalidated" v={o.invalidationReason} /> : null}
          {o.confirmationReason ? <Row k="Confirmation" v={o.confirmationReason} /> : null}
        </dl>
        <Note>
          Scores are model measurements of observed structure, not calibrated probabilities. RIPE is
          not CONFIRMED.
        </Note>
      </Panel>

      <Panel title="Structural state" subtitle="Shared features at this tick">
        <Meter label="Creation" value={o.creation} />
        <Meter label="Persistence" value={o.persistence} />
        <Meter label="Accumulation" value={o.accumulation} />
        <Meter label="Concentration" value={o.concentration} />
        <Meter label="Pressure" value={o.pressure} />
        <Meter label="Boundary pressure" value={o.boundaryPressure} />
        <Meter label="Maturity" value={o.maturity} />
        <Meter label="Absorption" value={o.absorption} tone="caution" />
        <Meter label="Exhaustion" value={o.exhaustion} tone="caution" />
        <Meter label="Release proximity" value={o.releaseProximity} />
        <Meter label="Structural integrity" value={o.integrity} tone="calm" />
        <Meter label="Danger" value={o.danger} tone="danger" />
        <Meter label="Conflict" value={o.conflict} tone="conflict" />
        <Meter label="Confirmation" value={o.confirmation} tone="calm" />
      </Panel>

      <div className="flex min-w-0 flex-col gap-3">
        <Panel title="Trajectory" subtitle="Velocity per cycle (least squares)">
          <dl className="space-y-1 text-[11px]">
            {Object.entries(vel).map(([k, v]) => (
              <Row
                key={k}
                k={k}
                v={`${v > 0 ? "+" : ""}${v.toFixed(2)} ${trajectoryGlyph(v * 10)}`}
              />
            ))}
            <Row
              k="composite trajectory"
              v={`${o.trajectory > 0 ? "+" : ""}${o.trajectory.toFixed(2)}`}
            />
            <Row k="rank score" v={o.rank.toFixed(1)} />
          </dl>
        </Panel>

        <Panel title="Formation evidence" subtitle={`${o.supportCount} supporting dimensions`}>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {o.formationEvidence.length ? (
              o.formationEvidence.map((e, i) => (
                <li key={`${e}-${i}`} className="border-l-2 border-border-strong pl-2">
                  {e}
                </li>
              ))
            ) : (
              <li>No recorded evidence.</li>
            )}
          </ul>
        </Panel>

        <Panel title="Opportunity history" subtitle="Events on this identity">
          <ul className="max-h-56 space-y-1 overflow-y-auto text-[11px]">
            {o.events.length ? (
              [...o.events].reverse().map((e) => <EventLine key={e.id} e={e} compact />)
            ) : (
              <li className="text-muted-foreground">No events yet.</li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 last:border-0">
      <dt className="mono-label">{k}</dt>
      <dd className="tabular max-w-[60%] truncate text-right text-[11px]">{v}</dd>
    </div>
  );
}

function EventLine({ e, compact }: { e: OpportunityEvent; compact?: boolean }) {
  return (
    <li className="border-b border-border/50 py-1 last:border-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="mono-label">{clock(e.at)}</span>
        <span className="mono-label">tick {e.tickEpoch}</span>
        {!compact ? (
          <span className="tabular text-[11px]">
            {e.symbol} · {e.contract}
          </span>
        ) : null}
        <StateTag state={e.type} className="tracking-[0.08em]" />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {e.evidence}
        {e.metric ? (
          <span className="tabular">
            {" — "}
            {e.metric}
            {e.previous !== null && e.next !== null
              ? `: ${e.previous.toFixed(1)} → ${e.next.toFixed(1)}`
              : ""}
          </span>
        ) : null}
      </p>
      {!compact ? <span className="mono-label">{e.opportunityId}</span> : null}
    </li>
  );
}

export function RadarView({
  snap,
  onSelectMarket,
}: {
  snap: OpportunitySnapshot;
  onSelectMarket: (symbol: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const detail = useMemo(
    () =>
      snap.opportunities.find((o) => o.opportunityId === selected) ??
      snap.radar[0] ??
      snap.formation[0] ??
      null,
    [snap, selected],
  );

  const pick = (id: string) => {
    setSelected(id);
    const o = snap.opportunities.find((x) => x.opportunityId === id);
    if (o) onSelectMarket(o.symbol);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <Panel
          title="LIVE OPPORTUNITY RADAR"
          subtitle="Ranked by age, quality, persistence, integrity, trajectory, pressure and danger"
          actions={
            <span className="mono-label">
              {snap.opportunities.length} tracked · {snap.born} born · {snap.confirmed} confirmed ·{" "}
              {snap.invalidated} invalidated
            </span>
          }
        >
          <RadarTable
            rows={snap.radar}
            selected={detail?.opportunityId ?? ""}
            onSelect={pick}
            empty="No structural opportunities above the formation floor yet."
          />
        </Panel>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel title="FORMATION WATCH" subtitle="Early structures, not yet mature">
            <ul className="space-y-1 text-[11px]">
              {snap.formation.length ? (
                snap.formation.map((o) => (
                  <li key={o.opportunityId}>
                    <button
                      type="button"
                      onClick={() => pick(o.opportunityId)}
                      className="flex w-full items-center justify-between gap-2 border-b border-border/50 py-1 text-left last:border-0 hover:text-foreground"
                    >
                      <span className="min-w-0 truncate">
                        {o.market} · {o.contract}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular">{Math.round(o.creation)}</span>
                        <StateTag state={o.phase} />
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="py-4 text-center text-muted-foreground">Nothing forming.</li>
              )}
            </ul>
          </Panel>

          <Panel title="RELEASE WATCH" subtitle="RIPE is not CONFIRMED — evidence only">
            <ul className="space-y-1 text-[11px]">
              {snap.releaseWatch.length ? (
                snap.releaseWatch.map((o) => (
                  <li key={o.opportunityId}>
                    <button
                      type="button"
                      onClick={() => pick(o.opportunityId)}
                      className="flex w-full items-center justify-between gap-2 border-b border-border/50 py-1 text-left last:border-0 hover:text-foreground"
                    >
                      <span className="min-w-0 truncate">
                        {o.market} · {o.contract}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular">{Math.round(o.releaseProximity)}</span>
                        <StateTag state={o.phase} />
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="py-4 text-center text-muted-foreground">
                  No structure near release.
                </li>
              )}
            </ul>
          </Panel>

          {snap.conflicted.length ? (
            <Panel title="CONFLICTED" subtitle="Opposing structure detected — stand aside">
              <ul className="space-y-1 text-[11px]">
                {snap.conflicted.map((o) => (
                  <li key={o.opportunityId} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {o.market} · {o.contract}
                    </span>
                    <span className="tabular text-conflict">{Math.round(o.conflict)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>

      {detail ? (
        <>
          <h3 className="mono-label px-1">PROVENANCE · {detail.opportunityId}</h3>
          <Provenance o={detail} />
        </>
      ) : null}
    </div>
  );
}

export function LedgerView({ snap }: { snap: OpportunitySnapshot }) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const f = filter.trim().toUpperCase();
    const list = [...snap.ledger].reverse();
    return f
      ? list.filter((e) =>
          `${e.symbol} ${e.market} ${e.contract} ${e.type} ${e.opportunityId}`
            .toUpperCase()
            .includes(f),
        )
      : list;
  }, [snap.ledger, filter]);

  return (
    <Panel
      title="EVENT LEDGER"
      subtitle="Meaningful structural events only — no per-tick noise"
      actions={
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter market / event"
          className="mono-label w-40 rounded border border-border bg-transparent px-2 py-1 outline-none focus:border-signal"
        />
      }
    >
      <ul className="max-h-[70vh] space-y-1 overflow-y-auto text-[11px]">
        {rows.length ? (
          rows.map((e) => <EventLine key={e.id} e={e} />)
        ) : (
          <li className="py-6 text-center text-muted-foreground">No events recorded yet.</li>
        )}
      </ul>
    </Panel>
  );
}
