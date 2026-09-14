/**
 * PRESENTATION LAYER ONLY.
 *
 * This component renders the output of the existing authoritative scanner
 * (src/lib/liquidity/scanner.ts). It performs NO analysis: no ranking, no
 * qualification, no psychology interpretation, no liquidity computation.
 * Every number shown is read directly from the engine's ScanResult.
 */

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Clock,
  Minus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useBestLiquidityScanner, type ScanResult } from "@/lib/liquidity/useIntelligence";
import { COOLDOWN_SECONDS } from "@/lib/liquidity/scanner";

/* ---------------------------------------------------------------- labels -- */

/** Qualitative reading of the engine's liquidity level. Label only. */
function liquidityBand(level: number): { label: string; tone: string } {
  if (level >= 80) return { label: "MATURE", tone: "text-calm" };
  if (level >= 60) return { label: "STRONG", tone: "text-signal" };
  if (level >= 35) return { label: "DEVELOPING", tone: "text-caution" };
  return { label: "LOW", tone: "text-muted-foreground" };
}

/** Qualitative reading of the engine's Sentinel psychology adherence. */
function adherenceBand(pct: number): { label: string; tone: string } {
  if (pct >= 85) return { label: "Strong alignment", tone: "text-calm" };
  if (pct >= 70) return { label: "Good alignment", tone: "text-signal" };
  if (pct >= 50) return { label: "Mixed alignment", tone: "text-caution" };
  return { label: "Weak alignment", tone: "text-danger" };
}

const TRAJECTORY_GLYPH: Record<string, { glyph: string; tone: string }> = {
  STRENGTHENING: { glyph: "↑ Strengthening", tone: "text-calm" },
  MATURING: { glyph: "↑ Maturing", tone: "text-signal" },
  RELEASING: { glyph: "↑ Releasing", tone: "text-state-ripe" },
  STABLE: { glyph: "→ Stable", tone: "text-muted-foreground" },
  EXHAUSTING: { glyph: "→ Exhausting", tone: "text-caution" },
  WEAKENING: { glyph: "↓ Weakening", tone: "text-danger" },
  INVALIDATING: { glyph: "↓ Invalidating", tone: "text-danger" },
};

function age(r: ScanResult) {
  const s = Math.max(0, Math.round(r.formationAgeSeconds || 0));
  const m = Math.floor(s / 60);
  return `${r.formationAge} ticks · ${m > 0 ? `${m}m ` : ""}${s % 60}s`;
}

/**
 * Deterministic narration of engine outputs. Introduces no new facts, no
 * predictions and no probability claims — it only reads existing fields.
 */
function aiInsight(r: ScanResult): string {
  const liq = liquidityBand(Math.round(r.liquidityLevel ?? 0));
  const psy = adherenceBand(Math.round(r.psychologyAdherence ?? 0));
  const parts: string[] = [];

  parts.push(
    `Observed liquidity is ${liq.label.toLowerCase()} at ${Math.round(r.liquidityLevel ?? 0)}% after ${r.formationAge} ticks of persistence`,
  );
  parts.push(
    `Sentinel psychology adherence reads ${Math.round(r.psychologyAdherence ?? 0)}% (${psy.label.toLowerCase()})`,
  );

  const traj = TRAJECTORY_GLYPH[r.trajectory]?.glyph.replace(/^[↑↓→]\s/, "") ?? r.trajectory;
  parts.push(
    `the formation is in ${r.lifecycleState.replace(/_/g, " ")} with a ${traj.toLowerCase()} trajectory`,
  );

  if (r.qualified) {
    parts.push("the engine reports all structural qualification gates satisfied");
  } else {
    const why = r.qualificationReasons?.[0] ?? r.qualificationReason;
    parts.push(
      `qualification is withheld: ${String(why || "structural gates not met").toLowerCase()}`,
    );
  }

  return parts.join(". ") + ".";
}

/* ------------------------------------------------------------ components -- */

