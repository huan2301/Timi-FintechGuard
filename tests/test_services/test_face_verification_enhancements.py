import numpy as np
import pytest

from src.app.core.security import create_face_verification_token, decode_face_verification_token
from src.app.services.face_verification import aggregate_embeddings


def test_aggregate_embeddings_returns_normalized_mean() -> None:
    vectors = [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
    ]

    result = aggregate_embeddings(vectors)

    assert result.shape == (3,)
    assert pytest.approx(float(np.linalg.norm(result)), rel=1e-6) == 1.0


def test_face_verification_token_binds_transaction_nonce_and_amount() -> None:
    token = create_face_verification_token(
        user_id="user-123",
        transaction_id="tx-456",
        nonce="challenge-789",
        amount=20_000_000,
    )

    decode_face_verification_token(
        token,
        user_id="user-123",
        transaction_id="tx-456",
        nonce="challenge-789",
        amount=20_000_000,
    )

    with pytest.raises(ValueError):
        decode_face_verification_token(
            token,
            user_id="user-123",
            transaction_id="tx-456",
            nonce="wrong-nonce",
            amount=20_000_000,
        )
