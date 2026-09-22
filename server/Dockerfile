# Build from the repo root (`docker build -f server/Dockerfile .`) so
# `server` resolves as a package the same way it does in local dev.
FROM python:3.8-slim

WORKDIR /app

# fastapi/motor/pydantic install from prebuilt wheels -- no compiler needed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server ./server

RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request as u; u.urlopen('http://localhost:5000/health', timeout=3)" || exit 1

# gunicorn is the process manager: it owns a master process that spawns
# WEB_CONCURRENCY uvicorn workers, restarts any that crash or hang past
# --timeout, and does a graceful rolling restart on SIGHUP. `exec` replaces
# the shell so gunicorn is PID 1 and receives Docker's SIGTERM directly.
CMD exec gunicorn server.main:app \
    -k uvicorn_worker.UvicornWorker \
    --bind 0.0.0.0:5000 \
    --workers ${WEB_CONCURRENCY:-2} \
    --timeout 30 \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile -
