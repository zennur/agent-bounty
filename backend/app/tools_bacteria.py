"""LangChain tools backed by the bacteria agent's parsed knowledge.

A factory ``build_tools(entries)`` returns a list of ``StructuredTool`` objects
matching the names declared in ``superbacteria-agent.md``.
"""

from __future__ import annotations

from typing import Any

from langchain_core.tools import StructuredTool


def _normalize(name: str) -> str:
    return name.strip().lower()


def _find_entry(entries: dict[str, dict[str, str]], query: str) -> tuple[str, dict[str, str]] | None:
    q = _normalize(query)
    for name, attrs in entries.items():
        if q in _normalize(name):
            return name, attrs
    for name, attrs in entries.items():
        for token in q.replace(",", " ").split():
            if len(token) > 2 and token in _normalize(name):
                return name, attrs
    return None


def _format_entry(name: str, attrs: dict[str, str]) -> str:
    lines = [f"# {name}"]
    for k, v in attrs.items():
        lines.append(f"- {k}: {v}")
    return "\n".join(lines)


def build_tools(entries: dict[str, dict[str, str]]) -> list[StructuredTool]:
    """Return the bacteria toolset bound to the parsed knowledge entries."""

    def get_bacteria_info(name: str) -> str:
        """Look up structured info for a single bacterium by name or acronym."""
        hit = _find_entry(entries, name)
        if not hit:
            return f"No bacterium matching '{name}' in knowledge base."
        return _format_entry(*hit)

    def search_by_resistance(antibiotic: str) -> str:
        """Find bacteria resistant to a given antibiotic or class."""
        q = _normalize(antibiotic)
        hits = [
            name for name, attrs in entries.items() if q in _normalize(attrs.get("resistance", ""))
        ]
        if not hits:
            return f"No bacteria found with resistance matching '{antibiotic}'."
        return "Bacteria resistant to '" + antibiotic + "': " + ", ".join(hits)

    def compare_bacteria(names: str) -> str:
        """Compare two or more bacteria. Pass a comma-separated list."""
        wanted = [n.strip() for n in names.split(",") if n.strip()]
        if len(wanted) < 2:
            return "Provide at least two comma-separated bacteria names."
        rows: list[str] = []
        for w in wanted:
            hit = _find_entry(entries, w)
            if hit:
                rows.append(_format_entry(*hit))
            else:
                rows.append(f"# {w}\n- not_found")
        return "\n\n".join(rows)

    def list_all_bacteria(_: str = "") -> str:
        """List every bacterium currently known to the agent."""
        return "\n".join(f"- {name}" for name in entries)

    def get_treatment_options(name: str) -> str:
        """Return the last-resort treatment options for a single bacterium."""
        hit = _find_entry(entries, name)
        if not hit:
            return f"No bacterium matching '{name}' in knowledge base."
        n, attrs = hit
        return f"{n}: last_resort_treatment = {attrs.get('last_resort_treatment', 'unknown')}"

    fns: dict[str, Any] = {
        "get_bacteria_info": get_bacteria_info,
        "search_by_resistance": search_by_resistance,
        "compare_bacteria": compare_bacteria,
        "list_all_bacteria": list_all_bacteria,
        "get_treatment_options": get_treatment_options,
    }

    return [
        StructuredTool.from_function(fn, name=name, description=fn.__doc__ or name)
        for name, fn in fns.items()
    ]
