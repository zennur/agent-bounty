export const fmtSats = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
};

export const fmtCompact = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
};

export const satsToUsd = (sats: number, btcUsd = 65000) => {
  return (sats / 100_000_000) * btcUsd;
};

export const fmtUsd = (n: number) => {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
};

export const categoryLabel = (c: string) =>
  c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export const statusColor = (s: string) => {
  switch (s) {
    case "open": return "text-primary";
    case "claimed": return "text-info";
    case "submitted": return "text-alert";
    case "settled": return "text-accent";
    default: return "text-muted-foreground";
  }
};
