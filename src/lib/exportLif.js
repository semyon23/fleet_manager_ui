import { pixelToWorld } from './nav2meta'

/**
 * Формирует VDA5050 Layout Interchange Format (LIF).
 *
 * Поля node/edge выровнены под VDA5050 Order-схему
 * (https://github.com/VDA5050/VDA5050/blob/main/json_schemas/order.schema):
 * `sequenceId`, `released`, `actions` на nodes/edges + `mapId`/`theta`
 * внутри nodePosition. Это позволяет бэку Семёна минимально трансформировать
 * наш layout в Order-сообщения при отправке заданий роботам.
 */
export function exportLif(map) {
  const h = map.height
  const meta = map.meta
  const mapId = map.id

  const nodes = map.waypoints.map((wp, i) => {
    const { x, y } = pixelToWorld(meta, wp.u, wp.v, h)
    return {
      nodeId: wp.id,
      sequenceId: (i + 1) * 2, // чётные для нод, нечётные для рёбер — конвенция VDA5050
      nodeName: wp.name || wp.id,
      nodeDescription: wp.description || '',
      released: true,
      nodePosition: {
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
        theta: 0,
        mapId,
      },
      actions: wp.actions || [],
      vehicleTypeNodeProperties: [],
    }
  })

  const edges = map.edges.map((e, i) => ({
    edgeId: e.id || `e-${i + 1}`,
    sequenceId: (i + 1) * 2 + 1,
    edgeName: e.id || `e-${i + 1}`,
    edgeDescription: '',
    released: true,
    startNodeId: e.from,
    endNodeId: e.to,
    maxSpeed: e.maxSpeed ?? 1.0,
    maxRotationSpeed: 1.0,
    orientation: 0,
    orientationType: 'TANGENTIAL',
    direction: 'FORWARD',
    actions: [],
    vehicleTypeEdgeProperties: [
      {
        vehicleTypeId: 'default',
        vehicleOrientation: 0,
        rotationAllowed: true,
        maxSpeed: e.maxSpeed ?? 1.0,
        maxRotationSpeed: 1.0,
        minHeight: 0,
        maxHeight: 0,
        actions: [],
        trajectory: null,
        reentryAllowed: true,
      },
    ],
  }))

  const stations = (map.stations || []).map((s) => {
    const { x, y } = pixelToWorld(meta, s.u, s.v, h)
    return {
      stationId: s.id,
      stationName: s.name || s.id,
      stationDescription: s.kind || '',
      stationType: s.kind || 'custom',
      interactionNodeIds: s.interactionNodeIds || [],
      stationPosition: {
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
        theta: 0,
        mapId,
      },
    }
  })

  return {
    metaInformation: {
      projectIdentification: 'fleet-manager',
      creator: 'DDmsngr/fleet-manager',
      exportTimestamp: new Date().toISOString(),
      lifVersion: '1.0.0',
      vda5050Version: '2.0.0',
    },
    layouts: [
      {
        layoutId: mapId,
        layoutName: map.name,
        layoutVersion: '1.0',
        layoutLevelId: '0',
        layoutLevelName: map.name,
        layoutDescription: `Exported from Fleet Manager. PGM ${map.width}x${map.height} @ ${meta.resolution} m/px, origin ${meta.origin.join(',')}.`,
        mapId,
        nodes,
        edges,
        stations,
      },
    ],
  }
}
