/**
 * Проверяет карту перед экспортом в LIF / GeoJSON.
 * Возвращает { errors: [], warnings: [] } — ошибки блокируют экспорт,
 * предупреждения показываются, но не блокируют.
 */
export function validateMap(map) {
  const errors = []
  const warnings = []
  if (!map) return { errors: ['Map is null'], warnings: [] }

  const waypoints = map.waypoints || []
  const stations = map.stations || []
  const edges = map.edges || []

  // 1. Дубликаты ID (между waypoints, между stations, между waypoint+station)
  const seen = new Map()
  for (const w of waypoints) {
    if (seen.has(w.id)) errors.push(`Duplicate node ID: ${w.id}`)
    else seen.set(w.id, 'waypoint')
  }
  for (const s of stations) {
    if (seen.has(s.id)) errors.push(`Duplicate ID: ${s.id} (station conflicts with ${seen.get(s.id)})`)
    else seen.set(s.id, 'station')
  }

  const allNodeIds = new Set(seen.keys())

  // 2. Дубликаты edge ID
  const edgeIds = new Set()
  for (const e of edges) {
    if (edgeIds.has(e.id)) errors.push(`Duplicate edge ID: ${e.id}`)
    else edgeIds.add(e.id)
  }

  // 3. Orphan edges — ссылаются на несуществующие ноды
  for (const e of edges) {
    if (!allNodeIds.has(e.from)) errors.push(`Edge ${e.id}: from-node "${e.from}" не найден`)
    if (!allNodeIds.has(e.to)) errors.push(`Edge ${e.id}: to-node "${e.to}" не найден`)
    if (e.from === e.to) warnings.push(`Edge ${e.id}: self-loop (from == to == ${e.from})`)
  }

  // 4. Изолированные waypoints (без единого ребра)
  const connected = new Set()
  for (const e of edges) {
    connected.add(e.from); connected.add(e.to)
  }
  for (const w of waypoints) {
    if (!connected.has(w.id)) warnings.push(`Waypoint ${w.id} isolated (no edges)`)
  }

  // 5. Дубликаты edge по паре (from, to) — необычно, но допустимо
  const pairs = new Map()
  for (const e of edges) {
    const key = e.from + '→' + e.to
    if (pairs.has(key)) warnings.push(`Duplicate edge ${e.from} → ${e.to} (ids: ${pairs.get(key)}, ${e.id})`)
    else pairs.set(key, e.id)
  }

  // 6. Station без interactionNodeIds — просто warning, не ошибка
  for (const s of stations) {
    if (!(s.interactionNodeIds || []).length) {
      warnings.push(`Station ${s.id}: interactionNodeIds пусто — робот не сможет к ней подъехать`)
    }
  }

  // 7. Отрицательные speed / cost
  for (const e of edges) {
    if (e.maxSpeed != null && e.maxSpeed < 0) errors.push(`Edge ${e.id}: maxSpeed < 0`)
    if (e.cost != null && e.cost < 0) warnings.push(`Edge ${e.id}: cost < 0`)
  }

  return { errors, warnings }
}
