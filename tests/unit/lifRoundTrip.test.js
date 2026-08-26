import { describe, it, expect } from 'vitest'
import { exportLif } from '../../src/lib/exportLif'
import { exportLifMulti } from '../../src/lib/exportLifMulti'
import { parseLif } from '../../src/lib/importLif'

// Универсальная фейковая карта в пиксельных координатах — как в store
function makeMap(overrides = {}) {
  return {
    id: 'map-1',
    name: 'Test map',
    width: 500,
    height: 400,
    meta: {
      resolution: 0.05,
      origin: [0, 0, 0],
      occupiedThresh: 0.65,
      freeThresh: 0.196,
      negate: 0,
      mode: 'trinary',
    },
    waypoints: [
      { id: 'n001', u: 100, v: 100, name: 'n001', description: '' },
      { id: 'n002', u: 200, v: 150, name: 'n002', description: '' },
      { id: 'n003', u: 300, v: 200, name: 'n003', description: '' },
    ],
    edges: [
      { id: 'e001', from: 'n001', to: 'n002', cost: 0, maxSpeed: 1.0 },
      { id: 'e002', from: 'n002', to: 'n003', cost: 0, maxSpeed: 1.5 },
    ],
    stations: [
      { id: 's001', u: 400, v: 100, name: 's001', kind: 'charge', interactionNodeIds: ['n001'] },
    ],
    ...overrides,
  }
}

describe('exportLif — VDA5050 Order-совместимая структура', () => {
  it('корневая структура: metaInformation + layouts[1]', () => {
    const lif = exportLif(makeMap())
    expect(lif.metaInformation.lifVersion).toBe('1.0.0')
    expect(lif.metaInformation.vda5050Version).toBe('2.0.0')
    expect(lif.layouts.length).toBe(1)
  })

  it('node содержит VDA5050 required поля', () => {
    const lif = exportLif(makeMap())
    const n = lif.layouts[0].nodes[0]
    expect(n.nodeId).toBe('n001')
    expect(n.sequenceId).toBe(2)  // (i+1)*2 = чётные
    expect(n.released).toBe(true)
    expect(n.actions).toEqual([])
    expect(n.nodePosition.x).toBeDefined()
    expect(n.nodePosition.y).toBeDefined()
    expect(n.nodePosition.theta).toBe(0)
    expect(n.nodePosition.mapId).toBe('map-1')
  })

  it('edge содержит orientationType/direction/actions', () => {
    const lif = exportLif(makeMap())
    const e = lif.layouts[0].edges[0]
    expect(e.sequenceId).toBe(3)  // (i+1)*2+1 = нечётные
    expect(e.released).toBe(true)
    expect(e.orientationType).toBe('TANGENTIAL')
    expect(e.direction).toBe('FORWARD')
    expect(e.actions).toEqual([])
    expect(e.startNodeId).toBe('n001')
    expect(e.endNodeId).toBe('n002')
  })

  it('sequenceIds уникальны и корректно чередуются', () => {
    const lif = exportLif(makeMap())
    const ids = [
      ...lif.layouts[0].nodes.map((n) => n.sequenceId),
      ...lif.layouts[0].edges.map((e) => e.sequenceId),
    ]
    expect(new Set(ids).size).toBe(ids.length)  // все уникальные
  })

  it('actions с ноды прокидываются в LIF', () => {
    const m = makeMap({
      waypoints: [{
        id: 'n1', u: 0, v: 0, name: 'n1', description: '',
        actions: [{ actionId: 'a1', actionType: 'pick', blockingType: 'HARD', actionParameters: [] }],
      }],
      edges: [], stations: [],
    })
    const lif = exportLif(m)
    expect(lif.layouts[0].nodes[0].actions[0].actionType).toBe('pick')
  })

  it('station содержит stationType и mapId в position', () => {
    const lif = exportLif(makeMap())
    const s = lif.layouts[0].stations[0]
    expect(s.stationType).toBe('charge')
    expect(s.stationPosition.mapId).toBe('map-1')
  })
})

