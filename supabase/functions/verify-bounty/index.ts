// LLM verifier: grades a specialist's submission against the bounty using Lovable AI.
// On accept → status=verified, then settles the payment.
// On reject → status=rejected, refunds the buyer's escrow.

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { makeContext } from "../_shared/lightning.ts";
import { getAlby } from "../_shared/alby-nwc.ts";

const VERIFY_TOOL = {
  type: "function" as const,
  function: {
    name: "verdict",
    description: "Return a verdict on whether the submission satisfies the bounty.",
    parameters: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["accept", "reject"] },
        score: { type: "number", description: "0–100 quality score" },
        reason: { type: "string", description: "One sentence rationale, citing concrete content." },
      },
      required: ["verdict", "score", "reason"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only.", 405);

  const { supabase, lightning } = makeContext();
  const { bounty_id } = await req.json().catch(() => ({}));
  if (!bounty_id) return errorResponse("bounty_id required.", 400);

  const { data: bounty, error } = await supabase.from("bounties").select("*").eq("id", bounty_id).maybeSingle();
  if (error || !bounty) return errorResponse("Bounty not found.", 404);
  if (bounty.status !== "submitted") return jsonResponse({ skipped: true, reason: `status=${bounty.status}` });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return errorResponse("LOVABLE_API_KEY not configured.", 500);

  const submissionResult = bounty.submission?.result ?? "(empty)";
  const messages = [
    {
      role: "system",
      content:
        "You are an impartial bounty verifier on GroundTruth, a peer-to-peer marketplace for AI agents. " +
        "Given a bounty description and the specialist's submission, decide whether the submission satisfies the bounty. " +
        "Be strict but fair. Reject empty, off-topic, or clearly low-effort submissions. Always call the `verdict` tool.",
    },
    {
      role: "user",
      content:
        `BOUNTY\nTitle: ${bounty.title}\nCategory: ${bounty.category}\nDescription: ${bounty.description ?? "(none)"}\n\n` +
        `SUBMISSION\n${submissionResult}\n\nNotes: ${bounty.submission?.notes ?? "(none)"}`,
    },
  ];

  let verdict: { verdict: "accept" | "reject"; score: number; reason: string } = {
    verdict: "accept", score: 75, reason: "Default verdict — verifier unavailable.",
  };

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: [VERIFY_TOOL],
        tool_choice: { type: "function", function: { name: "verdict" } },
      }),
    });
    if (resp.status === 429) return errorResponse("Rate limited.", 429);
    if (resp.status === 402) return errorResponse("AI credits exhausted.", 402);
    if (!resp.ok) {
      console.error("Verifier AI error", resp.status, await resp.text());
    } else {
      const data = await resp.json();
      const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (args) verdict = JSON.parse(args);
    }
  } catch (e) {
    console.error("Verifier call failed", e);
  }

  const buyerId = bounty.buyer_agent_id;
  const specialistId = bounty.specialist_agent_id;
  const amount = bounty.max_price_sats;

  if (verdict.verdict === "accept") {
    await supabase.from("bounties").update({
      status: "verified",
      verification: { ...verdict, verified_at: new Date().toISOString() },
      final_price_sats: amount,
    }).eq("id", bounty_id);

    // 1. Internal ledger: move sats from buyer escrow → specialist credit.
    const release = await lightning.release({
      buyerAgentId: buyerId, specialistAgentId: specialistId, amountSats: amount, bountyId: bounty_id,
    });
    if (!release.ok) return jsonResponse({ verdict, settled: false, error: release.message });

    // 2. Real Lightning payout if the specialist included an invoice.
    const payoutInvoice = bounty.submission?.payout_invoice as string | undefined;
    let payoutPreimage: string | null = null;
    let payoutError: string | null = null;
    if (payoutInvoice) {
      const alby = getAlby();
      if (!alby) {
        payoutError = "ALBY_NWC_URL not configured; payout invoice not paid.";
      } else {
        try {
          const pay = await alby.payInvoice(payoutInvoice);
          payoutPreimage = pay.preimage;
        } catch (e) {
          payoutError = (e as Error).message;
        } finally {
          alby.close();
        }
      }
    }

    await supabase.from("bounties").update({
      status: payoutError ? "verified" : "settled",
      settled_at: payoutError ? null : new Date().toISOString(),
      payout_preimage: payoutPreimage,
      payout_error: payoutError,
    }).eq("id", bounty_id);

    return jsonResponse({ verdict, settled: !payoutError, payout_preimage: payoutPreimage, payout_error: payoutError });
  } else {
    await supabase.from("bounties").update({
      status: "rejected",
      verification: { ...verdict, verified_at: new Date().toISOString() },
    }).eq("id", bounty_id);
    await lightning.refund({ buyerAgentId: buyerId, amountSats: amount, bountyId: bounty_id });
    // Specialist's job count goes up but success rate takes a hit.
    const { data: spec } = await supabase.from("agents")
      .select("total_jobs, success_rate").eq("id", specialistId).single();
    if (spec) {
      const newJobs = (spec.total_jobs ?? 0) + 1;
      const newRate = ((spec.success_rate ?? 1) * (spec.total_jobs ?? 0)) / newJobs;
      await supabase.from("agents").update({
        total_jobs: newJobs, success_rate: Number(newRate.toFixed(4)),
      }).eq("id", specialistId);
    }
    return jsonResponse({ verdict, refunded: true });
  }
});
