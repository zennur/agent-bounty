import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Agent, Bounty } from "@/lib/types";
import { fmtSats, fmtCompact, satsToUsd, fmtUsd, categoryLabel } from "@/lib/format";
import { CategoryChip, ReputationBadge, StatusPill } from "@/components/Chips";
import { ArrowLeft, Zap, Clock, Trophy, Wallet, CalendarDays, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function AgentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [bounties, setBounties] = useState<(Bounty & { buyer?: Agent })[]>([]);
  const [hireOpen, setHireOpen] = useState(false);
  const [myAgents, setMyAgents] = useState<Agent[]>([]);
  const [buyerAgentId, setBuyerAgentId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setMyAgents([]); return; }
    (async () => {
      const { data } = await supabase
        .from("agents_owner_view")
        .select("*")
        .eq("user_id", user.id);
      const list = ((data ?? []) as unknown) as Agent[];
      // Don't allow hiring yourself
      const filtered = list.filter((a) => a.id !== id);
      setMyAgents(filtered);
      if (filtered[0]) setBuyerAgentId(filtered[0].id);
    })();
  }, [user, id]);

  useEffect(() => {
    if (agent) setPrice(agent.base_price_sats);
  }, [agent]);

  const submitHire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;
    if (!user) { navigate("/auth"); return; }
    if (!buyerAgentId) {
      toast.error("Register an agent first to hire others.");
      return;
    }
    if (title.trim().length < 3) {
      toast.error("Title is too short");
      return;
    }
    setBusy(true);
    const category = agent.categories[0] ?? "research";
    const { error } = await supabase.from("bounties").insert({
      buyer_agent_id: buyerAgentId,
      specialist_agent_id: agent.id,
      title: title.trim(),
      description: desc.trim() || null,
      category,
      max_price_sats: price,
      status: "open",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Bounty sent to ${agent.name}.`);
    setHireOpen(false);
    setTitle("");
    setDesc("");
  };

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
      <Link to="/marketplace" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary mb-6 uppercase tracking-widest">
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
          <button
            onClick={() => {
              if (!user) { navigate("/auth"); return; }
              setHireOpen(true);
            }}
            className="bg-primary text-primary-foreground font-display text-sm px-5 py-3 hover:shadow-amber transition-all flex items-center gap-2"
          >
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

      <Dialog open={hireOpen} onOpenChange={setHireOpen}>
        <DialogContent className="bg-surface border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-widest text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary fill-current" /> Hire {agent.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Posts a bounty assigned directly to this specialist. They'll be notified instantly.
            </DialogDescription>
          </DialogHeader>

          {myAgents.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              You need to register a buyer agent first.{" "}
              <Link to="/register" className="text-primary underline">Register one →</Link>
            </div>
          ) : (
            <form onSubmit={submitHire} className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Acting as</div>
                <select
                  value={buyerAgentId}
                  onChange={(e) => setBuyerAgentId(e.target.value)}
                  className="w-full bg-background border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {myAgents.map((a) => (
                    <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Task title</div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`e.g. ${categoryLabel(agent.categories[0] ?? "research")} this for me`}
                  className="w-full bg-background border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  maxLength={200}
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Details (optional)</div>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={4}
                  placeholder="Paste content, links, or context for the specialist."
                  className="w-full bg-background border border-border px-3 py-2 text-xs font-mono leading-relaxed resize-y focus:border-primary focus:outline-none"
                  maxLength={2000}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 items-end">
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                    Max price (sats) · asking {fmtSats(agent.base_price_sats)}
                  </div>
                  <input
                    type="number"
                    min={10}
                    max={1_000_000}
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full bg-background border border-border px-3 py-2 font-display text-primary tabular text-lg focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-primary text-primary-foreground font-display px-4 py-2.5 hover:shadow-amber transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                >
                  {busy ? <Zap className="h-4 w-4 animate-bolt" /> : <Plus className="h-4 w-4" />}
                  {busy ? "SENDING..." : "SEND"}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
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
