"""Alembic configuration for the canonical ``src/app`` application."""

import sys
from os import getenv
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import make_url

from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

project_root = Path(__file__).resolve().parents[1]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

import src.app.models  # noqa: E402, F401 - registers every active ORM model
from src.app.config import get_settings  # noqa: E402
from src.app.db.base import Base  # noqa: E402

target_metadata = Base.metadata
settings = get_settings()


def get_url() -> str:
    """Use a direct Neon connection for migrations whenever one is available."""
    direct_url = getenv("DATABASE_URL_UNPOOLED")
    if direct_url:
        return direct_url

    # The app correctly uses the PgBouncer pooler, but Alembic needs a direct
    # connection for session/schema operations. Neon direct endpoints use the
    # same hostname without the ``-pooler`` suffix.
    parsed = make_url(settings.database_url)
    if parsed.host and "-pooler" in parsed.host:
        return parsed.set(host=parsed.host.replace("-pooler", "", 1)).render_as_string(
            hide_password=False
        )
    return settings.database_url


config.set_main_option("sqlalchemy.url", get_url())


def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_schemas=True,
        version_table_schema=settings.database_schema,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    # ``begin`` is important with pooled/remote PostgreSQL connections: it
    # commits both schema setup and Alembic's version-table update.
    with connectable.begin() as connection:
        # A missing schema in PostgreSQL's search_path is silently ignored,
        # causing unqualified CREATE TABLE calls to fall back to public.
        quoted_schema = connection.dialect.identifier_preparer.quote(
            settings.database_schema
        )
        connection.exec_driver_sql(f"CREATE SCHEMA IF NOT EXISTS {quoted_schema}")
        connection.exec_driver_sql(f"SET search_path TO {quoted_schema}, public")
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            include_schemas=True,
            version_table_schema=settings.database_schema,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
