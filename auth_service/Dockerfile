# syntax=docker/dockerfile:1.4
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY auth_service/requirements.txt ./requirements.txt
ENV PIP_DEFAULT_TIMEOUT=100 \
	PIP_RETRIES=10

RUN pip install --no-cache-dir -r requirements.txt

COPY auth_service/app ./app
COPY common ./common
# provide shared users_service models for imports like users_service.app.models.user
COPY users_service ./users_service

ENV PYTHONPATH=/app/app:/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


