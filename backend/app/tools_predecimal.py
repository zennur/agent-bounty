"""Tools for pre-decimal British £.s.d arithmetic (12d = 1s, 20s = £1)."""

from __future__ import annotations

from langchain_core.tools import StructuredTool


def _normalize(pounds: int, shillings: int, pence: int) -> tuple[int, int, int]:
    pence_total = pence + shillings * 12 + pounds * 20 * 12
    if pence_total < 0:
        raise ValueError("negative amounts not supported")
    p = pence_total // (20 * 12)
    rem = pence_total % (20 * 12)
    s = rem // 12
    d = rem % 12
    return p, s, d


def build_tools(_entries: dict[str, dict[str, str]]) -> list[StructuredTool]:
    def pence_to_lsd(total_pence: int) -> str:
        """Convert a non-negative integer total pence into £, s., d. (normalized)."""
        if total_pence < 0:
            return "Error: total_pence must be non-negative."
        p, s, d = _normalize(0, 0, total_pence)
        return f"£{p} {s}s. {d}d (total {total_pence} old pence)"

    def lsd_to_pence(pounds: int, shillings: int, pence: int) -> str:
        """Convert pounds, shillings, and pence into total old pence (integer)."""
        try:
            p, s, d = _normalize(pounds, shillings, pence)
        except ValueError as e:
            return f"Error: {e}"
        total = p * 20 * 12 + s * 12 + d
        return f"{total} old pence (£{p} {s}s. {d}d normalized)"

    def combine_lsd_amounts(
        pounds_a: int,
        shillings_a: int,
        pence_a: int,
        pounds_b: int,
        shillings_b: int,
        pence_b: int,
    ) -> str:
        """Add two £.s.d amounts (six integers) and return the normalized sum."""
        try:
            ta = _normalize(pounds_a, shillings_a, pence_a)
            tb = _normalize(pounds_b, shillings_b, pence_b)
        except ValueError as e:
            return f"Error: {e}"
        pa = ta[0] * 20 * 12 + ta[1] * 12 + ta[2]
        pb = tb[0] * 20 * 12 + tb[1] * 12 + tb[2]
        return pence_to_lsd(pa + pb)

    def explain_predecimal_rules(topic: str) -> str:
        """Return core pre-decimal rules. Topic can be 'summary', 'symbols', or 'decimal day'."""
        t = topic.lower().strip()
        if "symbol" in t or "notation" in t:
            return (
                "£ = pounds; shillings often written with /- (e.g. 5/- = 5 shillings); "
                "pence as d (e.g. 6d = sixpence)."
            )
        if "decimal" in t or "1971" in t:
            return (
                "Decimal Day: 15 February 1971. £1 became 100 new pence. "
                "This agent only models the old system (12d = 1s, 20s = £1)."
            )
        return (
            "12 pence (12d) = 1 shilling (1s). 20 shillings = 1 pound (£1). "
            "Always normalize carries through pence and shillings before stating a final £.s.d sum."
        )

    fns = {
        "pence_to_lsd": pence_to_lsd,
        "lsd_to_pence": lsd_to_pence,
        "combine_lsd_amounts": combine_lsd_amounts,
        "explain_predecimal_rules": explain_predecimal_rules,
    }
    return [
        StructuredTool.from_function(fn, name=name, description=fn.__doc__ or name)
        for name, fn in fns.items()
    ]
