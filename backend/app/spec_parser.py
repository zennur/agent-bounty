"""Parse agent.md specification files into structured AgentSpec objects.

The format is a small, opinionated subset of markdown:
- Top-level H1 title (ignored, but expected).
- H2 sections: Identity, Model, Knowledge, Tools, Input Schema,
  Output Schema, Queue, Heartbeat.
- Inside Model / Queue / Heartbeat, lines are `key: value`.
- Inside Tools, lines are `- tool_name` bullets.
- Knowledge keeps its original markdown body (with H3 entries).
- Input/Output schema blocks are parsed YAML-ish: top-level keys with
  indented `type:` / `description:` / `value:` children.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class AgentSpec:
    title: str
    identity: str
    provider: str
    model: str
    deployment: str | None
    temperature: float
    max_iterations: int
    knowledge: str
    knowledge_entries: dict[str, dict[str, str]]
    tools: list[str]
    input_schema: dict[str, dict[str, Any]]
    output_schema: dict[str, dict[str, Any]]
    queue: dict[str, str]
    heartbeat: dict[str, str]
    raw: str = field(repr=False)

    @property
    def slug(self) -> str:
        """Derive a URL-safe agent id from the heartbeat endpoint or title."""
        endpoint = self.heartbeat.get("endpoint", "")
        m = re.match(r"/agents/([^/]+)/heartbeat", endpoint)
        if m:
            return m.group(1)
        return re.sub(r"[^a-z0-9]+", "-", self.title.lower()).strip("-")

    @property
    def output_disclaimer(self) -> str | None:
        """Return the static disclaimer string from the output schema, if any."""
        d = self.output_schema.get("disclaimer")
        if isinstance(d, dict):
            val = d.get("value")
            if isinstance(val, str):
                return val
        return None

    @property
    def primary_input_field(self) -> str:
        """First field declared in input schema (e.g. 'bacteria_query')."""
        if not self.input_schema:
            return "query"
        return next(iter(self.input_schema))


_H2 = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
_H3 = re.compile(r"^###\s+(.+?)\s*$", re.MULTILINE)
_KV = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_\- ]*?)\s*:\s*(.*?)\s*$")


def _split_h2_sections(text: str) -> dict[str, str]:
    """Split markdown into a {section_name: body} map by H2 headings."""
    sections: dict[str, str] = {}
    matches = list(_H2.finditer(text))
    for i, m in enumerate(matches):
        name = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sections[name] = text[start:end].strip("\n")
    return sections


def _parse_kv_block(body: str) -> dict[str, str]:
    """Parse simple `key: value` lines into a dict."""
    result: dict[str, str] = {}
    for line in body.splitlines():
        line = line.rstrip()
        if not line or line.startswith("#") or line.lstrip().startswith("- "):
            continue
        m = _KV.match(line)
        if m:
            key, value = m.group(1).strip(), m.group(2).strip()
            result[key] = value
    return result


def _parse_tools_block(body: str) -> list[str]:
    tools: list[str] = []
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("- "):
            tools.append(line[2:].strip())
    return tools


def _parse_schema_block(body: str) -> dict[str, dict[str, Any]]:
    """Parse YAML-ish input/output schema blocks.

    Example:
        bacteria_query:
          type: string
          description: natural language question
    """
    schema: dict[str, dict[str, Any]] = {}
    current: str | None = None
    for raw in body.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if not raw.startswith(" ") and raw.rstrip().endswith(":"):
            current = raw.strip().rstrip(":")
            schema[current] = {}
            continue
        if current is None:
            continue
        line = raw.strip()
        m = _KV.match(line)
        if not m:
            continue
        k, v = m.group(1).strip(), m.group(2).strip()
        if (v.startswith('"') and v.endswith('"')) or (
            v.startswith("'") and v.endswith("'")
        ):
            v = v[1:-1]
        schema[current][k] = v
    return schema


def _parse_knowledge(body: str) -> tuple[str, dict[str, dict[str, str]]]:
    """Return (raw_markdown_body, parsed_entries_by_h3_title).

    Each H3 entry is parsed into its `- key: value` bullets.
    """
    entries: dict[str, dict[str, str]] = {}
    h3_matches = list(_H3.finditer(body))
    for i, m in enumerate(h3_matches):
        name = m.group(1).strip()
        start = m.end()
        end = h3_matches[i + 1].start() if i + 1 < len(h3_matches) else len(body)
        chunk = body[start:end]
        attrs: dict[str, str] = {}
        current_key: str | None = None
        for line in chunk.splitlines():
            stripped = line.strip()
            if stripped.startswith("- "):
                kv = stripped[2:]
                if ":" in kv:
                    k, v = kv.split(":", 1)
                    current_key = k.strip()
                    attrs[current_key] = v.strip()
                else:
                    current_key = None
            elif current_key and line.startswith("  "):
                attrs[current_key] = (attrs[current_key] + " " + stripped).strip()
        entries[name] = attrs
    return body.strip(), entries


def parse_spec(path: str | Path) -> AgentSpec:
    """Parse an agent markdown file into an AgentSpec."""
    path = Path(path)
    text = path.read_text(encoding="utf-8")

    title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else path.stem

    sections = _split_h2_sections(text)

    identity = sections.get("Identity", "").strip()

    model_kv = _parse_kv_block(sections.get("Model", ""))
    provider = model_kv.get("provider", "azure_openai")
    model = model_kv.get("model", "gpt-4o")
    deployment = model_kv.get("deployment") or None
    try:
        temperature = float(model_kv.get("temperature", "0.1"))
    except ValueError:
        temperature = 0.1
    try:
        max_iterations = int(model_kv.get("max_iterations", "5"))
    except ValueError:
        max_iterations = 5

    knowledge_body, knowledge_entries = _parse_knowledge(sections.get("Knowledge", ""))

    tools = _parse_tools_block(sections.get("Tools", ""))
    input_schema = _parse_schema_block(sections.get("Input Schema", ""))
    output_schema = _parse_schema_block(sections.get("Output Schema", ""))
    queue = _parse_kv_block(sections.get("Queue", ""))
    heartbeat = _parse_kv_block(sections.get("Heartbeat", ""))

    return AgentSpec(
        title=title,
        identity=identity,
        provider=provider,
        model=model,
        deployment=deployment,
        temperature=temperature,
        max_iterations=max_iterations,
        knowledge=knowledge_body,
        knowledge_entries=knowledge_entries,
        tools=tools,
        input_schema=input_schema,
        output_schema=output_schema,
        queue=queue,
        heartbeat=heartbeat,
        raw=text,
    )
