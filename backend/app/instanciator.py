"""Build a runnable LangChain agent from a parsed AgentSpec.

Uses LangGraph's prebuilt ``create_react_agent`` so we get a tool-calling
ReAct loop with iteration limits, plus AzureChatOpenAI as the model.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from langgraph.prebuilt import create_react_agent

from app.config import AzureConfig
from app.spec_parser import AgentSpec
from app.tools_bacteria import build_tools as build_bacteria_tools
from app.tools_oncology import build_tools as build_oncology_tools
from app.tools_predecimal import build_tools as build_predecimal_tools


TOOL_BUILDERS = {
    "superbacteria-agent": build_bacteria_tools,
    "oncology-drug-agent": build_oncology_tools,
    "british-predecimal-agent": build_predecimal_tools,
}


@dataclass
class RunResult:
    answer: str
    tool_calls_made: list[str]
    raw_messages: list[Any]


class Agent:
    """Wraps a LangGraph agent + spec metadata, exposes ``invoke``."""

    def __init__(self, spec: AgentSpec, tools: list[StructuredTool], graph: Any):
        self.spec = spec
        self.tools = tools
        self.graph = graph

    def invoke(self, query: str) -> RunResult:
        system = _build_system_prompt(self.spec)
        messages = [SystemMessage(content=system), HumanMessage(content=query)]
        result = self.graph.invoke(
            {"messages": messages},
            config={"recursion_limit": max(self.spec.max_iterations * 2, 6)},
        )
        out_messages = result.get("messages", [])
        tool_calls_made: list[str] = []
        final_text = ""
        for msg in out_messages:
            if isinstance(msg, AIMessage):
                if msg.content:
                    final_text = (
                        msg.content if isinstance(msg.content, str) else str(msg.content)
                    )
                for call in getattr(msg, "tool_calls", None) or []:
                    name = call.get("name") if isinstance(call, dict) else getattr(call, "name", None)
                    if name:
                        tool_calls_made.append(name)
            elif isinstance(msg, ToolMessage):
                if msg.name and msg.name not in tool_calls_made:
                    tool_calls_made.append(msg.name)
        return RunResult(answer=final_text, tool_calls_made=tool_calls_made, raw_messages=out_messages)


def _build_system_prompt(spec: AgentSpec) -> str:
    parts = [spec.identity.strip()]
    if spec.knowledge.strip():
        parts.append("\n# Knowledge base (authoritative):\n" + spec.knowledge.strip())
    disclaimer = spec.output_disclaimer
    if disclaimer:
        parts.append(f"\n# Required disclaimer to include or honor:\n{disclaimer}")
    parts.append(
        "\n# Style:\n"
        "- Use the provided tools when they help retrieve facts.\n"
        "- Stay strictly within the knowledge base; if asked about anything not "
        "covered, say it is not in your knowledge base."
    )
    return "\n".join(parts)


def _build_llm(spec: AgentSpec):
    provider = (spec.provider or "azure_openai").lower()
    if provider in {"azure_openai", "azure-openai", "azure"}:
        cfg = AzureConfig.from_env()
        if not cfg.endpoint or not cfg.api_key:
            raise RuntimeError(
                "Azure OpenAI is configured but AZURE_OPENAI_ENDPOINT or "
                "AZURE_OPENAI_API_KEY is missing in the environment."
            )
        deployment = spec.deployment or cfg.default_deployment or spec.model
        return AzureChatOpenAI(
            azure_endpoint=cfg.endpoint,
            api_key=cfg.api_key,
            api_version=cfg.api_version,
            azure_deployment=deployment,
            temperature=spec.temperature,
        )
    if provider in {"openai"}:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("provider=openai requires OPENAI_API_KEY")
        return ChatOpenAI(model=spec.model, temperature=spec.temperature, api_key=api_key)
    raise ValueError(f"Unsupported provider: {spec.provider}")


def build_agent(spec: AgentSpec) -> Agent:
    """Instanciate a LangChain agent from a parsed spec."""
    builder = TOOL_BUILDERS.get(spec.slug)
    if builder is None:
        raise KeyError(
            f"No tool builder registered for agent slug '{spec.slug}'. "
            f"Known: {sorted(TOOL_BUILDERS)}"
        )
    tools = builder(spec.knowledge_entries)
    declared = set(spec.tools)
    available = [t for t in tools if t.name in declared] if declared else tools
    llm = _build_llm(spec)
    graph = create_react_agent(llm, available)
    return Agent(spec=spec, tools=available, graph=graph)
