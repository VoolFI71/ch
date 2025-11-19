# Chess Platform API Guide

This document explains how to call the public HTTP and WebSocket APIs that back the chess platform so you can build a native/mobile client. All routes are exposed through the Nginx gateway that already serves the web app.

## Base URLs

| Environment | Gateway base | Notes |
|-------------|--------------|-------|
| Local Docker | `http://localhost` | All `/api/*` routes and `/ws/*` sockets pass through the gateway container. |
| Production / Staging | `https://<your-domain>` | Same path structure; replace `<your-domain>` with the deployed host. |

> **Tip:** Every request/response in this guide is JSON unless stated otherwise. Use `Content-Type: application/json` for POST/PATCH bodies.

## Authentication Model

1. **Register** (`POST /api/auth/register`) with email, username, password (min 8 chars).
2. **Login** (`POST /api/auth/login`) with either username *or* email plus password.  
   Response: `{ access_token, refresh_token, token_type }`.
3. Include the access token in every protected request header: `Authorization: Bearer <access_token>`.
4. When the access token expires, call `POST /api/auth/refresh` with the `refresh_token` to mint a fresh pair. Tokens rotate; discard used refresh tokens.

The access token payload contains the user id (`sub`) and is validated by every service via shared `common.security`.

## Error Format

Unless noted otherwise, errors follow FastAPI’s default envelope:

```json
{
  "detail": "Human readable explanation"
}
```

- `401` → missing/invalid auth
- `403` → user authenticated but not allowed (e.g., accessing lessons without enrollment)
- `404` → resource not found
- `422` → validation error (details in response)

## Services & Endpoints

### Auth Service (`/api/auth`)

| Method & Path | Body | Description | Response |
|---------------|------|-------------|----------|
| `POST /api/auth/register` | `{ "email": "user@ex.com", "username": "nickname", "password": "********" }` | Creates an account. | `UserOut` |
| `POST /api/auth/login` | `{ "login": "<username-or-email>", "password": "********" }` | Issues JWT pair. | `Token` |
| `POST /api/auth/refresh` | `{ "refresh_token": "<token>" }` | Rotates tokens. | `Token` |
| `GET /api/auth/me` | — (Bearer token) | Current user profile. | `UserOut` |
| `GET /api/auth/users/{id}` | — | Fetch any user by id (public). | `UserOut` |

`UserOut` fields: `id, email, username, is_active, created_at, updated_at`.

### Users Service (`/api/users`)

| Method | Description |
|--------|-------------|
| `GET /api/users/{id}` | Lightweight public profile (`UserPublic`: `id, username, display_name, title, rating, country, avatar_url, created_at, updated_at`). |

### Courses Service (`/api/courses`)

Most endpoints require Bearer auth if they depend on the current user.

| Method & Path | Description |
|---------------|-------------|
| `GET /api/courses/` | List all active courses (`CourseOut`: `id, slug, title, description, price_cents, is_active, created_at`). |
| `GET /api/courses/me` | Courses the current user is enrolled in. |
| `POST /api/courses/` | Admin/seed helper: create course (expects `CourseCreate`). |
| `POST /api/courses/{course_id}/enroll` | Enrolls current user; internally calls the enrollments service. |

### Lessons Service (`/api/courses/{course_id}/lessons`)

| Method & Path | Description |
|---------------|-------------|
| `GET /api/courses/{course_id}/lessons/` | Lists lessons in order. Requires enrollment when the course is paid. Returns `LessonOut` (`id, course_id, title, content, pgn_content, order_index, duration_sec, created_at`). |
| `POST /api/courses/{course_id}/lessons/` | Create lesson (`LessonCreate`). |
| `PATCH /api/courses/{course_id}/lessons/{lesson_id}` | Update lesson (`LessonUpdate`). |

### PGN Files (`/api/pgn-files`)

| Method | Description |
|--------|-------------|
| `GET /api/pgn-files/` | Returns PGN snippets the user has access to. Response array of `PGNFileOut` (course title, lesson number/title, PGN text). Uses enrollments service to verify access. |

### Enrollments Service (`/api/enrollments`)

| Method & Path | Description |
|---------------|-------------|
| `GET /api/enrollments/me` | List the caller’s enrollments. |
| `POST /api/enrollments/` | Create/ensure enrollment for the caller (`{ "course_id": <int> }`). Response: `{ enrollment, created }`. |

> Internal endpoints (`/internal`) require an `X-Internal-Token` header and are meant for service-to-service calls; mobile clients should not invoke them.

### Payments (`/api/payments`)

