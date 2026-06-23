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

python manage.py makemigrations accounts chat uploads --noinput
python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec "$@"
