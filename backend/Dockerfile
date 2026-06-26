# syntax=docker/dockerfile:1

# ---- Builder: install dependencies into an isolated prefix ----
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Build deps for any wheels that need compiling (e.g. asyncpg, argon2 fallbacks).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy only what's needed to resolve dependencies for better layer caching.
COPY pyproject.toml README.md ./
COPY app ./app

# Install the project (runtime deps only) into a relocatable prefix.
RUN python -m pip install --upgrade pip \
    && python -m pip install --prefix=/install .

# ---- Runtime: slim, non-root image ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    WEB_CONCURRENCY=4

# Create an unprivileged user.
RUN groupadd --system app && useradd --system --gid app --create-home app

WORKDIR /app

# Bring in the installed packages and the application source.
COPY --from=builder /install /usr/local
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini

USER app

EXPOSE 8000

# Container-level healthcheck hits the liveness endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0) if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).status==200 else sys.exit(1)"

# Gunicorn manages uvicorn workers; WEB_CONCURRENCY controls worker count.
CMD ["sh", "-c", "gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${WEB_CONCURRENCY} -b 0.0.0.0:${PORT} --access-logfile - --error-logfile -"]