describe('LIF round-trip: export → parse даёт эквивалентную карту', () => {
  it('waypoints сохраняют позицию (в пределах округления)', () => {
    const original = makeMap()
    const lif = exportLif(original)
    const parsed = parseLif(lif, original)
    expect(parsed.waypoints.length).toBe(3)
    for (let i = 0; i < 3; i++) {
      expect(parsed.waypoints[i].id).toBe(original.waypoints[i].id)
      expect(parsed.waypoints[i].u).toBeCloseTo(original.waypoints[i].u, 2)
      expect(parsed.waypoints[i].v).toBeCloseTo(original.waypoints[i].v, 2)
    }
  })

  it('edges сохраняют from/to/maxSpeed', () => {
    const original = makeMap()
    const lif = exportLif(original)
    const parsed = parseLif(lif, original)
    expect(parsed.edges.length).toBe(2)
    expect(parsed.edges[0].from).toBe('n001')
    expect(parsed.edges[0].to).toBe('n002')
    expect(parsed.edges[1].maxSpeed).toBe(1.5)
  })

  it('stations сохраняют kind (stationType) и interactionNodeIds', () => {
    const original = makeMap()
    const lif = exportLif(original)
    const parsed = parseLif(lif, original)
    expect(parsed.stations[0].kind).toBe('charge')
    expect(parsed.stations[0].interactionNodeIds).toEqual(['n001'])
  })

  it('actions на ноде выживают round-trip', () => {
    const withActions = makeMap({
      waypoints: [{
        id: 'n1', u: 100, v: 100, name: 'n1', description: '',
        actions: [
          { actionId: 'a1', actionType: 'pick', blockingType: 'HARD', actionParameters: [{ key: 'shelfId', value: 'A5' }] },
        ],
      }],
      edges: [], stations: [],
    })
    const lif = exportLif(withActions)
    const parsed = parseLif(lif, withActions)
    expect(parsed.waypoints[0].actions[0].actionType).toBe('pick')
    expect(parsed.waypoints[0].actions[0].actionParameters[0].key).toBe('shelfId')
  })
})

describe('exportLifMulti', () => {
  it('собирает несколько карт в один LIF с layouts[]', () => {
    const m1 = makeMap({ id: 'floor-1' })
    const m2 = makeMap({ id: 'floor-2', name: 'Second floor' })
    const lif = exportLifMulti([m1, m2])
    expect(lif.layouts.length).toBe(2)
    expect(lif.layouts[0].layoutId).toBe('floor-1')
    expect(lif.layouts[1].layoutId).toBe('floor-2')
    expect(lif.layouts[0].layoutLevelId).toBe('0')
    expect(lif.layouts[1].layoutLevelId).toBe('1')
  })

  it('каждый layout содержит свои nodes/edges/stations', () => {
    const lif = exportLifMulti([makeMap(), makeMap({ id: 'm2' })])
    expect(lif.layouts[0].nodes.length).toBe(3)
    expect(lif.layouts[1].nodes.length).toBe(3)
  })
})

describe('parseLif — выбор layout', () => {
  it('layoutIdx позволяет прочитать N-ый layout из multi', () => {
    const m1 = makeMap({ id: 'first' })
    const m2 = makeMap({
      id: 'second',
      waypoints: [{ id: 'other', u: 50, v: 50, name: 'other' }],
      edges: [],
      stations: [],
    })
    const lif = exportLifMulti([m1, m2])
    const parsed = parseLif(lif, m2, 1)
    expect(parsed.waypoints[0].id).toBe('other')
    expect(parsed.layoutName).toBe('Test map')  // makeMap default
  })

  it('падает при отсутствии layouts', () => {
    expect(() => parseLif({}, makeMap())).toThrow(/layouts/)
  })
})
