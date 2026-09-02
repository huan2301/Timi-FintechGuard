"""Engine, session factory và dependency get_db()."""

import logging
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from src.app.config import get_settings
from src.app.db.base import Base

logger = logging.getLogger(__name__)
settings = get_settings()

# pool_pre_ping: tự phát hiện connection đã chết (hay gặp khi Postgres restart trong Docker).
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=settings.log_level == "DEBUG",
)


if settings.database_url.startswith("postgresql"):

    @event.listens_for(engine, "connect")
    def set_application_schema(dbapi_connection, _connection_record) -> None:
        """Set search_path after connect; Neon poolers reject startup options."""
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute(f"SET search_path TO {settings.database_schema}, public")
        finally:
            cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


if settings.database_url.startswith("postgresql"):

    @event.listens_for(Session, "after_begin")
    def set_transaction_schema(_session, _transaction, connection) -> None:
        """Apply the schema to every transaction, including post-commit refreshes."""
        # Isolated SQLite tests can create their own Session while this module was
        # imported under a PostgreSQL runtime configuration.  PostgreSQL alone
        # supports ``SET LOCAL search_path``.
        if connection.dialect.name != "postgresql":
            return
        connection.exec_driver_sql(f"SET LOCAL search_path TO {settings.database_schema}, public")


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: mở session cho mỗi request, đảm bảo đóng sau khi xong."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        # Never leave a partially mutated unit of work attached to a pooled
        # connection when an endpoint raises before its explicit commit.
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """Create tables only for isolated tests.

    Local and production databases must use ``alembic upgrade head``. Vector
    storage is provider-specific and is not created as a side effect here.
    """
    import src.app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created for an isolated test")
