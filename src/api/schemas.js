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
export const Waypoint = z.object({
  id: z.string(),
  u: z.number(),
  v: z.number(),
  name: z.string(),
  description: z.string().optional().default(''),
  mapId: z.string().optional().default(''),
  actions: z.array(z.object({
    actionId: z.string(),
    actionType: z.string(),
    blockingType: z.enum(['NONE', 'SOFT', 'SINGLE', 'HARD']),
    actionDescriptor: z.string().optional(),
    actionParameters: z.array(z.object({
      key: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    })).optional().default([]),
  })).optional().default([]),
})
export const Edge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  cost: z.number().nonnegative().default(0),
  maxSpeed: z.number().positive().default(1),
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
  zones: z.array(z.any()).default([]),
  assignedRobots: z.array(z.string()).default([]),
  createdAt: IsoDateTime.optional(),
  updatedAt: IsoDateTime.optional(),
})
export const MapList = z.array(MapEntity)

// === Robots ===
export const RobotStatus = z.enum(['moving', 'charging', 'idle', 'error', 'offline'])
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
export const RobotCommand = z.object({
  action: z.enum(['pause', 'resume', 'stop', 'home', 'reboot', 'shutdown']),
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
export const CreateMissionRequest = z.object({
  name: z.string().min(1),
  mapId: z.string(),
  nodeIds: z.array(z.string()).min(2),
  robotId: z.string().optional(),
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
