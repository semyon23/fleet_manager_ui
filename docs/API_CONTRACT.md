# API Contract — Fleet Manager ↔ Backend

Актуально на 2026-08-27. Фронт готов к переключению флагом `mocks → real`
(Settings → API → tumbler). Мок-имплементация полностью зеркалит этот
контракт, так что бэку остаётся только принять запросы такого же вида
и отдать ответы такого же вида.

## Общее

- **Base URL** — берётся из env `VITE_API_BASE_URL` (по умолчанию `/api`)
- **Формат** — JSON, `Content-Type: application/json`
- **Encoding** — UTF-8
- **Даты/время** — ISO 8601 с timezone (`2026-08-27T10:15:00Z` или `+03:00`)
- **Расстояния** — метры (double)
- **Углы** — радианы (double)

### Auth

Все запросы кроме `POST /auth/login` и `POST /auth/refresh` требуют:
```
Authorization: Bearer <jwt-token>
```

Без токена или с невалидным — `401 Unauthorized`. Фронт автоматически
пытается сделать refresh при 401 если есть refreshToken.

### Формат ошибок

Все non-2xx ответы возвращают JSON:
```json
{
  "code": "INVALID_INPUT",
  "message": "Human readable message",
  "details": { "field": "why" }
}
```

- `code` — машинно-читаемая строка (снейк- или скрим-кейс)
- `message` — оператору покажем как есть
- `details` — опционально, любая структура

Известные `code`:
- `INVALID_INPUT` (400) — валидация не прошла
- `UNAUTHORIZED` (401) — нет токена
- `FORBIDDEN` (403) — доступ запрещён
- `NOT_FOUND` (404) — записи нет
- `CONFLICT` (409) — дубль ID / конкурентное изменение
- `RATE_LIMITED` (429)
- `INTERNAL` (500)

### Пагинация

Пока не нужна — карт/роботов/миссий < 100. Если потребуется:
`?page=1&pageSize=20` в query, `X-Total-Count` в заголовке ответа.

---

## Endpoints

### 🔐 Auth

#### `POST /auth/login`
```json
Request:  { "email": "operator@fleet.local", "password": "secret" }
Response 200: {
  "token": "eyJhbGc...",
  "refreshToken": "def...",
  "expiresAt": "2026-08-27T11:15:00Z",
  "user": {
    "id": "u-1",
    "email": "operator@fleet.local",
    "name": "Aleksey",
    "role": "operator" | "admin" | "viewer"
  }
}
Errors: 400 INVALID_INPUT, 401 UNAUTHORIZED (неверные логин/пароль)
```

#### `POST /auth/refresh`
```json
Request:  { "refreshToken": "def..." }
Response 200: тот же shape что login (новые token + refreshToken)
Errors: 401 UNAUTHORIZED (refresh просрочен)
```

#### `POST /auth/logout`
```
204 No Content
```

#### `GET /auth/me`
```json
Response 200: { "id": "u-1", "email": "...", "name": "...", "role": "..." }
```

---

### 🗺 Maps

