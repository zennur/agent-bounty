import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Agent, Budget } from "@/lib/types";
import { fmtSats, categoryLabel } from "@/lib/format";
import { Save, RotateCcw, Wallet, Zap, X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

const DEFAULT_CATEGORIES = ["code_review", "fact_check", "captcha", "translation", "security_audit", "research"];

export default function BudgetSettings() {
  const { user } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [draft, setDraft] = useState<Budget | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noAgent, setNoAgent] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data: a } = await supabase
        .from("agents_owner_view")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!a) {
        setNoAgent(true);
        setLoading(false);
        return;
      }
      setAgent(a as Agent);
      let { data: b } = await supabase.from("budgets").select("*").eq("agent_id", a.id).maybeSingle();
      // Auto-create a default budget row if missing so the page is editable.
      if (!b) {
        const { data: created, error } = await supabase
          .from("budgets")
          .insert({ agent_id: a.id })
          .select("*")
          .maybeSingle();
        if (error) {
          toast.error("Could not initialise budget: " + error.message);
          setLoading(false);
          return;
        }
        b = created;
      }
      setBudget(b as Budget);
      setDraft(b as Budget);
      setLoading(false);
    })();
  }, [user]);

  if (!user) return <div className="p-10 text-muted-foreground">Sign in to configure your agent's budget.</div>;
  if (loading) return <div className="p-10 text-muted-foreground">Loading...</div>;
  if (noAgent) return (
    <div className="p-10 max-w-xl">
      <h1 className="font-display text-2xl mb-2">No agent yet</h1>
      <p className="text-muted-foreground mb-4">Register an agent first, then come back to set its spending limits.</p>
      <a href="/register" className="inline-block bg-primary text-primary-foreground font-display px-5 py-3 hover:shadow-amber transition">REGISTER AN AGENT</a>
    </div>
  );
  if (!agent || !draft || !budget) return <div className="p-10 text-muted-foreground">Loading...</div>;

  const updateCap = (k: string, v: number) =>
    setDraft({ ...draft, per_category_caps: { ...draft.per_category_caps, [k]: v } });

  const totalAllocated = Object.values(draft.per_category_caps).reduce((s, n) => s + Number(n), 0);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("budgets")
      .update({
        daily_total_sats: draft.daily_total_sats,
        per_category_caps: draft.per_category_caps,
        auto_approve_threshold_sats: draft.auto_approve_threshold_sats,
      })
      .eq("id", draft.id);
    setSaving(false);
    if (error) toast.error("Failed to save: " + error.message);
    else {
      setBudget(draft);
      toast.success("Budget saved", { description: `Atlas can now spend up to ${fmtSats(draft.daily_total_sats)} sats / day` });
    }
  };

  const reset = () => setDraft(budget);

  const cats = Array.from(new Set([...DEFAULT_CATEGORIES, ...Object.keys(draft.per_category_caps)]));

  return (
    <div className="px-8 py-8 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
        <Zap className="h-3 w-3 text-primary" /> Spending controls
      </div>
      <h1 className="font-display text-4xl mb-2">Budget</h1>
      <p className="text-muted-foreground mb-8">
        Configure how much {agent.name} can spend autonomously on your behalf.
      </p>

      {/* Daily total */}
      <Section title="Daily total cap" subtitle="Maximum sats your agent can spend in a 24h window">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <input
              type="range"
              min={1000}
              max={100000}
              step={500}
              value={draft.daily_total_sats}
              onChange={(e) => setDraft({ ...draft, daily_total_sats: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular">
              <span>1K</span><span>50K</span><span>100K sats</span>
            </div>
          </div>
          <div className="bg-background border border-primary px-4 py-3 min-w-[160px] text-right shadow-amber">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Daily cap</div>
            <div className="font-display text-2xl text-primary text-glow-amber tabular">{fmtSats(draft.daily_total_sats)}</div>
          </div>
        </div>
      </Section>

      {/* Per-category */}
      <Section title="Per-category caps" subtitle={`Allocated: ${fmtSats(totalAllocated)} sats`}>
        <div className="space-y-3">
          {cats.map((cat) => {
            const v = Number(draft.per_category_caps[cat] ?? 0);
            return (
              <div key={cat} className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-3 text-sm">{categoryLabel(cat)}</div>
                <div className="col-span-7">
                  <input
                    type="range"
                    min={0}
                    max={5000}
                    step={50}
                    value={v}
                    onChange={(e) => updateCap(cat, Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-1 justify-end">
                  <input
                    type="number"
                    value={v}
                    onChange={(e) => updateCap(cat, Number(e.target.value))}
                    className="w-20 bg-background border border-border px-2 py-1 text-right text-sm tabular focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground">sats</span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Auto-approve */}
      <Section title="Auto-approve threshold" subtitle="Bounties under this amount don't require your tap">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Up to</span>
          <input
            type="number"
            value={draft.auto_approve_threshold_sats}
            onChange={(e) => setDraft({ ...draft, auto_approve_threshold_sats: Number(e.target.value) })}
            className="w-32 bg-background border border-border px-3 py-2 text-right text-lg tabular font-display text-primary focus:outline-none focus:border-primary"
          />
          <span className="text-sm text-muted-foreground">sats per task</span>
        </div>
      </Section>

      {/* Wallet */}
      <Section title="Wallet" subtitle="Lightning balance available to your agent">
        <div className="flex items-center gap-4">
          <div className="bg-background border border-border p-4 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Balance</div>
            <div className="font-display text-2xl text-accent tabular text-glow-mint">{fmtSats(budget.wallet_balance_sats)} <span className="text-xs text-muted-foreground">sats</span></div>
          </div>
          <button onClick={() => setTopupOpen(true)} className="bg-accent text-accent-foreground font-display px-5 py-3 hover:shadow-mint transition flex items-center gap-2">
            <Wallet className="h-4 w-4" /> TOP UP
          </button>
        </div>
      </Section>

      <div className="flex gap-3 mt-8 sticky bottom-4">
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary text-primary-foreground font-display px-6 py-3 hover:shadow-amber transition flex items-center gap-2 disabled:opacity-60"
        >
          <Save className="h-4 w-4" /> {saving ? "SAVING..." : "SAVE BUDGET"}
        </button>
        <button onClick={reset} className="border border-border hover:border-foreground px-6 py-3 font-display flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <RotateCcw className="h-4 w-4" /> RESET
        </button>
      </div>

      {topupOpen && agent && (
        <TopupModal
          agentId={agent.id}
          onClose={() => setTopupOpen(false)}
          onPaid={(sats) => {
            setBudget({ ...budget, wallet_balance_sats: budget.wallet_balance_sats + sats });
            setDraft({ ...draft, wallet_balance_sats: draft.wallet_balance_sats + sats });
          }}
        />
      )}
    </div>
  );
}

function TopupModal({ agentId, onClose, onPaid }: { agentId: string; onClose: () => void; onPaid: (sats: number) => void }) {
  const [amount, setAmount] = useState(5000);
  const [generating, setGenerating] = useState(false);
  const [topup, setTopup] = useState<{ id: string; invoice: string; amount_sats: number } | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("wallet-topup", {
      body: { agent_id: agentId, amount_sats: amount },
    });
    setGenerating(false);
    if (error || !data?.topup) {
      toast.error("Could not create invoice", { description: error?.message ?? data?.error });
      return;
    }
    setTopup(data.topup);
  };

  // Poll for settlement once we have an invoice.
  useEffect(() => {
    if (!topup || paid) return;
    const id = setInterval(async () => {
      const { data } = await supabase.functions.invoke("wallet-topup-check", {
        body: { topup_id: topup.id },
      });
      if (data?.status === "settled") {
        setPaid(true);
        onPaid(topup.amount_sats);
        toast.success(`Paid ${fmtSats(topup.amount_sats)} sats`);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [topup, paid, onPaid]);

  const copy = async () => {
    if (!topup) return;
    await navigator.clipboard.writeText(topup.invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border max-w-md w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
          <Zap className="h-3 w-3 text-accent" /> Lightning top-up
        </div>
        <h2 className="font-display text-2xl mb-6">Add sats via Alby</h2>

        {!topup && (
          <>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Amount</label>
            <div className="flex items-center gap-2 mt-2 mb-6">
              <input
                type="number"
                min={1}
                max={1000000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="flex-1 bg-background border border-border px-3 py-2 text-right text-lg tabular font-display text-accent focus:outline-none focus:border-accent"
              />
              <span className="text-sm text-muted-foreground">sats</span>
            </div>
            <button
              onClick={generate}
              disabled={generating || amount < 1}
              className="w-full bg-accent text-accent-foreground font-display px-5 py-3 hover:shadow-mint transition disabled:opacity-60"
            >
              {generating ? "GENERATING..." : "GENERATE INVOICE"}
            </button>
          </>
        )}

        {topup && !paid && (
          <>
            <div className="bg-background p-4 flex items-center justify-center mb-4">
              <QRCodeSVG value={topup.invoice.toUpperCase()} size={220} bgColor="transparent" fgColor="hsl(var(--accent))" level="M" />
            </div>
            <div className="text-center text-xs text-muted-foreground mb-4">
              Pay <span className="text-accent tabular">{fmtSats(topup.amount_sats)}</span> sats from any Lightning wallet
            </div>
            <button
              onClick={copy}
              className="w-full border border-border hover:border-foreground px-4 py-2 font-mono text-xs flex items-center justify-center gap-2 truncate"
            >
              {copied ? <><Check className="h-3 w-3" /> COPIED</> : <><Copy className="h-3 w-3" /> {topup.invoice.slice(0, 32)}…</>}
            </button>
            <div className="text-center text-[10px] uppercase tracking-widest text-muted-foreground mt-4 animate-pulse">
              Waiting for payment…
            </div>
          </>
        )}

        {paid && (
          <div className="text-center py-8">
            <div className="text-6xl mb-3">⚡</div>
            <div className="font-display text-xl text-accent mb-1">Payment received</div>
            <div className="text-sm text-muted-foreground mb-6">Wallet credited with {fmtSats(topup!.amount_sats)} sats</div>
            <button onClick={onClose} className="bg-accent text-accent-foreground font-display px-5 py-3 hover:shadow-mint transition">
              DONE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: any) {
  return (
    <div className="bg-surface border border-border p-6 mb-4">
      <div className="mb-4">
        <h3 className="font-display text-base">{title}</h3>
        <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}
