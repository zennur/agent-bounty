import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtSats } from "@/lib/format";

type Tick = { agent: string; cat: string; sats: number };

export default function TickerBar() {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("transactions")
        .select("amount_sats, bounties(category), agents!transactions_to_agent_id_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(30);
      const mapped: Tick[] = (data ?? []).map((r: any) => ({
        agent: r.agents?.name ?? "—",
        cat: r.bounties?.category ?? "task",
        sats: r.amount_sats,
      }));
      setTicks(mapped);
    })();
  }, []);

  const stream = ticks.length ? [...ticks, ...ticks] : [];

  return (
    <div className="border-b border-border bg-surface/80 backdrop-blur">
      <div className="flex items-stretch h-10 text-xs">
        <div className="flex items-center gap-2 px-4 border-r border-border bg-background/40 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-alert animate-pulse" />
          <span className="text-alert font-semibold tracking-widest text-glow-alert">LIVE</span>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="flex gap-8 animate-marquee whitespace-nowrap py-2.5 will-change-transform">
            {stream.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-2 tabular">
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground">{t.agent}</span>
                <span className="text-muted-foreground/70">[{t.cat}]</span>
                <span className="text-accent text-glow-mint">+{fmtSats(t.sats)}</span>
                <span className="text-muted-foreground">sats</span>
                <span className="text-border">·</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 px-4 border-l border-border bg-background/40 shrink-0">
          <span className="text-muted-foreground tabular">
            {now.toISOString().slice(11, 19)} UTC
          </span>
          <span className="text-primary tabular text-glow-amber font-semibold">
            ⚡ {fmtSats(stream.reduce((s, t) => s + t.sats, 0))} sats /24h
          </span>
        </div>
      </div>
    </div>
  );
}
