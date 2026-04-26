"""Centralized config (Azure OpenAI + agent paths)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AzureConfig:
    endpoint: str
    api_key: str
    api_version: str
    default_deployment: str | None

    @classmethod
    def from_env(cls) -> "AzureConfig":
        return cls(
            endpoint=os.environ.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/"),
            api_key=os.environ.get("AZURE_OPENAI_API_KEY", ""),
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
            default_deployment=os.environ.get("AZURE_OPENAI_CHAT_DEPLOYMENT") or None,
        )


REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = Path(os.environ.get("AGENTS_DIR", REPO_ROOT / "agents"))
