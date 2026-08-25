#!/usr/bin/env sh
set -eu

# Neon recommends the direct/unpooled URL for Alembic migrations. The app
# continues using DATABASE_URL (normally the pooled URL) after this command.
if [ -n "${DATABASE_URL_UNPOOLED:-}" ]; then
  DATABASE_URL="$DATABASE_URL_UNPOOLED" alembic upgrade head
else
  alembic upgrade head
fi

exec "$@"
