# syntax=docker/dockerfile:1.4
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt

ENV PIP_DEFAULT_TIMEOUT=100 \
	PIP_RETRIES=10

RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY common ./common

ENV PYTHONPATH=/app/backend:/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


