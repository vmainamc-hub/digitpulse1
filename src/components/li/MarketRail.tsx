import { cn } from "@/lib/utils";
import { MARKET_GROUPS } from "@/lib/liquidity/universe";
import type { ComputedMarket } from "@/lib/liquidity/useIntelligence";

import { StateTag } from "./primitives";

const GROUP_LABEL: Record<string, string> = {
  STANDARD: "Volatility indices",
  "1S": "1-second volatility",
  JUMP: "Jump indices",
};

export function MarketRail({
  markets,
  selected,
  onSelect,
}: {
  markets: ComputedMarket[];
  selected: string;
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {MARKET_GROUPS.map((group) => (
        <div key={group}>
          <div className="mono-label mb-1.5 px-1">{GROUP_LABEL[group]}</div>
          <div className="flex flex-col gap-1">
            {markets
              .filter((m) => m.group === group)
              .map((m) => {
                const a = m.analysis;
                const isSelected = m.symbol === selected;
                return (
                  <button
                    key={m.symbol}
                    type="button"
                    onClick={() => onSelect(m.symbol)}
                    aria-current={isSelected}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                      isSelected
                        ? "border-signal/50 bg-signal/10"
                        : "border-transparent bg-surface hover:border-border-strong hover:bg-surface-raised",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        m.status === "LIVE" ? "live-dot bg-calm" : "bg-muted-foreground/50",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {m.name}
                      </span>
                      <span className="tabular block text-[10px] text-muted-foreground">
                        {m.symbol} · {m.history.length} ticks
                        {m.last !== null ? ` · ${m.last.toFixed(m.pip_size ?? 2)}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <StateTag state={a?.top.state ?? "WAITING"} />
                      <span className="tabular text-[10px] text-muted-foreground">
                        {a ? Math.round(a.top.confirmation) : "—"}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
