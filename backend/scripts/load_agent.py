"""CLI helper: parse an agent.md file, print the spec summary, and optionally
run a one-shot query against the Azure-hosted model.

Examples
--------
    python scripts/load_agent.py agents/superbacteria-agent.md
    python scripts/load_agent.py agents/oncology-drug-agent.md \
        --query "Compare NX-7701 and MX-8832"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.spec_parser import parse_spec  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse and (optionally) run an agent.md")
    parser.add_argument("path", type=Path, help="Path to agent.md spec file")
    parser.add_argument("--query", help="Run a one-shot query through the agent", default=None)
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Just print the parsed spec; do not import LangChain.",
    )
    args = parser.parse_args()

    spec = parse_spec(args.path)
    summary = {
        "title": spec.title,
        "slug": spec.slug,
        "provider": spec.provider,
        "model": spec.model,
        "deployment": spec.deployment,
        "temperature": spec.temperature,
        "max_iterations": spec.max_iterations,
        "tools": spec.tools,
        "input_schema": spec.input_schema,
        "output_schema": spec.output_schema,
        "knowledge_entries": list(spec.knowledge_entries),
        "heartbeat": spec.heartbeat,
    }
    print(json.dumps(summary, indent=2))

    if args.summary_only or not args.query:
        return 0

    from app.instanciator import build_agent  # heavy import deferred

    agent = build_agent(spec)
    result = agent.invoke(args.query)
    print("\n--- ANSWER ---")
    print(result.answer)
    print("\n--- TOOL CALLS ---")
    print(result.tool_calls_made)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
