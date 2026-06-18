// Hosted runner: when a new bounty is posted, the Postgres trigger calls this.
// We pick the best-fit hosted specialist and run it via Lovable AI to produce a submission.
// Then we claim + submit on its behalf, which kicks off the verifier.

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { makeContext } from "../_shared/lightning.ts";

// Duplicated from src/lib/utils.ts — keep in sync.
function effectivePrice(basePriceSats: number, reputation: number): number {
  if (reputation >= 90) return Math.round(basePriceSats * 1.5);
  if (reputation >= 80) return Math.round(basePriceSats * 1.25);
  if (reputation >= 60) return Math.round(basePriceSats * 1.1);
  return basePriceSats;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only.", 405);

  const { supabase } = makeContext();
  const { bounty_id } = await req.json().catch(() => ({}));
  if (!bounty_id) return errorResponse("bounty_id required.", 400);

  const { data: bounty } = await supabase.from("bounties").select("*").eq("id", bounty_id).maybeSingle();
  if (!bounty || bounty.status !== "open") {
    return jsonResponse({ skipped: true, reason: `bounty status=${bounty?.status ?? "missing"}` });
  }

  // Pick a specialist that handles this category. Prefer highest reputation,
  // but enforce eligibility on EFFECTIVE price (base price adjusted by reputation premium).
  const { data: candidates } = await supabase
    .from("agents")
    .select("id, name, persona, system_prompt, base_price_sats, reputation, categories, runtime, external_invoke_url, input_field_name")
    .in("runtime", ["hosted", "external"])
    .eq("agent_type", "specialist")
    .eq("is_active", true)
    .contains("categories", [bounty.category])
    .order("reputation", { ascending: false });

  const specialist = (candidates ?? []).find(
    (c) => effectivePrice(c.base_price_sats, c.reputation) <= bounty.max_price_sats,
  );
  if (!specialist) {
    console.log("No specialist for", bounty.category);
    return jsonResponse({ dispatched: false, reason: "No matching specialist." });
  }

  // Atomically claim.
  const { data: claimed } = await supabase
    .from("bounties").update({ specialist_agent_id: specialist.id, status: "claimed" })
    .eq("id", bounty_id).eq("status", "open").select("*").maybeSingle();
  if (!claimed) {
    return jsonResponse({ dispatched: false, reason: "Already claimed by someone else." });
  }

  let result = "";

  if (specialist.runtime === "external" && specialist.external_invoke_url) {
    // External AgentBazaar agent
    const inputKey = specialist.input_field_name ?? "query";
    try {
      const extResp = await fetch(specialist.external_invoke_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [inputKey]: `${bounty.title}\n\n${bounty.description ?? ""}`,
        }),
      });
      if (!extResp.ok) {
        console.error("External agent error", extResp.status, await extResp.text());
        result = `(${specialist.name} returned an error — ${extResp.status})`;
      } else {
        const extData = await extResp.json();
        result = extData.answer ?? extData.result ?? JSON.stringify(extData);
      }
    } catch (e) {
      console.error("External agent fetch failed", e);
      result = `(${specialist.name} unreachable — fallback verdict.)`;
    }
  } else {
    // Hosted Lovable AI specialist
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return errorResponse("LOVABLE_API_KEY not configured.", 500);

    const systemPrompt = specialist.system_prompt
      ?? `You are ${specialist.name}. ${specialist.persona}. Provide a focused, expert response.`;

    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `BOUNTY: ${bounty.title}\nCATEGORY: ${bounty.category}\n\n${bounty.description ?? ""}` },
          ],
        }),
      });
      if (!resp.ok) {
        console.error("Hosted runner AI error", resp.status, await resp.text());
        result = `(${specialist.name} could not complete the task — upstream error.)`;
      } else {
        const data = await resp.json();
        result = data.choices?.[0]?.message?.content ?? "(empty response)";
      }
    } catch (e) {
      console.error("Hosted runner LLM failed", e);
      result = `(${specialist.name} crashed — fallback verdict.)`;
    }
  }

  // Submit on behalf of the hosted specialist.
  await supabase.from("bounties").update({
    status: "submitted",
    submission: {
      result,
      notes: `Hosted runner: ${specialist.name}`,
      submitted_at: new Date().toISOString(),
    },
  }).eq("id", bounty_id);

  // Trigger verification.
  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil(
    fetch(`${projectUrl}/functions/v1/verify-bounty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bounty_id }),
    }).catch(() => {})
  );

  return jsonResponse({ dispatched: true, specialist: specialist.name });
});
