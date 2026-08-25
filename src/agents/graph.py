"""Canonical LangGraph entrypoint.

Production transaction and intervention graphs live in this package. The
legacy ``build_graph`` export remains available for old template tests.
"""

from src.agents.intervention_graph import intervention_graph
from src.agents.legacy_graph import build_graph
from src.agents.transaction_graph import transaction_graph

__all__ = ["build_graph", "intervention_graph", "transaction_graph"]

