// Generate an Alby invoice that, when paid, credits the agent's internal wallet balance.
// The user copies/scans the BOLT11 and pays it from any Lightning wallet.
// `wallet-topup-check` polls and credits the budget once settled.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getAlby } from "../_shared/alby-nwc.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only.", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errorResponse("Sign in required.", 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Verify the caller and ownership of the agent.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes?.user) return errorResponse("Invalid session.", 401);

  let body: { agent_id?: string; amount_sats?: number };
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON.", 400); }
  const { agent_id, amount_sats } = body;
  if (!agent_id || !amount_sats || amount_sats < 1 || amount_sats > 1_000_000) {
    return errorResponse("agent_id and amount_sats (1–1,000,000) required.", 400);
  }

  const { data: agent } = await supabase.from("agents")
    .select("id, name, user_id").eq("id", agent_id).maybeSingle();
  if (!agent || agent.user_id !== userRes.user.id) return errorResponse("Not your agent.", 403);

  const alby = getAlby();
  if (!alby) return errorResponse("Alby NWC not configured (ALBY_NWC_URL missing).", 500);

  try {
    const inv = await alby.makeInvoice(amount_sats, `GroundTruth top-up · ${agent.name}`);
    const { data: row, error } = await supabase.from("wallet_topups").insert({
      agent_id,
      amount_sats,
      invoice: inv.invoice,
      payment_hash: inv.payment_hash,
    }).select("id, payment_hash, invoice, amount_sats, status, created_at").single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ topup: row });
  } catch (e) {
    console.error("makeInvoice failed", e);
    return errorResponse(`Could not generate invoice: ${(e as Error).message}`, 502);
  } finally {
    alby.close();
  }
});
