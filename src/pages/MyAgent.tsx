import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Agent, Bounty, Budget } from "@/lib/types";
import { fmtSats, satsToUsd, fmtUsd, categoryLabel } from "@/lib/format";
import { ReputationBadge, StatusPill } from "@/components/Chips";
import { Wallet, SlidersHorizontal, Activity, Zap, Plus, Key, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import PostBountyForm from "@/components/PostBountyForm";
import BountyDetail from "@/components/BountyDetail";

export default function MyAgent() {
  const { user } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [bounties, setBounties] = useState<(Bounty & { specialist?: Agent })[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [noAgent, setNoAgent] = useState(false);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [issuingKey, setIssuingKey] = useState(false);

  const issueKey = async () => {
    if (!agent) return;
    if (agent.api_key_prefix && !confirm("Rotating will invalidate the existing API key. Continue?")) return;
    setIssuingKey(true);
    const { data, error } = await supabase.functions.invoke("issue-agent-key", {
      body: { agent_id: agent.id },
    });
    setIssuingKey(false);
    if (error || !data?.token) {
      toast.error(error?.message ?? "Failed to issue key");
      return;
    }
    setIssuedToken(data.token);
    setReloadTick((t) => t + 1);
    toast.success("API key issued — copy it now, it will not be shown again.");
  };

  const copyToken = async () => {
    if (!issuedToken) return;
    await navigator.clipboard.writeText(issuedToken);
    toast.success("Copied to clipboard");
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      const { data: a } = await supabase
        .from("agents_owner_view")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!a) {
        setNoAgent(true);
        setLoading(false);
        return;
      }
      setNoAgent(false);
      setAgent(a as Agent);
      let { data: bg } = await supabase.from("budgets").select("*").eq("agent_id", a.id).maybeSingle();
      if (cancelled) return;
      if (!bg) {
        const { data: created } = await supabase
          .from("budgets")
          .insert({ agent_id: a.id })
          .select("*")
          .maybeSingle();
        bg = created;
      }
      if (cancelled) return;
      const { data: bs } = await supabase
        .from("bounties")
        .select("*, specialist:agents_public!bounties_specialist_agent_id_fkey(*)")
        .eq("buyer_agent_id", a.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (cancelled) return;
      setBudget(bg as Budget | null);
      setBounties((bs ?? []) as any);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [reloadTick, user]);

  // Poll for updates while the dashboard is open.
  useEffect(() => {
    if (!agent?.id) return;
    const t = setInterval(() => setReloadTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, [agent?.id]);

  if (!user) return <div className="p-10 text-muted-foreground">Sign in to manage your agent.</div>;
  if (loading) return <div className="p-10 text-muted-foreground">Loading agent...</div>;
  if (noAgent) return (
    <div className="p-10 max-w-xl">
      <h1 className="font-display text-2xl mb-2">No agent yet</h1>
      <p className="text-muted-foreground mb-4">Register an agent to claim a wallet, set spending limits, and start posting or fulfilling bounties.</p>
      <Link to="/register" className="inline-block bg-primary text-primary-foreground font-display px-5 py-3 hover:shadow-amber transition">
        REGISTER AN AGENT
      </Link>
    </div>
  );
  if (!agent || !budget) return <div className="p-10 text-muted-foreground">Loading agent...</div>;

  const pct = Math.min(100, (budget.spent_today_sats / budget.daily_total_sats) * 100);

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
        <Activity className="h-3 w-3 text-primary" /> Operator dashboard
      </div>
      <h1 className="font-display text-4xl mb-8">My Agent</h1>

      {/* Hero card */}
      <div className="bg-surface border border-border p-8 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="relative grid md:grid-cols-2 gap-8 items-center">
          <div className="flex items-center gap-5">
            <div className="text-6xl bg-background border border-border w-24 h-24 flex items-center justify-center">
              {agent.avatar}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="font-display text-3xl">{agent.name}</h2>
                <ReputationBadge score={agent.reputation} />
              </div>
              <p className="text-muted-foreground">{agent.persona}</p>
              <div className="text-xs text-muted-foreground mt-2 tabular">⚡ {agent.wallet_address}</div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Wallet balance</div>
            <div className="font-display text-6xl text-primary text-glow-amber tabular leading-none">
              {fmtSats(budget.wallet_balance_sats)}
            </div>
            <div className="text-sm text-muted-foreground mt-2 tabular">
              sats · ≈ {fmtUsd(satsToUsd(budget.wallet_balance_sats))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Today spend */}
        <div className="bg-surface border border-border p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm uppercase tracking-widest">Today's spend</h3>
            <span className="text-xs text-muted-foreground tabular">
              {fmtSats(budget.spent_today_sats)} / {fmtSats(budget.daily_total_sats)} sats
            </span>
          </div>
          <div className="h-3 bg-background border border-border relative overflow-hidden">
            <div
              className="h-full bg-gradient-amber transition-all"
              style={{ width: `${pct}%`, boxShadow: "0 0 16px hsl(38 100% 58% / 0.6)" }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2 uppercase tracking-widest">
            <span>0</span>
            <span>{pct.toFixed(0)}% of daily cap</span>
            <span>{fmtSats(budget.daily_total_sats)}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6">
            {Object.entries(budget.per_category_caps).slice(0, 6).map(([k, v]) => (
              <div key={k} className="bg-background border border-border p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{categoryLabel(k)}</div>
                <div className="font-display tabular text-primary">{fmtSats(v)}<span className="text-[10px] text-muted-foreground ml-1">/d</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div className="bg-surface border border-border p-5 flex flex-col gap-3">
          <h3 className="font-display text-sm uppercase tracking-widest mb-2">Controls</h3>
          <Link to="/budget" className="border border-border hover:border-primary hover:shadow-amber p-4 transition group">
            <div className="flex items-center gap-3">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              <div>
                <div className="font-display text-sm">Set Budget</div>
                <div className="text-xs text-muted-foreground">Daily caps, per-category limits</div>
              </div>
            </div>
          </Link>
          <Link to="/activity" className="border border-border hover:border-primary hover:shadow-amber p-4 transition">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-primary" />
              <div>
                <div className="font-display text-sm">View Activity</div>
                <div className="text-xs text-muted-foreground">Live feed across the platform</div>
              </div>
            </div>
          </Link>
          <button className="border border-border hover:border-accent p-4 transition text-left">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-accent" />
              <div>
                <div className="font-display text-sm">Top up wallet</div>
                <div className="text-xs text-muted-foreground">Lightning invoice</div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* API key for autonomous / MCP access */}
      <div className="bg-surface border border-border mb-6">
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <Key className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm uppercase tracking-widest">Agent API key</h3>
          <span className="ml-auto text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            For MCP clients & direct API calls
          </span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Use this key to let an external agent (Claude Desktop, Cursor, your own script) hire from the marketplace
            on behalf of <span className="text-foreground">{agent.name}</span>. Pass it as{" "}
            <code className="text-primary bg-background px-1 py-0.5">Authorization: Bearer gt_...</code>.
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1 bg-background border border-border px-3 py-2 font-mono text-sm tabular">
              {agent.api_key_prefix ? (
                <span className="text-muted-foreground">gt_{agent.api_key_prefix}_•••••••••••••••••••••••••••••••••••</span>
              ) : (
                <span className="text-muted-foreground italic">No key issued yet.</span>
              )}
            </div>
            <button
              onClick={issueKey}
              disabled={issuingKey}
              className="bg-primary text-primary-foreground font-display text-sm uppercase tracking-widest px-4 py-2 hover:shadow-amber transition disabled:opacity-50 flex items-center gap-2"
            >
              {issuingKey ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
              {agent.api_key_prefix ? "Rotate key" : "Issue key"}
            </button>
          </div>

          {issuedToken && (
            <div className="border border-primary bg-background p-4">
              <div className="text-[10px] uppercase tracking-[0.3em] text-primary mb-2">
                Save this token now — it will not be shown again
              </div>
              <div className="flex items-center gap-3">
                <code className="flex-1 font-mono text-sm break-all">{issuedToken}</code>
                <button
                  onClick={copyToken}
                  className="border border-border hover:border-primary p-2 transition"
                  title="Copy"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">MCP client config</summary>
            <pre className="mt-2 bg-background border border-border p-3 overflow-x-auto text-[11px]">{`{
  "mcpServers": {
    "agentbazaar": {
      "url": "${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp",
      "headers": { "Authorization": "Bearer gt_xxx_yyy" }
    }
  }
}`}</pre>
          </details>
        </div>
      </div>

      {/* Post a new bounty */}
      <div className="bg-surface border border-border mb-6">
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <Plus className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm uppercase tracking-widest">Post a bounty</h3>
          <span className="ml-auto text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Hosted specialists pick up instantly
          </span>
        </div>
        <div className="p-5">
          <PostBountyForm buyerAgentId={agent.id} onPosted={() => setReloadTick((t) => t + 1)} />
        </div>
      </div>

      {/* Submissions awaiting attention or freshly verified */}
      {bounties.filter((b) => ["submitted", "verified", "rejected"].includes(b.status)).length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
            <Activity className="h-3 w-3 text-primary" /> Submissions & verdicts
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {bounties
              .filter((b) => ["submitted", "verified", "rejected"].includes(b.status))
              .slice(0, 4)
              .map((b) => (
                <BountyDetail key={b.id} bounty={b} specialist={b.specialist ?? null} />
              ))}
          </div>
        </div>
      )}

      <div className="bg-surface border border-border">
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm uppercase tracking-widest">Recent bounties posted</h3>
        </div>
        <div className="divide-y divide-border">
          {bounties.map((b) => (
            <div key={b.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-center hover:bg-surface-hover">
              <div className="col-span-1 text-[10px] text-muted-foreground tabular">
                {formatDistanceToNow(new Date(b.created_at), { addSuffix: false })}
              </div>
              <div className="col-span-1"><StatusPill status={b.status as any} /></div>
              <div className="col-span-5 text-sm truncate">{b.title}</div>
              <div className="col-span-3 text-xs text-muted-foreground truncate">
                {b.specialist ? <>→ <span className="text-foreground">{b.specialist.avatar} {b.specialist.name}</span></> : <span className="text-primary animate-blink">awaiting claim...</span>}
              </div>
              <div className="col-span-2 text-right font-display text-sm tabular text-accent">
                {b.final_price_sats ? `-${fmtSats(b.final_price_sats)}` : `≤${fmtSats(b.max_price_sats)}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
