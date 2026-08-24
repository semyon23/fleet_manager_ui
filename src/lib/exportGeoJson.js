import { pixelToWorld } from './nav2meta'

/**
 * Формирует Nav2 Route Server GeoJSON из нашей карты.
 * Совместимо с bekirbostanci/vda5050_lif_editor.
 *
 * Nodes: Point + { frame, id }
 * Edges: MultiLineString (без coordinates) + { id, startid, endid, cost, overridable }
 * id — числовой индекс, edge id идёт после всех нод.
 */
export function exportNav2GeoJson(map) {
  const h = map.height
  const meta = map.meta

  const nodeIdToIndex = {}
  const nodeFeatures = map.waypoints.map((wp, i) => {
    nodeIdToIndex[wp.id] = i
    const { x, y } = pixelToWorld(meta, wp.u, wp.v, h)
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(x.toFixed(4)), Number(y.toFixed(4))],
      },
      properties: {
        frame: map.name,
        id: i,
        name: wp.id,
      },
    }
  })

  let edgeIdCounter = nodeFeatures.length
  const edgeFeatures = map.edges
    .filter((e) => nodeIdToIndex[e.from] !== undefined && nodeIdToIndex[e.to] !== undefined)
    .map((e) => ({
      type: 'Feature',
      geometry: { type: 'MultiLineString' },
      properties: {
        id: edgeIdCounter++,
        startid: nodeIdToIndex[e.from],
        endid: nodeIdToIndex[e.to],
        cost: typeof e.cost === 'number' ? e.cost : 0.0,
        overridable: e.overridable !== false,
      },
    }))

  return {
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:EPSG::3857' },
    },
    type: 'FeatureCollection',
    name: map.name,
    features: [...nodeFeatures, ...edgeFeatures],
  }
}

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
