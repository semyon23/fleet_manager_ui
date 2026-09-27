import { describe, it, expect } from 'vitest'
import {
  signedArea, pointInPolygon, isSimplePolygon, polygonsOverlap, corridorPolygonPx, rectFromCorners,
} from '../../src/lib/geometry'
import { buildZoneSet, validateZones, validateVdaAttributes, toSpecNodePosition, toSpecEdgeAttributes, nodeLookup } from '../../src/lib/vdaLayout'
import { exportLif } from '../../src/lib/exportLif'
import { parseLif } from '../../src/lib/importLif'
import { parseParamValue, formatParamValue } from '../../src/lib/vda5050'

const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]

function makeMap(overrides = {}) {
  return {
    id: 'map-1',
    name: 'Test',
    width: 200,
    height: 100,
    meta: { resolution: 0.1, origin: [0, 0, 0] },
    waypoints: [],
    edges: [],
    stations: [],
    zones: [],
    ...overrides,
  }
}

// Прямоугольник в пикселях
const rectPx = (u1, v1, u2, v2) => rectFromCorners({ x: u1, y: v1 }, { x: u2, y: v2 }).map((p) => ({ u: p.x, v: p.y }))

describe('geometry', () => {
  it('signedArea: знак зависит от обхода', () => {
    expect(signedArea(sq)).toBe(100)
    expect(signedArea([...sq].reverse())).toBe(-100)
  })

  it('pointInPolygon', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false)
  })

  it('isSimplePolygon ловит "бабочку" и вырожденные', () => {
    expect(isSimplePolygon(sq)).toBe(true)
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(false)
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false)
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toBe(false)
  })

  it('polygonsOverlap: пересечение и вложенность', () => {
    const b = sq.map((p) => ({ x: p.x + 5, y: p.y + 5 }))
    const inner = [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }]
    const far = sq.map((p) => ({ x: p.x + 50, y: p.y }))
    expect(polygonsOverlap(sq, b)).toBe(true)
    expect(polygonsOverlap(sq, inner)).toBe(true)
    expect(polygonsOverlap(sq, far)).toBe(false)
  })

  it('corridorPolygonPx: "лево" по ходу движения в мире', () => {
    // Едем на восток: в мире лево — север, в пикселях это меньший v
    const poly = corridorPolygonPx({ x: 0, y: 50 }, { x: 10, y: 50 }, 2, 3)
    expect(poly[0]).toEqual({ x: 0, y: 48 })
    expect(poly[2]).toEqual({ x: 10, y: 53 })
  })
})

describe('buildZoneSet', () => {
  it('вершины в метрах и против часовой стрелки', () => {
    // В пикселях обход по часовой на экране — в метрах (ось Y вверх) он станет против часовой не всегда,
    // поэтому проверяем результат, а не вход.
    const map = makeMap({ zones: [{ id: 'z1', type: 'BLOCKED', name: 'Pit', vertices: rectPx(10, 10, 50, 40) }] })
    const zs = buildZoneSet(map)
    expect(zs.mapId).toBe('map-1')
    expect(zs.zones[0].zoneType).toBe('BLOCKED')
    expect(zs.zones[0].zoneDescriptor).toBe('Pit')
    expect(signedArea(zs.zones[0].vertices)).toBeGreaterThan(0)
    // u=10 → x=1 м; v=10 при height=100 → y=(100-10)*0.1=9 м
    expect(zs.zones[0].vertices).toContainEqual({ x: 1, y: 9 })
  })

  it('поля пишутся только те, что нужны типу', () => {
    const map = makeMap({
      zones: [
        { id: 'z1', type: 'SPEED_LIMIT', vertices: rectPx(0, 0, 10, 10), maximumSpeed: 0.3, penaltyFactor: 0.9 },
        {
          id: 'z2', type: 'ACTION', vertices: rectPx(20, 20, 30, 30),
          entryActions: [{ actionId: 'x', actionType: 'detectObject', blockingType: 'SOFT', actionParameters: [{ key: 'objectType', value: 'pallet' }] }],
          duringActions: [], exitActions: [],
        },
      ],
    })
    const [speed, action] = buildZoneSet(map).zones
    expect(speed.maximumSpeed).toBe(0.3)
    expect(speed).not.toHaveProperty('penaltyFactor')
    // у zone action нет actionId — его генерирует робот
    expect(action.entryActions[0]).toEqual({
      actionType: 'detectObject', blockingType: 'SOFT', actionParameters: [{ key: 'objectType', value: 'pallet' }],
    })
    expect(action.duringActions).toEqual([])
  })

  it('zoneSetId меняется вместе с содержимым', () => {
    const map = makeMap({ zones: [{ id: 'z1', type: 'BLOCKED', vertices: rectPx(0, 0, 10, 10) }] })
    const a = buildZoneSet(map).zoneSetId
    const same = buildZoneSet(map).zoneSetId
    const moved = buildZoneSet({ ...map, zones: [{ ...map.zones[0], vertices: rectPx(0, 0, 11, 10) }] }).zoneSetId
    expect(a).toBe(same)
    expect(a).not.toBe(moved)
    expect(a.startsWith('map-1-zs-')).toBe(true)
  })
})

