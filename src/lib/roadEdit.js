/**
 * Правка дорог на графе карты: скругление угла дугой заданного радиуса.
 * Координаты — пиксели карты (u, v), как в map.waypoints / map.stations.
 *
 * Дорога из инструмента Straight road — это цепочка близких вершин на одной прямой,
 * поэтому скругление идёт вдоль прямых участков по обе стороны от угла: вершины,
 * попавшие внутрь поворота, убираются, дуга стыкуется с дорогой по касательной.
 */
import { unitVector, filletCorner, sampleArc } from './geometry'

const EPS_PX = 0.5 // допуск «на одной прямой» и «в той же точке», пиксели

function positions(map) {
  const pos = new Map()
  for (const w of map.waypoints) pos.set(w.id, { x: w.u, y: w.v })
  for (const s of map.stations || []) pos.set(s.id, { x: s.u, y: s.v })
  return pos
}

function neighbourMap(map) {
  const nb = new Map()
  const add = (a, b) => {
    if (!nb.has(a)) nb.set(a, new Set())
    nb.get(a).add(b)
  }
  for (const e of map.edges) {
    add(e.from, e.to)
    add(e.to, e.from)
  }
  return nb
}

// Прямой участок от угла p через соседа n: [{ id, dist }] по порядку удаления от p.
// Идём, пока вершины лежат на луче p→n и это «проходные» узлы дороги
// (ровно два соседа, без actions, не станции). Последний элемент — граница участка.
function walkLeg(p, n, pos, nb, byId) {
  const origin = pos.get(p)
  const dir = unitVector(origin, pos.get(n))
  const out = []
  let prev = p
  let cur = n
  const seen = new Set([p])
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const q = pos.get(cur)
    const dx = q.x - origin.x
    const dy = q.y - origin.y
    const dist = dx * dir.x + dy * dir.y
    if (dist <= 0 || Math.abs(dx * -dir.y + dy * dir.x) > EPS_PX) break
    out.push({ id: cur, dist })
    const w = byId.get(cur)
    const links = nb.get(cur) || new Set()
    if (!w || w.actions?.length || links.size !== 2) break
    const next = [...links].find((x) => x !== prev)
    prev = cur
    cur = next
  }
  return { dir, items: out }
}

/**
 * Угол в узле nodeId: ровно два соседа, не на одной прямой.
 * @returns {{ legs, theta, maxRPx } | null}
 */
export function cornerAt(map, nodeId) {
  const pos = positions(map)
  const nb = neighbourMap(map)
  const byId = new Map(map.waypoints.map((w) => [w.id, w]))
  const links = nb.get(nodeId)
  if (!pos.has(nodeId) || !links || links.size !== 2) return null
  const legs = [...links].map((n) => ({ first: n, ...walkLeg(nodeId, n, pos, nb, byId) }))
  if (legs.some((l) => !l.dir || !l.items.length)) return null
  const cos = legs[0].dir.x * legs[1].dir.x + legs[0].dir.y * legs[1].dir.y
  const theta = Math.acos(Math.max(-1, Math.min(1, cos)))
  if (theta < 1e-3 || Math.PI - theta < 1e-3) return null
  const reach = Math.min(...legs.map((l) => l.items[l.items.length - 1].dist))
  return { legs, theta, maxRPx: reach * Math.tan(theta / 2) }
}

/**
 * Скругляет угол в nodeId дугой радиуса rPx с вершинами не реже stepPx
 * (или ровно pointCount точек на дуге вместе с точками касания, если pointCount >= 3).
 * Сам узел переезжает в середину дуги (его id, actions и атрибуты сохраняются).
 * Направления движения и атрибуты рёбер берутся с рёбер угла (actions рёбер не копируются).
 *
 * @param newIds (count) => string[] — свободные id для новых узлов
 * @returns {{ waypoints, edges, added, removed } | { error: 'not-corner' } | { error: 'too-big', maxRPx }}
 */
