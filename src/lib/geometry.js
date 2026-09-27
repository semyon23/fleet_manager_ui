/**
 * Плоская геометрия для редактора карт: полигоны зон, коридоры рёбер.
 * Точки — { x, y } в любой одной системе (пиксели карты или метры).
 */

// Ориентированная площадь (формула шнурка). > 0 — обход против часовой стрелки
// в системе с осью Y вверх (метры карты). В пикселях (Y вниз) знак обратный.
export function signedArea(points) {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function pointInPolygon(p, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

// Пересечение отрезков [p1,p2] и [p3,p4], включая касание.
export function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = cross(p3, p4, p1)
  const d2 = cross(p3, p4, p2)
  const d3 = cross(p1, p2, p3)
  const d4 = cross(p1, p2, p4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  const onSeg = (p, q, r) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) &&
    Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y)
  if (d1 === 0 && onSeg(p3, p4, p1)) return true
  if (d2 === 0 && onSeg(p3, p4, p2)) return true
  if (d3 === 0 && onSeg(p1, p2, p3)) return true
  if (d4 === 0 && onSeg(p1, p2, p4)) return true
  return false
}

// Простой полигон: стороны не пересекаются, кроме соседних в общей вершине.
export function isSimplePolygon(poly) {
  const n = poly.length
  if (n < 3) return false
  for (let i = 0; i < n; i++) {
    const a1 = poly[i]
    const a2 = poly[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      // Соседние стороны делят вершину — их не проверяем
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (segmentsIntersect(a1, a2, poly[j], poly[(j + 1) % n])) return false
    }
  }
  return Math.abs(signedArea(poly)) > 1e-12
}

// Полигоны перекрываются: пересекаются стороны или один внутри другого.
export function polygonsOverlap(a, b) {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
    }
  }
  return pointInPolygon(a[0], b) || pointInPolygon(b[0], a)
}

export function centroid(poly) {
  const A = signedArea(poly)
  if (Math.abs(A) < 1e-12) {
    const n = poly.length || 1
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const f = a.x * b.y - b.x * a.y
    cx += (a.x + b.x) * f
    cy += (a.y + b.y) * f
  }
  return { x: cx / (6 * A), y: cy / (6 * A) }
}

// Прямоугольник по двум противоположным углам, 4 вершины.
export function rectFromCorners(a, b) {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ]
}

// Коридор ребра в ПИКСЕЛЯХ карты (ось v вниз): четырёхугольник вокруг отрезка a→b.
// Слева/справа — относительно направления движения в мировых координатах (ось Y вверх).
// В пикселях "лево" для направления (du, dv) — это (dv, -du).
export function corridorPolygonPx(a, b, leftPx, rightPx) {
  const du = b.x - a.x
  const dv = b.y - a.y
  const len = Math.hypot(du, dv)
  if (len < 1e-9) return []
  const lu = dv / len
  const lv = -du / len
  return [
    { x: a.x + lu * leftPx, y: a.y + lv * leftPx },
    { x: b.x + lu * leftPx, y: b.y + lv * leftPx },
    { x: b.x - lu * rightPx, y: b.y - lv * rightPx },
    { x: a.x - lu * rightPx, y: a.y - lv * rightPx },
  ]
}

export function pointsAttr(poly) {
  return poly.map((p) => `${p.x},${p.y}`).join(' ')
}

// Угол в мире (рад, против часовой, ось Y вверх) → поворот SVG в пикселях (град, по часовой).
export function worldAngleToSvgDeg(theta) {
  return (-(theta || 0) * 180) / Math.PI
}

// Нормализация угла в [-Pi, Pi].
export function normalizeAngle(a) {
  let x = Number(a) || 0
  while (x > Math.PI) x -= 2 * Math.PI
  while (x < -Math.PI) x += 2 * Math.PI
  return x
}

export const degToRad = (d) => (Number(d) || 0) * Math.PI / 180
export const radToDeg = (r) => (Number(r) || 0) * 180 / Math.PI

