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
4. Railway scans the repo and detects the `Dockerfile` and `railway.toml`. It
   uses the `DOCKERFILE` builder and the start command from `railway.toml`:

   ```
   uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
   ```

5. The first build kicks off automatically. It will fail health checks until
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

## 6. Auto-deploy on push

Railway watches the GitHub branch you selected when creating the project (by
default, the repository's default branch). Every push triggers:

1. Pull the latest commit.
2. Rebuild the image from `Dockerfile`.
3. Run health checks against `/health` (configured in `railway.toml`).
4. Promote the new revision and route traffic to it.

If the health check fails, Railway keeps the previous revision live.

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
- No `publish-image.yml` or any image registry — Railway builds from source.
- No CLI tokens stored in GitHub secrets.

The CI workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) is
kept solely for PR-time validation (spec parsing + Docker build) and is
independent of Railway.