export function roundCorner(map, nodeId, rPx, stepPx, newIds, pointCount = 0) {
  const corner = cornerAt(map, nodeId)
  if (!corner) return { error: 'not-corner' }
  if (!(rPx > 0) || rPx > corner.maxRPx + EPS_PX) return { error: 'too-big', maxRPx: corner.maxRPx }

  const p = positions(map).get(nodeId)
  const t = rPx / Math.tan(corner.theta / 2) // расстояние от угла до точки касания
  const [legA, legB] = corner.legs
  const far = (leg) => ({ x: p.x + leg.dir.x * (t + 10), y: p.y + leg.dir.y * (t + 10) })
  const f = filletCorner(far(legA), p, far(legB), rPx)
  const pts = sampleArc(f.arc, stepPx, undefined, pointCount >= 3 ? pointCount : 0)

  // Для каждой стороны: какие вершины убрать, к какой пристыковаться, нужна ли новая точка касания
  const plan = (leg, tangent) => {
    const idx = leg.items.findIndex((it) => it.dist >= t - EPS_PX)
    const anchor = leg.items[idx]
    return {
      removed: leg.items.slice(0, idx).map((it) => it.id),
      anchor: anchor.id,
      reuse: Math.abs(anchor.dist - t) <= EPS_PX, // точка касания совпала с вершиной дороги
      tangent,
    }
  }
  const sideA = plan(legA, f.t1)
  const sideB = plan(legB, f.t2)

  // Точки цепочки: [касание A] … середина (сам узел) … [касание B]
  const mid = Math.floor(pts.length / 2)
  const inner = pts.slice(1, -1)
  const midInner = mid - 1
  const freshCount = inner.length - 1 + (sideA.reuse ? 0 : 1) + (sideB.reuse ? 0 : 1)
  const ids = newIds(freshCount)
  const newWps = []
  const corner0 = map.waypoints.find((w) => w.id === nodeId)
  const make = (q) => {
    const id = ids.shift()
    newWps.push({ id, u: q.x, v: q.y, name: id, description: '', mapId: corner0?.mapId || '' })
    return id
  }
  const chain = []
  chain.push(sideA.anchor)
  if (!sideA.reuse) chain.push(make(f.t1))
  inner.forEach((q, i) => chain.push(i === midInner ? nodeId : make(q)))
  if (!sideB.reuse) chain.push(make(f.t2))
  chain.push(sideB.anchor)

  // Направления — по рёбрам угла: A→узел или узел→B значит движение A → B
  const edgesAt = (n) => map.edges.filter((e) => (e.from === n && e.to === nodeId) || (e.from === nodeId && e.to === n))
  const eA = edgesAt(legA.first)
  const eB = edgesAt(legB.first)
  const forward = eA.some((e) => e.from === legA.first) || eB.some((e) => e.to === legB.first)
  const backward = eA.some((e) => e.to === legA.first) || eB.some((e) => e.from === legB.first)
  const { actions: _a, id: _i, from: _f, to: _t, ...tpl } = eA[0] || eB[0]

  const removed = new Set([...sideA.removed, ...sideB.removed])
  const touched = new Set([...removed, nodeId])
  const keptEdges = map.edges.filter((e) => !touched.has(e.from) && !touched.has(e.to))
  const newEdges = []
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1]
    const b = chain[i]
    if (forward) newEdges.push({ ...tpl, id: a + '_' + b, from: a, to: b })
    if (backward) newEdges.push({ ...tpl, id: b + '_' + a, from: b, to: a })
  }

  const midPt = inner[midInner]
  return {
    waypoints: [
      ...map.waypoints
        .filter((w) => !removed.has(w.id))
        .map((w) => (w.id === nodeId ? { ...w, u: midPt.x, v: midPt.y } : w)),
      ...newWps,
    ],
    edges: [...keptEdges, ...newEdges],
    added: newWps.length,
    removed: removed.size,
  }
}