// ============================================================================
// Дороги: прямые и дуги, разбитые на вершины. Работает в любой системе координат,
// в редакторе — в пикселях карты. Дуга: { cx, cy, r, a0, sweep } — от угла a0 на sweep
// (со знаком: > 0 — в сторону роста угла).
// ============================================================================

const TWO_PI = 2 * Math.PI
const wrap2Pi = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI

export function unitVector(from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  return len < 1e-9 ? null : { x: dx / len, y: dy / len }
}

// Точки отрезка a→b с шагом не больше stepPx, концы включены — все на одной прямой.
export function sampleSegment(a, b, stepPx) {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.max(1, Math.ceil(len / Math.max(stepPx, 1e-6) - 1e-9))
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / n,
    y: a.y + ((b.y - a.y) * i) / n,
  }))
}

// Дуга из a в b через m. null — точки на одной прямой.
export function arcThrough3(a, m, b) {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y))
  if (Math.abs(d) < 1e-9) return null
  const sa = a.x * a.x + a.y * a.y
  const sm = m.x * m.x + m.y * m.y
  const sb = b.x * b.x + b.y * b.y
  const cx = (sa * (m.y - b.y) + sm * (b.y - a.y) + sb * (a.y - m.y)) / d
  const cy = (sa * (b.x - m.x) + sm * (a.x - b.x) + sb * (m.x - a.x)) / d
  const a0 = Math.atan2(a.y - cy, a.x - cx)
  const toEnd = wrap2Pi(Math.atan2(b.y - cy, b.x - cx) - a0)
  const toMid = wrap2Pi(Math.atan2(m.y - cy, m.x - cx) - a0)
  // m лежит на дуге: идём в ту сторону, где его встретим раньше конца
  const sweep = toMid < toEnd ? toEnd : toEnd - TWO_PI
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy), a0, sweep }
}

// Дуга из a, выходящая по направлению dir (единичный вектор), в точку b —
// продолжает предыдущий участок без излома. null — b на касательной (это прямая)
// или позади так, что дуга вырождается.
export function arcTangent(a, dir, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const nx = -dir.y
  const ny = dir.x
  const dn = dx * nx + dy * ny
  if (Math.abs(dn) < 1e-9) return null
  const rs = (dx * dx + dy * dy) / (2 * dn) // со знаком: центр = a + n * rs
  const cx = a.x + nx * rs
  const cy = a.y + ny * rs
  const a0 = Math.atan2(a.y - cy, a.x - cx)
  const toEnd = wrap2Pi(Math.atan2(b.y - cy, b.x - cx) - a0)
  // rs > 0 — движение по dir совпадает с ростом угла
  const sweep = rs > 0 ? toEnd : toEnd - TWO_PI
  return { cx, cy, r: Math.abs(rs), a0, sweep }
}

export function arcLength(arc) {
  return Math.abs(arc.sweep) * arc.r
}

export function arcPoint(arc, t) {
  const ang = arc.a0 + arc.sweep * t
  return { x: arc.cx + arc.r * Math.cos(ang), y: arc.cy + arc.r * Math.sin(ang) }
}

// Направление движения в конце дуги (единичный вектор).
export function arcEndDirection(arc) {
  const ang = arc.a0 + arc.sweep
  const s = Math.sign(arc.sweep) || 1
  return { x: -Math.sin(ang) * s, y: Math.cos(ang) * s }
}

// Точки дуги, концы включены. pointCount >= 2 — ровно столько точек, равномерно.
// Иначе шаг — не больше stepPx по длине и maxStepRad по углу,
// чтобы крутой поворот малого радиуса тоже выглядел гладко.
export function sampleArc(arc, stepPx, maxStepRad = Math.PI / 12, pointCount = 0) {
  const n = pointCount >= 2
    ? Math.round(pointCount) - 1
    : Math.max(
      2,
      Math.ceil(arcLength(arc) / Math.max(stepPx, 1e-6) - 1e-9),
      Math.ceil(Math.abs(arc.sweep) / maxStepRad - 1e-9),
    )
  return Array.from({ length: n + 1 }, (_, i) => arcPoint(arc, i / n))
}

