# Single image: build the React SPA, then serve it (plus API + WebSocket) from
# Django/daphne on one port. Build context is the repo root.

# --- stage 1: build the React SPA ---
FROM node:20-alpine AS spa
WORKDIR /spa
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build         # -> /spa/dist

# --- stage 2: Django app ---
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# No apt-get needed: psycopg[binary] bundles libpq, Pillow ships wheels,
# Postgres readiness is checked from Python in entrypoint.sh.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Built SPA served by WhiteNoise at the site root (see settings.SPA_DIR).
COPY --from=spa /spa/dist /app/spa

RUN chmod +x entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "--proxy-headers", "config.asgi:application"]
