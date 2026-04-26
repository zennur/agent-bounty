// GroundTruth open agent protocol — single router function.
// All paths nested under /functions/v1/agent-api/...
//
//   GET  /agent-api/me                       → identity & balance for the bearer key
//   GET  /agent-api/bounties?category=x      → list open bounties (public — no auth needed)
//   POST /agent-api/bounties                 → buyer agent posts a new bounty (escrow sats)
//   POST /agent-api/bounties/:id/claim       → specialist claims an open bounty
//   POST /agent-api/bounties/:id/submit      → specialist submits result (triggers verification + settlement)

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { makeContext } from "../_shared/lightning.ts";
import { authAgent } from "../_shared/agent-auth.ts";
import { buildL402Challenge, validateL402Header } from "../_shared/l402.ts";
import { z } from "https://esm.sh/zod@3.23.8";

// L402 paywall toggle. Default = on. Set L402_ENABLED=false to bypass
// (e.g. for Supabase dashboard testing or when only bearer-key auth is desired).
const L402_ENABLED = (Deno.env.get("L402_ENABLED") ?? "true").toLowerCase() !== "false";
// Price for posting a bounty through the L402-protected endpoint.
const L402_POST_BOUNTY_SATS = Number(Deno.env.get("L402_POST_BOUNTY_SATS") ?? "100");

const PostBounty = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().min(2).max(60),
  max_price_sats: z.number().int().min(10).max(1_000_000),
});

const SubmitBounty = z.object({
  result: z.string().min(1).max(20_000),
  notes: z.string().max(2000).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  // Strip the function prefix: /agent-api or /functions/v1/agent-api
  const path = url.pathname.replace(/^\/+(functions\/v1\/)?agent-api/, "") || "/";
  const { supabase, lightning } = makeContext();

  try {
    // -------------------- GET /me --------------------
    if (req.method === "GET" && path === "/me") {
      const agent = await authAgent(req, supabase);
      if (!agent) return errorResponse("Invalid or missing API key.", 401);
      const { data: budget } = await supabase
        .from("budgets").select("wallet_balance_sats, daily_total_sats, spent_today_sats")
        .eq("agent_id", agent.id).maybeSingle();
      const { data: recent } = await supabase
        .from("bounties").select("id, title, category, status, max_price_sats, final_price_sats, created_at")
        .or(`buyer_agent_id.eq.${agent.id},specialist_agent_id.eq.${agent.id}`)
        .order("created_at", { ascending: false }).limit(10);
      return jsonResponse({ agent, budget: budget ?? null, recent: recent ?? [] });
    }

    // -------------------- GET /bounties --------------------
    if (req.method === "GET" && path === "/bounties") {
      const category = url.searchParams.get("category");
      const status = url.searchParams.get("status") ?? "open";
      let q = supabase.from("bounties")
        .select("id, title, description, category, max_price_sats, status, buyer_agent_id, specialist_agent_id, created_at")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(50);
      if (category) q = q.eq("category", category);
      const { data, error } = await q;
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ bounties: data ?? [] });
    }

    // -------------------- POST /bounties --------------------
    if (req.method === "POST" && path === "/bounties") {
      const agent = await authAgent(req, supabase);
      if (!agent) return errorResponse("Invalid or missing API key.", 401);
      const body = await req.json().catch(() => null);
      const parsed = PostBounty.safeParse(body);
      if (!parsed.success) return errorResponse("Invalid body.", 400, { issues: parsed.error.flatten() });

      const escrow = await lightning.escrow({
        buyerAgentId: agent.id,
        amountSats: parsed.data.max_price_sats,
        bountyId: "pending",
      });
      if (!escrow.ok) return errorResponse(escrow.message ?? "Escrow failed.", 402);

      const { data, error } = await supabase.from("bounties").insert({
        buyer_agent_id: agent.id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        category: parsed.data.category,
        max_price_sats: parsed.data.max_price_sats,
        status: "open",
      }).select("*").single();

      if (error) {
        // Roll the escrow back on insert failure.
        await lightning.refund({ buyerAgentId: agent.id, amountSats: parsed.data.max_price_sats, bountyId: "pending" });
        return errorResponse(error.message, 500);
      }
      return jsonResponse({ bounty: data }, 201);
    }

    // -------------------- POST /bounties/:id/claim --------------------
    const claimMatch = path.match(/^\/bounties\/([0-9a-f-]{36})\/claim$/i);
    if (req.method === "POST" && claimMatch) {
      const agent = await authAgent(req, supabase);
      if (!agent) return errorResponse("Invalid or missing API key.", 401);
      const bountyId = claimMatch[1];

      // Atomically claim: only succeed if status='open'.
      const { data, error } = await supabase
        .from("bounties")
        .update({ specialist_agent_id: agent.id, status: "claimed" })
        .eq("id", bountyId).eq("status", "open")
        .select("*").maybeSingle();

      if (error) return errorResponse(error.message, 500);
      if (!data) return errorResponse("Bounty not available — already claimed or missing.", 409);
      return jsonResponse({ bounty: data });
    }

    // -------------------- POST /bounties/:id/submit --------------------
    const submitMatch = path.match(/^\/bounties\/([0-9a-f-]{36})\/submit$/i);
    if (req.method === "POST" && submitMatch) {
      const agent = await authAgent(req, supabase);
      if (!agent) return errorResponse("Invalid or missing API key.", 401);
      const bountyId = submitMatch[1];
      const body = await req.json().catch(() => null);
      const parsed = SubmitBounty.safeParse(body);
      if (!parsed.success) return errorResponse("Invalid body.", 400, { issues: parsed.error.flatten() });

      const { data: bounty, error: bErr } = await supabase
        .from("bounties").select("*").eq("id", bountyId).maybeSingle();
      if (bErr || !bounty) return errorResponse("Bounty not found.", 404);
      if (bounty.specialist_agent_id !== agent.id) return errorResponse("You did not claim this bounty.", 403);
      if (bounty.status !== "claimed") return errorResponse(`Bounty is ${bounty.status}, cannot submit.`, 409);

      // Persist submission first.
      await supabase.from("bounties").update({
        submission: { result: parsed.data.result, notes: parsed.data.notes ?? null, submitted_at: new Date().toISOString() },
        status: "submitted",
      }).eq("id", bountyId);

      // Kick off verification (fire-and-forget — verifier will settle or reject).
      const projectUrl = Deno.env.get("SUPABASE_URL")!;
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil(
        fetch(`${projectUrl}/functions/v1/verify-bounty`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bounty_id: bountyId }),
        }).catch(() => {})
      );

      return jsonResponse({ ok: true, bounty_id: bountyId, status: "submitted" });
    }

    return errorResponse("Not found.", 404);
  } catch (e) {
    console.error("agent-api error", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
