// GroundTruth MCP server — exposes the marketplace as autonomous-agent tools.
//
// Endpoint: https://<ref>.supabase.co/functions/v1/mcp
// Transport: MCP Streamable HTTP (JSON-RPC over POST + SSE).
// Auth: per-agent API key in `Authorization: Bearer gt_<prefix>_<secret>`.
//   - list_agents / get_agent_details / get_task_result work without auth.
//   - hire_agent requires a valid bearer token; the authed agent becomes the buyer.

import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";
import { makeContext } from "../_shared/lightning.ts";
import { authAgent, sha256Hex } from "../_shared/agent-auth.ts";
import {
  buildL402Challenge,
  macaroonFingerprint,
  validateL402Header,
} from "../_shared/l402.ts";

const server = new McpServer({
  name: "agentbazaar",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});
const err = (message: string) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
  isError: true,
});

// -------------------- list_agents --------------------
server.tool("list_agents", {
  description:
    "Discover specialist agents on the marketplace. Returns id, name, persona, categories, base_price_sats, reputation, success_rate, runtime. Optionally filter by category, max price (sats), or minimum reputation.",
  inputSchema: z.object({
    category: z.string().optional().describe("Category tag (e.g. 'code_review')"),
    max_price_sats: z.number().optional().describe("Only agents at or below this price"),
    min_reputation: z.number().optional().describe("Only agents at or above this reputation"),
  }),
  handler: async (args) => {
    const { supabase } = makeContext();
    let q = supabase
      .from("agents")
      .select(
        "id, name, avatar, persona, categories, base_price_sats, reputation, success_rate, total_jobs, avg_completion_seconds, runtime, agent_type, is_active",
      )
      .eq("agent_type", "specialist")
      .eq("is_active", true)
      .order("reputation", { ascending: false })
      .limit(100);

    if (args.category) q = q.contains("categories", [args.category]);
    if (typeof args.max_price_sats === "number") q = q.lte("base_price_sats", args.max_price_sats);
    if (typeof args.min_reputation === "number") q = q.gte("reputation", args.min_reputation);

    const { data, error } = await q;
    if (error) return err(error.message);
    return json({ agents: data ?? [], count: data?.length ?? 0 });
  },
});

// -------------------- get_agent_details --------------------
server.tool("get_agent_details", {
  description:
    "Fetch one agent's full profile by id, plus its 5 most recent settled jobs as evidence of capability.",
  inputSchema: z.object({
    agent_id: z.string().describe("UUID of the agent"),
  }),
  handler: async (args) => {
    const { supabase } = makeContext();
    const { data: agent, error } = await supabase
      .from("agents")
      .select(
        "id, name, avatar, persona, categories, base_price_sats, reputation, success_rate, total_jobs, total_sats_earned, avg_completion_seconds, runtime, agent_type, is_active",
      )
      .eq("id", args.agent_id)
      .maybeSingle();
    if (error) return err(error.message);
    if (!agent) return err("Agent not found.");

    const { data: recent } = await supabase
      .from("bounties")
      .select("id, title, category, status, final_price_sats, settled_at")
      .eq("specialist_agent_id", args.agent_id)
      .eq("status", "settled")
      .order("settled_at", { ascending: false })
      .limit(5);

    return json({ agent, recent_jobs: recent ?? [] });
  },
});

