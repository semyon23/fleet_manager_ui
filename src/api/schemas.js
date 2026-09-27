import { z } from 'zod'

/**
 * Zod-схемы для runtime-валидации ответов бэка. Пойманное несовпадение
 * бросит `ApiError(500, 'SCHEMA_MISMATCH', ...)` — сразу видно что бэк
 * поехал с контракта, без гадания на прод-мониторинге.
 *
 * Все схемы соответствуют `docs/API_CONTRACT.md`.
 */

// === Общее ===
export const IsoDateTime = z.string().datetime({ offset: true })

export const ApiErrorBody = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
})

// === Auth ===
export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
export const LoginResponse = z.object({
  token: z.string(),
  refreshToken: z.string(),
  expiresAt: IsoDateTime,
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.enum(['operator', 'admin', 'viewer']),
  }),
})
export const RefreshRequest = z.object({ refreshToken: z.string() })
export const RefreshResponse = LoginResponse.pick({
  token: true, refreshToken: true, expiresAt: true,
})

// === Maps ===
export const MapMeta = z.object({
  resolution: z.number().positive(),
  origin: z.tuple([z.number(), z.number(), z.number()]),
  occupiedThresh: z.number().min(0).max(1).optional(),
  freeThresh: z.number().min(0).max(1).optional(),
  negate: z.union([z.literal(0), z.literal(1)]).optional(),
  mode: z.enum(['trinary', 'scale', 'raw']).optional(),
})
// Action узла/ребра (VDA 5050 v3, 7.3). Значение параметра — любой JSON.
export const MapAction = z.object({
  actionId: z.string(),
  actionType: z.string(),
  blockingType: z.enum(['NONE', 'SOFT', 'SINGLE', 'HARD']),
  actionDescriptor: z.string().optional(),
  actionParameters: z.array(z.object({
    key: z.string(),
    value: z.any(),
  })).optional().default([]),
  retriable: z.boolean().optional(),
})
// Action в ACTION-зоне — без actionId (его генерирует робот)
export const ZoneAction = MapAction.omit({ actionId: true })

export const Waypoint = z.object({
  id: z.string(),
  u: z.number(),
  v: z.number(),
  name: z.string(),
  description: z.string().optional().default(''),
  mapId: z.string().optional().default(''),
  actions: z.array(MapAction).optional().default([]),
  // Мировые радианы; нет поля — ориентация любая
  theta: z.number().optional(),
  allowedDeviationXY: z.object({ a: z.number(), b: z.number(), theta: z.number() }).optional(),
  allowedDeviationTheta: z.number().optional(),
})
export const Corridor = z.object({
  leftWidth: z.number().nonnegative(),
  rightWidth: z.number().nonnegative(),
  corridorReferencePoint: z.enum(['KINEMATIC_CENTER', 'CONTOUR']).optional(),
  releaseRequired: z.boolean().optional(),
  releaseLossBehavior: z.enum(['STOP', 'RETURN']).optional(),
})
export const Edge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  cost: z.number().nonnegative().default(0),
  maxSpeed: z.number().positive().default(1),
  maximumMobileRobotHeight: z.number().nonnegative().optional(),
  minimumLoadHandlingDeviceHeight: z.number().nonnegative().optional(),
  orientation: z.number().optional(),
  orientationType: z.enum(['GLOBAL', 'TANGENTIAL']).optional(),
  direction: z.string().optional(),
  reachOrientationBeforeEntering: z.boolean().optional(),
  maximumRotationSpeed: z.number().nonnegative().optional(),
  corridor: Corridor.optional(),
  actions: z.array(MapAction).optional().default([]),
})
// Зона карты (VDA 5050 v3, 6.4). Вершины в пикселях карты, углы — мировые радианы.
// Поля типа (maximumSpeed, direction, ...) — см. lib/vda5050.js ZONE_TYPES.
export const Zone = z.object({
  id: z.string(),
  type: z.enum([
    'BLOCKED', 'LINE_GUIDED', 'RELEASE', 'COORDINATED_REPLANNING', 'SPEED_LIMIT',
    'ACTION', 'PRIORITY', 'PENALTY', 'DIRECTED', 'BIDIRECTED',
  ]),
  name: z.string().optional().default(''),
  vertices: z.array(z.object({ u: z.number(), v: z.number() })).min(3),
  maximumSpeed: z.number().optional(),
  entryActions: z.array(ZoneAction).optional(),
  duringActions: z.array(ZoneAction).optional(),
  exitActions: z.array(ZoneAction).optional(),
  releaseLossBehavior: z.enum(['STOP', 'CONTINUE', 'EVACUATE']).optional(),
  priorityFactor: z.number().min(0).max(1).optional(),
  penaltyFactor: z.number().min(0).max(1).optional(),
  direction: z.number().optional(),
  directedLimitation: z.enum(['SOFT', 'RESTRICTED', 'STRICT']).optional(),
  bidirectedLimitation: z.enum(['SOFT', 'RESTRICTED']).optional(),
})
export const Station = z.object({
  id: z.string(),
  u: z.number(),
  v: z.number(),
  name: z.string(),
  kind: z.enum(['charge', 'loading', 'parking', 'custom']),
  description: z.string().optional().default(''),
  interactionNodeIds: z.array(z.string()).default([]),
})
export const MapEntity = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  meta: MapMeta,
  pgmDataUrl: z.string().optional(),
  waypoints: z.array(Waypoint).default([]),
  edges: z.array(Edge).default([]),
  stations: z.array(Station).default([]),
  zones: z.array(Zone).default([]),
  assignedRobots: z.array(z.string()).default([]),
  createdAt: IsoDateTime.optional(),
  updatedAt: IsoDateTime.optional(),
})
export const MapList = z.array(MapEntity)

