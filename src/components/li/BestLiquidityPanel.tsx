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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Meter, StateTag } from "@/components/li/primitives";
import { useBestLiquidityScanner, type ScanResult } from "@/lib/liquidity/useIntelligence";
import { COOLDOWN_SECONDS } from "@/lib/liquidity/scanner";

interface BestLiquidityPanelProps {
  onSelectMarket?: (symbol: string) => void;
  onSelectContract?: (contractId: string) => void;
  activeMarketSymbol?: string;
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
    scan,
    totalScansPerformed,
  } = useBestLiquidityScanner();

  const [scanPulse, setScanPulse] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

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
              Ranks all persistent formations by composite evidence strength, displays the #1 ranked
              formation, and separately determines structural qualification.
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

            {/* If in cooldown, allow force deliberate re-scan */}
            {cooldownActive && !isScanning && (
              <button
                type="button"
                onClick={handleScan}
                title="Force a new deliberate scan immediately"
                className="rounded border border-border px-2.5 py-2 font-mono text-[10px] hover:border-signal hover:text-foreground"
              >
                Force Re-scan
              </button>
            )}
          </div>
        </div>

        {/* Cooldown progress bar */}
        {cooldownActive && (
          <div className="mt-2.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-signal transition-all duration-1000"
                style={{
                  width: `${Math.round(((COOLDOWN_SECONDS - cooldownRemainingSeconds) / COOLDOWN_SECONDS) * 100)}%`,
                }}
              />
            </div>
            <span className="tabular text-foreground/80 font-medium">
              Smart Cooldown: {cooldownRemainingSeconds}s remaining
            </span>
            <span className="text-[9px] text-muted-foreground">
              (Materially superior formations override automatically)
            </span>
          </div>
        )}
      </div>

      {/* SECTION 2: SUPERIOR FORMATION OVERRIDE BANNER */}
      {lastOverride && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-signal/60 bg-signal/10 px-3.5 py-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-signal shrink-0 animate-pulse" />
            <div>
              <strong className="text-signal font-semibold tracking-wide">
                ⚡ SUPERIOR FORMATION OVERRIDE #{overrideCount}
              </strong>
              <div className="mt-0.5 text-[11px] text-foreground/90">
                <span className="text-muted-foreground">Previous: </span>
                <span className="line-through">{lastOverride.previous}</span>
                <ArrowRight className="inline mx-1.5 size-3 text-signal" />
                <span className="text-foreground font-semibold">New: {lastOverride.next}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="rounded bg-signal/20 px-2 py-0.5 text-[10px] font-medium text-signal">
              +{lastOverride.scoreDelta.toFixed(1)} pts advantage
            </span>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{lastOverride.reason}</p>
          </div>
        </div>
      )}

      {/* SECTION 3: INVALIDATION WARNING BANNER */}
      {currentSelection?.isInvalidated && (
        <div className="flex items-center gap-2 rounded-md border border-danger/60 bg-danger/10 px-3.5 py-2 font-mono text-xs text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          <div className="flex-1">
            <strong className="font-semibold">⚠️ SELECTED FORMATION INVALIDATED</strong>
            <p className="mt-0.5 text-[11px] text-foreground/90 font-sans">
              {currentSelection.invalidationReason ||
                "Structural candidate decay or hard Sentinel psychology rules violated."}{" "}
              Press <span className="font-bold text-signal font-mono">SCAN</span> to evaluate fresh
              formations.
            </p>
          </div>
        </div>
      )}

      {/* SECTION 4: SCAN RESULT CONTAINER */}
      {currentSelection ? (
        <div className="space-y-3 font-sans">
          {/* 4A: BEST RANKED FORMATION CARD */}
          <div
            className={cn(
              "panel relative overflow-hidden p-4 transition-all",
              currentSelection.isInvalidated
                ? "border-danger/40 bg-danger/5 opacity-80"
                : "border-signal/50 bg-surface-raised shadow-xs",
            )}
          >
            {/* Card Top Badges */}
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/80 pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                  <span className="inline-flex items-center gap-1 rounded bg-signal/20 px-2 py-0.5 font-bold text-signal">
                    <Award className="size-3" />
                    BEST RANKED FORMATION · #1
                  </span>

                  <span className="rounded border border-border bg-background px-2 py-0.5 text-muted-foreground">
                    ZONE: {currentSelection.zoneId}
                  </span>

                  <StateTag state={currentSelection.lifecycleState} />

                  {/* Explicit Qualification Badge */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold",
                      currentSelection.qualified
                        ? "border border-calm/50 bg-calm/15 text-calm"
                        : "border border-caution/50 bg-caution/15 text-caution",
                    )}
                  >
                    {currentSelection.qualified ? (
                      <>
                        <CheckCircle2 className="size-3 text-calm" />
                        QUALIFIED
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="size-3 text-caution" />
                        NOT QUALIFIED
                      </>
                    )}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-baseline gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-foreground font-mono">
                    {currentSelection.symbol}
                  </h2>
                  <span className="text-sm font-medium text-muted-foreground">
                    {currentSelection.market}
                  </span>
                  <span className="text-base font-semibold text-signal font-mono">
                    {currentSelection.contract}
                  </span>
                </div>
              </div>

              {/* Score and Inspect action */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="font-mono text-[10px] text-muted-foreground block">
                    RANKING SCORE
                  </span>
                  <span className="tabular font-mono text-2xl font-bold text-signal">
                    {currentSelection.score.toFixed(1)}
                    <span className="text-xs text-muted-foreground">/100</span>
                  </span>
                </div>

                {onSelectMarket && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectMarket(currentSelection.symbol);
                      if (onSelectContract) onSelectContract(currentSelection.contractId);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs font-semibold transition-colors",
                      isViewingSelected
                        ? "border-signal bg-signal/15 text-signal"
                        : "border-border-strong bg-surface hover:border-signal hover:text-foreground",
                    )}
                  >
                    <span>{isViewingSelected ? "Viewing Formation" : "Inspect Formation"}</span>
                    <ArrowRight className="size-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Qualification Assessment Details */}
            <div
              className={cn(
                "mt-3 rounded-md border p-2.5 font-mono text-xs",
                currentSelection.qualified
                  ? "border-calm/30 bg-calm/5 text-foreground"
                  : "border-caution/30 bg-caution/5 text-foreground",
              )}
            >
              <div className="flex items-start gap-2">
                {currentSelection.qualified ? (
                  <ShieldCheck className="size-4 text-calm shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="size-4 text-caution shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-wide uppercase">
                      Qualification Analysis:{" "}
                      {currentSelection.qualified ? (
                        <span className="text-calm">PASS</span>
                      ) : (
                        <span className="text-caution">FAILED STRUCTURAL GATE</span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Status: {currentSelection.qualificationStatus}
                    </span>
                  </div>

                  {currentSelection.qualified ? (
                    <p className="text-[11px] text-muted-foreground">
                      Passed all hard Sentinel psychology and structural evidence gates (valid digit
                      structure, non-losing Red/Purple digits, minimum persistence, and low
                      conflict).
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      <p className="text-[11px] text-caution font-medium">
                        Disqualification Reasons:
                      </p>
                      <ul className="list-disc list-inside text-[11px] text-foreground/90 space-y-0.5">
                        {currentSelection.qualificationReasons?.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        )) ?? <li>{currentSelection.qualificationReason}</li>}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Primary Evidence & Psychology Row */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
              <div className="rounded border border-border/70 bg-background/50 p-2.5">
                <span className="block text-[10px] text-muted-foreground">SENTINEL PSYCHOLOGY</span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-base font-bold text-foreground">
                    {currentSelection.psychologyScore}%
                  </span>
                  <span
                    className={cn(
                      "font-semibold text-xs",
                      currentSelection.psychologyValidity === "VALID"
                        ? "text-calm"
                        : currentSelection.psychologyValidity === "WATCH"
                          ? "text-caution"
                          : "text-danger",
                    )}
                  >
                    {currentSelection.psychologyValidity}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground truncate">
                  {currentSelection.psychologyReasons.length
                    ? currentSelection.psychologyReasons[0]
                    : "Valid Sentinel digit structure"}
                </p>
              </div>

              <div className="rounded border border-border/70 bg-background/50 p-2.5">
                <span className="block text-[10px] text-muted-foreground">
                  ACCUMULATED LIQUIDITY
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-base font-bold text-signal">
                    {currentSelection.liquidityScore}%
                  </span>
                  <span className="text-xs text-muted-foreground">Persistent</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Structural memory depth across windows
                </p>
              </div>

              <div className="rounded border border-border/70 bg-background/50 p-2.5">
                <span className="block text-[10px] text-muted-foreground">
                  FORMATION PERSISTENCE
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-base font-bold text-foreground">
                    {currentSelection.formationAge} ticks
                  </span>
                  <span className="text-xs text-muted-foreground tabular">
                    {currentSelection.formationAgeSeconds}s
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Duration: {currentSelection.formationDuration} candidate ticks
                </p>
              </div>

              <div className="rounded border border-border/70 bg-background/50 p-2.5">
                <span className="block text-[10px] text-muted-foreground">
                  TRAJECTORY & SUPPORT
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span
                    className={cn(
                      "text-xs font-bold",
                      currentSelection.trajectory === "RELEASING" ||
                        currentSelection.trajectory === "STRENGTHENING"
                        ? "text-calm"
                        : currentSelection.trajectory === "INVALIDATING" ||
                            currentSelection.trajectory === "WEAKENING"
                          ? "text-danger"
                          : "text-foreground",
                    )}
                  >
                    {currentSelection.trajectory}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {currentSelection.multiWindowSupport} windows
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Scan Time: {currentSelection.formattedTime}
                </p>
              </div>
            </div>

            {/* Sub-Dimension Accumulators Grid */}
            <div className="mt-3.5 border-t border-border/70 pt-3">
              <span className="block mb-2 font-mono text-[10px] text-muted-foreground uppercase">
                FORMATION ACCUMULATION METRICS
              </span>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Meter
                  label={`Reservoir Strength (${currentSelection.reservoirRatio})`}
                  value={currentSelection.reservoirScore}
                  suffix="%"
                />
                <Meter
                  label="Dominant Exhaustion"
                  value={currentSelection.dominantExhaustion}
                  suffix="%"
                />
                <Meter
                  label="Reservoir Delivery"
                  value={currentSelection.deliveryScore}
                  suffix="%"
                />
                <Meter
                  label="Migration / Rotation"
                  value={currentSelection.migrationScore}
                  suffix="%"
                />
                <Meter
                  label="Digit Absorption"
                  value={currentSelection.absorptionScore}
                  suffix="%"
                />
                <Meter
                  label="Release Readiness"
                  value={currentSelection.releaseReadiness}
                  suffix="%"
                />
                <Meter
                  label="Conflict / Contradiction"
                  value={currentSelection.conflictScore}
                  tone={
                    currentSelection.conflictLevel === "HIGH"
                      ? "danger"
                      : currentSelection.conflictLevel === "MODERATE"
                        ? "caution"
                        : "calm"
                  }
                  suffix="%"
                />
                <div className="flex flex-col justify-end font-mono">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[10px] text-muted-foreground">CONFLICT STATE</span>
                    <span
                      className={cn(
                        "font-semibold",
                        currentSelection.conflictLevel === "LOW"
                          ? "text-calm"
                          : currentSelection.conflictLevel === "MODERATE"
                            ? "text-caution"
                            : "text-danger",
                      )}
                    >
                      {currentSelection.conflictLevel}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Opposing structural vectors
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 4B: BEST QUALIFIED FORMATION CARD */}
          <div className="panel p-3.5 border-border bg-surface shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded border border-calm/40 bg-calm/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-calm uppercase">
                  <ShieldCheck className="size-3" />
                  Best Qualified Formation
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Highest-ranked formation passing all hard structural & Sentinel gates
                </span>
              </div>

              {bestQualified && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  Universe Rank: #{bestQualified.rank}
                </span>
              )}
            </div>

            {/* Scenario 1: Best Ranked IS qualified */}
            {currentSelection.qualified ? (
              <div className="mt-2.5 flex items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2 text-calm">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>
                    #1 Ranked formation (<strong>{currentSelection.symbol}</strong>{" "}
                    {currentSelection.contract}) satisfies all qualification gates.
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Score: {currentSelection.score.toFixed(1)}/100 · {currentSelection.lifecycleState}
                </span>
              </div>
            ) : bestQualified ? (
              /* Scenario 2: Best Ranked is NOT qualified, but a qualified formation exists */
              <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 font-mono text-xs">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-signal/15 px-2 py-0.5 text-xs font-bold text-signal">
                      {bestQualified.symbol}
                    </span>
                    <span className="text-foreground/90 font-medium">{bestQualified.contract}</span>
                    <span className="text-muted-foreground text-[11px]">
                      ({bestQualified.market})
                    </span>
                    <StateTag state={bestQualified.lifecycleState} />
                    <span className="rounded border border-calm/50 bg-calm/10 px-1.5 py-0.2 text-[10px] font-semibold text-calm">
                      QUALIFIED
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-sans">
                    Passed Sentinel psychology ({bestQualified.psychologyScore}%),{" "}
                    {bestQualified.formationAge} ticks persistence, conflict{" "}
                    {bestQualified.conflictScore}%.
                  </p>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block">RANKING SCORE</span>
                    <span className="text-base font-bold text-foreground">
                      {bestQualified.score.toFixed(1)}
                      <span className="text-xs text-muted-foreground">/100</span>
                    </span>
                  </div>

                  {onSelectMarket && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectMarket(bestQualified.symbol);
                        if (onSelectContract) onSelectContract(bestQualified.contractId);
                      }}
                      className={cn(
                        "flex items-center gap-1 rounded border px-2.5 py-1 text-xs transition-colors",
                        isViewingBestQualified
                          ? "border-calm bg-calm/15 text-calm"
                          : "border-border hover:border-signal hover:text-foreground",
                      )}
                    >
                      <span>{isViewingBestQualified ? "Viewing" : "Inspect Qualified"}</span>
                      <ArrowRight className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Scenario 3: No qualified formation in universe */
              <div className="mt-2.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <Info className="size-4 text-caution shrink-0" />
                <span>
                  No formations currently pass all structural qualification gates. The #1 ranked
                  formation above is displayed for observational liquidity tracking.
                </span>
              </div>
            )}
          </div>

          {/* 4C: EXPANDABLE UNIVERSE RANKING LEADERBOARD */}
          {allRanked && allRanked.length > 1 && (
            <div className="rounded border border-border/80 bg-background/50 p-2.5">
              <button
                type="button"
                onClick={() => setShowLeaderboard((v) => !v)}
                className="flex w-full items-center justify-between font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    Ranked Persistent Formations ({allRanked.length})
                  </span>
                  <span className="text-[10px]">
                    · #1: {currentSelection.symbol} ({currentSelection.score.toFixed(1)})
                    {bestQualified && (
                      <span className="text-calm ml-1.5">
                        · Best Qualified: {bestQualified.symbol} (#{bestQualified.rank})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  <span>{showLeaderboard ? "Hide Leaderboard" : "Show All Ranks"}</span>
                  {showLeaderboard ? (
                    <ChevronUp className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                </div>
              </button>

              {showLeaderboard && (
                <div className="mt-2.5 overflow-x-auto border-t border-border/60 pt-2 font-mono text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/60 text-[10px] text-muted-foreground">
                        <th className="pb-1">RANK</th>
                        <th className="pb-1">MARKET</th>
                        <th className="pb-1">CONTRACT</th>
                        <th className="pb-1">SCORE</th>
                        <th className="pb-1">LIFECYCLE</th>
                        <th className="pb-1">QUALIFIED?</th>
                        <th className="pb-1 text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {allRanked.slice(0, 10).map((res) => {
                        const isThisSelected = currentSelection.zoneId === res.zoneId;
                        const isThisBestQualified = bestQualified?.zoneId === res.zoneId;
                        return (
                          <tr
                            key={res.zoneId}
                            className={cn(
                              "text-[11px] transition-colors",
                              isThisSelected && "bg-signal/10",
                              !isThisSelected && isThisBestQualified && "bg-calm/5",
                            )}
                          >
                            <td className="py-1.5 font-bold">
                              #{res.rank}
                              {isThisSelected && (
                                <span className="ml-1 text-[9px] text-signal font-normal">#1</span>
                              )}
                              {isThisBestQualified && !isThisSelected && (
                                <span className="ml-1 text-[9px] text-calm font-normal">
                                  BEST QUAL
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 font-semibold text-foreground">{res.symbol}</td>
                            <td className="py-1.5 text-muted-foreground">{res.contract}</td>
                            <td className="py-1.5 font-bold tabular text-signal">
                              {res.score.toFixed(1)}
                            </td>
                            <td className="py-1.5">
                              <StateTag state={res.lifecycleState} />
                            </td>
                            <td className="py-1.5">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                                  res.qualified
                                    ? "bg-calm/15 text-calm"
                                    : "bg-caution/15 text-caution",
                                )}
                              >
                                {res.qualificationStatus}
                              </span>
                            </td>
                            <td className="py-1.5 text-right">
                              {onSelectMarket && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectMarket(res.symbol);
                                    if (onSelectContract) onSelectContract(res.contractId);
                                  }}
                                  className="text-[10px] text-muted-foreground hover:text-signal hover:underline"
                                >
                                  Select
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : noRankedFound ? (
        /* SECTION 5: NO ACTIVE FORMATIONS FOUND AT ALL */
        <div className="panel p-6 text-center font-mono">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Info className="size-5" />
          </div>
          <h3 className="mt-2 text-sm font-bold text-foreground tracking-wide">
            NO ACTIVE LIQUIDITY FORMATIONS FOUND
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground font-sans">
            No persistent liquidity zones have formed yet across the 15 monitored synthetic markets.
            Formations accumulate over multiple ticks.
          </p>
          <button
            type="button"
            onClick={handleScan}
            className="mt-3 inline-flex items-center gap-1.5 rounded border border-border px-3 py-1 text-xs hover:border-signal hover:text-foreground"
          >
            <RefreshCw className="size-3" />
            Re-scan Universe
          </button>
        </div>
      ) : (
        /* SECTION 6: INITIAL PROMPT BEFORE FIRST SCAN */
        <div className="rounded border border-dashed border-border p-4 text-center font-mono text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">DELIBERATE LIQUIDITY SCANNER READY</p>
          <p className="mt-1 text-[11px] font-sans">
            Press{" "}
            <span className="font-semibold text-signal font-mono">SCAN FOR BEST LIQUIDITY</span> to
            evaluate all 15 monitored markets. The scanner will rank all formations by score first,
            display the #1 ranked formation, and separately determine qualification.
          </p>
        </div>
      )}
    </div>
  );
}
