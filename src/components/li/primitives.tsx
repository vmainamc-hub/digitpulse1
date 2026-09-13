import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { LiquidityState } from "@/lib/liquidity/universe";

const STATE_CLASS: Record<string, string> = {
  NO_LIQUIDITY: "text-muted-foreground border-border bg-muted/20",
  ABSENT: "text-state-absent border-state-absent/35 bg-state-absent/10",
  FORMING: "text-state-forming border-state-forming/35 bg-state-forming/10",
  BUILDING: "text-state-building border-state-building/35 bg-state-building/10",
  MATURE: "text-state-mature border-state-mature/35 bg-state-mature/10",
  EXHAUSTION_WATCH: "text-state-exhausting border-state-exhausting/35 bg-state-exhausting/10",
  EXHAUSTION_CONFIRMED: "text-state-exhausting border-state-exhausting/45 bg-state-exhausting/15",
  DELIVERY: "text-state-released border-state-released/35 bg-state-released/10",
  DELIVERY_ACCELERATING: "text-state-released border-state-released/45 bg-state-released/15",
  ABSORBING: "text-state-absorbing border-state-absorbing/35 bg-state-absorbing/10",
  EXHAUSTING: "text-state-exhausting border-state-exhausting/35 bg-state-exhausting/10",
  RELEASE_WATCH: "text-state-ripe border-state-ripe/35 bg-state-ripe/10",
  RIPE: "text-state-ripe border-state-ripe/40 bg-state-ripe/12",
  RELEASE: "text-state-released border-state-released/40 bg-state-released/12",
  RELEASED: "text-state-released border-state-released/40 bg-state-released/12",
  "DIRECTIONAL MOVE": "text-state-confirmed border-state-confirmed/40 bg-state-confirmed/12",
  CONFIRMED: "text-state-confirmed border-state-confirmed/45 bg-state-confirmed/14",
  CONFLICTED: "text-state-conflicted border-state-conflicted/40 bg-state-conflicted/12",
  BLOCKED: "text-state-blocked border-state-blocked/45 bg-state-blocked/14",
  INVALIDATED: "text-state-absent border-state-absent/25 bg-state-absent/5",
  WAITING: "text-muted-foreground border-border bg-muted/40",
};

export function StateTag({
  state,
  className,
}: {
  state: LiquidityState | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.12em]",
        STATE_CLASS[state] ?? STATE_CLASS["WAITING"],
        className,
      )}
    >
      {state}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel flex min-w-0 flex-col", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h3 className="mono-label text-foreground/80">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions}
      </header>
      <div className="min-w-0 flex-1 p-3">{children}</div>
    </section>
  );
}

function barTone(value: number, tone: Tone) {
  if (tone === "danger") return "bg-danger";
  if (tone === "caution") return "bg-caution";
  if (tone === "conflict") return "bg-conflict";
  if (tone === "calm") return "bg-calm";
  return value >= 70 ? "bg-signal" : value >= 40 ? "bg-signal/70" : "bg-signal/40";
}

type Tone = "signal" | "danger" | "caution" | "conflict" | "calm";

export function Meter({
  label,
  value,
  tone = "signal",
  suffix,
}: {
  label: string;
  value: number;
  tone?: Tone;
  suffix?: string;
}) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono-label">{label}</span>
        <span className="tabular text-xs text-foreground">
          {Math.round(value || 0)}
          {suffix}
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", barTone(v, tone))}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

export function Metric({
  label,
  value,
  suffix = "",
  digits = 1,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  digits?: number;
  tone?: Tone;
}) {
  const toneClass =
    tone === "danger"
      ? "text-danger"
      : tone === "caution"
        ? "text-caution"
        : tone === "calm"
          ? "text-calm"
          : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 last:border-0">
      <span className="mono-label">{label}</span>
      <strong className={cn("tabular text-xs font-medium", toneClass)}>
        {Number(value || 0).toFixed(digits)}
        {suffix}
      </strong>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 border-l-2 border-border-strong pl-2 text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
