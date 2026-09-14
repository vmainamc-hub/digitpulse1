import { useState } from "react";
import {
  Zap,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  Layers,
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  Check,
  History,
  Activity,
  Milestone,
  HelpCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Meter, StateTag } from "@/components/li/primitives";
import { useBestLiquidityScanner, type ScanResult } from "@/lib/liquidity/useIntelligence";
import { COOLDOWN_SECONDS } from "@/lib/liquidity/scanner";
import type { FormationTimelineEvent } from "@/lib/liquidity/zones";

interface BestLiquidityPanelProps {
  onSelectMarket?: (symbol: string) => void;
  onSelectContract?: (contractId: string) => void;
  activeMarketSymbol?: string;
}

const JOURNEY_PHASES = [
  { id: "FORMING", label: "FORMING" },
  { id: "BUILDING", label: "BUILDING" },
  { id: "MATURE", label: "MATURE" },
  { id: "EXHAUSTION", label: "EXHAUSTION" },
  { id: "DELIVERY", label: "DELIVERY" },
  { id: "ABSORBING", label: "ABSORBING" },
  { id: "RELEASE", label: "RELEASE" },
  { id: "CONFIRMED", label: "CONFIRMED" },
] as const;

function getPhaseIndex(phase: string): number {
  switch (phase) {
    case "FORMING":
      return 0;
    case "BUILDING":
      return 1;
    case "MATURE":
      return 2;
    case "EXHAUSTING":
    case "EXHAUSTION_WATCH":
    case "EXHAUSTION_CONFIRMED":
      return 3;
    case "DELIVERY":
    case "DELIVERY_ACCELERATING":
      return 4;
    case "ABSORBING":
      return 5;
    case "RIPE":
    case "RELEASE_WATCH":
    case "RELEASE":
    case "DIRECTIONAL_MOVE":
      return 6;
    case "CONFIRMED":
      return 7;
    default:
      return 0;
  }
}

