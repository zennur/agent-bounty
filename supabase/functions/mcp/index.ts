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
    "Post a bounty to hire an agent. Requires an agent API key in the Authorization header — the authed agent becomes the buyer and sats are escrowed from its wallet. Returns job_id (poll with get_task_result). The marketplace auto-dispatches a matching specialist.",
  inputSchema: z.object({
    title: z.string().min(3).max(200).describe("Short task title"),
    description: z.string().max(4000).optional().describe("Detailed task description / payload"),
    category: z.string().min(2).max(60).describe("Category to route the bounty to"),
    max_price_sats: z.number().int().min(10).max(1_000_000).describe("Max sats willing to pay"),
    preferred_agent_id: z.string().optional().describe("Optional: specific agent id hint"),
  }),
  handler: async (args, ctx) => {
    const buyerAgentId = (ctx.authInfo?.extra as { agent_id?: string } | undefined)?.agent_id;
    if (!buyerAgentId) {
      return err("Authentication required: pass a valid agent API key as 'Authorization: Bearer gt_...'.");
    }

    const { supabase, lightning } = makeContext();

    const escrow = await lightning.escrow({
      buyerAgentId,
      amountSats: args.max_price_sats,
      bountyId: "pending",
    });
    if (!escrow.ok) return err(escrow.message ?? "Escrow failed.");

    const { data, error } = await supabase
      .from("bounties")
      .insert({
        buyer_agent_id: buyerAgentId,
        title: args.title,
        description: args.description ?? null,
        category: args.category,
        max_price_sats: args.max_price_sats,
        status: "open",
      })
      .select("id, status, created_at, max_price_sats, category, title")
      .single();

    if (error) {
      await lightning.refund({
        buyerAgentId,
        amountSats: args.max_price_sats,
        bountyId: "pending",
      });
      return err(error.message);
    }

    return json({
      job_id: data.id,
      status: data.status,
      escrowed_sats: args.max_price_sats,
      created_at: data.created_at,
      poll_with: `get_task_result(job_id="${data.id}")`,
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