// -------------------- hire_agent --------------------
server.tool("hire_agent", {
  description:
    "Hire an agent and get the result inline. Two auth modes:\n" +
    "  • Bearer: pass `Authorization: Bearer gt_<key>` — sats are escrowed from the agent's wallet.\n" +
    "  • L402 (keyless): on first call, omit auth → returns a 402 challenge with `invoice` + `macaroon` to pay over Lightning. Retry with `Authorization: L402 <macaroon>:<preimage>` to execute.\n" +
    "Picks best-match specialist for the category (or uses preferred_agent_id), invokes synchronously, returns the answer. No polling.",
  inputSchema: z.object({
    title: z.string().min(3).max(200).describe("Short task title"),
    description: z.string().max(4000).optional().describe("Detailed task description / payload"),
    category: z.string().min(2).max(60).describe("Category to route the request to"),
    max_price_sats: z.number().int().min(10).max(1_000_000).describe("Max sats willing to pay"),
    preferred_agent_id: z.string().optional().describe("Optional: specific agent id to hire"),
    refund_lnaddress: z.string().optional().describe("L402 mode only: Lightning address for refunds if the agent fails"),
  }),
  handler: async (args, ctx) => {
    const extra = ctx.authInfo?.extra as
      | { agent_id?: string; agent_name?: string; l402_header?: string }
      | undefined;
    const buyerAgentId = extra?.agent_id;
    const l402Header = extra?.l402_header;

    const { supabase, lightning } = makeContext();

    // 1. Pick a specialist.
    type Specialist = {
      id: string;
      name: string;
      base_price_sats: number;
      runtime: string;
      external_invoke_url: string | null;
      input_field_name: string | null;
      external_slug: string | null;
      system_prompt: string | null;
      persona: string | null;
    };
    let specialist: Specialist;

    if (args.preferred_agent_id) {
      const { data } = await supabase
        .from("agents")
        .select("id, name, base_price_sats, runtime, external_invoke_url, input_field_name, external_slug, system_prompt, persona, is_active")
        .eq("id", args.preferred_agent_id)
        .eq("is_active", true)
        .maybeSingle();
      const picked = data as unknown as Specialist | null;
      if (!picked) return err("Preferred agent not found or inactive.");
      if (picked.base_price_sats > args.max_price_sats) {
        return err(`Preferred agent costs ${picked.base_price_sats} sats, above your max of ${args.max_price_sats}.`);
      }
      specialist = picked;
    } else {
      const { data: candidates } = await supabase
        .from("agents")
        .select("id, name, base_price_sats, runtime, external_invoke_url, input_field_name, external_slug, system_prompt, persona")
        .in("runtime", ["hosted", "external"])
        .eq("agent_type", "specialist")
        .eq("is_active", true)
        .lte("base_price_sats", args.max_price_sats)
        .contains("categories", [args.category])
        .order("reputation", { ascending: false })
        .limit(1);
      const picked = (candidates?.[0] as unknown as Specialist | undefined) ?? null;
      if (!picked) return err(`No active specialist found for category "${args.category}" at max ${args.max_price_sats} sats.`);
      specialist = picked;
    }

    const price = specialist.base_price_sats;

    // 2. Auth gate: prefer Bearer (buyerAgentId); else require L402.
    let authMode: "bearer" | "l402";
    let macaroonHash: string | null = null;

    if (buyerAgentId) {
      authMode = "bearer";
    } else if (l402Header) {
      const v = await validateL402Header(l402Header);
      if (!v.ok || !v.claims) {
        return err(`L402 auth failed: ${v.reason ?? "invalid"}.`);
      }
      if (v.claims.amount_sats < price) {
        return err(`L402 macaroon paid ${v.claims.amount_sats} sats, but ${specialist.name} costs ${price}.`);
      }
      if (v.claims.resource && v.claims.resource !== "mcp:hire_agent" && v.claims.resource !== specialist.id) {
        return err(`L402 macaroon bound to resource "${v.claims.resource}", not this hire.`);
      }
      const macaroon = l402Header.match(/^L402\s+([^:\s]+):/)?.[1] ?? "";
      macaroonHash = await macaroonFingerprint(macaroon);
      authMode = "l402";
    } else {
      // No auth at all → return L402 challenge so the caller can pay & retry.
      const challenge = await buildL402Challenge(
        price,
        "mcp:hire_agent",
        `Hire ${specialist.name} via MCP`,
        { role: "buyer", refund_lnaddress: args.refund_lnaddress },
      );
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            status: 402,
            error: "Payment Required",
            mode: "l402",
            specialist: { id: specialist.id, name: specialist.name, price_sats: price },
            invoice: challenge.body.invoice,
            macaroon: challenge.body.macaroon,
            payment_hash: challenge.body.payment_hash,
            amount_sats: challenge.body.amount_sats,
            demo_preimage: challenge.body.demo_preimage,
            instructions:
              "Pay the BOLT11 invoice over Lightning, then re-call hire_agent with header " +
              `'Authorization: L402 ${challenge.body.macaroon}:<preimage>'. ` +
              "In demo/mock mode, use the demo_preimage above.",
          }, null, 2),
        }],
        isError: false,
      };
    }

    // 3. Bearer-mode escrow (skip entirely for L402 — invoice already paid).
    if (authMode === "bearer") {
      const escrow = await lightning.escrow({
        buyerAgentId: buyerAgentId!,
        amountSats: price,
        bountyId: "pending",
      });
      if (!escrow.ok) return err(escrow.message ?? "Escrow failed.");
    }

    // 4. Create the bounty row in 'claimed' state so the dispatcher trigger doesn't fire.
    const { data: bounty, error: insertErr } = await supabase
      .from("bounties")
      .insert({
        buyer_agent_id: authMode === "bearer" ? buyerAgentId : null,
        specialist_agent_id: specialist.id,
        title: args.title,
        description: args.description ?? null,
        category: args.category,
        max_price_sats: args.max_price_sats,
        status: "claimed",
        auth_mode: authMode,
        buyer_macaroon_hash: macaroonHash,
        refund_lnaddress: authMode === "l402" ? args.refund_lnaddress ?? null : null,
      })
      .select("id")
      .single();

    if (insertErr || !bounty) {
      if (authMode === "bearer") {
        await lightning.refund({ buyerAgentId: buyerAgentId!, amountSats: price, bountyId: "pending" });
      }
      return err(insertErr?.message ?? "Failed to create bounty.");
    }

    const jobId = bounty.id;

    // 5. Invoke the agent synchronously.
    const taskPayload = `${args.title}\n\n${args.description ?? ""}`.trim();
    let agentResult: string | null = null;
    let agentError: string | null = null;

    try {
      if (specialist.runtime === "external" && specialist.external_invoke_url) {
        const inputKey = specialist.input_field_name ?? "query";
        const resp = await fetch(specialist.external_invoke_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [inputKey]: taskPayload }),
        });
        if (!resp.ok) {
          agentError = `Agent returned HTTP ${resp.status}: ${await resp.text().catch(() => "")}`;
        } else {
          const data = await resp.json();
          agentResult = data.answer ?? data.result ?? JSON.stringify(data);
        }
      } else if (specialist.runtime === "hosted") {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) {
          agentError = "Hosted runtime not configured (missing LOVABLE_API_KEY).";
        } else {
          const systemPrompt = specialist.system_prompt
            ?? `You are ${specialist.name}. ${specialist.persona ?? ""}. Provide a focused, expert response.`;
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `BOUNTY: ${args.title}\nCATEGORY: ${args.category}\n\n${args.description ?? ""}` },
              ],
            }),
          });
          if (!resp.ok) {
            agentError = `Hosted AI returned HTTP ${resp.status}.`;
          } else {
            const data = await resp.json();
            agentResult = data.choices?.[0]?.message?.content ?? null;
            if (!agentResult) agentError = "Hosted AI returned empty response.";
          }
        }
      } else {
        agentError = `Specialist runtime '${specialist.runtime}' is not invokable.`;
      }
    } catch (e) {
      agentError = e instanceof Error ? e.message : String(e);
    }

    // 6. Settle.
    if (agentError || !agentResult) {
      if (authMode === "bearer") {
        await lightning.refund({ buyerAgentId: buyerAgentId!, amountSats: price, bountyId: jobId });
      }
      // L402: refund must go to refund_lnaddress out-of-band — record the failure.
      await supabase
        .from("bounties")
        .update({
          status: "failed",
          payout_error: agentError ?? "Unknown invocation error.",
          submission: { error: agentError, attempted_at: new Date().toISOString() },
        })
        .eq("id", jobId);
      const refundNote = authMode === "l402"
        ? ` Refund owed to ${args.refund_lnaddress ?? "(no refund address provided)"}.`
        : " Sats refunded.";
      return err(`Agent invocation failed: ${agentError ?? "no result"}.${refundNote}`);
    }

    // Success: pay the specialist. For L402, source funds = the L402 invoice itself (from_agent_id null).
    let payoutRef: string | null = null;
    if (authMode === "bearer") {
      const release = await lightning.release({
        buyerAgentId: buyerAgentId!,
        specialistAgentId: specialist.id,
        amountSats: price,
        bountyId: jobId,
      });
      payoutRef = release.txn_id ?? null;
    } else {
      // L402 settlement: log the credit to the specialist directly.
      const { data: txn } = await supabase
        .from("transactions")
        .insert({
          from_agent_id: null,
          to_agent_id: specialist.id,
          bounty_id: jobId,
          amount_sats: price,
          status: "settled",
        })
        .select("id")
        .single();
      payoutRef = txn?.id ?? null;
      const { data: spec } = await supabase
        .from("agents")
        .select("total_sats_earned, total_jobs, success_rate")
        .eq("id", specialist.id)
        .single();
      if (spec) {
        const newJobs = (spec.total_jobs ?? 0) + 1;
        const newRate = ((spec.success_rate ?? 1) * (spec.total_jobs ?? 0) + 1) / newJobs;
        await supabase
          .from("agents")
          .update({
            total_sats_earned: (spec.total_sats_earned ?? 0) + price,
            total_jobs: newJobs,
            success_rate: Number(newRate.toFixed(4)),
          })
          .eq("id", specialist.id);
      }
    }

    await supabase
      .from("bounties")
      .update({
        status: "settled",
        final_price_sats: price,
        submission: {
          result: agentResult,
          notes: `MCP synchronous invocation via ${specialist.name} (${authMode})`,
          submitted_at: new Date().toISOString(),
        },
        verification: { ok: true, mode: `mcp_synchronous_${authMode}` },
        settled_at: new Date().toISOString(),
        payout_preimage: payoutRef,
      })
      .eq("id", jobId);

    return json({
      job_id: jobId,
      status: "settled",
      auth_mode: authMode,
      result: agentResult,
      specialist: {
        id: specialist.id,
        name: specialist.name,
        slug: specialist.external_slug,
        runtime: specialist.runtime,
      },
      paid_sats: price,
      payout_ref: payoutRef,
    });
  },
});


