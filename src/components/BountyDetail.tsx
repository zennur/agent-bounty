import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Bounty, Agent, BountyStatus } from "@/lib/types";
import { fmtSats, categoryLabel } from "@/lib/format";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, XCircle, Clock, Bot, ShieldCheck } from "lucide-react";

const STATUS_COLOR: Record<BountyStatus, string> = {
  open: "text-muted-foreground",
  claimed: "text-info",
  submitted: "text-primary animate-blink",
  verified: "text-accent",
  rejected: "text-alert",
  settled: "text-accent",
};

export default function BountyDetail({ bounty, specialist, buyer }: { bounty: Bounty; specialist?: Agent | null; buyer?: Agent | null }) {
  // L402: posted via the keyless agent-API flow (auth_mode='l402') OR (legacy heuristic) by an external buyer agent.
  const isL402 = bounty.auth_mode === "l402" || (!!bounty.buyer_agent_id && buyer?.runtime === "external");
  return (
    <div className="bg-surface border border-border p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1 flex items-center gap-2 flex-wrap">
            <span>{categoryLabel(bounty.category)} · {formatDistanceToNow(new Date(bounty.created_at), { addSuffix: true })}</span>
            {isL402 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-primary/40 bg-primary/10 text-primary tracking-[0.2em]">
                <ShieldCheck className="h-2.5 w-2.5" /> L402 protected
              </span>
            )}
          </div>
          <h3 className="font-display text-base">{bounty.title}</h3>
        </div>
        <div className={`text-xs uppercase tracking-widest ${STATUS_COLOR[bounty.status]} flex items-center gap-1.5`}>
          {bounty.status === "settled" || bounty.status === "verified" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
          {bounty.status === "rejected" ? <XCircle className="h-3.5 w-3.5" /> : null}
          {bounty.status === "submitted" || bounty.status === "claimed" || bounty.status === "open" ? <Clock className="h-3.5 w-3.5" /> : null}
          {bounty.status}
        </div>
      </div>

      {bounty.description && (
        <pre className="bg-background border border-border p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap text-muted-foreground">
{bounty.description}
        </pre>
      )}

      {specialist && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5 text-primary" />
          <span>Specialist:</span>
          <span className="text-foreground">{specialist.avatar} {specialist.name}</span>
        </div>
      )}

      {bounty.submission && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1.5">Submission</div>
          <pre className="bg-background border border-border p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap">
{bounty.submission.result}
          </pre>
        </div>
      )}

      {bounty.verification && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1.5">Verifier verdict</div>
          <div className={`border p-3 text-xs ${bounty.verification.verdict === "accept" ? "border-accent/40 bg-accent/5" : "border-alert/40 bg-alert/5"}`}>
            <div className="flex items-center justify-between mb-1">
              <span className={`font-display uppercase tracking-widest ${bounty.verification.verdict === "accept" ? "text-accent" : "text-alert"}`}>
                {bounty.verification.verdict} · {bounty.verification.score}/100
              </span>
            </div>
            <p className="text-muted-foreground">{bounty.verification.reason}</p>
          </div>
        </div>
      )}

      {bounty.final_price_sats != null && (
        <div className="text-right text-xs text-muted-foreground tabular space-y-1">
          {bounty.status === "settled" && specialist && bounty.final_price_sats > specialist.base_price_sats && (
            <div className="text-primary text-[11px]">
              ⚡ Premium rate applied based on specialist reputation
            </div>
          )}
          <div>Settled {fmtSats(bounty.final_price_sats)} sats</div>
        </div>
      )}
    </div>
  );
}

export function useLiveBounty(bountyId: string | null) {
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [specialist, setSpecialist] = useState<Agent | null>(null);
  const [buyer, setBuyer] = useState<Agent | null>(null);

  useEffect(() => {
    if (!bountyId) return;
    let cancel = false;

    const load = async () => {
      const { data: b } = await supabase.from("bounties").select("*").eq("id", bountyId).maybeSingle();
      if (cancel || !b) return;
      setBounty(b as unknown as Bounty);
      if (b.specialist_agent_id) {
        const { data: a } = await supabase.from("agents_public").select("*").eq("id", b.specialist_agent_id).maybeSingle();
        if (!cancel) setSpecialist((a as unknown) as Agent | null);
      }
      if (b.buyer_agent_id) {
        const { data: a } = await supabase.from("agents_public").select("*").eq("id", b.buyer_agent_id).maybeSingle();
        if (!cancel) setBuyer((a as unknown) as Agent | null);
      }
    };
    load();

    const channel = supabase.channel(`bounty-${bountyId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bounties", filter: `id=eq.${bountyId}` }, () => load())
      .subscribe();

    return () => { cancel = true; supabase.removeChannel(channel); };
  }, [bountyId]);

  return { bounty, specialist, buyer };
}
