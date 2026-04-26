"""LangChain tools backed by the oncology agent's parsed knowledge."""

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
    """Return the oncology toolset bound to the parsed knowledge entries."""

    def get_drug_info(name: str) -> str:
        """Look up structured info for a single drug by code or generic name."""
        hit = _find_entry(entries, name)
        if not hit:
            return f"No drug matching '{name}' in knowledge base."
        return _format_entry(*hit)

    def compare_drugs(names: str) -> str:
        """Compare two or more drugs. Pass a comma-separated list."""
        wanted = [n.strip() for n in names.split(",") if n.strip()]
        if len(wanted) < 2:
            return "Provide at least two comma-separated drug names."
        rows: list[str] = []
        for w in wanted:
            hit = _find_entry(entries, w)
            if hit:
                rows.append(_format_entry(*hit))
            else:
                rows.append(f"# {w}\n- not_found")
        return "\n\n".join(rows)

    def search_by_cancer_type(cancer: str) -> str:
        """Find drugs targeting a given cancer type / indication."""
        q = _normalize(cancer)
        hits = [
            name for name, attrs in entries.items() if q in _normalize(attrs.get("target_cancer", ""))
        ]
        if not hits:
            return f"No drugs found targeting '{cancer}'."
        return "Drugs targeting '" + cancer + "': " + ", ".join(hits)

    def search_by_mechanism(mechanism: str) -> str:
        """Find drugs whose drug_class or mechanism matches a substring."""
        q = _normalize(mechanism)
        hits = []
        for name, attrs in entries.items():
            blob = _normalize(attrs.get("drug_class", "") + " " + attrs.get("mechanism", ""))
            if q in blob:
                hits.append(name)
        if not hits:
            return f"No drugs with mechanism matching '{mechanism}'."
        return "Drugs matching '" + mechanism + "': " + ", ".join(hits)

    def get_trial_data(name: str) -> str:
        """Return trial phase / name / efficacy / OS benefit for a drug."""
        hit = _find_entry(entries, name)
        if not hit:
            return f"No drug matching '{name}' in knowledge base."
        n, attrs = hit
        keys = ["trial_phase", "trial_name", "efficacy", "os_benefit"]
        rows = [f"{k}: {attrs.get(k, 'unknown')}" for k in keys]
        return f"{n}\n" + "\n".join(rows)

    def list_all_drugs(_: str = "") -> str:
        """List every drug currently known to the agent."""
        return "\n".join(f"- {name}" for name in entries)

    fns: dict[str, Any] = {
        "get_drug_info": get_drug_info,
        "compare_drugs": compare_drugs,
        "search_by_cancer_type": search_by_cancer_type,
        "search_by_mechanism": search_by_mechanism,
        "get_trial_data": get_trial_data,
        "list_all_drugs": list_all_drugs,
    }

    return [
        StructuredTool.from_function(fn, name=name, description=fn.__doc__ or name)
        for name, fn in fns.items()
    ]
