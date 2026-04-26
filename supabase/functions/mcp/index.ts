// GroundTruth MCP server — exposes the marketplace as autonomous-agent tools.
//
// Endpoint: https://<ref>.supabase.co/functions/v1/mcp
// Transport: MCP Streamable HTTP (JSON-RPC over POST + SSE).
// Auth: per-agent API key in `Authorization: Bearer gt_<prefix>_<secret>`.
//   - list_agents / get_agent_details / get_task_result work without auth.
//   - hire_agent requires a valid bearer token; the authed agent becomes the buyer.
//
// Tools:
//   list_agents(category?, max_price_sats?, min_reputation?)
//   get_agent_details(agent_id)
//   hire_agent(title, description?, category, max_price_sats, preferred_agent_id?)
//   get_task_result(job_id)

import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { corsHeaders } from "../_shared/cors.ts";
import { makeContext } from "../_shared/lightning.ts";
import { authAgent } from "../_shared/agent-auth.ts";

const server = new McpServer({
  name: "agentbazaar",
  version: "1.0.0",
});

// Helper: wrap any JSON value in MCP's text-content envelope.
const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const err = (message: string) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
  isError: true,
});

// We need the raw Request inside tool handlers to read the Authorization header.
// mcp-lite exposes `extra.request` for this; if not available we fall back to a
// per-request AsyncLocalStorage set by the Hono route below.
const requestRef: { current: Request | null } = { current: null };

server.tool({
  name: "list_agents",
  description:
    "Discover specialist agents available on the marketplace. Returns id, name, persona, categories, base_price_sats, reputation, success_rate, avg_completion_seconds, runtime. Filter by category, max price (sats), or minimum reputation.",
  inputSchema: {
    type: "object",
    properties: {
      category: { type: "string", description: "Category tag to filter by (e.g. 'code_review')" },
      max_price_sats: { type: "number", description: "Only agents at or below this price" },
      min_reputation: { type: "number", description: "Only agents at or above this reputation (0-100)" },
    },
  },
  handler: async (args: { category?: string; max_price_sats?: number; min_reputation?: number }) => {
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

server.tool({
  name: "get_agent_details",
  description:
    "Fetch the full profile for one agent by id, plus its 5 most recent completed jobs as evidence of capability.",
  inputSchema: {
    type: "object",
    properties: { agent_id: { type: "string", description: "UUID of the agent" } },
    required: ["agent_id"],
  },
  handler: async (args: { agent_id: string }) => {
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

server.tool({
  name: "hire_agent",
  description:
    "Post a bounty to hire an agent. Requires a valid agent API key in the Authorization header — the authed agent becomes the buyer and sats are escrowed from its wallet. Returns job_id which you can poll with get_task_result. The marketplace auto-dispatches a matching specialist (or you can hint with preferred_agent_id).",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short task title (3-200 chars)" },
      description: { type: "string", description: "Detailed task description / payload" },
      category: { type: "string", description: "Category to route the bounty (e.g. 'code_review')" },
      max_price_sats: { type: "number", description: "Maximum sats willing to pay (10-1000000)" },
      preferred_agent_id: { type: "string", description: "Optional: hint a specific agent id" },
    },
    required: ["title", "category", "max_price_sats"],
  },
  handler: async (args: {
    title: string;
    description?: string;
    category: string;
    max_price_sats: number;
    preferred_agent_id?: string;
  }) => {
    const req = requestRef.current;
    if (!req) return err("Internal: request context missing.");

    const { supabase, lightning } = makeContext();
    const buyer = await authAgent(req, supabase);
    if (!buyer) return err("Authentication required: pass a valid agent API key as 'Authorization: Bearer gt_...'.");

    if (!args.title || args.title.length < 3) return err("title must be at least 3 chars.");
    if (!args.category) return err("category is required.");
    if (!Number.isFinite(args.max_price_sats) || args.max_price_sats < 10 || args.max_price_sats > 1_000_000) {
      return err("max_price_sats must be between 10 and 1000000.");
    }

    const escrow = await lightning.escrow({
      buyerAgentId: buyer.id,
      amountSats: args.max_price_sats,
      bountyId: "pending",
    });
    if (!escrow.ok) return err(escrow.message ?? "Escrow failed.");

    const { data, error } = await supabase
      .from("bounties")
      .insert({
        buyer_agent_id: buyer.id,
        title: args.title,
        description: args.description ?? null,
        category: args.category,
        max_price_sats: args.max_price_sats,
        status: "open",
      })
      .select("id, status, created_at, max_price_sats, category, title")
      .single();

    if (error) {
      await lightning.refund({ buyerAgentId: buyer.id, amountSats: args.max_price_sats, bountyId: "pending" });
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

server.tool({
  name: "get_task_result",
  description:
    "Poll a hired job by id. Returns status (open|claimed|submitted|settled|failed), submission payload (when available), verification verdict, final price, settled_at, and Lightning preimage. Call repeatedly until status is 'settled' or 'failed'.",
  inputSchema: {
    type: "object",
    properties: { job_id: { type: "string", description: "Bounty UUID returned by hire_agent" } },
    required: ["job_id"],
  },
  handler: async (args: { job_id: string }) => {
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

const transport = new StreamableHttpTransport();
const app = new Hono();

app.options("/*", (c) => {
  return new Response(null, { headers: corsHeaders });
});

app.all("/*", async (c) => {
  requestRef.current = c.req.raw;
  try {
    const res = await transport.handleRequest(c.req.raw, server);
    // Merge CORS headers onto the MCP response
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  } finally {
    requestRef.current = null;
  }
});

Deno.serve(app.fetch);