describe('validateZones', () => {
  it('меньше 3 вершин и самопересечение — ошибки', () => {
    const map = makeMap({
      zones: [
        { id: 'z1', type: 'BLOCKED', vertices: [{ u: 0, v: 0 }, { u: 5, v: 5 }] },
        { id: 'z2', type: 'BLOCKED', vertices: [{ u: 0, v: 0 }, { u: 10, v: 10 }, { u: 10, v: 0 }, { u: 0, v: 10 }] },
      ],
    })
    const { errors } = validateZones(map)
    expect(errors.some((e) => e.includes('z1') && e.includes('3 vertices'))).toBe(true)
    expect(errors.some((e) => e.includes('z2') && e.includes('intersect'))).toBe(true)
  })

  it('обязательные параметры по типу', () => {
    const v = (z) => validateZones(makeMap({ zones: [{ id: 'z', vertices: rectPx(0, 0, 10, 10), ...z }] })).errors
    expect(v({ type: 'SPEED_LIMIT' }).length).toBe(1)
    expect(v({ type: 'SPEED_LIMIT', maximumSpeed: 0.5 })).toEqual([])
    expect(v({ type: 'PRIORITY', priorityFactor: 1.5 }).length).toBe(1)
    expect(v({ type: 'RELEASE' }).length).toBe(1)
    expect(v({ type: 'DIRECTED', direction: 0 }).length).toBe(1)
    expect(v({ type: 'DIRECTED', direction: 0, directedLimitation: 'STRICT' })).toEqual([])
  })

  it('зона за пределами карты — ошибка', () => {
    const { errors } = validateZones(makeMap({ zones: [{ id: 'z', type: 'BLOCKED', vertices: rectPx(150, 50, 250, 90) }] }))
    expect(errors.some((e) => e.includes('beyond the map'))).toBe(true)
  })

  it('перекрытие зон направления — ошибка, узел в BLOCKED — предупреждение', () => {
    const map = makeMap({
      zones: [
        { id: 'd1', type: 'DIRECTED', direction: 0, directedLimitation: 'SOFT', vertices: rectPx(0, 0, 50, 50) },
        { id: 'd2', type: 'BIDIRECTED', direction: 0, bidirectedLimitation: 'SOFT', vertices: rectPx(40, 40, 90, 90) },
        { id: 'b1', type: 'BLOCKED', vertices: rectPx(100, 0, 150, 50) },
      ],
      waypoints: [{ id: 'n1', u: 120, v: 20 }],
    })
    const { errors, warnings } = validateZones(map)
    expect(errors.some((e) => e.includes('d1') && e.includes('d2'))).toBe(true)
    expect(warnings.some((w) => w.includes('n1') && w.includes('b1'))).toBe(true)
  })
})

