import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Agent, Budget } from "@/lib/types";
import { fmtSats, categoryLabel } from "@/lib/format";
import { Save, RotateCcw, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_CATEGORIES = ["code_review", "fact_check", "captcha", "translation", "security_audit", "research"];

export default function BudgetSettings() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [draft, setDraft] = useState<Budget | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.from("agents").select("*").eq("is_my_agent", true).maybeSingle();
      if (!a) return;
      setAgent(a as Agent);
      const { data: b } = await supabase.from("budgets").select("*").eq("agent_id", a.id).maybeSingle();
      setBudget(b as Budget);
      setDraft(b as Budget);
    })();
  }, []);

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
          <button className="bg-accent text-accent-foreground font-display px-5 py-3 hover:shadow-mint transition flex items-center gap-2">
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
