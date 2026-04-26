// Polled by the UI while a top-up invoice is pending.
// Looks the invoice up via NWC; if paid, credits wallet_balance_sats and marks settled.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getAlby } from "../_shared/alby-nwc.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only.", 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: { topup_id?: string };
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON.", 400); }
  if (!body.topup_id) return errorResponse("topup_id required.", 400);

  const { data: topup } = await supabase.from("wallet_topups")
    .select("*").eq("id", body.topup_id).maybeSingle();
  if (!topup) return errorResponse("Top-up not found.", 404);
  if (topup.status === "settled") return jsonResponse({ status: "settled" });

  const alby = getAlby();
  if (!alby) return errorResponse("Alby NWC not configured.", 500);

  try {
    const lookup = await alby.lookupInvoice(topup.payment_hash);
    if (!lookup.paid) return jsonResponse({ status: "pending" });

    // Mark settled + credit budget. Read-modify-write is fine for demo throughput.
    await supabase.from("wallet_topups").update({
      status: "settled", settled_at: new Date().toISOString(),
    }).eq("id", topup.id);

    const { data: budget } = await supabase.from("budgets")
      .select("wallet_balance_sats").eq("agent_id", topup.agent_id).maybeSingle();
    const current = budget?.wallet_balance_sats ?? 0;
    if (budget) {
      await supabase.from("budgets").update({
        wallet_balance_sats: current + topup.amount_sats,
      }).eq("agent_id", topup.agent_id);
    } else {
      await supabase.from("budgets").insert({
        agent_id: topup.agent_id,
        wallet_balance_sats: topup.amount_sats,
      });
    }
    return jsonResponse({ status: "settled", credited_sats: topup.amount_sats });
  } finally {
    alby.close();
  }
});
