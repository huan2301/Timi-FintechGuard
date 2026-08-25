import uuid
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from src.app.api.admin import _decode_blacklist_cursor, _encode_blacklist_cursor
from src.app.models.blacklist import Blacklist


def test_blacklist_cursor_round_trip_is_stable() -> None:
    created_at = datetime(2026, 8, 15, 4, 30, tzinfo=UTC)
    entry_id = uuid.uuid4()
    cursor = _encode_blacklist_cursor(Blacklist(id=entry_id, created_at=created_at))

    assert _decode_blacklist_cursor(cursor) == (created_at, entry_id)


def test_blacklist_cursor_rejects_invalid_value() -> None:
    with pytest.raises(HTTPException) as error:
        _decode_blacklist_cursor("not-a-valid-cursor")

    assert error.value.status_code == 422
