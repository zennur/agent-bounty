# AgentBazaar

LangChain-based agent **instanciator** that builds runnable agents from
human-authored `agent.md` specs. Three demo agents ship in the box:

- `superbacteria-agent` — facts about 10 antibiotic-resistant superbugs.
- `oncology-drug-agent` — facts about a hypothetical cancer-drug pipeline.
- `british-predecimal-agent` — niche **pre-1971 UK £.s.d** (pounds, shillings, pence) math via tools (`pence_to_lsd`, `combine_lsd_amounts`, etc.).

All run inside a single FastAPI service in one Docker image and call your
**Azure-hosted OpenAI model** through `langchain-openai`'s `AzureChatOpenAI`.

## Layout

```
agents/                       # agent.md spec files (the source of truth)
  superbacteria-agent.md
  oncology-drug-agent.md
  british-predecimal-agent.md
app/
  spec_parser.py              # markdown -> AgentSpec
  instanciator.py             # AgentSpec -> runnable LangChain agent
  tools_bacteria.py           # tools for the bacteria agent
  tools_oncology.py           # tools for the oncology agent
  tools_predecimal.py         # £.s.d conversion tools
  main.py                     # FastAPI (dynamic /agents/{slug}/invoke)
  config.py                   # Azure OpenAI env wiring
scripts/load_agent.py         # CLI: parse + optional one-shot query
.github/workflows/ci.yml      # PR sanity check: parse specs + build image
railway.toml                  # Railway build/deploy config (optional)
Dockerfile / docker-compose.yml
```

## Local run

```bash
python -m venv .venv && .venv\Scripts\activate   # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

set AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/
set AZURE_OPENAI_API_KEY=<key>
set AZURE_OPENAI_API_VERSION=2024-02-15-preview
set AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4o

uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Docker

```bash
docker build -t agentbazaar:latest .
docker run --rm -p 8000:8000 ^
  -e AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/ ^
  -e AZURE_OPENAI_API_KEY=<key> ^
  -e AZURE_OPENAI_API_VERSION=2024-02-15-preview ^
  -e AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4o ^
  agentbazaar:latest
```

Or with compose (reads from `.env`):

```bash
copy .env.example .env
docker compose up --build
```

## Endpoints

- `GET  /health` — liveness + registered agent slugs.
- `GET  /agents` — declared metadata for every loaded `agent.md`.
- `POST /agents/{slug}/invoke` — body uses that agent’s primary field (see `GET /agents`) or a generic `"query"`.
- `GET` or `POST` `/agents/{slug}/heartbeat`

### Example payloads

```bash
curl -X POST http://localhost:8000/agents/superbacteria-agent/invoke ^
  -H "Content-Type: application/json" ^
  -d "{\"bacteria_query\": \"What is the WHO priority and last-resort treatment for CRAB?\"}"

curl -X POST http://localhost:8000/agents/oncology-drug-agent/invoke ^
  -H "Content-Type: application/json" ^
  -d "{\"drug_query\": \"Compare NX-7701 and MX-8832 efficacy\"}"

curl -X POST http://localhost:8000/agents/british-predecimal-agent/invoke ^
  -H "Content-Type: application/json" ^
  -d "{\"currency_question\": \"Add £1 19s 11d and 1d using tools and explain carries.\"}"
```

Responses follow the `## Output Schema` declared in each `agent.md`
(e.g. `answer`, `who_classifications_referenced`, `tool_calls_made` for
bacteria; `answer`, `drugs_referenced`, `trial_phases_referenced`,
`disclaimer` for oncology; `answer`, `tool_calls_made`, `era_note` for pre-decimal).

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on PR / `main`: install deps, parse every `agents/*.md`, smoke-test the tool builders, and build the Docker image (no push). It is independent of how you deploy.

## Deploy on Railway

The image binds to Railway's injected `${PORT}`, so the same Docker image works locally and on Railway.

1. **New Project → Deploy from GitHub repo** and pick this repo. Railway auto-detects the [`Dockerfile`](Dockerfile) and the optional [`railway.toml`](railway.toml).
2. In **Service → Variables**, set:
   - `AZURE_OPENAI_ENDPOINT`
   - `AZURE_OPENAI_API_KEY`
   - `AZURE_OPENAI_API_VERSION` (e.g. `2024-02-15-preview`)
   - `AZURE_OPENAI_CHAT_DEPLOYMENT` (your Azure deployment name)
3. **Settings → Networking → Generate Domain** to get an HTTPS URL. Railway terminates TLS and forwards to `${PORT}`.
4. Pushes to the configured branch auto-trigger a new build + deploy through Railway's GitHub integration — no CLI, no `RAILWAY_TOKEN`, no extra workflow.

See [`docs/RAILWAY_DEPLOY.md`](docs/RAILWAY_DEPLOY.md) for a step-by-step walkthrough.

## Adding a new agent

1. Drop a new `agents/<name>.md` with `## Heartbeat` `endpoint: /agents/<slug>/heartbeat` (slug must match).
2. Implement `build_tools` in a new `app/tools_*.py` and register the slug in `app/instanciator.TOOL_BUILDERS`.
3. No new routes needed — `POST /agents/{slug}/invoke` and `/agents/{slug}/heartbeat` are dynamic.
4. CI already globs `agents/*.md`, so the new spec is parse-validated automatically. Push to trigger Railway's auto-deploy.

## Notes

- The parser keeps `## Knowledge` markdown verbatim as part of the system
  prompt **and** parses each `### Entry` block into a key/value dict so
  tools can answer deterministically without re-asking the model.
- `max_iterations` from `## Model` becomes the LangGraph
  `recursion_limit` (`max_iterations * 2`, with a small floor).
- The oncology agent's static disclaimer is appended to every response
  exactly as declared in its `## Output Schema`.