| Method & Path | Description |
|---------------|-------------|
| `POST /api/payments/checkout/{course_id}` | Starts a checkout. Returns `{ "payment_url": "...", "order_id": n }` for paid courses or `{ "status": "ok" }` when a free course enrollment is created immediately. |
| `GET /api/payments/order/{order_id}` | Poll order status until `PAID`. |
| `POST /api/payments/webhook` | Provider webhook (server-to-server). |
| `GET /api/payments/simulate/{order_id}/success` | Testing helper that marks the order paid and enrolls the user. |

All payment routes require Bearer tokens except the webhook (provider call) and simulator (dev).

### Games REST (`/api/games`)

Protected endpoints expect Bearer tokens. `game_id` is a UUID.

| Method & Path | Description |
|---------------|-------------|
| `POST /api/games/` | Create a game. Body `CreateGameRequest` (FEN/startpos, creator_color, optional metadata, optional time_control `{ initial_ms, increment_ms, type }`). Returns `GameDetail`. |
| `GET /api/games/?status=ACTIVE&limit=25` | Filter by one or multiple statuses (`status` query can repeat). Response: list of `GameSummary`. |
| `GET /api/games/{game_id}` | Full `GameDetail` plus up to `moves_limit` last moves (default 120). |
| `GET /api/games/{game_id}/moves?limit=200` | Raw move feed (`MoveListResponse`). |
| `POST /api/games/{game_id}/join` | Occupies the open color seat; returns updated `GameDetail`. |
| `POST /api/games/{game_id}/resign` | Resign as the authenticated player. |
| `POST /api/games/{game_id}/timeout` | Declare the opponent lost on time. Body `{ "loser_color": "white" | "black" }`. |

`GameDetail` includes: ids of players, status (`CREATED`, `ACTIVE`, `FINISHED`), `next_turn`, clocks, optional PGN, move list, metadata, time control, auto-cancel timestamp, etc.

### Games WebSocket (`/ws/games/{game_id}`)

Use for real-time board updates and move submission.

- URL: `ws(s)://<BASE>/ws/games/{game_id}?token=<ACCESS_TOKEN>`  
  `token` query param is optional for spectators; required to move pieces.
- Initial server message is a `WsStatePayload` with the current `GameDetail`.
- Client-to-server messages must match `MakeMovePayload`:

```json
{
  "type": "make_move",
  "uci": "e2e4",
  "white_clock_ms": 295000,
  "black_clock_ms": 300000,
  "promotion": "q",
  "client_move_id": "uuid-from-client"
}
```

- Server responses:
  - `WsMoveMadePayload` (broadcast to everyone) — contains updated `game` snapshot and the authoritative `MoveOut`.
  - `WsErrorPayload` with `type: "move_rejected"` for validation errors (includes `client_move_id` so you can correlate with optimistic UI).
  - `WsGameFinishedPayload` once `game.status` becomes `FINISHED`.

Clocks are authoritative on the server; send your locally measured remaining time so the backend can detect flag fall.

## Making Requests from Mobile Clients

1. Store both `access_token` and `refresh_token` securely (Keychain, Keystore).
2. Attach `Authorization` header to every `/api/*` call except registration/login.
3. For WebSockets, append the access token as `token` query parameter; reconnect and refresh the token whenever you receive HTTP 4401/401.
4. Respect rate limits by debouncing rapid calls (e.g., search, lobby refresh).
5. For offline support, cache responses from `GET /api/courses`, `GET /api/courses/{id}/lessons`, and `GET /api/games/{id}` and reconcile on reconnect.

## Example Flows

### Sign-in Flow
1. `POST /api/auth/login`
2. Save tokens.
3. `GET /api/auth/me` to show profile.

### Start & Play a Game
1. `POST /api/games/` with preferred color/time control.
2. Poll/list available games with `GET /api/games/?status=CREATED`.
3. Second user joins via `POST /api/games/{id}/join`.
4. Both clients connect to `ws://.../ws/games/{id}?token=...`.
5. Submit moves over the socket; listen for `move_made` and `game_finished`.

### Course Consumption
1. `GET /api/courses/` → show catalog.
2. Purchase or enroll:
   - Free: `POST /api/courses/{id}/enroll` → success returns course data immediately.
   - Paid: `POST /api/payments/checkout/{id}` → open `payment_url`, poll `/api/payments/order/{order_id}` until `PAID`.
3. `GET /api/courses/{id}/lessons/` to fetch lesson list, then render PGN / content.
4. Optional: `GET /api/pgn-files/` to download aggregated PGN resources.

## Security & Headers Recap

- `Authorization: Bearer <access>` — all protected routes.
- `X-Internal-Token` — **do not** use from mobile apps; only server-to-server (internal enrollment helpers).
- Requests run over HTTPS in production; ensure your mobile HTTP client validates TLS certificates.

## Extending the API

If you add new capabilities (chat, push notifications, analysis), follow the same gateway pattern: expose them under `/api/<feature>` and update this document so mobile clients stay in sync.


