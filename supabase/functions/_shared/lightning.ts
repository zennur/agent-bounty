// Lightning settlement abstraction.
// Today: mock implementation that moves sats inside the database (escrow → release).
// Tomorrow: swap in a real provider (Alby NWC, LNbits, Strike) by implementing the same interface.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface EscrowResult {
  ok: boolean;
  message?: string;
  escrow_id?: string;
}

export interface SettleResult {
  ok: boolean;
  message?: string;
  txn_id?: string;
}

export interface LightningProvider {
  /** Lock sats from a buyer's wallet. Returns escrow id (mock = budget snapshot). */
  escrow(args: { buyerAgentId: string; amountSats: number; bountyId: string }): Promise<EscrowResult>;
  /** Release escrowed sats to the specialist. */
  release(args: { buyerAgentId: string; specialistAgentId: string; amountSats: number; bountyId: string }): Promise<SettleResult>;
  /** Cancel an escrow and return funds to the buyer. */
  refund(args: { buyerAgentId: string; amountSats: number; bountyId: string }): Promise<SettleResult>;
}

/** Mock provider: ledger entries in `transactions`, balance updates on `budgets`/`agents`. */
export class MockLightningProvider implements LightningProvider {
  constructor(private supabase: SupabaseClient) {}

  async escrow({ buyerAgentId, amountSats, bountyId }: { buyerAgentId: string; amountSats: number; bountyId: string }): Promise<EscrowResult> {
    const { data: budget, error } = await this.supabase
      .from("budgets")
      .select("wallet_balance_sats, daily_total_sats, spent_today_sats")
      .eq("agent_id", buyerAgentId)
      .maybeSingle();

    if (error) return { ok: false, message: error.message };
    if (!budget) return { ok: false, message: "Buyer has no budget configured." };
    if (budget.wallet_balance_sats < amountSats) return { ok: false, message: "Insufficient wallet balance." };
    if (budget.spent_today_sats + amountSats > budget.daily_total_sats) {
      return { ok: false, message: "Daily budget cap would be exceeded." };
    }

    // Reserve funds optimistically.
    const { error: upErr } = await this.supabase
      .from("budgets")
      .update({
        wallet_balance_sats: budget.wallet_balance_sats - amountSats,
        spent_today_sats: budget.spent_today_sats + amountSats,
      })
      .eq("agent_id", buyerAgentId);

    if (upErr) return { ok: false, message: upErr.message };

    return { ok: true, escrow_id: bountyId };
  }

  async release({ buyerAgentId, specialistAgentId, amountSats, bountyId }: { buyerAgentId: string; specialistAgentId: string; amountSats: number; bountyId: string }): Promise<SettleResult> {
    const { data: txn, error } = await this.supabase
      .from("transactions")
      .insert({
        from_agent_id: buyerAgentId,
        to_agent_id: specialistAgentId,
        bounty_id: bountyId,
        amount_sats: amountSats,
        status: "settled",
      })
      .select("id")
      .single();
    if (error) return { ok: false, message: error.message };

    // Credit specialist (read-modify-write — fine for demo throughput).
    const { data: spec } = await this.supabase
      .from("agents")
      .select("total_sats_earned, total_jobs, success_rate")
      .eq("id", specialistAgentId)
      .single();
    if (spec) {
      const newJobs = (spec.total_jobs ?? 0) + 1;
      const newRate = ((spec.success_rate ?? 1) * (spec.total_jobs ?? 0) + 1) / newJobs;
      await this.supabase
        .from("agents")
        .update({
          total_sats_earned: (spec.total_sats_earned ?? 0) + amountSats,
          total_jobs: newJobs,
          success_rate: Number(newRate.toFixed(4)),
        })
        .eq("id", specialistAgentId);
    }

    return { ok: true, txn_id: txn.id };
  }

  async refund({ buyerAgentId, amountSats, bountyId: _bountyId }: { buyerAgentId: string; amountSats: number; bountyId: string }): Promise<SettleResult> {
    const { data: budget } = await this.supabase
      .from("budgets")
      .select("wallet_balance_sats, spent_today_sats")
      .eq("agent_id", buyerAgentId)
      .maybeSingle();
    if (!budget) return { ok: false, message: "Buyer has no budget configured." };

    await this.supabase.from("budgets").update({
      wallet_balance_sats: budget.wallet_balance_sats + amountSats,
      spent_today_sats: Math.max(0, budget.spent_today_sats - amountSats),
    }).eq("agent_id", buyerAgentId);

    return { ok: true };
  }
}

/** Helper: build a service-role client + the active provider in one shot. */
export function makeContext() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const lightning: LightningProvider = new MockLightningProvider(supabase);
  return { supabase, lightning };
}
