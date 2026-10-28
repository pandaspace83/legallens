# Build stage: install the locked dependencies with uv. Python 3.13 and uv 0.12 match pyproject.toml.
FROM python:3.13.9-slim-bookworm AS builder
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app

# Dependency files first: this layer is cached until pyproject.toml or uv.lock changes.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev

# Runtime stage: no uv, no compiler. Tesseract is the OCR engine (ingestion/ocr.py runs it as a program).
FROM python:3.13.9-slim-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Non-root user. /data holds the database, uploads and downloaded models, so it is a volume, not image content.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin app \
    && mkdir /data && chown app:app /data
COPY --from=builder --chown=app:app /app /app
COPY --chown=app:app docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    LEGALLENS_DATA_DIR=/data \
    LEGALLENS_HOST=0.0.0.0 \
    LEGALLENS_PORT=8000 \
    LEGALLENS_INPROCESS_WORKER=true
USER app
WORKDIR /app
VOLUME /data
EXPOSE 8000

# /api/v1/health needs no sign-in and returns no client data. The slim image has no curl, so use Python.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
    CMD python -c "import os,urllib.request as u; u.urlopen('http://127.0.0.1:%s/api/v1/health' % os.environ['LEGALLENS_PORT'], timeout=4)"

ENTRYPOINT ["docker-entrypoint.sh"]
