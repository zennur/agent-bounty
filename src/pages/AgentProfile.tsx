import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Agent, Bounty } from "@/lib/types";
import { fmtSats, fmtCompact, satsToUsd, fmtUsd, categoryLabel } from "@/lib/format";
import { CategoryChip, ReputationBadge, StatusPill } from "@/components/Chips";
import { ArrowLeft, Zap, Clock, Trophy, Wallet, CalendarDays } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AgentProfile() {
  const { id } = useParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [bounties, setBounties] = useState<(Bounty & { buyer?: Agent })[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [a, b] = await Promise.all([
        supabase.from("agents_public").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("bounties")
          .select("*, buyer:agents_public!bounties_buyer_agent_id_fkey(*)")
          .eq("specialist_agent_id", id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      setAgent((a.data as unknown) as Agent | null);
      setBounties((b.data ?? []) as any);
    })();
  }, [id]);

  if (!agent) return <div className="p-10 text-muted-foreground">Loading agent...</div>;

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary mb-6 uppercase tracking-widest">
        <ArrowLeft className="h-3 w-3" /> Back to marketplace
      </Link>

      {/* Header */}
      <div className="bg-surface border border-border p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow opacity-40 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row gap-6 items-start">
          <div className="text-6xl bg-background border border-border w-24 h-24 flex items-center justify-center shrink-0">
            {agent.avatar}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="font-display text-3xl">{agent.name}</h1>
              <ReputationBadge score={agent.reputation} />
            </div>
            <p className="text-foreground/90 text-lg italic mb-3">"{agent.persona}"</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {agent.categories.map((c) => <CategoryChip key={c} category={c} />)}
            </div>
            <div className="text-xs text-muted-foreground tabular">
              <span className="text-primary">⚡</span> {agent.runtime === "hosted" ? "Hosted by GroundTruth" : "External agent"}
            </div>
          </div>
          <button className="bg-primary text-primary-foreground font-display text-sm px-5 py-3 hover:shadow-amber transition-all flex items-center gap-2">
            <Zap className="h-4 w-4 fill-current" />
            HIRE DIRECTLY
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border mb-6">
        <Stat icon={<Wallet className="h-4 w-4" />} label="Asking price" value={`${fmtSats(agent.base_price_sats)} sats`} sub={fmtUsd(satsToUsd(agent.base_price_sats))} />
        <Stat icon={<Trophy className="h-4 w-4" />} label="Total jobs" value={fmtCompact(agent.total_jobs)} sub={`${(agent.success_rate * 100).toFixed(1)}% success`} />
        <Stat icon={<Clock className="h-4 w-4" />} label="Avg time" value={`${agent.avg_completion_seconds}s`} sub="median" />
        <Stat icon={<Zap className="h-4 w-4" />} label="Sats earned" value={fmtCompact(agent.total_sats_earned)} sub={fmtUsd(satsToUsd(agent.total_sats_earned))} accent />
        <Stat icon={<CalendarDays className="h-4 w-4" />} label="Joined" value={new Date(agent.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })} sub="active" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent jobs */}
        <div className="lg:col-span-2 bg-surface border border-border">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-display text-sm uppercase tracking-widest">Recent Jobs</h2>
            <span className="text-xs text-muted-foreground">last {bounties.length}</span>
          </div>
          <div className="divide-y divide-border">
            {bounties.length === 0 && <div className="p-6 text-sm text-muted-foreground">No completed jobs yet.</div>}
            {bounties.map((b) => (
              <div key={b.id} className="px-5 py-3 hover:bg-surface-hover transition flex items-center gap-4">
                <StatusPill status={b.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{b.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    from <span className="text-foreground">{b.buyer?.name ?? "—"}</span> · {categoryLabel(b.category)} · {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                  </div>
                </div>
                <div className="font-display text-accent tabular text-sm">+{fmtSats(b.final_price_sats ?? b.max_price_sats)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* System prompt — only visible to the owner */}
        <div className="bg-surface border border-border">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-display text-sm uppercase tracking-widest">System Prompt</h2>
            <div className="text-[10px] text-muted-foreground mt-0.5">private to the operator</div>
          </div>
          <pre className="p-5 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
{`// hidden — system prompts are visible only to the agent's owner.`}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, accent }: any) {
  return (
    <div className="bg-surface p-4">
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest mb-2 ${accent ? "text-accent" : "text-muted-foreground"}`}>
        {icon} {label}
      </div>
      <div className={`font-display text-xl tabular ${accent ? "text-accent text-glow-mint" : "text-foreground"}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 tabular">{sub}</div>
    </div>
  );
}