export function BestLiquidityPanel({
  onSelectMarket,
  onSelectContract,
  activeMarketSymbol,
}: BestLiquidityPanelProps) {
  const {
    currentSelection,
    bestQualified,
    allRanked,
    cooldownRemainingSeconds,
    cooldownActive,
    isScanning,
    noRankedFound,
    noQualifiedFound,
    lastOverride,
    overrideCount,
    rankHoldTimeSeconds,
    scanHistory,
    scan,
    totalScansPerformed,
  } = useBestLiquidityScanner();

  const [scanPulse, setScanPulse] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTelescope, setShowTelescope] = useState(false);

  const handleScan = () => {
    setScanPulse(true);
    scan();
    setTimeout(() => setScanPulse(false), 800);
  };

  const selectedSymbol = currentSelection?.symbol;
  const isViewingSelected = Boolean(
    activeMarketSymbol && selectedSymbol && selectedSymbol === activeMarketSymbol,
  );

  const bestQualifiedSymbol = bestQualified?.symbol;
  const isViewingBestQualified = Boolean(
    activeMarketSymbol && bestQualifiedSymbol && bestQualifiedSymbol === activeMarketSymbol,
  );

  const currentPhaseIndex = currentSelection ? getPhaseIndex(currentSelection.lifecycleState) : 0;

  return (
    <div className="space-y-3 font-mono">
      {/* SECTION 1: SCANNER ACTION BAR */}
      <div className="relative overflow-hidden rounded-md border border-signal/40 bg-surface-raised/90 p-3 shadow-xs font-sans">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-signal/5 blur-2xl" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-signal uppercase">
                <Layers className="size-3" />
                Layer 3 · Liquidity Scanner
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                Rank First · Qualify Second · 15 Deriv Synthetic Markets
              </span>
            </div>
            <p className="text-xs text-foreground/90 font-medium">
              Evaluates all persistent formations by accumulated evidence. Displays the absolute #1
              ranked formation and separately assesses structural qualification.
            </p>
          </div>

          {/* Scanner Button Group */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning}
              className={cn(
                "relative flex items-center gap-2 rounded px-4 py-2 font-mono text-xs font-semibold tracking-wider transition-all select-none shadow-xs",
                isScanning
                  ? "border border-signal/60 bg-signal/20 text-signal cursor-wait"
                  : cooldownActive
                    ? "border border-border-strong bg-surface hover:border-signal hover:bg-surface-raised text-foreground"
                    : "border border-signal bg-signal text-background hover:bg-signal/90 shadow-sm",
                scanPulse && "ring-2 ring-signal ring-offset-1 ring-offset-background",
              )}
            >
              {isScanning ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin text-signal" />
                  <span>SCANNING...</span>
                </>
              ) : cooldownActive ? (
                <>
                  <Clock className="size-3.5 text-signal" />
                  <span>SCAN — {cooldownRemainingSeconds}s</span>
                </>
              ) : (
                <>
                  <Zap className="size-3.5 fill-current" />
                  <span>SCAN FOR BEST LIQUIDITY</span>
                </>
              )}
            </button>

            {cooldownActive && !isScanning && (
              <button
                type="button"
                onClick={handleScan}
                title="Force a new deliberate scan immediately"
                className="rounded border border-border px-2.5 py-2 font-mono text-[10px] hover:border-signal hover:text-foreground transition-colors"
              >
                Force Re-scan
              </button>
            )}
          </div>
        </div>

        {/* Cooldown progress bar */}
        {cooldownActive && (
          <div className="mt-2.5 space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>Anti-churn cooldown active</span>
              <span>{cooldownRemainingSeconds}s remaining</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-signal transition-all duration-1000 ease-linear"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      ((COOLDOWN_SECONDS - cooldownRemainingSeconds) / COOLDOWN_SECONDS) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: SMART OVERRIDE ALERT BANNER */}
      {currentSelection?.isOverride && (
        <div className="flex items-start gap-2.5 rounded-md border border-signal/50 bg-signal/10 p-2.5 text-xs text-signal font-sans">
          <Sparkles className="size-4 shrink-0 text-signal mt-0.5" />
          <div className="space-y-0.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold font-mono text-[11px] uppercase tracking-wider">
                Material Superiority Override Triggered (#{currentSelection.overrideCount})
              </span>
              <span className="text-[10px] font-mono opacity-80">Cooldown bypassed</span>
            </div>
            <p className="text-[11px] text-foreground/90 font-mono">
              Overrode previous selection {currentSelection.previousMarketContract} (
              {currentSelection.previousScore?.toFixed(1)} pts):{" "}
              {currentSelection.overrideReason ||
                "Candidate demonstrated superior structural backing."}
            </p>
          </div>
        </div>
      )}

      {/* SECTION 3: INVALIDATION BANNER */}
      {currentSelection?.isInvalidated && (
        <div className="flex items-start gap-2.5 rounded-md border border-danger/60 bg-danger/10 p-2.5 text-xs text-danger font-sans">
          <AlertTriangle className="size-4 shrink-0 text-danger mt-0.5" />
          <div className="space-y-0.5 flex-1">
            <span className="font-semibold font-mono text-[11px] uppercase tracking-wider">
              Selected Formation Invalidated
            </span>
            <p className="text-[11px] text-foreground/90 font-mono">
              {currentSelection.invalidationReason ||
                "Structural evidence has deteriorated or Sentinel psychology has been rejected."}
            </p>
          </div>
        </div>
      )}

      {/* SECTION 4: MAIN DUAL-CARD GRID */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* LEFT / PRIMARY CARD: BEST RANKED FORMATION (#1) */}
        <div className={cn("space-y-3", bestQualified ? "lg:col-span-7" : "lg:col-span-12")}>
          {currentSelection ? (
            <div className="rounded-md border-2 border-signal/60 bg-surface-raised p-4 shadow-sm space-y-4">
              {/* Formation Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/80 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-signal px-2 py-0.5 text-xs font-bold text-background uppercase tracking-wider">
                      <Award className="size-3.5 fill-current" />
                      RANK #1
                    </span>
                    <span className="text-lg font-bold tracking-tight text-foreground">
                      {currentSelection.symbol} · {currentSelection.contract}
                    </span>
                    <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {currentSelection.zoneId}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-0.5">
                    <span className="flex items-center gap-1">
                      <span className="text-foreground font-semibold">Phase:</span>
                      <StateTag state={currentSelection.lifecycleState} />
                    </span>

                    <span className="flex items-center gap-1">
                      <span className="text-foreground font-semibold">Trajectory:</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 font-semibold text-[11px]",
                          currentSelection.trajectory === "STRENGTHENING" && "text-calm",
                          currentSelection.trajectory === "WEAKENING" && "text-danger",
                          currentSelection.trajectory === "RELEASING" && "text-signal",
                          currentSelection.trajectory === "STABLE" && "text-muted-foreground",
                        )}
                      >
                        {currentSelection.trajectory === "STRENGTHENING" && (
                          <TrendingUp className="size-3" />
                        )}
                        {currentSelection.trajectory === "WEAKENING" && (
                          <TrendingDown className="size-3" />
                        )}
                        {currentSelection.trajectory === "STABLE" && <Minus className="size-3" />}
                        {currentSelection.trajectory}
                        {currentSelection.trajectoryData?.evidenceMomentum !== undefined &&
                          ` (${currentSelection.trajectoryData.evidenceMomentum > 0 ? "+" : ""}${currentSelection.trajectoryData.evidenceMomentum.toFixed(1)})`}
                      </span>
                    </span>

                    <span className="flex items-center gap-1">
                      <Clock className="size-3 text-muted-foreground" />
                      <span>
                        Age: {currentSelection.formationAge} ticks (
                        {Math.floor(currentSelection.formationAgeSeconds / 60)}m{" "}
                        {currentSelection.formationAgeSeconds % 60}s)
                      </span>
                    </span>

                    {currentSelection.rankHoldTimeSeconds > 0 && (
                      <span className="text-[10px] text-signal/90 font-medium">
                        Held #1 for {Math.floor(currentSelection.rankHoldTimeSeconds / 60)}m{" "}
                        {currentSelection.rankHoldTimeSeconds % 60}s
                      </span>
                    )}
                  </div>
                </div>

                {/* Score & Actions */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-2xl font-black text-signal tracking-tight">
                      {currentSelection.score.toFixed(1)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Composite Rank Score
                    </div>
                  </div>

                  {onSelectMarket && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectMarket(currentSelection.symbol);
                        if (onSelectContract) onSelectContract(currentSelection.contractId);
                      }}
                      className={cn(
                        "rounded px-2.5 py-1.5 text-xs font-semibold tracking-wider transition-colors flex items-center gap-1.5",
                        isViewingSelected
                          ? "bg-signal/20 text-signal border border-signal/40"
                          : "bg-surface border border-border hover:border-signal text-foreground",
                      )}
                    >
                      {isViewingSelected ? "Viewing" : "Inspect"}
                      <ArrowRight className="size-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* WHY #1 DYNAMIC SECTION */}
              <div className="rounded-md border border-signal/30 bg-signal/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-signal uppercase tracking-wider">
                  <Sparkles className="size-3.5" />
                  <span>Why This Formation is Ranked #1</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                  {currentSelection.explanation.primaryReasons.map((reason, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-foreground/90">
                      <Check className="size-3.5 text-signal shrink-0 mt-0.5" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>

                {/* Runner-Up Comparison */}
                {currentSelection.explanation.runnerUpComparison && (
                  <div className="mt-2 border-t border-signal/20 pt-2 text-[11px] text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-foreground/90 font-medium">
                      {currentSelection.explanation.runnerUpComparison.summary}
                    </span>
                    <span className="text-signal text-[10px]">
                      Runner-up: {currentSelection.explanation.runnerUpComparison.runnerUpSymbol}{" "}
                      {currentSelection.explanation.runnerUpComparison.runnerUpContract} (
                      {currentSelection.explanation.runnerUpComparison.runnerUpScore.toFixed(1)})
                    </span>
                  </div>
                )}
              </div>

              {/* FORMATION JOURNEY PIPELINE */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Milestone className="size-3 text-signal" />
                    Formation Development Journey
                  </span>
                  <span className="text-[10px] text-signal font-normal">
                    Current: {currentSelection.lifecycleState}
                  </span>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 pt-1">
                  {JOURNEY_PHASES.map((p, idx) => {
                    const isPast = idx < currentPhaseIndex;
                    const isCurrent = idx === currentPhaseIndex;
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "flex flex-col items-center justify-center p-1.5 rounded text-center transition-all border",
                          isCurrent
                            ? "bg-signal text-background border-signal font-bold shadow-xs scale-102"
                            : isPast
                              ? "bg-surface border-signal/40 text-signal/80 font-medium"
                              : "bg-surface/50 border-border/50 text-muted-foreground/50",
                        )}
                      >
                        <span className="text-[9px] tracking-tight">{p.label}</span>
                        {isPast && <Check className="size-2.5 mt-0.5 text-signal" />}
                        {isCurrent && <Activity className="size-2.5 mt-0.5 animate-pulse" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* EVIDENCE TIMELINE (CHRONOLOGICAL EVENT LOG) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <History className="size-3 text-signal" />
                    Evidence Timeline (Logged Structural Events)
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    {currentSelection.timeline.length} milestones recorded
                  </span>
                </div>

                {currentSelection.timeline.length > 0 ? (
                  <div className="max-h-36 overflow-y-auto space-y-1 rounded border border-border bg-surface p-2 pr-1">
                    {currentSelection.timeline.slice(-6).map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-start justify-between gap-2 text-[11px] border-b border-border/40 pb-1 last:border-0 last:pb-0"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-signal font-semibold">{ev.title}</span>
                            <span className="text-[9px] text-muted-foreground">({ev.phase})</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            {ev.description}
                          </p>
                        </div>
                        <span className="text-[9px] text-muted-foreground/70 shrink-0 font-mono">
                          {ev.timeStr}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-border bg-surface p-2 text-center text-[10px] text-muted-foreground">
                    Formation recently initialized. Accumulating structural evidence milestones...
                  </div>
                )}
              </div>

              {/* STRUCTURAL QUALIFICATION STATUS BANNER */}
              <div
                className={cn(
                  "rounded-md border p-3 text-xs space-y-1.5",
                  currentSelection.qualified
                    ? "border-calm/60 bg-calm/10 text-calm"
                    : "border-warning/60 bg-warning/10 text-warning",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
                    {currentSelection.qualified ? (
                      <>
                        <ShieldCheck className="size-4 text-calm" />
                        <span>STRUCTURAL STATUS: QUALIFIED (TRADE READY)</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="size-4 text-warning" />
                        <span>STRUCTURAL STATUS: NOT QUALIFIED (MONITOR ONLY)</span>
                      </>
                    )}
                  </div>
                  <span className="rounded bg-background/50 px-2 py-0.5 font-mono text-[10px] font-semibold">
                    {currentSelection.qualificationStatus}
                  </span>
                </div>

                <div className="text-[11px] text-foreground/90">
                  {currentSelection.qualified ? (
                    <p>Passed all hard Sentinel psychology and structural confirmation gates.</p>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-semibold text-warning">
                        Structural Disqualification Reasons:
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                        {currentSelection.qualificationReasons.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* METRIC ACCUMULATOR METERS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <Meter
                  label="Reservoir"
                  value={currentSelection.reservoirScore}
                  hint="Winning neglected digits"
                />
                <Meter
                  label="Exhaustion"
                  value={currentSelection.dominantExhaustion}
                  hint="Dominant decay"
                />
                <Meter
                  label="Delivery"
                  value={currentSelection.deliveryScore}
                  hint="Active reservoir flow"
                />
                <Meter
                  label="Migration"
                  value={currentSelection.migrationScore}
                  hint="Markov transition shift"
                />
              </div>

              {/* TOGGLE: MULTI-WINDOW TELESCOPE */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowTelescope(!showTelescope)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-signal transition-colors"
                >
                  {showTelescope ? (
                    <ChevronUp className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                  <span>Multi-Window Intelligence Telescope (1000 down to 10 ticks)</span>
                </button>

                {showTelescope && (
                  <div className="mt-2 rounded border border-border bg-surface p-2 text-xs space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted-foreground">1000 Ticks:</span>{" "}
                        <span className="text-foreground font-semibold">
                          {currentSelection.psychologyValidity} Psychology
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Support Ratio:</span>{" "}
                        <span className="text-foreground font-semibold">
                          {currentSelection.multiWindowSupport} Core Dimensions
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Conflict:</span>{" "}
                        <span className="text-foreground font-semibold">
                          {currentSelection.conflictScore}% ({currentSelection.conflictLevel})
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Release Readiness:</span>{" "}
                        <span className="text-foreground font-semibold">
                          {currentSelection.releaseReadiness}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-surface-raised p-8 text-center text-muted-foreground space-y-2">
              <Zap className="size-8 mx-auto text-muted-foreground/40" />
              <div className="font-medium text-sm text-foreground">No Formation Selected</div>
              <p className="text-xs max-w-md mx-auto">
                Press <strong>SCAN FOR BEST LIQUIDITY</strong> above to evaluate all 15 synthetic
                markets and rank their persistent liquidity formations.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT CARD: BEST QUALIFIED FORMATION (IF DIFFERENT FROM #1) */}
        {currentSelection && (
          <div className="lg:col-span-5 space-y-3">
            <div className="rounded-md border border-calm/40 bg-surface-raised p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-border/80 pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-calm" />
                  <span className="text-xs font-bold uppercase tracking-wider text-calm">
                    Best Qualified Formation
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Highest-Ranked Trade-Ready Formation
                </span>
              </div>

              {currentSelection.qualified ? (
                <div className="rounded border border-calm/30 bg-calm/5 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-calm">
                    <CheckCircle2 className="size-3.5" />
                    <span>Rank #1 Formation is Already Qualified</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {currentSelection.symbol} {currentSelection.contract} successfully passed all
                    hard Sentinel psychology constraints and structural verification gates.
                  </p>
                </div>
              ) : bestQualified ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-calm/20 border border-calm/50 px-1.5 py-0.5 text-[10px] font-bold text-calm">
                          RANK #{bestQualified.rank}
                        </span>
                        <span className="text-base font-bold text-foreground">
                          {bestQualified.symbol} · {bestQualified.contract}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {bestQualified.zoneId} · Phase:{" "}
                        <span className="text-foreground font-semibold">
                          {bestQualified.lifecycleState}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-bold text-calm">
                        {bestQualified.score.toFixed(1)}
                      </div>
                      <div className="text-[9px] text-muted-foreground uppercase">Score</div>
                    </div>
                  </div>

                  <div className="rounded bg-surface p-2 text-[11px] space-y-1 border border-border">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Delivery:</span>
                      <span className="text-foreground font-semibold">
                        {bestQualified.deliveryScore}%
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Exhaustion:</span>
                      <span className="text-foreground font-semibold">
                        {bestQualified.dominantExhaustion}%
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Reservoir:</span>
                      <span className="text-foreground font-semibold">
                        {bestQualified.reservoirScore}%
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Persistence:</span>
                      <span className="text-foreground font-semibold">
                        {bestQualified.formationAge} ticks
                      </span>
                    </div>
                  </div>

                  {onSelectMarket && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectMarket(bestQualified.symbol);
                        if (onSelectContract) onSelectContract(bestQualified.contractId);
                      }}
                      className={cn(
                        "w-full rounded py-1.5 text-xs font-semibold tracking-wider transition-colors flex items-center justify-center gap-1.5",
                        isViewingBestQualified
                          ? "bg-calm/20 text-calm border border-calm/40"
                          : "bg-surface border border-border hover:border-calm text-foreground",
                      )}
                    >
                      {isViewingBestQualified ? "Viewing Best Qualified" : "Inspect Best Qualified"}
                      <ArrowRight className="size-3" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded border border-warning/30 bg-warning/5 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-warning">
                    <AlertTriangle className="size-3.5" />
                    <span>No Formations Currently Qualified</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    All currently active formations in the universe failed one or more structural
                    gates (e.g. losing-side Red/Purple digit, invalid parity, or excessive
                    conflict).
                  </p>
                </div>
              )}
            </div>

            {/* SCAN HISTORY SUMMARY */}
            <div className="rounded-md border border-border bg-surface-raised p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <History className="size-3.5 text-signal" />
                  Recent Scans ({scanHistory.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-[10px] text-signal hover:underline"
                >
                  {showHistory ? "Hide" : "Show"}
                </button>
              </div>

              {showHistory && scanHistory.length > 0 && (
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {scanHistory.map((snap) => (
                    <div
                      key={snap.id}
                      className="flex items-center justify-between text-[10px] p-1.5 rounded bg-surface border border-border/50"
                    >
                      <div>
                        <span className="font-semibold text-foreground">
                          {snap.selectedSymbol} {snap.selectedContract}
                        </span>
                        <span className="text-muted-foreground ml-1">
                          ({snap.selectedScore.toFixed(1)})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "px-1 py-0.2 rounded font-semibold text-[9px]",
                            snap.selectedQualified
                              ? "bg-calm/10 text-calm"
                              : "bg-warning/10 text-warning",
                          )}
                        >
                          {snap.selectedQualified ? "QUALIFIED" : "NOT QUAL"}
                        </span>
                        <span className="text-muted-foreground/70">{snap.formattedTime}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 5: EXPANDABLE UNIVERSE LEADERBOARD */}
      {allRanked.length > 0 && (
        <div className="rounded-md border border-border bg-surface-raised p-3 space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowLeaderboard(!showLeaderboard)}
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-signal transition-colors"
            >
              {showLeaderboard ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
              <span>Ranked Formations Leaderboard ({allRanked.length} Active in Universe)</span>
            </button>
            <span className="text-[10px] text-muted-foreground">
              Sorted by Composite Score (Descending)
            </span>
          </div>

          {showLeaderboard && (
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="pb-1.5 font-medium">Rank</th>
                    <th className="pb-1.5 font-medium">Market / Contract</th>
                    <th className="pb-1.5 font-medium">Score</th>
                    <th className="pb-1.5 font-medium">Phase</th>
                    <th className="pb-1.5 font-medium">Trajectory</th>
                    <th className="pb-1.5 font-medium">Qualification</th>
                    <th className="pb-1.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {allRanked.map((item) => (
                    <tr
                      key={item.zoneId}
                      className={cn(
                        "hover:bg-surface transition-colors",
                        item.rank === 1 && "bg-signal/5 font-semibold",
                      )}
                    >
                      <td className="py-2">
                        <span
                          className={cn(
                            "inline-block w-6 text-center rounded text-[10px] font-bold py-0.5",
                            item.rank === 1
                              ? "bg-signal text-background"
                              : item.rank === 2
                                ? "bg-signal/20 text-signal"
                                : "text-muted-foreground",
                          )}
                        >
                          #{item.rank}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="font-bold text-foreground">
                          {item.symbol} · {item.contract}
                        </div>
                        <div className="text-[9px] text-muted-foreground">{item.zoneId}</div>
                      </td>
                      <td className="py-2 text-signal font-bold">{item.score.toFixed(1)}</td>
                      <td className="py-2">
                        <StateTag state={item.lifecycleState} />
                      </td>
                      <td className="py-2 text-[11px]">{item.trajectory}</td>
                      <td className="py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            item.qualified
                              ? "bg-calm/10 text-calm border border-calm/30"
                              : "bg-warning/10 text-warning border border-warning/30",
                          )}
                        >
                          {item.qualified ? "QUALIFIED" : "NOT QUALIFIED"}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {onSelectMarket && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectMarket(item.symbol);
                              if (onSelectContract) onSelectContract(item.contractId);
                            }}
                            className="rounded border border-border px-2 py-1 text-[10px] hover:border-signal hover:text-signal transition-colors"
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
