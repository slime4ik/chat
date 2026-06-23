#!/bin/sh
set -e

echo "Waiting for postgres at ${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}..."
python - <<'PY'
import os, socket, time
host = os.environ.get("POSTGRES_HOST", "db")
port = int(os.environ.get("POSTGRES_PORT", "5432"))
while True:
    try:
        with socket.create_connection((host, port), timeout=2):
            break
    except OSError:
        time.sleep(0.5)
PY
echo "Postgres is up."

# Migrations are committed to the repo (apps/*/migrations). We ONLY apply them
# here — never `makemigrations` at runtime, otherwise schema changes to existing
# tables silently never get applied. `--fake-initial` lets an already-populated
# database (tables present, 0001 not yet recorded) adopt the initial migration.
python manage.py migrate --fake-initial --noinput
python manage.py collectstatic --noinput

exec "$@"
