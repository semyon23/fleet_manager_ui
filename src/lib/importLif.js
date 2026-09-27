import { worldToPixel } from './nav2meta'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

// Action из файла → внутренний вид (параметры как есть, любой JSON).
function readAction(a) {
  return {
    actionId: a.actionId || 'a-' + Math.random().toString(36).slice(2, 10),
    actionType: a.actionType || '',
    blockingType: a.blockingType || 'NONE',
    actionDescriptor: a.actionDescriptor || '',
    actionParameters: Array.isArray(a.actionParameters) ? a.actionParameters.map((p) => ({ key: p.key, value: p.value })) : [],
    ...(a.retriable ? { retriable: true } : {}),
  }
}

// Убирает undefined, чтобы в store не оседали пустые ключи.
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

/**
 * Разбирает VDA5050 LIF JSON и возвращает { waypoints, edges, stations }
 * в пиксельных координатах указанной карты.
 *
 * @param {object} lif — распарсенный LIF-объект (см. exportLif)
 * @param {object} map — целевая карта (нужны meta.resolution, meta.origin, height
 *                       для обратной конвертации метров → пикселей)
 * @param {number} layoutIdx — какой layout взять (по умолчанию 0)
 */
export function parseLif(lif, map, layoutIdx = 0) {
  if (!lif || typeof lif !== 'object') throw new Error('LIF must be an object')
  if (!Array.isArray(lif.layouts)) throw new Error('LIF.layouts must be array')
  const layout = lif.layouts[layoutIdx]
  if (!layout) throw new Error(`Layout #${layoutIdx} not found`)

  const meta = map.meta
  const H = map.height

  const waypoints = (layout.nodes || []).map((n) => {
    const pos = n.nodePosition || {}
    const { u, v } = worldToPixel(meta, Number(pos.x || 0), Number(pos.y || 0), H)
    const d = pos.allowedDeviationXY || pos.allowedDeviationXy
    return compact({
      id: String(n.nodeId),
      name: n.nodeName || n.nodeId,
      description: n.nodeDescription || '',
      mapId: pos.mapId || map.id || '',
      actions: Array.isArray(n.actions) ? n.actions.map(readAction) : [],
      theta: num(pos.theta),
      allowedDeviationXY: d && num(d.a) !== undefined && num(d.b) !== undefined
        ? { a: d.a, b: d.b, theta: num(d.theta) ?? 0 }
        : undefined,
      allowedDeviationTheta: num(pos.allowedDeviationTheta),
      u, v,
    })
  })

  const edges = (layout.edges || []).map((e) => {
    const c = e.corridor
    return compact({
      id: String(e.edgeId),
      from: String(e.startNodeId),
      to: String(e.endNodeId),
      cost: 0,
      maxSpeed: Number(e.maximumSpeed ?? e.maxSpeed ?? e.vehicleTypeEdgeProperties?.[0]?.maxSpeed ?? 1.0),
      maximumMobileRobotHeight: num(e.maximumMobileRobotHeight),
      minimumLoadHandlingDeviceHeight: num(e.minimumLoadHandlingDeviceHeight),
      orientation: num(e.orientation),
      orientationType: num(e.orientation) !== undefined ? (e.orientationType || 'TANGENTIAL') : undefined,
      direction: e.direction && e.direction !== 'FORWARD' ? String(e.direction) : undefined,
      reachOrientationBeforeEntering: e.reachOrientationBeforeEntering ? true : undefined,
      maximumRotationSpeed: num(e.maximumRotationSpeed),
      corridor: c && num(c.leftWidth) !== undefined && num(c.rightWidth) !== undefined
        ? compact({
            leftWidth: c.leftWidth,
            rightWidth: c.rightWidth,
            corridorReferencePoint: c.corridorReferencePoint,
            releaseRequired: c.releaseRequired ? true : undefined,
            releaseLossBehavior: c.releaseLossBehavior,
          })
        : undefined,
      actions: Array.isArray(e.actions) ? e.actions.map(readAction) : [],
    })
  })

  const stations = (layout.stations || []).map((s) => {
    const pos = s.stationPosition || {}
    const { u, v } = worldToPixel(meta, Number(pos.x || 0), Number(pos.y || 0), H)
    return {
      id: String(s.stationId),
      name: s.stationName || s.stationId,
      description: s.stationDescription || '',
      kind: s.stationType || 'custom',
      interactionNodeIds: Array.isArray(s.interactionNodeIds) ? s.interactionNodeIds.map(String) : [],
      u, v,
    }
  })

  return { waypoints, edges, stations, layoutName: layout.layoutName }
}
