import { worldToPixel } from './nav2meta'

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
    return {
      id: String(n.nodeId),
      name: n.nodeName || n.nodeId,
      description: n.nodeDescription || '',
      mapId: pos.mapId || map.id || '',
      actions: Array.isArray(n.actions) ? n.actions : [],
      u, v,
    }
  })

  const edges = (layout.edges || []).map((e) => ({
    id: String(e.edgeId),
    from: String(e.startNodeId),
    to: String(e.endNodeId),
    cost: 0,
    maxSpeed: Number(e.maxSpeed ?? e.vehicleTypeEdgeProperties?.[0]?.maxSpeed ?? 1.0),
  }))

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
