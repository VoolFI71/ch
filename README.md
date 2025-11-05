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
   Для локального запуска без `nginx` и `certbot` используйте резервную конфигурацию:
   ```bash
   docker compose -f docker-compose.local.yml up --build
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

Для HTTPS (Let's Encrypt):
- `LETSENCRYPT_DOMAIN` — основной домен (можно указать несколько через запятую)
- `LETSENCRYPT_EXTRA_DOMAINS` — дополнительные домены через запятую (опционально)
- `LETSENCRYPT_EMAIL` — email администратора для уведомлений Let's Encrypt
- `LETSENCRYPT_STAGING=1` — включите на тестовом запуске, чтобы не попасть под лимиты ACME

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

### HTTPS (nginx + Let's Encrypt)

В `docker-compose.yml` добавлен сервис `nginx`, который терминирует HTTPS и проксирует запросы в `api`. Сертификаты выдаёт Let's Encrypt через ACME (webroot).

1. В `.env` задайте:
   - `LETSENCRYPT_DOMAIN=example.com` (можно перечислить несколько доменов через запятую);
   - при необходимости `LETSENCRYPT_EXTRA_DOMAINS=www.example.com,app.example.com`;
   - `LETSENCRYPT_EMAIL=admin@example.com`;
   - `LETSENCRYPT_STAGING=1` на тестовом прогоне (чтобы не упереться в квоты).
2. Убедитесь, что DNS домена смотрит на сервер, где стартует docker-compose (порты 80/443 должны быть доступны снаружи).
3. Подготовьте каталоги и временный сертификат (последовательно выполните команды; вместо `example.com` подставьте ваш основной домен):
   ```bash
   # создаём директорию для ACME-челленджей
   docker compose run --rm --entrypoint "" certbot sh -c "mkdir -p /var/www/certbot"

   # загружаем рекомендуемые TLS-параметры (выполняется один раз)
   docker compose run --rm --entrypoint "" certbot sh -c "set -eu; \
     mkdir -p /etc/letsencrypt; \
     [ -f /etc/letsencrypt/options-ssl-nginx.conf ] || wget -q https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/_internal/options-ssl-nginx.conf -O /etc/letsencrypt/options-ssl-nginx.conf; \
     [ -f /etc/letsencrypt/ssl-dhparams.pem ] || wget -q https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/_internal/ssl-dhparams.pem -O /etc/letsencrypt/ssl-dhparams.pem"

   # создаём временный (dummy) сертификат для запуска nginx
   docker compose run --rm --entrypoint "" certbot sh -c "set -eu; \
     DOMAIN=example.com; \
     mkdir -p /etc/letsencrypt/live/$DOMAIN; \
     openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
       -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
       -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
       -subj '/CN=localhost' >/dev/null 2>&1"

   # запускаем nginx с заглушечным сертификатом
   docker compose up -d nginx
   ```
4. Запрашиваем реальный сертификат (перечислите все домены, которые должны быть в сертификате):
   ```bash
   docker compose run --rm certbot certonly \
     --webroot -w /var/www/certbot \
     --staging \
     -d example.com -d www.example.com \
     --email admin@example.com \
     --agree-tos --no-eff-email

   # перезагружаем nginx, чтобы он подхватил свежий сертификат
   docker compose exec nginx nginx -t
   docker compose exec nginx nginx -s reload
   ```
   Уберите флаг `--staging`, когда будете запрашивать боевой сертификат.
5. После успешной проверки удалите временный сертификат (необязательно: Certbot перепишет файлы) и следите, чтобы `LETSENCRYPT_STAGING=0` был задан в `.env`.
6. Для продления можно добавить cron-задачу, например:
   ```bash
   0 3 * * * cd /path/to/project && docker compose run --rm certbot renew --webroot -w /var/www/certbot && docker compose exec nginx nginx -s reload
   ```

Все сертификаты и ключи живут в volume `letsencrypt`, ACME-челленджи — в `certbot-www`.

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


