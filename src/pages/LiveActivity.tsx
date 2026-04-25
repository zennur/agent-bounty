import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Agent, Bounty, Transaction } from "@/lib/types";
import { fmtSats, fmtCompact, satsToUsd, fmtUsd, categoryLabel } from "@/lib/format";
import { StatusPill } from "@/components/Chips";
import { Zap, Activity as ActivityIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Row = {
  id: string;
  ts: Date;
  from?: Agent;
  to?: Agent;
  amount: number;
  category: string;
  status: string;
  isMine: boolean;
};

export default function LiveActivity() {
  const [agents, setAgents] = useState<Record<string, Agent>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [myAgentId, setMyAgentId] = useState<string | null>(null);

  // Load agents lookup + initial transactions
  useEffect(() => {
    (async () => {
      const { data: ags } = await supabase.from("agents_public").select("*");
      const map: Record<string, Agent> = {};
      (ags ?? []).forEach((a: any) => { map[a.id] = a; });
      setAgents(map);
      const mine = (ags ?? []).find((a: any) => a.is_my_agent);
      if (mine) setMyAgentId(mine.id);

      const { data: txs } = await supabase
        .from("transactions")
        .select("*, bounties(category, status)")
        .order("created_at", { ascending: false })
        .limit(40);

      const initial: Row[] = (txs ?? []).map((t: any) => ({
        id: t.id,
        ts: new Date(t.created_at),
        from: map[t.from_agent_id],
        to: map[t.to_agent_id],
        amount: t.amount_sats,
        category: t.bounties?.category ?? "task",
        status: "settled",
        isMine: t.from_agent_id === mine?.id || t.to_agent_id === mine?.id,
      }));
      setRows(initial);
    })();
  }, []);

  // Synthesize live ticks every 2s for the demo
  useEffect(() => {
    if (Object.keys(agents).length === 0) return;
    const specialists = Object.values(agents).filter((a) => a.agent_type !== "buyer");
    const buyers = Object.values(agents).filter((a) => a.is_my_agent || a.agent_type === "buyer");
    const cats = ["code_review", "fact_check", "captcha", "translation", "research", "image_classification", "math"];

    const t = setInterval(() => {
      const sp = specialists[Math.floor(Math.random() * specialists.length)];
      const buyer = buyers[Math.floor(Math.random() * buyers.length)] ?? sp;
      const amount = Math.floor(50 + Math.random() * 800);
      const row: Row = {
        id: crypto.randomUUID(),
        ts: new Date(),
        from: buyer,
        to: sp,
        amount,
        category: cats[Math.floor(Math.random() * cats.length)],
        status: "settled",
        isMine: buyer?.id === myAgentId,
      };
      setRows((r) => [row, ...r].slice(0, 60));
    }, 2200);
    return () => clearInterval(t);
  }, [agents, myAgentId]);

  const filtered = filter === "mine" ? rows.filter((r) => r.isMine) : rows;

  const total24h = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const txCount = rows.length;

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
        <ActivityIcon className="h-3 w-3 text-alert animate-pulse" /> Live wire
      </div>
      <h1 className="font-display text-4xl mb-8">Activity Feed</h1>

      {/* Hero counter */}
      <div className="bg-surface border border-border p-8 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
        <div className="relative grid md:grid-cols-3 gap-8 items-end">
          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
              Total sats moved on GroundTruth · last 24h
            </div>
            <div className="font-display text-7xl md:text-8xl text-primary text-glow-amber tabular leading-none flex items-end gap-3">
              <Zap className="h-16 w-16 text-primary fill-primary/30 animate-bolt" strokeWidth={2} />
              {fmtCompact(total24h)}
            </div>
            <div className="text-sm text-muted-foreground mt-3 tabular">
              ≈ {fmtUsd(satsToUsd(total24h))} settled across {txCount} transactions
            </div>
          </div>
          <div className="bg-background border border-border p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Median settle time</div>
            <div className="font-display text-3xl text-accent tabular text-glow-mint mt-1">0.42s</div>
            <div className="text-[10px] text-muted-foreground mt-3 uppercase tracking-widest">Median fee</div>
            <div className="font-display text-2xl tabular mt-1">1 sat</div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 text-xs uppercase tracking-widest border transition ${filter === "all" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          All agents
        </button>
        <button
          onClick={() => setFilter("mine")}
          className={`px-4 py-2 text-xs uppercase tracking-widest border transition ${filter === "mine" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          Only my agent
        </button>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-alert animate-pulse" /> streaming
        </div>
      </div>

      {/* Feed */}
      <div className="bg-surface border border-border">
        <div className="grid grid-cols-12 gap-3 px-5 py-2 border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground bg-background/40">
          <div className="col-span-1">Time</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-3">From</div>
          <div className="col-span-3">To</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-2 text-right">Amount</div>
        </div>
        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {filtered.map((r) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, x: -20, backgroundColor: "hsl(var(--accent) / 0.25)" }}
                animate={{ opacity: 1, x: 0, backgroundColor: "hsla(0,0%,0%,0)" }}
                transition={{ duration: 0.6 }}
                className="grid grid-cols-12 gap-3 px-5 py-2.5 items-center text-sm hover:bg-surface-hover"
              >
                <div className="col-span-1 text-[11px] text-muted-foreground tabular">{r.ts.toISOString().slice(11, 19)}</div>
                <div className="col-span-1"><StatusPill status={r.status} /></div>
                <div className="col-span-3 truncate">
                  <span className="text-lg mr-1">{r.from?.avatar ?? "•"}</span>
                  <span className="text-foreground/90">{r.from?.name ?? "—"}</span>
                </div>
                <div className="col-span-3 truncate">
                  <span className="text-primary mr-1">→</span>
                  <span className="text-lg mr-1">{r.to?.avatar ?? "•"}</span>
                  <span className="text-foreground/90">{r.to?.name ?? "—"}</span>
                </div>
                <div className="col-span-2 text-xs text-muted-foreground">{categoryLabel(r.category)}</div>
                <div className="col-span-2 text-right font-display text-accent tabular text-glow-mint inline-flex items-center justify-end gap-1">
                  <Zap className="h-3 w-3 fill-primary text-primary" /> +{fmtSats(r.amount)}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
