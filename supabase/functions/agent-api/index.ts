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
import {
  buildL402Challenge,
  validateL402Header,
  canonicalBodyHash,
  macaroonFingerprint,
} from "../_shared/l402.ts";
import { z } from "https://esm.sh/zod@3.23.8";

// L402 paywall toggle. Default = on. Set L402_ENABLED=false to bypass
// (e.g. for Supabase dashboard testing or when only bearer-key auth is desired).
const L402_ENABLED = (Deno.env.get("L402_ENABLED") ?? "true").toLowerCase() !== "false";

// Bearer payload — buyer has an account, sats come from wallet_balance_sats.
const PostBounty = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().min(2).max(60),
  max_price_sats: z.number().int().min(10).max(1_000_000),
});

// L402 payload — keyless buyer, refund_lnaddress required so we can refund on reject/cancel.
const PostBountyL402 = PostBounty.extend({
  refund_lnaddress: z.string().min(3).max(200),
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
    // Dual-mode auth:
    //   • Bearer  → existing account flow: escrow from wallet_balance_sats, attribute bounty to agent.
    //   • L402    → keyless flow: invoice == max_price_sats, no account, refund_lnaddress required.
    //   • Neither → 402 challenge (only when L402_ENABLED).
    if (req.method === "POST" && path === "/bounties") {
      const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
      const isBearer = !!authHeader && /^Bearer\s+/i.test(authHeader);
      const isL402 = !!authHeader && /^L402\s+/i.test(authHeader);

      // ---- Mode A: Bearer (account + wallet) ----
      if (isBearer) {
        const agent = await authAgent(req, supabase);
        if (!agent) return errorResponse("Invalid or missing API key.", 401);
        const body = await req.json().catch(() => null);
        const parsed = PostBounty.safeParse(body);
        if (!parsed.success) return errorResponse("Invalid body.", 400, { issues: parsed.error.flatten() });

        const escrow = await lightning.escrow({
          buyerAgentId: agent.id, amountSats: parsed.data.max_price_sats, bountyId: "pending",
        });
        if (!escrow.ok) return errorResponse(escrow.message ?? "Escrow failed.", 402);

        const { data, error } = await supabase.from("bounties").insert({
          buyer_agent_id: agent.id,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          category: parsed.data.category,
          max_price_sats: parsed.data.max_price_sats,
          auth_mode: "bearer",
          status: "open",
        }).select("*").single();

        if (error) {
          await lightning.refund({ buyerAgentId: agent.id, amountSats: parsed.data.max_price_sats, bountyId: "pending" });
          return errorResponse(error.message, 500);
        }
        return jsonResponse({ bounty: data }, 201);
      }

      // ---- Mode B: L402 (keyless) ----
      // Step 1: no header → 402 challenge. The buyer must include max_price_sats and
      // refund_lnaddress in the FIRST request body so the invoice is correctly priced
      // and we can bind body_hash to prevent param-swap on retry.
      if (!isL402) {
        if (!L402_ENABLED) return errorResponse("Authentication required.", 401);
        const draft = await req.json().catch(() => null);
        const parsed = PostBountyL402.safeParse(draft);
        if (!parsed.success) {
          return errorResponse(
            "L402 mode requires title, category, max_price_sats and refund_lnaddress in the request body.",
            400,
            { issues: parsed.error.flatten() },
          );
        }
        const bodyHash = await canonicalBodyHash(parsed.data);
        const challenge = await buildL402Challenge(
          parsed.data.max_price_sats,
          "POST /agent-api/bounties",
          `GroundTruth · ${parsed.data.title.slice(0, 24)}`,
          { body_hash: bodyHash, refund_lnaddress: parsed.data.refund_lnaddress, role: "buyer" },
        );
        return new Response(JSON.stringify(challenge.body), {
          status: 402,
          headers: { ...corsHeaders, ...challenge.headers, "Content-Type": "application/json" },
        });
      }

      // Step 2: L402 header present. Validate preimage + body_hash, then insert.
      const v = await validateL402Header(authHeader);
      if (!v.ok || !v.claims) return errorResponse(`L402 invalid: ${v.reason}`, 401);

      const body = await req.json().catch(() => null);
      const parsed = PostBountyL402.safeParse(body);
      if (!parsed.success) return errorResponse("Invalid body.", 400, { issues: parsed.error.flatten() });

      // Body must match the body_hash baked into the macaroon during step 1.
      const expectedHash = v.claims.caveats?.body_hash;
      const actualHash = await canonicalBodyHash(parsed.data);
      if (!expectedHash || expectedHash !== actualHash) {
        return errorResponse("Body does not match the macaroon's body_hash caveat (params changed between 402 and retry).", 401);
      }
      // Invoice amount must equal the bounty price.
      if (v.claims.amount_sats !== parsed.data.max_price_sats) {
        return errorResponse("Macaroon amount does not match max_price_sats.", 401);
      }

      // Extract the macaroon (we know the header matches the L402 grammar).
      const macaroon = authHeader!.match(/^L402\s+([^:\s]+):/i)![1];
      const fp = await macaroonFingerprint(macaroon);

      const { data, error } = await supabase.from("bounties").insert({
        buyer_agent_id: null,
        buyer_macaroon_hash: fp,
        refund_lnaddress: parsed.data.refund_lnaddress,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        category: parsed.data.category,
        max_price_sats: parsed.data.max_price_sats,
        auth_mode: "l402",
        status: "open",
      }).select("*").single();

      if (error) return errorResponse(error.message, 500);
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
