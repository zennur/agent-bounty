"""MCP server exposing each registered agent.md as a tool over SSE.

This module is mounted at ``/mcp`` on the FastAPI app, so Cursor (and any
other MCP client) can connect via:

    https://<host>/mcp/sse

Tools are auto-generated from every ``agent.md`` discovered under
``AGENTS_DIR``. Each tool's name is the agent slug, its input is the agent's
primary input field (string), and its body delegates to the same
``_invoke_agent`` helper used by the HTTP API so behavior stays identical.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import mcp.types as types
from fastapi import HTTPException
from mcp.server import Server
from mcp.server.lowlevel import NotificationOptions
from mcp.server.models import InitializationOptions
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.routing import Mount, Route

from app.config import AGENTS_DIR
from app.spec_parser import AgentSpec, parse_spec

logger = logging.getLogger("agentbazaar.mcp")

_SERVER_NAME = "agentbazaar"
_SERVER_VERSION = "0.1.0"


def _discover_specs() -> dict[str, AgentSpec]:
    """Parse every ``agents/*.md`` once at import time.

    Mirrors ``AgentRegistry.discover`` but is independent so the MCP layer
    has its own view (the actual agent instantiation still goes through the
    HTTP-side ``registry`` via ``_invoke_agent``).
    """
    specs: dict[str, AgentSpec] = {}
    base = Path(AGENTS_DIR)
    if not base.exists():
        logger.warning("MCP: agents dir not found: %s", base)
        return specs
    for path in sorted(base.glob("*.md")):
        try:
            spec = parse_spec(path)
            specs[spec.slug] = spec
            logger.info("MCP: registered tool for %s", spec.slug)
        except Exception as exc:  # noqa: BLE001
            logger.exception("MCP: failed to parse %s: %s", path, exc)
    return specs


_SPECS: dict[str, AgentSpec] = _discover_specs()

server: Server = Server(_SERVER_NAME)


def _input_schema_for(spec: AgentSpec) -> dict[str, Any]:
    primary = spec.primary_input_field
    field_meta = spec.input_schema.get(primary, {}) if spec.input_schema else {}
    description = (
        field_meta.get("description") or f"Natural-language input for {spec.title}"
    )
    return {
        "type": "object",
        "properties": {
            primary: {
                "type": "string",
                "description": description,
            }
        },
        "required": [primary],
        "additionalProperties": False,
    }


def _tool_description(spec: AgentSpec) -> str:
    title = spec.title.strip()
    first_line = ""
    for line in spec.identity.splitlines():
        if line.strip():
            first_line = line.strip()
            break
    if first_line and first_line.lower() != title.lower():
        return f"{title} - {first_line}"
    return title


@server.list_tools()
async def _list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name=slug,
            description=_tool_description(spec),
            inputSchema=_input_schema_for(spec),
        )
        for slug, spec in _SPECS.items()
    ]


@server.call_tool()
async def _call_tool(
    name: str, arguments: dict[str, Any] | None
) -> list[types.TextContent]:
    if name not in _SPECS:
        raise ValueError(f"unknown agent tool '{name}'")

    from app.main import InvokeRequest, _invoke_agent

    payload = arguments or {}
    try:
        body = InvokeRequest(**payload)
        result = _invoke_agent(name, body)
    except HTTPException as exc:
        text = f"Error {exc.status_code}: {exc.detail}"
        return [types.TextContent(type="text", text=text)]
    except Exception as exc:  # noqa: BLE001
        logger.exception("MCP tool %s failed", name)
        return [types.TextContent(type="text", text=f"Error: {exc}")]

    return [
        types.TextContent(
            type="text",
            text=json.dumps(result, ensure_ascii=False, default=str),
        )
    ]


# Endpoint advertised in SSE handshake. Starlette mounts this app under
# ``/mcp``, so the framework will prefix that path automatically; we only
# specify the *internal* path here to avoid a doubled ``/mcp/mcp/...``.
_sse = SseServerTransport("/messages/")


async def _handle_sse(request: Request) -> None:
    async with _sse.connect_sse(
        request.scope, request.receive, request._send  # type: ignore[attr-defined]
    ) as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name=_SERVER_NAME,
                server_version=_SERVER_VERSION,
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


mcp_app: Starlette = Starlette(
    routes=[
        Route("/sse", endpoint=_handle_sse),
        Mount("/messages/", app=_sse.handle_post_message),
    ]
)
