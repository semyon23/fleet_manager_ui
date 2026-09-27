import { pixelToWorld } from './nav2meta'
import {
  toSpecAction, toSpecNodePosition, toSpecEdgeAttributes, nodeLookup,
} from './vdaLayout'

/**
 * Формирует VDA5050 Layout Interchange Format (LIF).
 *
 * Поля node/edge выровнены под order VDA 5050 v3.0.0 (docs/VDA5050_EN.md, 7.3):
 * `sequenceId`, `released`, `actions`, `nodePosition` (theta, allowedDeviationXY,
 * allowedDeviationTheta, mapId), атрибуты ребра (maximumSpeed, orientation,
 * corridor, ...). Так бэку проще собрать из layout order-сообщение.
 *
 * Необязательные поля пишем только если они заданы: например, theta = 0 обязала бы
 * робота встать в ориентацию 0, а "не задано" значит "любая ориентация".
 *
 * Зоны в LIF 1.0 не входят — они выгружаются отдельно как zoneSet (buildZoneSet).
 */
export function buildLifLayout(map, levelIdx = 0) {
  const h = map.height
  const meta = map.meta
  const mapId = map.id
  const byId = nodeLookup(map)

  const nodes = map.waypoints.map((wp, i) => ({
    nodeId: wp.id,
    sequenceId: (i + 1) * 2, // чётные для нод, нечётные для рёбер — конвенция VDA5050
    nodeName: wp.name || wp.id,
    nodeDescription: wp.description || '',
    released: true,
    nodePosition: toSpecNodePosition(map, wp),
    actions: (wp.actions || []).map((a) => toSpecAction(a)),
    vehicleTypeNodeProperties: [],
  }))

  const edges = map.edges.map((e, i) => {
    const attrs = toSpecEdgeAttributes(map, e, byId)
    return {
      edgeId: e.id || `e-${i + 1}`,
      sequenceId: (i + 1) * 2 + 1,
      edgeName: e.id || `e-${i + 1}`,
      edgeDescription: e.description || '',
      released: true,
      startNodeId: e.from,
      endNodeId: e.to,
      ...attrs,
      maxSpeed: e.maxSpeed ?? 1.0,  // старое имя поля — бэк его уже читает
      actions: (e.actions || []).map((a) => toSpecAction(a)),
      vehicleTypeEdgeProperties: [
        {
          vehicleTypeId: 'default',
          vehicleOrientation: attrs.orientation ?? 0,
          orientationType: attrs.orientationType || 'TANGENTIAL',
          rotationAllowed: true,
          maxSpeed: e.maxSpeed ?? 1.0,
          maxRotationSpeed: attrs.maximumRotationSpeed ?? null,
          minHeight: attrs.minimumLoadHandlingDeviceHeight ?? 0,
          maxHeight: attrs.maximumMobileRobotHeight ?? 0,
          actions: [],
          trajectory: null,
          reentryAllowed: true,
        },
      ],
    }
  })

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
    layoutId: mapId,
    layoutName: map.name,
    layoutVersion: '1.0',
    layoutLevelId: String(levelIdx),
    layoutLevelName: map.name,
    layoutDescription: `Exported from Fleet Manager. PGM ${map.width}x${map.height} @ ${meta.resolution} m/px, origin ${meta.origin.join(',')}.`,
    mapId,
    nodes,
    edges,
    stations,
  }
}

export function lifMetaInformation() {
  return {
    projectIdentification: 'fleet-manager',
    creator: 'fleet-manager',
    exportTimestamp: new Date().toISOString(),
    lifVersion: '1.0.0',
    vda5050Version: '3.0.0',
  }
}

export function exportLif(map) {
  return {
    metaInformation: lifMetaInformation(),
    layouts: [buildLifLayout(map, 0)],
  }
}