#### `GET /maps`
Возвращает список **всех** карт (без heavy PGM-blob'ов — только метаданные).

```json
Response 200: [ Map, Map, ... ]
```

#### `GET /maps/:id`
Полная карта включая waypoints/edges/stations и PGM (в `pgmDataUrl` — data:image/png;base64,...).

```json
Response 200: Map
Errors: 404 NOT_FOUND
```

#### `POST /maps`
Создание новой карты. `pgmDataUrl` — base64-строка PGM или PNG.

```json
Request: {
  "name": "Warehouse F1",
  "width": 500, "height": 400,
  "meta": {
    "resolution": 0.05,
    "origin": [0, 0, 0],
    "occupiedThresh": 0.65,
    "freeThresh": 0.196,
    "negate": 0,
    "mode": "trinary"
  },
  "pgmDataUrl": "data:image/png;base64,...",
  "waypoints": [], "edges": [], "stations": [], "zones": [],
  "assignedRobots": []
}
Response 200: Map (с server-generated id, createdAt, updatedAt)
Errors: 400 INVALID_INPUT
```

#### `PATCH /maps/:id`
Частичный апдейт — можно прислать любое подмножество полей карты.
Клиент использует это при каждом Save в редакторе.

```json
Request: { "name": "New name", "meta": {...}, "waypoints": [...] }
Response 200: Map (обновлённая)
Errors: 404 NOT_FOUND, 409 CONFLICT
```

#### `DELETE /maps/:id`
```
204 No Content
```

#### `POST /maps/:id/assign-robots`
```json
Request: { "robotIds": ["amr-01", "amr-02"] }
Response 200: Map
```

**Map schema:**
```typescript
type Map = {
  id: string
  name: string
  width: number    // px
  height: number   // px
  meta: MapMeta
  pgmDataUrl: string   // data:image/png;base64,... или empty на list-запросах
  waypoints: Waypoint[]
  edges: Edge[]
  stations: Station[]
  zones: any[]         // TBD
  assignedRobots: string[]  // robot ids
  createdAt: string    // ISO
  updatedAt: string
}

type MapMeta = {
  resolution: number   // m/px
  origin: [number, number, number]  // [x, y, theta] в метрах
  occupiedThresh?: number
  freeThresh?: number
  negate?: 0 | 1
  mode?: 'trinary' | 'scale' | 'raw'
}

type Waypoint = {
  id: string
  u: number   // pixel x
  v: number   // pixel y
  name: string
  description?: string
  mapId?: string
  actions?: Action[]   // VDA5050 actions
}

type Edge = {
  id: string
  from: string  // waypoint/station id
  to: string
  cost?: number     // default 0
  maxSpeed?: number // m/s, default 1
}

type Station = {
  id: string
  u: number
  v: number
  name: string
  kind: 'charge' | 'loading' | 'parking' | 'custom'
  description?: string
  interactionNodeIds: string[]  // waypoint ids от которых робот подъезжает
}

type Action = {
  actionId: string
  actionType: string   // 'pick' | 'drop' | 'charge' | 'wait' | ... — согласуем список
  blockingType: 'NONE' | 'SOFT' | 'SINGLE' | 'HARD'
  actionDescriptor?: string
  actionParameters?: { key: string, value: string | number | boolean }[]
}
```

---

### 🤖 Robots

#### `GET /robots`
Snapshot всех роботов на момент запроса. Real-time апдейты — через WebSocket/MQTT (см. ниже).

```json
Response 200: [ Robot, Robot, ... ]
```

**Robot schema:**
```typescript
type Robot = {
  id: string
  model: string
  status: 'moving' | 'charging' | 'idle' | 'error' | 'offline'
  battery: number    // 0..100
  x: number          // world x (м)
  y: number          // world y (м)
  theta: number      // heading (rad)
  mission?: string | null   // id текущей миссии
  uptime?: string    // "3d 12h" или "0h"
}
```

#### `GET /robots/:id`
```json
Response 200: Robot
Errors: 404 NOT_FOUND
```

#### `POST /fms/robots`

Регистрация нового робота в fleet. Формат от Семёна (2026-08-29). Заметь префикс `/fms/` —
уточняем нужен ли он на всех эндпоинтах или только тут.

```json
Request: {
  "name": "amr-10",              // уникальный id, используется дальше во всех API
  "manufacturer": "Corp",        // производитель
  "amr_class": "CARRIER"         // CARRIER | FORKLIFT | TUGGER | TOWING | MOBILE_ROBOT (default: CARRIER)
}
Response 201 Created: {
  "status": "success",
  "robot_id": "amr-10"
}
Errors: 400 INVALID_INPUT, 409 CONFLICT (робот с таким name уже есть)
```

**Открытый вопрос:** REST-канон — вернуть **сам созданный объект** (полный `Robot`),
а не `{status, robot_id}`. Обёртка избыточна — 201 уже говорит success. Ждём решения Семёна.

#### `POST /robots/:id/command`
Отправить команду роботу.
```json
Request: { "action": "pause" | "resume" | "stop" | "home" | "reboot" | "shutdown" }
Response 204
Errors: 400 INVALID_INPUT, 404 NOT_FOUND, 409 CONFLICT (робот не в том состоянии)
```

#### `POST /robots/:id/teleop`
Прямое управление (для Teleop экрана). Twist-сообщение в формате ROS 2.
```json
Request: {
  "linear":  { "x": 0.5, "y": 0, "z": 0 },   // м/с
  "angular": { "x": 0, "y": 0, "z": 0.3 }    // рад/с
}
Response 204
```

Отправляется с частотой ~10 Гц пока оператор держит джойстик. Робот должен
timeout'нуть и остановиться если не получил обновление за 500мс.

---

### 📋 Missions

Миссия — набор упорядоченных nodeIds + robotId. Бэк при её "запуске" превращает
это в VDA5050 Order и шлёт роботу через MQTT.

#### `GET /missions`
```json
Response 200: [ Mission, Mission, ... ]
```

#### `POST /missions`

**Робота НЕ передаём — диспетчер бэка сам выбирает свободного.** Ответ возвращает миссию
уже с назначенным `robotId` (или `null`, если сразу не смогли назначить и она уходит в очередь).

```json
Request: {
  "name": "Pickup zone A → Charge",
  "mapId": "map-xxx",
  "nodeIds": ["n001", "n002", "n003"],
  "priority": "normal"        // low | normal | high | critical (optional, default: normal)
}
Response 200: Mission (status='pending', robotId=назначенный робот или null)
```

#### `POST /missions/:id/cancel`
```
204 No Content
```

**Mission schema:**
```typescript
type Mission = {
  id: string
  name: string
  mapId: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  robotId: string | null
  nodeIds: string[]
  createdAt: string  // ISO
  updatedAt: string
}
```

---

### 🚨 Alerts

#### `GET /alerts`
```json
Response 200: [ Alert, Alert, ... ]
```

#### `POST /alerts/:id/ack`
Пометить как acknowledged.
```json
Response 200: Alert (acknowledged=true)
```

**Alert schema:**
```typescript
type Alert = {
  id: string
  severity: 'info' | 'warning' | 'error'
  robotId: string | null   // null если системный alert
  message: string
  code?: string    // e.g. 'OBSTACLE', 'LOW_BAT', 'BROKER'
  createdAt: string
  acknowledged: boolean
}
```

---

## Real-time каналы (не HTTP)

### WebSocket или MQTT-over-WebSocket

**URL** — согласуем. Фронт может использовать:
- `mqtt.js` для MQTT-over-WS (`wss://backend/mqtt`)
- `reconnecting-websocket` для чистого WS (`wss://backend/ws`)

**Auth** — тот же JWT-token как параметр `?token=...` или заголовок при handshake.

### Topics / channels

- **`robots/state`** (subscribe) — VDA5050 State-сообщения, ~1-10 Гц на робота
- **`robots/factsheet`** (subscribe on demand) — статичные капабилити робота
- **`orders`** (publish) — фронт отправляет VDA5050 Order при запуске миссии
- **`instantActions`** (publish) — pause/resume/stop/home
- **`connection`** (subscribe) — connection state
- **`visualization`** (subscribe) — track/path preview (не критично)

Формат сообщений — VDA5050 v2.0.0 или v2.1.0 (уточни версию).

### Throttling

Фронт троттлит рендер до 10 Гц (100 мс окно). Если бэк шлёт 50 Гц —
дропаем промежуточные фреймы, показываем последний.

---

## Что фронт делает сейчас в mock-режиме

- **`GET /*`** → читает из `localStorage`
- **`POST/PATCH /*`** → пишет в `localStorage`
- **Auth** → всегда логинит с любыми creds, генерит фейк-JWT
- **Real-time** → пока не подключён (Live Map показывает статичные мок-позиции)
- **Все запросы имеют искусственную задержку 80–250мс** — чтобы UI-состояния
  loading/spinner были видны

## Как переключиться на real

1. Собери `.env.local` с `VITE_API_BASE_URL=https://backend.local/api`
2. Пересобери фронт: `npm run build`
3. Открой Settings → API → выключи Mock mode
4. Или программно: `localStorage.setItem('fm.api.useMocks', '0')` + reload

## Runtime-валидация ответов

Фронт использует Zod-схемы (`src/api/schemas.js`) чтобы валидировать каждый ответ.
Если бэк вернул структуру не по контракту — вылетит `ApiError` с `code:
SCHEMA_MISMATCH` и деталями в консоли. Это раннее обнаружение breaking changes.

---

## Открытые вопросы (нужно от тебя)

1. **VDA5050 версия** — 2.0.0 или 2.1.0?
2. **Actions vocabulary** — финальный список `actionType` строк
3. **MQTT topic pattern** — используем стандартный `uagv/v2/<manufacturer>/<serialNumber>/*` или свой?
4. **Throttling** — с какой частотой ты будешь публиковать State?
5. **Auth** — JWT достаточно или сразу с refresh-flow?
6. **CORS** — нужно ли фронту слать `credentials: 'include'` (cookies) или Bearer в заголовке?
7. **Deploy** — где физически будет бэк относительно фронта? Same-origin? Разные домены?

Отвечай прям тут в issue или комментом на PR — я обновлю доку.
