import { pixelToWorld } from './nav2meta'
import {
  signedArea, isSimplePolygon, polygonsOverlap, pointInPolygon,
} from './geometry'
import {
  zoneTypeMeta, ZONE_TYPES, ZONE_RELEASE_LOSS, DIRECTED_LIMITATIONS, BIDIRECTED_LIMITATIONS,
  BLOCKING_TYPES, ORIENTATION_TYPES, CORRIDOR_REFERENCE_POINTS, CORRIDOR_RELEASE_LOSS,
} from './vda5050'

/**
 * Перевод внутренней модели карты в структуры VDA 5050 v3.0.0
 * (nodePosition, edge-атрибуты, action, zoneSet) + проверки по спецификации.
 *
 * Внутренняя модель (пиксели карты, ось v вниз):
 *   waypoint: { id, u, v, name, description, theta?, allowedDeviationXY?{a,b,theta},
 *               allowedDeviationTheta?, actions[] }
 *   edge:     { id, from, to, cost, maxSpeed, maximumMobileRobotHeight?, minimumLoadHandlingDeviceHeight?,
 *               orientation?, orientationType?, direction?, reachOrientationBeforeEntering?,
 *               maximumRotationSpeed?, corridor?{...}, actions[] }
 *   zone:     { id, type, name, vertices: [{u, v}], ...поля типа (maximumSpeed, direction, ...) }
 * Углы (theta, orientation, direction) хранятся уже в мировых радианах.
 */

const round4 = (n) => Number(Number(n).toFixed(4))
const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

// === Actions ===

export function newActionId() {
  return 'a-' + Math.random().toString(36).slice(2, 10)
}

// withId=false — для zone action: actionId генерирует сам робот.
export function toSpecAction(a, { withId = true } = {}) {
  const out = { actionType: a.actionType }
  if (withId) out.actionId = a.actionId || newActionId()
  if (a.actionDescriptor) out.actionDescriptor = a.actionDescriptor
  out.blockingType = a.blockingType || 'NONE'
  const params = (a.actionParameters || []).filter((p) => p.key)
  if (params.length) out.actionParameters = params.map((p) => ({ key: p.key, value: p.value }))
  if (a.retriable) out.retriable = true
  return out
}

// === Nodes / Edges ===

export function toSpecNodePosition(map, wp) {
  const { x, y } = pixelToWorld(map.meta, wp.u, wp.v, map.height)
  const pos = { x: round4(x), y: round4(y) }
  if (isNum(wp.theta)) pos.theta = round4(wp.theta)
  const d = wp.allowedDeviationXY
  if (d && isNum(d.a) && isNum(d.b)) {
    pos.allowedDeviationXY = { a: round4(d.a), b: round4(d.b), theta: round4(d.theta || 0) }
  }
  if (isNum(wp.allowedDeviationTheta)) pos.allowedDeviationTheta = round4(wp.allowedDeviationTheta)
  pos.mapId = map.id
  return pos
}

// Длина ребра в метрах — по прямой между узлами (траектории NURBS пока не рисуем).
export function edgeLengthMeters(map, e, nodeById) {
  const a = nodeById.get(e.from)
  const b = nodeById.get(e.to)
  if (!a || !b) return null
  return Math.hypot(b.u - a.u, b.v - a.v) * map.meta.resolution
}

// Необязательные атрибуты ребра v3 — только заданные.
export function toSpecEdgeAttributes(map, e, nodeById) {
  const out = {}
  if (isNum(e.maxSpeed)) out.maximumSpeed = e.maxSpeed
  if (isNum(e.maximumMobileRobotHeight)) out.maximumMobileRobotHeight = e.maximumMobileRobotHeight
  if (isNum(e.minimumLoadHandlingDeviceHeight)) out.minimumLoadHandlingDeviceHeight = e.minimumLoadHandlingDeviceHeight
  if (isNum(e.orientation)) {
    out.orientation = round4(e.orientation)
    out.orientationType = e.orientationType || 'TANGENTIAL'
  }
  if (e.direction) out.direction = e.direction
  if (e.reachOrientationBeforeEntering) out.reachOrientationBeforeEntering = true
  if (isNum(e.maximumRotationSpeed)) out.maximumRotationSpeed = e.maximumRotationSpeed
  const len = edgeLengthMeters(map, e, nodeById)
  if (len != null) out.length = round4(len)
  const c = e.corridor
  if (c && isNum(c.leftWidth) && isNum(c.rightWidth)) {
    out.corridor = { leftWidth: c.leftWidth, rightWidth: c.rightWidth }
    if (c.corridorReferencePoint) out.corridor.corridorReferencePoint = c.corridorReferencePoint
    if (c.releaseRequired) out.corridor.releaseRequired = true
    if (c.releaseRequired && c.releaseLossBehavior) out.corridor.releaseLossBehavior = c.releaseLossBehavior
  }
  return out
}

