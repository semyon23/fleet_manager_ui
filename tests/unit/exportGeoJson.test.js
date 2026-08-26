import { describe, it, expect } from 'vitest'
import { exportNav2GeoJson } from '../../src/lib/exportGeoJson'

function makeMap(overrides = {}) {
  return {
    id: 'map-1',
    name: 'Warehouse',
    width: 500,
    height: 400,
    meta: { resolution: 0.05, origin: [0, 0, 0] },
    waypoints: [
      { id: 'n001', u: 0, v: 0 },
      { id: 'n002', u: 200, v: 200 },
    ],
    edges: [{ id: 'e001', from: 'n001', to: 'n002', cost: 1.5 }],
    ...overrides,
  }
}

describe('exportNav2GeoJson', () => {
  it('корневая структура: FeatureCollection + CRS EPSG::3857', () => {
    const g = exportNav2GeoJson(makeMap())
    expect(g.type).toBe('FeatureCollection')
    expect(g.crs.properties.name).toBe('urn:ogc:def:crs:EPSG::3857')
    expect(g.name).toBe('Warehouse')
  })

  it('nodes → Point features с числовым id, начиная с 0', () => {
    const g = exportNav2GeoJson(makeMap())
    const points = g.features.filter((f) => f.geometry.type === 'Point')
    expect(points.length).toBe(2)
    expect(points[0].properties.id).toBe(0)
    expect(points[1].properties.id).toBe(1)
    expect(points[0].properties.name).toBe('n001')
    expect(points[0].geometry.coordinates.length).toBe(2)  // [x, y]
  })

  it('edges → MultiLineString без coordinates + startid/endid ссылками на индексы', () => {
    const g = exportNav2GeoJson(makeMap())
    const edges = g.features.filter((f) => f.geometry.type === 'MultiLineString')
    expect(edges.length).toBe(1)
    expect(edges[0].properties.startid).toBe(0)
    expect(edges[0].properties.endid).toBe(1)
    expect(edges[0].properties.cost).toBe(1.5)
    expect(edges[0].properties.overridable).toBe(true)
    // MultiLineString намеренно без coordinates — routes связываются через ID
    expect(edges[0].geometry.coordinates).toBeUndefined()
  })

  it('edge id идёт после всех нод', () => {
    const g = exportNav2GeoJson(makeMap())
    const edges = g.features.filter((f) => f.geometry.type === 'MultiLineString')
    expect(edges[0].properties.id).toBe(2)  // 2 ноды → edge id = 2
  })

  it('пропускает edges с несуществующим from/to', () => {
    const g = exportNav2GeoJson(makeMap({
      edges: [
        { id: 'e001', from: 'n001', to: 'n002' },
        { id: 'e002', from: 'n001', to: 'ghost' },
        { id: 'e003', from: 'lost', to: 'n002' },
      ],
    }))
    const edges = g.features.filter((f) => f.geometry.type === 'MultiLineString')
    expect(edges.length).toBe(1)  // только валидное edge
  })

  it('overridable=false прокидывается', () => {
    const g = exportNav2GeoJson(makeMap({
      edges: [{ id: 'e001', from: 'n001', to: 'n002', overridable: false }],
    }))
    const edges = g.features.filter((f) => f.geometry.type === 'MultiLineString')
    expect(edges[0].properties.overridable).toBe(false)
  })

  it('координаты в метрах, не в пикселях', () => {
    const g = exportNav2GeoJson(makeMap())
    // pixel (0, 0), h=400, res=0.05, origin=[0,0]
    // world: x = 0, y = (400-0)*0.05 = 20
    const [x, y] = g.features[0].geometry.coordinates
    expect(x).toBe(0)
    expect(y).toBe(20)
  })
})
