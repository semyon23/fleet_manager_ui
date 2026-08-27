/**
 * Мок-сторэдж для Maps API. Использует существующий localStorage-persist
 * из stores/maps.js, чтобы UI видел одни и те же данные из обоих слоёв.
 */

const LS_KEY = 'fm.maps.v1'

function readAll() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}
function writeAll(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}
function nowIso() { return new Date().toISOString() }
function newId() { return 'map-' + Math.random().toString(36).slice(2, 8) }

export function listMaps() {
  return readAll()
}
export function getMap(id) {
  const map = readAll().find((m) => m.id === id)
  if (!map) {
    const err = new Error('Map not found')
    err.status = 404
    throw err
  }
  return map
}
export function createMap(payload) {
  const list = readAll()
  const map = {
    id: newId(),
    name: payload.name,
    meta: payload.meta,
    pgmDataUrl: payload.pgmDataUrl || '',
    width: payload.width,
    height: payload.height,
    waypoints: payload.waypoints || [],
    edges: payload.edges || [],
    stations: payload.stations || [],
    zones: payload.zones || [],
    assignedRobots: payload.assignedRobots || [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  list.push(map)
  writeAll(list)
  return map
}
export function updateMap(id, patch) {
  const list = readAll()
  const idx = list.findIndex((m) => m.id === id)
  if (idx < 0) {
    const err = new Error('Map not found')
    err.status = 404
    throw err
  }
  const updated = { ...list[idx], ...patch, updatedAt: nowIso() }
  list[idx] = updated
  writeAll(list)
  return updated
}
export function deleteMap(id) {
  writeAll(readAll().filter((m) => m.id !== id))
  return null
}
export function assignRobots(id, robotIds) {
  return updateMap(id, { assignedRobots: robotIds })
}