export function nodeLookup(map) {
  return new Map([...(map.waypoints || []), ...(map.stations || [])].map((n) => [n.id, n]))
}

// === Zones ===

// Вершины зоны в метрах, против часовой стрелки (7.6).
export function zoneVerticesWorld(map, zone) {
  const pts = (zone.vertices || []).map((p) => {
    const { x, y } = pixelToWorld(map.meta, p.u, p.v, map.height)
    return { x: round4(x), y: round4(y) }
  })
  return signedArea(pts) < 0 ? pts.reverse() : pts
}

export function toSpecZone(map, zone) {
  const meta = zoneTypeMeta(zone.type)
  const out = {
    zoneId: zone.id,
    zoneType: zone.type,
  }
  if (zone.name) out.zoneDescriptor = zone.name
  out.vertices = zoneVerticesWorld(map, zone)
  for (const f of meta.fields) {
    const v = zone[f]
    if (v === undefined || v === null || v === '') continue
    if (f.endsWith('Actions')) out[f] = (v || []).map((a) => toSpecAction(a, { withId: false }))
    else if (f === 'direction') out[f] = round4(v)
    else out[f] = v
  }
  return out
}

// FNV-1a 32 бита — короткий стабильный хеш содержимого.
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Объект zoneSet (7.6) без заголовка сообщения — заголовок добавляет диспетчер.
 * Содержимое набора с данным zoneSetId менять нельзя, поэтому zoneSetId
 * выводится из хеша зон: изменили зоны — получили новый id.
 */
export function buildZoneSet(map) {
  const zones = (map.zones || []).map((z) => toSpecZone(map, z))
  return {
    mapId: map.id,
    zoneSetId: `${map.id}-zs-${fnv1a(JSON.stringify(zones))}`,
    zoneSetDescriptor: map.name,
    zones,
  }
}

// === Проверки по спецификации ===

function zonePolyPx(zone) {
  return (zone.vertices || []).map((p) => ({ x: p.u, y: p.v }))
}

function checkActions(list, where, errors, { withId = true } = {}) {
  for (const a of list || []) {
    if (!a.actionType) errors.push(`${where}: action without type`)
    if (a.blockingType && !BLOCKING_TYPES.includes(a.blockingType)) {
      errors.push(`${where}: unknown blocking type ${a.blockingType}`)
    }
    if (withId && !a.actionId) errors.push(`${where}: action ${a.actionType || ''} without id`)
  }
}

