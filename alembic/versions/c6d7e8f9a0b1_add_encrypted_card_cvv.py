"""add encrypted card cvv"""

from collections.abc import Sequence
import base64
import hashlib
import secrets

import sqlalchemy as sa
from alembic import op
from cryptography.fernet import Fernet
from src.app.config import get_settings


revision: str = "c6d7e8f9a0b1"
down_revision: str | Sequence[str] | None = "b5c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.add_column(
        "user_cards",
        sa.Column("cvv_encrypted", sa.String(length=1000), nullable=True),
        schema=schema,
    )
    bind = op.get_bind()
    cards = sa.table(
        "user_cards",
        sa.column("id", sa.Uuid()),
        sa.column("cvv_encrypted", sa.String(length=1000)),
        schema=schema,
    )
    cipher_key = base64.urlsafe_b64encode(hashlib.sha256(get_settings().jwt_secret_key.encode()).digest())
    cipher = Fernet(cipher_key)
    for card_id, current_cvv in bind.execute(sa.select(cards.c.id, cards.c.cvv_encrypted)):
        if current_cvv:
            continue
        cvv = f"{secrets.randbelow(1000):03d}"
        bind.execute(
            cards.update().where(cards.c.id == card_id).values(
                cvv_encrypted=cipher.encrypt(cvv.encode()).decode(),
            )
        )
    op.alter_column("user_cards", "cvv_encrypted", nullable=False, schema=schema)


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_column("user_cards", "cvv_encrypted", schema=schema)