// -------------------- get_task_result --------------------
server.tool("get_task_result", {
  description:
    "Poll a hired job by id. Returns status (open|claimed|submitted|settled|failed), result payload (when available), verification verdict, final price, settled_at, and Lightning preimage. Call repeatedly until status is 'settled' or 'failed'.",
  inputSchema: z.object({
    job_id: z.string().describe("Bounty UUID returned by hire_agent"),
  }),
  handler: async (args) => {
    const { supabase } = makeContext();
    const { data, error } = await supabase
      .from("bounties")
      .select(
        "id, title, category, status, max_price_sats, final_price_sats, submission, verification, settled_at, payout_preimage, payout_error, specialist_agent_id, created_at",
      )
      .eq("id", args.job_id)
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("Job not found.");

    let specialist = null;
    if (data.specialist_agent_id) {
      const { data: s } = await supabase
        .from("agents")
        .select("id, name, avatar, persona")
        .eq("id", data.specialist_agent_id)
        .maybeSingle();
      specialist = s;
    }

    return json({
      job_id: data.id,
      status: data.status,
      title: data.title,
      category: data.category,
      specialist,
      result: data.submission ?? null,
      verification: data.verification ?? null,
      max_price_sats: data.max_price_sats,
      final_price_sats: data.final_price_sats,
      settled_at: data.settled_at,
      payout_preimage: data.payout_preimage,
      error: data.payout_error,
      created_at: data.created_at,
    });
  },
});

// ---- HTTP wiring ----
const transport = new StreamableHttpTransport();
const handle = transport.bind(server);
const app = new Hono();

app.options("/*", () => new Response(null, { headers: corsHeaders }));

app.all("/*", async (c) => {
  // Resolve bearer token to an agent (if any) and pass via authInfo.
  let authInfo: { token: string; scopes: string[]; extra?: Record<string, unknown> } | undefined;
  const header = c.req.raw.headers.get("authorization") ?? c.req.raw.headers.get("Authorization");
  if (header?.startsWith("Bearer gt_")) {
    const token = header.slice("Bearer ".length).trim();
    const { supabase } = makeContext();
    const agent = await authAgent(c.req.raw, supabase);
    if (agent) {
      authInfo = {
        token: await sha256Hex(token),
        scopes: ["agent"],
        extra: { agent_id: agent.id, agent_name: agent.name },
      };
    }
  }

  const res = await handle(c.req.raw, authInfo ? { authInfo } : undefined);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});

Deno.serve(app.fetch);
