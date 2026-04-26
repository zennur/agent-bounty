"""FastAPI service exposing both agents over HTTP."""

from __future__ import annotations

import logging
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict

from app.config import AGENTS_DIR
from app.instanciator import Agent, build_agent
from app.spec_parser import AgentSpec, parse_spec

logger = logging.getLogger("agentbazaar")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


class AgentRegistry:
    def __init__(self, agents_dir: Path):
        self.agents_dir = agents_dir
        self.specs: dict[str, AgentSpec] = {}
        self._agents: dict[str, Agent] = {}

    def discover(self) -> None:
        if not self.agents_dir.exists():
            logger.warning("agents dir not found: %s", self.agents_dir)
            return
        for path in sorted(self.agents_dir.glob("*.md")):
            try:
                spec = parse_spec(path)
                self.specs[spec.slug] = spec
                logger.info("registered spec: %s (%s)", spec.slug, path.name)
            except Exception as exc:
                logger.exception("failed to parse %s: %s", path, exc)

    def get_agent(self, slug: str) -> Agent:
        if slug in self._agents:
            return self._agents[slug]
        spec = self.specs.get(slug)
        if spec is None:
            raise KeyError(slug)
        agent = build_agent(spec)
        self._agents[slug] = agent
        logger.info("instantiated agent: %s", slug)
        return agent


registry = AgentRegistry(AGENTS_DIR)


@asynccontextmanager
async def lifespan(_: FastAPI):
    registry.discover()
    yield


app = FastAPI(
    title="AgentBazaar",
    description="LangChain agents instanciated from agent.md specs.",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "agents": list(registry.specs)}


@app.get("/agents")
def list_agents() -> dict[str, Any]:
    return {
        slug: {
            "title": spec.title,
            "provider": spec.provider,
            "model": spec.model,
            "deployment": spec.deployment,
            "tools": spec.tools,
            "input_schema": spec.input_schema,
            "output_schema": spec.output_schema,
            "heartbeat": spec.heartbeat.get("endpoint"),
        }
        for slug, spec in registry.specs.items()
    }


class InvokeRequest(BaseModel):
    """Invoke payload: use the agent's primary input field name (see ``GET /agents``)
    or a generic ``query``. Extra keys are allowed for forward-compatible agents."""

    model_config = ConfigDict(extra="allow")

    bacteria_query: str | None = None
    drug_query: str | None = None
    query: str | None = None

    def resolve(self, spec: AgentSpec) -> str:
        primary = spec.primary_input_field
        data = self.model_dump(mode="python", exclude_none=True)
        if primary in data and data[primary]:
            return str(data[primary])
        if self.query:
            return self.query
        if self.bacteria_query:
            return self.bacteria_query
        if self.drug_query:
            return self.drug_query
        raise HTTPException(
            status_code=422,
            detail=f"missing input field; expected '{primary}' or 'query'",
        )


WHO_LEVELS = ["critical", "high", "medium", "low"]


def _who_classifications(spec: AgentSpec, text: str) -> list[str]:
    found: list[str] = []
    lower = text.lower()
    for entry in spec.knowledge_entries.values():
        prio = entry.get("who_priority")
        if prio and prio.lower() in lower and prio.lower() not in [f.lower() for f in found]:
            found.append(prio)
    if not found:
        for level in WHO_LEVELS:
            if level in lower and level not in [f.lower() for f in found]:
                found.append(level)
    return found


def _drugs_referenced(spec: AgentSpec, text: str) -> list[str]:
    refs: list[str] = []
    lower = text.lower()
    for name in spec.knowledge_entries:
        code = name.split(" ", 1)[0]
        if code.lower() in lower or name.lower() in lower:
            if name not in refs:
                refs.append(name)
    return refs


def _trial_phases_referenced(spec: AgentSpec, text: str, drugs: list[str]) -> list[str]:
    phases: list[str] = []
    for d in drugs:
        attrs = spec.knowledge_entries.get(d, {})
        phase = attrs.get("trial_phase")
        if phase and phase not in phases:
            phases.append(phase)
    if not phases:
        for m in re.findall(r"phase\s+(?:i{1,3}|iv|[1-4])(?:/(?:i{1,3}|iv|[1-4]))?", text, re.IGNORECASE):
            normalized = m.title()
            if normalized not in phases:
                phases.append(normalized)
    return phases


def _build_response(spec: AgentSpec, query: str, run_result) -> dict[str, Any]:
    answer = run_result.answer or ""
    response: dict[str, Any] = {"answer": answer}
    if "who_classifications_referenced" in spec.output_schema:
        response["who_classifications_referenced"] = _who_classifications(
            spec, answer + "\n" + query
        )
    if "drugs_referenced" in spec.output_schema:
        drugs = _drugs_referenced(spec, answer + "\n" + query)
        response["drugs_referenced"] = drugs
        if "trial_phases_referenced" in spec.output_schema:
            response["trial_phases_referenced"] = _trial_phases_referenced(
                spec, answer, drugs
            )
    if "tool_calls_made" in spec.output_schema:
        response["tool_calls_made"] = run_result.tool_calls_made
    if "era_note" in spec.output_schema:
        era = spec.output_schema.get("era_note", {})
        if isinstance(era, dict) and era.get("value"):
            response["era_note"] = str(era["value"])
        else:
            response["era_note"] = "Historical UK coinage only (pre-1971). Not financial advice."
    disclaimer = spec.output_disclaimer
    if disclaimer:
        response["disclaimer"] = disclaimer
    return response


def _invoke_agent(slug: str, body: InvokeRequest) -> dict[str, Any]:
    try:
        agent = registry.get_agent(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown agent '{slug}'")
    except Exception as exc:
        logger.exception("failed to instantiate agent %s", slug)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    query = body.resolve(agent.spec)
    try:
        result = agent.invoke(query)
    except Exception as exc:
        logger.exception("agent %s failed", slug)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return _build_response(agent.spec, query, result)


@app.post("/agents/{slug}/invoke")
def invoke_agent(slug: str, body: InvokeRequest) -> dict[str, Any]:
    if slug not in registry.specs:
        raise HTTPException(status_code=404, detail=f"unknown agent '{slug}'")
    return _invoke_agent(slug, body)


@app.api_route("/agents/{slug}/heartbeat", methods=["GET", "POST"])
def heartbeat_agent(slug: str) -> dict[str, Any]:
    if slug not in registry.specs:
        raise HTTPException(status_code=404, detail=f"unknown agent '{slug}'")
    return {"agent": slug, "status": "alive", "ts": int(time.time())}