// === Robots ===
// Внутренние status'ы фронта. Мапятся из RobotState бэка Семёна:
//   IDLE→idle, ERROR→error, ON_TASK→moving (визуально едет),
//   CHARGING→charging, MAP_DEPLOYMENT→deploying, TELEOP→teleop.
// Плюс frontend-only 'offline' когда status.online=false.
export const RobotStatus = z.enum(['moving', 'charging', 'idle', 'error', 'offline', 'teleop', 'deploying'])
export const Robot = z.object({
  id: z.string(),
  model: z.string(),
  status: RobotStatus,
  battery: z.number().min(0).max(100),
  x: z.number(),
  y: z.number(),
  theta: z.number(),
  mission: z.string().nullable().optional(),
  uptime: z.string().optional(),
})
export const RobotList = z.array(Robot)

// ==== Wire-format от бэка Семёна (GET /fms/robots) ====
// Отличается от нашего внутреннего Robot — мапится через wireToRobot().
// Схема из его кода (2026-08-29):
export const RobotWire = z.object({
  name: z.string(),
  spec: z.object({
    labels: z.array(z.any()).optional().default([]),
    battery: z.object({ critical_level: z.number() }).partial().optional(),
    heartbeat_timeout_seconds: z.number().optional(),
    switch_teleop: z.boolean().optional(),
  }).partial().optional(),
  status: z.object({
    online: z.boolean(),
    state: z.string(),                    // строку смэпим в наш enum
    battery_level: z.number(),
    position_initialized: z.boolean().optional(),
    pose: z.object({
      x: z.number(),
      y: z.number(),
      theta: z.number(),
    }),
    identifier: z.object({
      agv_class: z.string().optional(),
      speed_max: z.number().optional(),
    }).partial().optional(),
    software_version: z.object({
      os: z.string().optional(),
      app: z.string().optional(),
    }).partial().optional(),
    hardware_version: z.object({
      manufacturer: z.string().optional(),
      serial_number: z.string().optional(),
    }).partial().optional(),
    // У Семёна бэк отдаёт эти два поля то как {} (пустой объект), то как []
    // — z.any() лояльно, чтобы Zod не валил валидацию из-за формата обёртки.
    info_messages: z.any().optional(),
    errors: z.any().optional(),
  }),
})
export const RobotWireList = z.array(RobotWire)

// Маппер wire → внутренний Robot, который жрёт UI.
// STATE_MAP переводит RobotState C++ enum Семёна (2026-08-30) в наш frontend-enum.
// Если робот offline (status.online=false) — приоритетно ставим 'offline'.
const STATE_MAP = {
  IDLE: 'idle',
  ERROR: 'error',
  ON_TASK: 'moving',
  CHARGING: 'charging',
  MAP_DEPLOYMENT: 'deploying',
  TELEOP: 'teleop',
}
export function wireToRobot(w) {
  const rawState = String(w.status.state || '').toUpperCase()
  const mapped = STATE_MAP[rawState] || 'idle'
  const status = !w.status.online ? 'offline' : mapped
  const modelParts = [
    w.status?.hardware_version?.manufacturer,
    w.status?.identifier?.agv_class,
  ].filter(Boolean)
  return {
    id: w.name,
    model: modelParts.join(' · ') || '—',
    // Нужен для MQTT-топика uagv/v2/<manufacturer>/<serial>/... (useRobotMqtt)
    manufacturer: w.status?.hardware_version?.manufacturer || '',
    status,
    battery: Math.round(w.status.battery_level ?? 0),
    x: w.status.pose?.x ?? 0,
    y: w.status.pose?.y ?? 0,
    theta: w.status.pose?.theta ?? 0,
    mission: null,
    uptime: '—',
  }
}
export const RobotCommand = z.object({
  action: z.enum(['pause', 'resume', 'stop', 'home', 'reboot', 'shutdown']),
})

// POST /fms/robots — регистрация нового робота в fleet.
// Формат Семёна (2026-08-29): { name, manufacturer, amr_class="CARRIER" (default) }
export const AmrClass = z.enum(['CARRIER', 'FORKLIFT', 'TUGGER', 'TOWING', 'MOBILE_ROBOT'])
export const RegisterRobotRequest = z.object({
  name: z.string().min(1),
  manufacturer: z.string().default(''),  // Семён: можно пустую строку
  amr_class: AmrClass.default('CARRIER'),
})
export const RegisterRobotResponse = z.object({
  status: z.literal('success'),
  robot_id: z.string(),
})

// === Missions ===
export const Mission = z.object({
  id: z.string(),
  name: z.string(),
  mapId: z.string(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  robotId: z.string().nullable(),
  nodeIds: z.array(z.string()),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export const MissionList = z.array(Mission)
// Робота НЕ передаём — бэк-диспетчер сам выберет свободного и вернёт его в Mission.robotId
export const CreateMissionRequest = z.object({
  name: z.string().min(1),
  mapId: z.string(),
  nodeIds: z.array(z.string()).min(2),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional().default('normal'),
})

// === Alerts ===
export const Alert = z.object({
  id: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  robotId: z.string().nullable(),
  message: z.string(),
  code: z.string().optional(),
  createdAt: IsoDateTime,
  acknowledged: z.boolean().default(false),
})
export const AlertList = z.array(Alert)

// === Settings ===
export const AppSettings = z.object({
  backendUrl: z.string(),
  mqttUrl: z.string().optional(),
  units: z.enum(['metric', 'imperial']).default('metric'),
  language: z.string().default('en'),
})