function Gauge({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: number;
  caption: string;
  tone: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  const segments = 20;
  const lit = Math.round((v / 100) * segments);
  return (
    <div className="glass rounded-xl p-5">
      <div className="mono-label">{label}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="tabular text-5xl leading-none font-semibold tracking-tight">{v}</span>
        <span className="text-sm text-muted-foreground">/ 100</span>
      </div>
      <div className={cn("mt-1 text-sm font-medium", tone)}>{caption}</div>
      <div className="mt-4 flex gap-[3px]" aria-hidden>
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 flex-1 rounded-[2px] transition-colors duration-700",
              i < lit ? "bg-signal/80" : "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string | undefined }) {
  return (
    <div className="min-w-0">
      <div className="mono-label">{label}</div>
      <div className={cn("truncate text-sm font-medium", tone ?? "text-foreground")}>{value}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- screen -- */

export function SignalBriefing({
  onInspect,
  activeMarketSymbol,
}: {
  onInspect?: (symbol: string, contractId: string) => void;
  activeMarketSymbol?: string;
}) {
  const {
    currentSelection,
    bestQualified,
    cooldownActive,
    cooldownRemainingSeconds,
    isScanning,
    noRankedFound,
    totalScansPerformed,
    scan,
  } = useBestLiquidityScanner();

  const [showInsight] = useState(true);
  const r = currentSelection;

  const insight = useMemo(() => (r ? aiInsight(r) : ""), [r]);

  const liqLevel = Math.round(r?.liquidityLevel ?? 0);
  const liq = liquidityBand(liqLevel);
  const psyPct = Math.round(r?.psychologyAdherence ?? 0);
  const psy = adherenceBand(psyPct);
  const traj = r ? (TRAJECTORY_GLYPH[r.trajectory] ?? TRAJECTORY_GLYPH["STABLE"]) : null;

  return (
    <section className="space-y-4">
      {/* Scan bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Best ranked formation</h2>
          <p className="text-xs text-muted-foreground">
            Deliberate snapshot of the intelligence engine · {totalScansPerformed} scans this
            session
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cooldownActive ? (
            <span className="mono-label tabular">hold {cooldownRemainingSeconds}s</span>
          ) : null}
          <button
            type="button"
            onClick={() => scan()}
            disabled={isScanning}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
              isScanning
                ? "cursor-wait bg-signal/15 text-signal"
                : "bg-signal text-primary-foreground hover:bg-signal/90",
            )}
          >
            {isScanning ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Zap className="size-4" />
            )}
            {isScanning ? "Scanning" : "Scan"}
          </button>
        </div>
      </div>

      {cooldownActive ? (
        <div className="h-px w-full overflow-hidden bg-border">
          <div
            className="h-full bg-signal/60 transition-[width] duration-1000 ease-linear"
            style={{
              width: `${Math.max(0, Math.min(100, ((COOLDOWN_SECONDS - cooldownRemainingSeconds) / COOLDOWN_SECONDS) * 100))}%`,
            }}
          />
        </div>
      ) : null}

      {!r ? (
        <div className="glass flex h-56 flex-col items-center justify-center gap-2 rounded-2xl text-center">
          <Activity className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {noRankedFound
              ? "No rankable formation is present in the observed universe yet."
              : "Press Scan to capture the current intelligence state."}
          </p>
        </div>
      ) : (
        <>
          {/* HERO */}
          <div className="glass-hero rounded-2xl p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="mono-label text-signal">Rank #1 · {r.zoneId}</div>
                <h3 className="mt-1 text-4xl leading-none font-semibold tracking-tight md:text-5xl">
                  {r.symbol}
                  <span className="ml-3 text-muted-foreground">{r.contract}</span>
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {r.market} · scanned {r.formattedTime}
                </p>
              </div>

              <div
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium",
                  r.qualified ? "bg-calm/12 text-calm" : "bg-caution/12 text-caution",
                )}
              >
                {r.qualified ? (
                  <ShieldCheck className="size-4" />
                ) : (
                  <ShieldAlert className="size-4" />
                )}
                {r.qualified ? "QUALIFIED" : "NOT QUALIFIED"}
              </div>
            </div>

            {/* The two decision indicators */}
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Gauge label="Liquidity level" value={liqLevel} caption={liq.label} tone={liq.tone} />
              <Gauge
                label="Psychology adherence"
                value={psyPct}
                caption={psy.label}
                tone={psy.tone}
              />
            </div>

            {/* Supporting line */}
            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/60 pt-5 md:grid-cols-5">
              <Stat label="Phase" value={r.lifecycleState.replace(/_/g, " ")} />
              <Stat label="Trajectory" value={traj?.glyph ?? r.trajectory} tone={traj?.tone} />
              <Stat label="Age" value={age(r)} />
              <Stat label="Evidence" value={r.multiWindowSupport} />
              <Stat label="Confirmation" value={`${Math.round(r.releaseReadiness)}%`} />
            </div>

            {!r.qualified ? (
              <p className="mt-4 text-sm text-caution/90">
                {r.qualificationReasons?.[0] ?? r.qualificationReason}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {onInspect ? (
                <button
                  type="button"
                  onClick={() => onInspect(r.symbol, r.contractId)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-4 py-2 text-sm transition-colors hover:border-signal"
                >
                  {activeMarketSymbol === r.symbol ? "Viewing market" : "Inspect market"}
                  <ArrowRight className="size-3.5" />
                </button>
              ) : null}
              <span className="mono-label tabular flex items-center gap-1.5">
                <Clock className="size-3" />
                held #1 for {Math.floor((r.rankHoldTimeSeconds || 0) / 60)}m{" "}
                {(r.rankHoldTimeSeconds || 0) % 60}s
              </span>
            </div>
          </div>

          {/* AI INSIGHT + WHY #1 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {showInsight ? (
              <div className="glass rounded-2xl p-5">
                <div className="mono-label flex items-center gap-1.5 text-signal">
                  <Sparkles className="size-3" />
                  AI insight
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground/90">{insight}</p>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Observed and inferred structure from public tick data. Not a probability, not a
                  forecast, not a claim about order flow.
                </p>
              </div>
            ) : null}

            <div className="glass rounded-2xl p-5">
              <div className="mono-label">Why this is #1</div>
              <ul className="mt-2 space-y-1.5">
                {r.explanation.primaryReasons.slice(0, 4).map((reason, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground/90">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-signal" aria-hidden />
                    {reason}
                  </li>
                ))}
              </ul>
              {r.explanation.runnerUpComparison ? (
                <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  {r.explanation.runnerUpComparison.summary} Runner-up:{" "}
                  {r.explanation.runnerUpComparison.runnerUpSymbol}{" "}
                  {r.explanation.runnerUpComparison.runnerUpContract}.
                </p>
              ) : null}
            </div>
          </div>

          {/* BEST QUALIFIED (separate concept from best ranked) */}
          {bestQualified && bestQualified.zoneId !== r.zoneId ? (
            <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
              <div className="min-w-0">
                <div className="mono-label text-calm">Best qualified</div>
                <div className="mt-1 text-xl font-semibold tracking-tight">
                  {bestQualified.symbol}
                  <span className="ml-2 text-muted-foreground">{bestQualified.contract}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <Stat
                  label="Liquidity"
                  value={`${Math.round(bestQualified.liquidityLevel ?? 0)}`}
                />
                <Stat
                  label="Psychology"
                  value={`${Math.round(bestQualified.psychologyAdherence ?? 0)}%`}
                />
                <Stat label="Phase" value={bestQualified.lifecycleState.replace(/_/g, " ")} />
                {onInspect ? (
                  <button
                    type="button"
                    onClick={() => onInspect(bestQualified.symbol, bestQualified.contractId)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-4 py-2 text-sm transition-colors hover:border-calm"
                  >
                    Inspect
                    <ArrowRight className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* EVIDENCE TIMELINE — story of the formation */}
          {r.timeline.length > 0 ? (
            <div className="glass rounded-2xl p-5">
              <div className="mono-label">Evidence timeline</div>
              <ol className="mt-3 space-y-0">
                {r.timeline
                  .slice(-8)
                  .reverse()
                  .map((ev, i, arr) => (
                    <li key={ev.id} className="relative flex gap-4 pb-4 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            i === 0 ? "bg-signal" : "bg-border-strong",
                          )}
                          aria-hidden
                        />
                        {i < arr.length - 1 ? (
                          <span className="w-px flex-1 bg-border" aria-hidden />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">{ev.title}</span>
                          <span className="mono-label tabular">{ev.timeStr}</span>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {ev.description}
                        </p>
                      </div>
                    </li>
                  ))}
              </ol>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function TrajectoryIcon({ trajectory }: { trajectory: string }) {
  if (trajectory === "STRENGTHENING" || trajectory === "MATURING")
    return <TrendingUp className="size-3.5 text-calm" />;
  if (trajectory === "WEAKENING" || trajectory === "INVALIDATING")
    return <TrendingDown className="size-3.5 text-danger" />;
  return <Minus className="size-3.5 text-muted-foreground" />;
}