describe('узлы и рёбра v3', () => {
  it('nodePosition: theta и отклонения только если заданы', () => {
    const map = makeMap()
    expect(toSpecNodePosition(map, { u: 10, v: 90 })).toEqual({ x: 1, y: 1, mapId: 'map-1' })
    const full = toSpecNodePosition(map, {
      u: 10, v: 90, theta: Math.PI / 2, allowedDeviationXY: { a: 0.3, b: 0.1, theta: 0 }, allowedDeviationTheta: 0.1,
    })
    expect(full.theta).toBeCloseTo(1.5708, 4)
    expect(full.allowedDeviationXY).toEqual({ a: 0.3, b: 0.1, theta: 0 })
    expect(full.allowedDeviationTheta).toBe(0.1)
  })

  it('коридор без releaseRequired не несёт releaseLossBehavior', () => {
    const map = makeMap({ waypoints: [{ id: 'a', u: 0, v: 0 }, { id: 'b', u: 30, v: 40 }] })
    const attrs = toSpecEdgeAttributes(map, {
      id: 'e', from: 'a', to: 'b', maxSpeed: 1,
      corridor: { leftWidth: 0.5, rightWidth: 0.4, releaseRequired: false, releaseLossBehavior: 'RETURN' },
    }, nodeLookup(map))
    expect(attrs.length).toBe(5)
    expect(attrs.corridor).toEqual({ leftWidth: 0.5, rightWidth: 0.4 })
  })

  it('повторяющийся actionId и пустой actionType — ошибки', () => {
    const map = makeMap({
      waypoints: [
        { id: 'n1', u: 0, v: 0, actions: [{ actionId: 'a1', actionType: 'pick', blockingType: 'HARD' }] },
        { id: 'n2', u: 5, v: 5, actions: [{ actionId: 'a1', actionType: '', blockingType: 'NONE' }] },
      ],
    })
    const { errors } = validateVdaAttributes(map)
    expect(errors.some((e) => e.includes('a1') && e.includes('also used'))).toBe(true)
    expect(errors.some((e) => e.includes('without type'))).toBe(true)
  })

  it('LIF round-trip сохраняет поля v3', () => {
    const map = makeMap({
      waypoints: [
        { id: 'n1', u: 10, v: 10, name: 'n1', theta: 1, allowedDeviationXY: { a: 0.5, b: 0.2, theta: 0.3 }, allowedDeviationTheta: 0.2,
          actions: [{ actionId: 'a1', actionType: 'pick', blockingType: 'HARD', actionParameters: [{ key: 'height', value: 0.4 }], retriable: true }] },
        { id: 'n2', u: 60, v: 10, name: 'n2' },
      ],
      edges: [{
        id: 'e1', from: 'n1', to: 'n2', cost: 0, maxSpeed: 0.8, orientation: 3.1416, orientationType: 'TANGENTIAL',
        maximumRotationSpeed: 0.5, corridor: { leftWidth: 0.4, rightWidth: 0.6, corridorReferencePoint: 'CONTOUR', releaseRequired: true, releaseLossBehavior: 'RETURN' },
        actions: [{ actionId: 'a2', actionType: 'detectObject', blockingType: 'NONE', actionParameters: [] }],
      }],
    })
    const back = parseLif(exportLif(map), map)
    const n1 = back.waypoints[0]
    expect(n1.theta).toBe(1)
    expect(n1.allowedDeviationXY).toEqual({ a: 0.5, b: 0.2, theta: 0.3 })
    expect(n1.allowedDeviationTheta).toBe(0.2)
    expect(n1.actions[0]).toMatchObject({ actionId: 'a1', actionType: 'pick', retriable: true, actionParameters: [{ key: 'height', value: 0.4 }] })
    expect(back.waypoints[1]).not.toHaveProperty('theta')
    const e = back.edges[0]
    expect(e.maxSpeed).toBe(0.8)
    expect(e.orientation).toBe(3.1416)
    expect(e.maximumRotationSpeed).toBe(0.5)
    expect(e.corridor).toEqual({ leftWidth: 0.4, rightWidth: 0.6, corridorReferencePoint: 'CONTOUR', releaseRequired: true, releaseLossBehavior: 'RETURN' })
    expect(e.actions[0].actionType).toBe('detectObject')
  })
})

describe('значения параметров action', () => {
  it('распознаёт типы', () => {
    expect(parseParamValue('1.5')).toBe(1.5)
    expect(parseParamValue('true')).toBe(true)
    expect(parseParamValue('["FLEET_CONTROL","LOCAL"]')).toEqual(['FLEET_CONTROL', 'LOCAL'])
    expect(parseParamValue('pallet_eu')).toBe('pallet_eu')
    expect(parseParamValue('[oops')).toBe('[oops')
    expect(formatParamValue(['A'])).toBe('["A"]')
    expect(formatParamValue(2)).toBe('2')
    // строка "123" переживает круг формат → разбор
    expect(formatParamValue('123')).toBe('"123"')
    expect(parseParamValue(formatParamValue('123'))).toBe('123')
  })
})
