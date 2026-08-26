import { pixelToWorld } from './nav2meta'

/**
 * Мульти-layout экспорт: собирает ВСЕ переданные карты в один LIF-файл
 * с массивом layouts[]. Каждый layout получает уникальный layoutId и
 * увеличивающийся layoutLevelId (0, 1, 2 …) — эмулирует этажность.
 *
 * Каждая карта должна иметь meta+waypoints+edges+stations как в основном exportLif.
 */
export function exportLifMulti(maps) {
  const layouts = maps.map((map, floorIdx) => {
    const H = map.height
    const meta = map.meta
    const mapId = map.id

    const nodes = map.waypoints.map((wp, i) => {
      const { x, y } = pixelToWorld(meta, wp.u, wp.v, H)
      return {
        nodeId: wp.id,
        sequenceId: (i + 1) * 2,
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
      vehicleTypeEdgeProperties: [{
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
      }],
    }))

    const stations = (map.stations || []).map((s) => {
      const { x, y } = pixelToWorld(meta, s.u, s.v, H)
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
      layoutLevelId: String(floorIdx),
      layoutLevelName: map.name,
      layoutDescription: `PGM ${map.width}x${map.height} @ ${meta.resolution} m/px`,
      mapId,
      nodes,
      edges,
      stations,
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
    layouts,
  }
}