// Дуга, укороченная до maxSweep (конец сдвигается по той же окружности).
export function clampArcSweep(arc, maxSweep) {
  if (Math.abs(arc.sweep) <= maxSweep) return arc
  return { ...arc, sweep: Math.sign(arc.sweep) * maxSweep }
}

// Скругление угла a–p–b радиусом r: дуга касается обоих отрезков в t1 (на p→a) и t2 (на p→b).
// Ошибки: { error: 'straight' } — угла нет; { error: 'too-big', maxR } — не помещается на отрезках.
export function filletCorner(a, p, b, r) {
  const u1 = unitVector(p, a)
  const u2 = unitVector(p, b)
  if (!u1 || !u2) return { error: 'straight' }
  const cos = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y))
  const theta = Math.acos(cos) // угол между сторонами в вершине p
  if (theta < 1e-3 || Math.PI - theta < 1e-3) return { error: 'straight' }
  const half = Math.tan(theta / 2)
  const t = r / half
  const lenA = Math.hypot(a.x - p.x, a.y - p.y)
  const lenB = Math.hypot(b.x - p.x, b.y - p.y)
  const maxR = Math.min(lenA, lenB) * half
  if (!(r > 0) || t >= Math.min(lenA, lenB)) return { error: 'too-big', maxR }
  const t1 = { x: p.x + u1.x * t, y: p.y + u1.y * t }
  const t2 = { x: p.x + u2.x * t, y: p.y + u2.y * t }
  const bis = unitVector({ x: 0, y: 0 }, { x: u1.x + u2.x, y: u1.y + u2.y })
  const dist = r / Math.sin(theta / 2)
  const cx = p.x + bis.x * dist
  const cy = p.y + bis.y * dist
  const a0 = Math.atan2(t1.y - cy, t1.x - cx)
  let sweep = wrap2Pi(Math.atan2(t2.y - cy, t2.x - cx) - a0)
  if (sweep > Math.PI) sweep -= TWO_PI // короткая дуга
  return { t1, t2, arc: { cx, cy, r, a0, sweep }, maxR }
}

// Направление, привязанное к шагу snapRad (Shift при рисовании дороги).
export function snapDirection(from, to, snapRad) {
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  const ang = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / snapRad) * snapRad
  return { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len }
}

// Проекция to на луч from + dir, если отклонение не больше tolRad; иначе null.
export function snapToRay(from, dir, to, tolRad) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const along = dx * dir.x + dy * dir.y
  if (along <= 0) return null
  const across = dx * -dir.y + dy * dir.x
  if (Math.abs(Math.atan2(across, along)) > tolRad) return null
  return { x: from.x + dir.x * along, y: from.y + dir.y * along }
}

// Поворот радиуса r из a по направлению dir. Сторона — где лежит target, угол — до луча
// из центра на target, кратно snapRad (0 — без привязки), не больше maxSweep.
// null — target прямо по курсу.
export function arcFixedRadius(a, dir, target, r, snapRad = 0, maxSweep = TWO_PI) {
  const nx = -dir.y
  const ny = dir.x
  const side = Math.sign((target.x - a.x) * nx + (target.y - a.y) * ny)
  if (!side || !(r > 0)) return null
  const cx = a.x + nx * r * side
  const cy = a.y + ny * r * side
  const a0 = Math.atan2(a.y - cy, a.x - cx)
  const ccw = wrap2Pi(Math.atan2(target.y - cy, target.x - cx) - a0)
  let sweep = side > 0 ? ccw : TWO_PI - ccw // величина поворота по ходу движения
  if (snapRad) sweep = Math.max(snapRad, Math.round(sweep / snapRad) * snapRad)
  sweep = Math.min(sweep, TWO_PI - (snapRad || 1e-3), maxSweep)
  if (sweep < 1e-3) return null
  return { cx, cy, r, a0, sweep: side > 0 ? sweep : -sweep }
}
