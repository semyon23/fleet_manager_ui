import { pixelToWorld } from './nav2meta'

/**
 * Формирует VDA5050 Layout Interchange Format (LIF) 1.0.0 из нашей карты.
 * Совместимо со стандартом VDA/VDMA.
 */
export function exportLif(map) {
  const h = map.height
  const meta = map.meta

  const nodes = map.waypoints.map((wp) => {
    const { x, y } = pixelToWorld(meta, wp.u, wp.v, h)
    return {
      nodeId: wp.id,
      nodeName: wp.id,
      nodeDescription: '',
      mapId: map.id,
      nodePosition: {
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
      },
      vehicleTypeNodeProperties: [],
    }
  })

  const edges = map.edges.map((e, i) => ({
    edgeId: e.id || `e-${i + 1}`,
    edgeName: e.id || `e-${i + 1}`,
    edgeDescription: '',
    startNodeId: e.from,
    endNodeId: e.to,
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

  return {
    metaInformation: {
      projectIdentification: 'fleet-manager',
      creator: 'DDmsngr/fleet-manager',
      exportTimestamp: new Date().toISOString(),
      lifVersion: '1.0.0',
    },
    layouts: [
      {
        layoutId: map.id,
        layoutName: map.name,
        layoutVersion: '1.0',
        layoutLevelId: '0',
        layoutLevelName: map.name,
        layoutDescription: `Exported from Fleet Manager. PGM ${map.width}x${map.height} @ ${meta.resolution} m/px, origin ${meta.origin.join(',')}.`,
        nodes,
        edges,
        stations: [],
      },
    ],
  }
}
