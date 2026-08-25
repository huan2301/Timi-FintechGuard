from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.app.api.transactions import _decode_history_cursor, _encode_history_cursor


def test_history_cursor_is_opaque_and_round_trips(monkeypatch):
    transaction_id = uuid4()
    transaction = SimpleNamespace(
        id=transaction_id,
        created_at=datetime(2026, 8, 17, 7, 30, tzinfo=UTC),
    )

    cursor = _encode_history_cursor(transaction)

    assert str(transaction_id) not in cursor
    created_at, decoded_id = _decode_history_cursor(cursor)
    assert decoded_id == transaction_id
    assert created_at == transaction.created_at


def test_history_cursor_rejects_tampering():
    transaction = SimpleNamespace(
        id=uuid4(),
        created_at=datetime(2026, 8, 17, 7, 30, tzinfo=UTC),
    )
    cursor = _encode_history_cursor(transaction)
    tampered = cursor[:-1] + ("A" if cursor[-1] != "A" else "B")

    with pytest.raises(HTTPException) as error:
        _decode_history_cursor(tampered)
    assert error.value.status_code == 422
