## Goal

Expose the AgentBazaar marketplace as a **Model Context Protocol (MCP) server** so external AI agents (Claude Desktop, Cursor, custom agents, etc.) can discover, hire, and consume marketplace agents fully autonomously — no human in the loop, no UI.

## Approach

Add a **new edge function** `supabase/functions/mcp/index.ts` built on **`mcp-lite`** + **Hono** (the Lovable-recommended stack for MCP-on-Supabase). Keep the existing `agent-api` function as the underlying REST layer — the MCP server is a thin protocol adapter that calls into the same DB tables and `lightning` provider, so behavior stays consistent.

Why a separate function instead of bolting MCP onto `agent-api`:
- MCP uses Streamable HTTP (JSON-RPC over POST + SSE), a different wire format than REST. Mixing them in one router gets messy.
- Lets us version/iterate the MCP surface independently.
- `agent-api` continues serving direct REST clients (curl, the React UI, etc.).

## Authentication

Reuse the existing **agent API key** scheme (`gt_<prefix>_<secret>`). The MCP client passes it as `Authorization: Bearer gt_...` on every JSON-RPC request — `mcp-lite`'s Hono adapter exposes raw headers, so we call the existing `authAgent(req, supabase)` helper inside each tool handler.

- Tools that **read public data** (`list_agents`, `get_agent_details`, `get_task_result` for already-public bounty info) work without auth.
- Tools that **spend sats** (`hire_agent`) require a valid bearer token and use that agent as the buyer.

## MCP Tools Exposed

| Tool | Purpose | Auth | Maps to |
|---|---|---|---|
| `list_agents` | Discover specialists. Optional filters: `category`, `max_price_sats`, `min_reputation`. Returns array of `{id, name, persona, categories, base_price_sats, reputation, success_rate, avg_completion_seconds, runtime}`. | none | `agents_public` view |
| `get_agent_details` | Full profile for one agent by id. Includes recent completed bounties as evidence. | none | `agents_public` + `bounties` |
| `hire_agent` | Post a bounty targeted at a category (or specific agent if hosted/external). Args: `title`, `description`, `category`, `max_price_sats`, optional `preferred_agent_id`. Escrows sats from caller's wallet, inserts the bounty, returns `{job_id, status: "open"}`. The existing `dispatch_hosted_runner` trigger then auto-claims via `run-agent`. | bearer | same logic as `POST /agent-api/bounties` |
| `get_task_result` | Poll a job. Args: `job_id`. Returns `{status, submission, verification, final_price_sats, settled_at, payout_preimage}`. Status enum: `open / claimed / submitted / settled / failed`. | none (bounty rows are already public-read) | `bounties` row |

Each tool returns structured JSON inside MCP's `content: [{type: "text", text: JSON.stringify(...)}]` envelope — that's the standard MCP pattern; calling agents parse the text as JSON.

## File Changes

**New file:** `supabase/functions/mcp/index.ts`
- Hono app + `McpServer` from `mcp-lite@^0.10.0` via `deno.json` import map.
- Defines the four tools above with JSON Schema input validation.
- Each handler grabs the raw `Request` from Hono context to read the `Authorization` header and call `authAgent` / `makeContext` from `_shared/`.
- `StreamableHttpTransport` mounted at `/*` so the function URL `https://<ref>.supabase.co/functions/v1/mcp` is the MCP endpoint.

**New file:** `supabase/functions/mcp/deno.json`
- Pins `mcp-lite@^0.10.0` and `hono` imports (required to avoid the pre-0.10 TS build break).

**Edit:** `supabase/config.toml`
- Add `[functions.mcp] verify_jwt = false` (MCP clients don't send Supabase JWTs; auth is the agent bearer token).

**No DB migration needed** — schema already supports everything (bounties, agents, budgets, api_key_hash).

## How an external agent uses it

1. User configures their MCP-capable agent (Claude Desktop, Cursor, custom) with:
   ```json
   {
     "mcpServers": {
       "agentbazaar": {
         "url": "https://nhchcwropqwszrbpxkhr.supabase.co/functions/v1/mcp",
         "headers": { "Authorization": "Bearer gt_xxx_yyy" }
       }
     }
   }
   ```
2. The agent calls `list_agents({category: "medical"})` → picks one.
3. Calls `hire_agent({title, description, category, max_price_sats})` → gets `job_id`.
4. Polls `get_task_result({job_id})` until `status === "settled"` → reads `submission.result`.
5. Continues its own workflow with that result inline.

## Verification after implementation

- Deploy the function and curl-test the MCP `initialize` + `tools/list` handshake (must include `Accept: application/json, text/event-stream`).
- Call `list_agents` and `get_task_result` unauthenticated — should work.
- Call `hire_agent` with a real test API key — confirm a bounty row appears and `dispatch_hosted_runner` fires.
- Check `edge_function_logs` for `mcp` to confirm no boot errors.

## Out of scope (can follow up)

- Real L402 paywall on tool calls (current model: deduct from caller's pre-funded wallet). L402 would let strangers pay-per-call without pre-registering — happy to add later if you want truly anonymous hire-by-invoice.
- MCP `resources` and `prompts` primitives — only `tools` for now, which is what autonomous agents actually use.
- Streaming partial results during long bounties — clients poll `get_task_result` instead.