export function validateZones(map) {
  const errors = []
  const warnings = []
  const zones = map.zones || []
  const ids = new Set()

  for (const z of zones) {
    const where = `Zone ${z.id}`
    if (ids.has(z.id)) errors.push(`Duplicate zone ID: ${z.id}`)
    ids.add(z.id)
    if (!ZONE_TYPES.some((t) => t.value === z.type)) errors.push(`${where}: unknown type ${z.type}`)

    const poly = zonePolyPx(z)
    if (poly.length < 3) {
      errors.push(`${where}: needs at least 3 vertices`)
      continue
    }
    if (!isSimplePolygon(poly)) errors.push(`${where}: edges of the polygon intersect`)
    if (map.width && map.height && poly.some((p) => p.x < 0 || p.y < 0 || p.x > map.width || p.y > map.height)) {
      errors.push(`${where}: extends beyond the map`)
    }

    switch (z.type) {
      case 'SPEED_LIMIT':
        if (!isNum(z.maximumSpeed) || z.maximumSpeed <= 0) errors.push(`${where}: maximum speed must be > 0`)
        break
      case 'RELEASE':
        if (!ZONE_RELEASE_LOSS.includes(z.releaseLossBehavior)) errors.push(`${where}: release loss behavior is required`)
        break
      case 'PRIORITY':
        if (!isNum(z.priorityFactor) || z.priorityFactor < 0 || z.priorityFactor > 1) errors.push(`${where}: priority factor must be 0..1`)
        break
      case 'PENALTY':
        if (!isNum(z.penaltyFactor) || z.penaltyFactor < 0 || z.penaltyFactor > 1) errors.push(`${where}: penalty factor must be 0..1`)
        break
      case 'DIRECTED':
        if (!isNum(z.direction)) errors.push(`${where}: direction is required`)
        if (!DIRECTED_LIMITATIONS.includes(z.directedLimitation)) errors.push(`${where}: limitation is required`)
        break
      case 'BIDIRECTED':
        if (!isNum(z.direction)) errors.push(`${where}: direction is required`)
        if (!BIDIRECTED_LIMITATIONS.includes(z.bidirectedLimitation)) errors.push(`${where}: limitation is required`)
        break
      case 'ACTION': {
        const all = [...(z.entryActions || []), ...(z.duringActions || []), ...(z.exitActions || [])]
        if (!all.length) warnings.push(`${where}: action zone has no actions`)
        checkActions(all, where, errors, { withId: false })
        break
      }
      default:
        break
    }
  }

  // DIRECTED и BIDIRECTED не должны перекрываться (6.4.4, пункт 8)
  const directed = zones.filter((z) => (z.type === 'DIRECTED' || z.type === 'BIDIRECTED') && (z.vertices || []).length >= 3)
  for (let i = 0; i < directed.length; i++) {
    for (let j = i + 1; j < directed.length; j++) {
      if (polygonsOverlap(zonePolyPx(directed[i]), zonePolyPx(directed[j]))) {
        errors.push(`Zones ${directed[i].id} and ${directed[j].id}: direction zones must not overlap`)
      }
    }
  }

  // Узел внутри BLOCKED-зоны — робот туда не доедет
  const blocked = zones.filter((z) => z.type === 'BLOCKED' && (z.vertices || []).length >= 3)
  for (const n of [...(map.waypoints || []), ...(map.stations || [])]) {
    for (const z of blocked) {
      if (pointInPolygon({ x: n.u, y: n.v }, zonePolyPx(z))) {
        warnings.push(`Node ${n.id} lies inside blocked zone ${z.id}`)
      }
    }
  }

  return { errors, warnings }
}

export function validateVdaAttributes(map) {
  const errors = []
  const warnings = []
  const actionIds = new Map()
  const trackIds = (list, where) => {
    for (const a of list || []) {
      if (!a.actionId) continue
      if (actionIds.has(a.actionId)) errors.push(`${where}: action id ${a.actionId} is also used in ${actionIds.get(a.actionId)}`)
      else actionIds.set(a.actionId, where)
    }
  }

  for (const w of map.waypoints || []) {
    const where = `Node ${w.id}`
    const d = w.allowedDeviationXY
    if (d && ((isNum(d.a) && d.a < 0) || (isNum(d.b) && d.b < 0))) errors.push(`${where}: deviation must be >= 0`)
    if (d && isNum(d.a) && isNum(d.b) && d.b > d.a) warnings.push(`${where}: deviation minor axis is larger than major axis`)
    if (isNum(w.allowedDeviationTheta) && (w.allowedDeviationTheta < 0 || w.allowedDeviationTheta > Math.PI)) {
      errors.push(`${where}: angle deviation must be 0..180°`)
    }
    if (isNum(w.allowedDeviationTheta) && !isNum(w.theta)) warnings.push(`${where}: angle deviation is set without orientation`)
    checkActions(w.actions, where, errors)
    trackIds(w.actions, where)
  }

  for (const e of map.edges || []) {
    const where = `Edge ${e.id}`
    for (const f of ['maximumMobileRobotHeight', 'minimumLoadHandlingDeviceHeight', 'maximumRotationSpeed']) {
      if (isNum(e[f]) && e[f] < 0) errors.push(`${where}: ${f} < 0`)
    }
    if (e.orientationType && !ORIENTATION_TYPES.includes(e.orientationType)) errors.push(`${where}: unknown orientation type`)
    const c = e.corridor
    if (c) {
      if (!isNum(c.leftWidth) || !isNum(c.rightWidth) || c.leftWidth < 0 || c.rightWidth < 0) {
        errors.push(`${where}: corridor widths must be >= 0`)
      } else if (c.leftWidth === 0 && c.rightWidth === 0) {
        warnings.push(`${where}: corridor of zero width — remove it instead`)
      }
      if (c.corridorReferencePoint && !CORRIDOR_REFERENCE_POINTS.includes(c.corridorReferencePoint)) errors.push(`${where}: unknown corridor reference point`)
      if (c.releaseLossBehavior && !CORRIDOR_RELEASE_LOSS.includes(c.releaseLossBehavior)) errors.push(`${where}: unknown corridor release loss behavior`)
    }
    checkActions(e.actions, where, errors)
    trackIds(e.actions, where)
  }

  return { errors, warnings }
}
