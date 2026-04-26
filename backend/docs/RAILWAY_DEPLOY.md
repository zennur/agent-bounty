# Deploying AgentBazaar to Railway

This guide walks you through deploying the FastAPI agent service on
[Railway](https://railway.com/) using its native GitHub integration. No
CLI push, no `RAILWAY_TOKEN`, no extra GitHub Action.

> Why Railway works out of the box: the [`Dockerfile`](../Dockerfile) binds to
> the `${PORT}` env var Railway injects, and [`railway.toml`](../railway.toml)
> tells Railway exactly how to build and probe the service.

---

## 1. Prerequisites

- A Railway account (free tier is enough for a smoke test).
- Your Azure OpenAI resource details:
  - endpoint URL (`https://<resource>.openai.azure.com/`)
  - API key
  - API version (e.g. `2024-02-15-preview`)
  - chat deployment name (e.g. `gpt-4o`)
- This repo pushed to GitHub.

## 2. Create the Railway project

1. Open the Railway dashboard and click **New Project**.
2. Choose **Deploy from GitHub repo**.
3. Authorize Railway for your GitHub account / org if prompted, then pick this
   repo.
4. **Monorepo: set the Root Directory.** This repo lives in a monorepo where
   the backend is under `backend/`. In **Service → Settings → Source**, set
   **Root Directory** to `backend`. Railway will then resolve `Dockerfile` and
   `railway.toml` relative to `backend/`.
5. Railway scans `backend/` and detects the `Dockerfile` and `railway.toml`.
   It uses the `DOCKERFILE` builder and the start command from `railway.toml`:

   ```
   uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
   ```

6. The first build kicks off automatically. It will fail health checks until
   you set the Azure env vars in step 3.

## 3. Set environment variables

In **Service → Variables**, add:

| Key | Value |
|-----|-------|
| `AZURE_OPENAI_ENDPOINT` | `https://<resource>.openai.azure.com/` |
| `AZURE_OPENAI_API_KEY` | your Azure OpenAI key (mark as secret) |
| `AZURE_OPENAI_API_VERSION` | e.g. `2024-02-15-preview` |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | your Azure chat deployment name (e.g. `gpt-4o`) |

Notes:

- `PORT` is provided automatically by Railway — **do not set it yourself**.
- `AGENTS_DIR` is baked into the Docker image as `/app/agents`, so leave it
  alone.

After saving, Railway redeploys.

## 4. Generate a public domain

In **Service → Settings → Networking** click **Generate Domain**. You'll get
an HTTPS URL similar to:

```
https://agentbazaar-production.up.railway.app
```

Railway terminates TLS and forwards to `${PORT}` inside the container.

## 5. Smoke test

Replace `<host>` with your Railway domain.

```bash
curl https://<host>/health

curl https://<host>/agents

curl -X POST https://<host>/agents/superbacteria-agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"bacteria_query": "What is the WHO priority and last-resort treatment for CRAB?"}'

curl -X POST https://<host>/agents/oncology-drug-agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"drug_query": "Compare NX-7701 and MX-8832 efficacy"}'

curl -X POST https://<host>/agents/british-predecimal-agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"currency_question": "Add £1 19s 11d and 1d using tools and explain carries."}'
```

If `/health` returns the registered agent slugs and the `invoke` calls return
JSON answers without `401`/`404` from Azure OpenAI in the logs, you're done.

## 5b. Connect from Cursor (MCP)

The same FastAPI app also serves a remote [Model Context Protocol](https://modelcontextprotocol.io/)
server at `/mcp/sse`. That turns each `agent.md` into a Cursor tool call — no
local install, no proxy script.

Quick check that the MCP endpoint is live:

```bash
curl -N https://<host>/mcp/sse
# expected: HTTP 200, content-type: text/event-stream, and an
# "event: endpoint" line announcing /mcp/messages/?session_id=...
```

Wire Cursor to it:

1. Open (or create) `~/.cursor/mcp.json`.
2. Add the `agentbazaar` server:

   ```json
   {
     "mcpServers": {
       "agentbazaar": {
         "url": "https://<host>/mcp/sse"
       }
     }
   }
   ```

3. Restart Cursor → **Settings → MCP**. You should see `agentbazaar` listed
   with three green tools:

   - `superbacteria-agent`
   - `oncology-drug-agent`
   - `british-predecimal-agent`

4. Use it in chat, e.g.:

   - "Use the agentbazaar tool `superbacteria-agent` to look up the WHO
     priority and last-resort treatment for CRAB."
   - "Call `british-predecimal-agent` to add £1 19s 11d and 1d and explain
     the carries."

Cursor routes those calls through the MCP server on Railway, which delegates
to the same `/agents/{slug}/invoke` logic. Adding a new `agents/*.md` and
redeploying is enough — the new agent automatically becomes a new MCP tool.

> Heads-up: this URL is currently open. Anyone with the host can call your
> agents and consume Azure OpenAI tokens. If that becomes a problem, add an
> `X-API-Key` check on `/mcp/sse` and pass `"headers": { "X-API-Key": "..." }`
> in `mcp.json`.

## 6. Auto-deploy on push

Railway watches the GitHub branch you selected when creating the project (by
default, the repository's default branch). Every push that touches `backend/`
triggers:

1. Pull the latest commit.
2. Rebuild the image from `backend/Dockerfile`.
3. Run health checks against `/health` (configured in `backend/railway.toml`).
4. Promote the new revision and route traffic to it.

If the health check fails, Railway keeps the previous revision live.

> Tip: Railway's GitHub integration redeploys on **any** commit to the watched
> branch by default. If your monorepo gets noisy, configure the Root Directory
> filter or add a Railway path filter so frontend-only commits don't trigger
> backend rebuilds.

## 7. Troubleshooting

- **`401`/`404` from Azure OpenAI** → wrong `AZURE_OPENAI_API_KEY`,
  endpoint, or deployment name. Verify in the Azure portal.
- **Build fails on `pip install`** → check Railway's build log. If it's a
  network issue, retrying usually works.
- **Health check timing out** → first request can be slow on a fresh
  replica. Increase `healthcheckTimeout` in [`railway.toml`](../railway.toml)
  if needed.
- **Cold starts** → if the service has min replicas = 0, the first request
  after idle takes a few seconds while Railway spins it back up.

## 8. Things that are *not* needed on Railway

- No Azure Container Apps, ACR, or managed identity.
- No image registry (GHCR, ACR, Docker Hub) — Railway builds from source.
- No CLI tokens stored in GitHub secrets.
- No GitHub Actions workflows — this repo ships zero workflows; Railway's
  GitHub integration handles build + deploy on its own.
