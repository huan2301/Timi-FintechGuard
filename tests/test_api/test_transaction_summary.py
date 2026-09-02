from types import SimpleNamespace
from unittest.mock import MagicMock

from src.app.routers.api.transactions import security_summary


def test_security_summary_returns_platform_wide_aggregates() -> None:
    db = MagicMock()
    db.scalar.side_effect = [125, 480, 9_750_000_000, 17]

    result = security_summary(
        db=db,
        _current_user=SimpleNamespace(),
    )

    assert result == {
        "total_users": 125,
        "total_transactions": 480,
        "total_completed_volume": 9_750_000_000,
        "blocked_transactions": 17,
    }
    assert db.scalar.call_count == 4
