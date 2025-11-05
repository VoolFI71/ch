## Chess Courses - Backend + Frontend (FastAPI + Postgres)

### Что сделано
- FastAPI приложение с регистрацией/логином (email + пароль)
- JWT токены: access и refresh
- Роуты: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`
- Простой healthcheck: `GET /healthz`
- Автосоздание таблиц при старте
- Отдача существующего фронтенда из директории `backend/web/` через FastAPI (маршрутизация к `.html`)
- Dockerfile и docker-compose для запуска API и Postgres

### Быстрый старт (Docker Compose)
1. Установите Docker и Docker Compose
2. Запустите сервисы:
   ```bash
   docker compose up --build
   ```
3. API будет доступен на `http://localhost:8000` (Swagger: `http://localhost:8000/docs`)
4. Фронтенд HTML файлы будут отдаваться по соответствующим путям, например `http://localhost:8000/index.html`

### Переменные окружения
Можно создать файл `.env` в корне или задать переменные в docker-compose.

Обязательные:
- `DATABASE_URL` (пример: `postgresql+psycopg2://chess:chess@db:5432/chess`)
- `JWT_SECRET` — задайте длинную случайную строку

Опциональные (имеют значения по умолчанию):
- `JWT_ALGORITHM=HS256`
- `ACCESS_TOKEN_EXPIRE_MINUTES=15`
- `REFRESH_TOKEN_EXPIRE_DAYS=30`
- `WEB_DIR=backend/web`
- `METRICS_ENABLED=true` — включает `/metrics`

Объектное хранилище (MinIO/S3):
- `S3_ENDPOINT` (пример для локального MinIO: `http://minio:9000`)
- `S3_REGION` (опционально)
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_USE_SSL=false`
- `S3_BUCKET_VIDEOS` — бакет для видео
- `S3_BUCKET_ASSETS` — бакет для дополнительных файлов
- `S3_PRESIGN_EXPIRE_SECONDS=3600` — срок действия подписанных ссылок

### Использование API (примеры)

Регистрация:
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

Логин:
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```
Ответ:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer"
}
```

Получить профиль:
```http
GET /api/auth/me
Authorization: Bearer <access_token>
```

Обновить токен:
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "..."
}
```

### Локальный запуск без Docker
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r backend/requirements.txt

export DATABASE_URL=postgresql+psycopg2://chess:chess@localhost:5432/chess
export JWT_SECRET=your_long_random_secret

uvicorn app.main:app --reload --app-dir backend
```

### Мониторинг (Prometheus + Grafana)

В приложении включена метрика `/metrics` через `prometheus-fastapi-instrumentator`.
Для локального запуска Prometheus и Grafana:

1. `docker compose up -d --build`
2. Prometheus: `http://localhost:9090`
3. Grafana: `http://localhost:3000` (логин/пароль: admin/admin)

Логи (Loki + Promtail)
- Loki: `http://localhost:3100` (API)
- Promtail собирает логи Docker-контейнеров (`/var/lib/docker/containers/*/*-json.log`)
- В Grafana уже добавлен источник данных Loki. Импортируйте дашборды для Loki/Logs Explorer

Сохранение дашбордов Grafana
- Данные Grafana сохраняются в volume `grafana-data` (`/var/lib/grafana`), дашборды не пропадут между рестартами.
- Для автоподгрузки дашбордов используйте папку `monitoring/grafana/provisioning/dashboards/` (провайдер настроен).

### Структура
```
backend/
  app/
    main.py
    config.py
    database.py
    security.py
    models/
      user.py
    routers/
      auth.py
    schemas/
      auth.py
web/
  *.html, *.css
  (перемещено в backend/web)
```


