import { describe, it, expect } from 'vitest'
import {
  sampleSegment, arcThrough3, arcTangent, arcEndDirection, sampleArc, arcLength,
  filletCorner, snapDirection, snapToRay, arcFixedRadius, arcPoint, clampArcSweep,
} from '../../src/lib/geometry'
import { cornerAt, roundCorner } from '../../src/lib/roadEdit'

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)
const close = (p, q, eps = 1e-6) => expect(dist(p, q)).toBeLessThan(eps)

describe('roads: straight', () => {
  it('sampleSegment gives evenly spaced collinear points with exact ends', () => {
    const pts = sampleSegment({ x: 0, y: 0 }, { x: 10, y: 5 }, 2)
    expect(pts.length).toBe(7) // длина 11.18 → 6 отрезков
    close(pts[0], { x: 0, y: 0 })
    close(pts[pts.length - 1], { x: 10, y: 5 })
    for (const p of pts) expect(Math.abs(p.y - p.x / 2)).toBeLessThan(1e-9)
    const d = dist(pts[0], pts[1])
    for (let i = 1; i < pts.length; i++) expect(Math.abs(dist(pts[i - 1], pts[i]) - d)).toBeLessThan(1e-9)
  })

  it('short segment still has two ends', () => {
    expect(sampleSegment({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 2)).toHaveLength(2)
  })

  it('snapDirection rounds the angle, keeps the length', () => {
    const p = snapDirection({ x: 0, y: 0 }, { x: 10, y: 1 }, Math.PI / 12)
    close(p, { x: Math.hypot(10, 1), y: 0 })
  })

  it('snapToRay projects only within tolerance and ahead', () => {
    const dir = { x: 1, y: 0 }
    close(snapToRay({ x: 0, y: 0 }, dir, { x: 10, y: 0.3 }, 0.05), { x: 10, y: 0 })
    expect(snapToRay({ x: 0, y: 0 }, dir, { x: 10, y: 3 }, 0.05)).toBeNull()
    expect(snapToRay({ x: 0, y: 0 }, dir, { x: -10, y: 0 }, 0.05)).toBeNull()
  })
})

describe('roads: arcs', () => {
  it('arcThrough3: quarter circle through the middle point', () => {
    const arc = arcThrough3({ x: 10, y: 0 }, { x: Math.SQRT1_2 * 10, y: Math.SQRT1_2 * 10 }, { x: 0, y: 10 })
    expect(arc.r).toBeCloseTo(10)
    expect(arc.sweep).toBeCloseTo(Math.PI / 2)
    const back = arcThrough3({ x: 0, y: 10 }, { x: Math.SQRT1_2 * 10, y: Math.SQRT1_2 * 10 }, { x: 10, y: 0 })
    expect(back.sweep).toBeCloseTo(-Math.PI / 2)
  })

  it('arcThrough3: collinear → null', () => {
    expect(arcThrough3({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull()
  })

  it('arcTangent leaves the start along dir and hits the end', () => {
    const a = { x: 0, y: 0 }
    const dir = { x: 1, y: 0 }
    for (const b of [{ x: 5, y: 5 }, { x: 5, y: -5 }, { x: 2, y: 8 }]) {
      const arc = arcTangent(a, dir, b)
      const pts = sampleArc(arc, 0.5)
      close(pts[0], a)
      close(pts[pts.length - 1], b)
      // первый шаг идёт почти по dir
      const s = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y }
      const cos = (s.x * dir.x + s.y * dir.y) / Math.hypot(s.x, s.y)
      expect(cos).toBeGreaterThan(0.99)
      for (const p of pts) expect(Math.abs(Math.hypot(p.x - arc.cx, p.y - arc.cy) - arc.r)).toBeLessThan(1e-6)
    }
    expect(arcTangent(a, dir, { x: 5, y: 0 })).toBeNull()
  })

  it('arcTangent quarter turn: radius and end direction', () => {
    const arc = arcTangent({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 5 })
    expect(arc.r).toBeCloseTo(5)
    expect(Math.abs(arc.sweep)).toBeCloseTo(Math.PI / 2)
    close(arcEndDirection(arc), { x: 0, y: 1 })
  })

  it('sampleArc limits both length step and angle step', () => {
    const arc = { cx: 0, cy: 0, r: 1, a0: 0, sweep: Math.PI }
    expect(sampleArc(arc, 100).length - 1).toBe(12) // 180° / 15°
    const big = { cx: 0, cy: 0, r: 100, a0: 0, sweep: Math.PI / 2 }
    expect(sampleArc(big, 10).length - 1).toBe(Math.ceil(arcLength(big) / 10))
  })
})

describe('roads: fillet', () => {
  it('rounds a right angle: tangent points and radius', () => {
    const f = filletCorner({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }, 3)
    close(f.t1, { x: 0, y: 3 })
    close(f.t2, { x: 3, y: 0 })
    expect(f.arc.cx).toBeCloseTo(3)
    expect(f.arc.cy).toBeCloseTo(3)
    expect(Math.abs(f.arc.sweep)).toBeCloseTo(Math.PI / 2)
    const pts = sampleArc(f.arc, 0.5)
    close(pts[0], f.t1)
    close(pts[pts.length - 1], f.t2)
  })

  it('reports too big radius with the maximum', () => {
    const f = filletCorner({ x: 0, y: 2 }, { x: 0, y: 0 }, { x: 10, y: 0 }, 5)
    expect(f.error).toBe('too-big')
    expect(f.maxR).toBeCloseTo(2)
  })

  it('straight line has no corner', () => {
    expect(filletCorner({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 1).error).toBe('straight')
  })
})


// L-дорога как из инструмента W: вершины через 20 px (1 м при 0.05 м/px),
// по 10 м в каждую сторону от угла c (200, 200). Движение снизу вверх, потом вправо.
function lRoad({ doubleWay = false } = {}) {
  const waypoints = []
  const up = []
  for (let i = 10; i >= 1; i--) up.push({ id: 'a' + i, u: 200, v: 200 + i * 20 })
  const right = []
  for (let i = 1; i <= 10; i++) right.push({ id: 'b' + i, u: 200 + i * 20, v: 200 })
  const chain = [...up, { id: 'c', u: 200, v: 200, actions: [{ actionType: 'beep' }] }, ...right]
  waypoints.push(...chain)
  const edges = []
  for (let i = 1; i < chain.length; i++) {
    edges.push({ id: chain[i - 1].id + '_' + chain[i].id, from: chain[i - 1].id, to: chain[i].id, maxSpeed: 0.7 })
    if (doubleWay) edges.push({ id: chain[i].id + '_' + chain[i - 1].id, from: chain[i].id, to: chain[i - 1].id, maxSpeed: 0.7 })
  }
  return { waypoints, edges, stations: [] }
}
const idGen = () => { let k = 0; return (n) => Array.from({ length: n }, () => 'x' + ++k) }
const at = (m, id) => m.waypoints.find((w) => w.id === id)

// Путь по рёбрам from → to (только прямые рёбра), или null
function walk(m, from, to) {
  const out = new Map()
  for (const e of m.edges) out.set(e.from, [...(out.get(e.from) || []), e.to])
  const path = [from]
  const seen = new Set([from])
  let cur = from
  while (cur !== to) {
    const next = (out.get(cur) || []).find((x) => !seen.has(x))
    if (!next) return null
    seen.add(next); path.push(next); cur = next
  }
  return path
}

describe('roads: round corner on a road with dense nodes', () => {
  it('pointCount sets the number of nodes on the arc (tangent points included)', () => {
    const m = lRoad()
    const res = { ...m, ...roundCorner(m, 'c', 60, 20, idGen(), 5) }
    const path = walk(res, 'a10', 'b10')
    const i0 = path.indexOf('a3')
    const i1 = path.indexOf('b3')
    expect(i1 - i0 + 1).toBe(5)
  })

  it('max radius comes from the whole straight leg, not the nearest node', () => {
    const c = cornerAt(lRoad(), 'c')
    expect(c.maxRPx).toBeCloseTo(200) // 10 м в пикселях, для 90° R = длина прямой
  })

  it('R = 3 m: nodes inside the turn removed, arc tangent, direction kept', () => {
    const m = lRoad()
    const r = roundCorner(m, 'c', 60, 20, idGen())
    expect(r.error).toBeUndefined()
    const res = { ...m, ...r }
    // a1, a2, b1, b2 внутри поворота — убраны; a3, b3 — точки касания (совпали с вершинами)
    for (const id of ['a1', 'a2', 'b1', 'b2']) expect(at(res, id)).toBeUndefined()
    expect(at(res, 'a3')).toBeDefined()
    expect(at(res, 'b3')).toBeDefined()
    // Узел угла на середине дуги, actions на месте
    const c = at(res, 'c')
    expect(Math.hypot(c.u - 260, c.v - 260)).toBeCloseTo(60)
    expect(c.actions).toHaveLength(1)
    // Все точки дуги на окружности радиуса 60 с центром (260, 260)
    const path = walk(res, 'a10', 'b10')
    expect(path).not.toBeNull()
    const arc = path.slice(path.indexOf('a3'), path.indexOf('b3') + 1).map((id) => at(res, id))
    for (const p of arc) expect(Math.hypot(p.u - 260, p.v - 260)).toBeCloseTo(60)
    // 90° не реже 15° → минимум 6 отрезков
    expect(arc.length - 1).toBeGreaterThanOrEqual(6)
    // Обратного пути нет — дорога была односторонней; атрибуты рёбер сохранены
    expect(walk(res, 'b10', 'a10')).toBeNull()
    expect(res.edges.every((e) => e.maxSpeed === 0.7)).toBe(true)
    // Ни одного висячего ребра
    const ids = new Set(res.waypoints.map((w) => w.id))
    expect(res.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true)
  })

  it('radius between nodes adds exact tangent points', () => {
    const m = lRoad()
    const r = roundCorner(m, 'c', 50, 20, idGen())
    const res = { ...m, ...r }
    const path = walk(res, 'a10', 'b10').map((id) => at(res, id))
    // касание на 2.5 м от угла: (200, 250) и (250, 200)
    expect(path.some((p) => Math.hypot(p.u - 200, p.v - 250) < 1e-6)).toBe(true)
    expect(path.some((p) => Math.hypot(p.u - 250, p.v - 200) < 1e-6)).toBe(true)
  })

  it('two-way road stays two-way', () => {
    const m = lRoad({ doubleWay: true })
    const res = { ...m, ...roundCorner(m, 'c', 60, 20, idGen()) }
    expect(walk(res, 'a10', 'b10')).not.toBeNull()
    expect(walk(res, 'b10', 'a10')).not.toBeNull()
  })

  it('too big radius reports the maximum', () => {
    const r = roundCorner(lRoad(), 'c', 260, 20, idGen())
    expect(r.error).toBe('too-big')
    expect(r.maxRPx).toBeCloseTo(200)
  })

  it('leg stops at a node with actions', () => {
    const m = lRoad()
    m.waypoints = m.waypoints.map((w) => (w.id === 'a2' ? { ...w, actions: [{ actionType: 'pick' }] } : w))
    expect(cornerAt(m, 'c').maxRPx).toBeCloseTo(40)
  })
})

describe('roads: fixed radius turn', () => {
  const a = { x: 0, y: 0 }
  const dir = { x: 1, y: 0 }
  it('snaps to 90° and keeps the radius', () => {
    // курсор примерно на 80° поворота налево-вниз (в пикселях +y)
    const arc = arcFixedRadius(a, dir, { x: 38, y: 36 }, 40, Math.PI / 12)
    expect(arc.r).toBe(40)
    expect(arc.sweep).toBeCloseTo(Math.PI / 2)
    close(arcPoint(arc, 1), { x: 40, y: 40 })
    close(arcEndDirection(arc), { x: 0, y: 1 })
  })
  it('turns to the other side by the cursor', () => {
    const arc = arcFixedRadius(a, dir, { x: 40, y: -41 }, 40, Math.PI / 12)
    expect(arc.sweep).toBeCloseTo(-Math.PI / 2)
    close(arcPoint(arc, 1), { x: 40, y: -40 })
  })
  it('straight ahead is not a turn', () => {
    expect(arcFixedRadius(a, dir, { x: 50, y: 0 }, 40, Math.PI / 12)).toBeNull()
  })
  it('turn is capped by maxSweep', () => {
    // курсор позади старта — без ограничения было бы ~180°
    const arc = arcFixedRadius(a, dir, { x: -5, y: 80 }, 40, Math.PI / 12, Math.PI / 2)
    expect(arc.sweep).toBeCloseTo(Math.PI / 2)
  })
})

describe('roads: arc node count', () => {
  const arc = { cx: 0, cy: 0, r: 100, a0: 0, sweep: Math.PI / 2 }
  it('sampleArc with pointCount gives exactly that many evenly spaced points', () => {
    const pts = sampleArc(arc, 1, undefined, 5)
    expect(pts.length).toBe(5)
    close(pts[0], { x: 100, y: 0 })
    close(pts[4], { x: 0, y: 100 })
    close(pts[2], { x: 100 * Math.SQRT1_2, y: 100 * Math.SQRT1_2 })
  })
  it('clampArcSweep keeps the sign and shortens the arc', () => {
    expect(clampArcSweep({ ...arc, sweep: -Math.PI }, Math.PI / 2).sweep).toBeCloseTo(-Math.PI / 2)
    expect(clampArcSweep(arc, Math.PI)).toBe(arc)
  })
})
