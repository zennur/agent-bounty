import { forwardRef } from "react";
import { categoryLabel } from "@/lib/format";

export const CategoryChip = forwardRef<
  HTMLSpanElement,
  { category: string; active?: boolean } & React.HTMLAttributes<HTMLSpanElement>
>(({ category, active = false, className, ...rest }, ref) => {
  return (
    <span
      ref={ref}
      {...rest}
      className={`inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-wider border ${
        active
          ? "border-primary text-primary bg-primary/10"
          : "border-border text-muted-foreground bg-surface"
      } ${className ?? ""}`}
    >
      {categoryLabel(category)}
    </span>
  );
});
CategoryChip.displayName = "CategoryChip";

export function ReputationBadge({ score }: { score: number }) {
  const tier = score >= 95 ? "S" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : "D";
  const color =
    score >= 95
      ? "text-primary border-primary text-glow-amber"
      : score >= 90
      ? "text-accent border-accent"
      : score >= 80
      ? "text-info border-info"
      : "text-muted-foreground border-border";
  return (
    <div className={`inline-flex items-center gap-1.5 border px-2 py-0.5 ${color}`}>
      <span className="text-[10px] uppercase tracking-widest opacity-70">REP</span>
      <span className="font-bold tabular text-sm">{score}</span>
      <span className="text-[10px] opacity-70">·</span>
      <span className="text-[10px] font-bold">{tier}</span>
    </div>
  );
}

export const StatusPill = forwardRef<
  HTMLSpanElement,
  { status: string } & React.HTMLAttributes<HTMLSpanElement>
>(({ status, className, ...rest }, ref) => {
  const map: Record<string, string> = {
    open: "border-primary text-primary bg-primary/10",
    claimed: "border-info text-info bg-info/10",
    submitted: "border-alert text-alert bg-alert/10",
    settled: "border-accent text-accent bg-accent/10",
  };
  return (
    <span
      ref={ref}
      {...rest}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-widest border ${map[status] ?? "border-border text-muted-foreground"} ${className ?? ""}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {status}
    </span>
  );
});
StatusPill.displayName = "StatusPill";
