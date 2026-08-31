// Демо-миссии убраны 2026-08-31 по фидбеку Семёна. Список пустой при первом
// заходе; наполняется через createMission.
const MOCK_MISSIONS = []

export function listMissions() { return MOCK_MISSIONS.map((m) => ({ ...m })) }
export function getMission(id) {
  const m = MOCK_MISSIONS.find((x) => x.id === id)
  if (!m) { const e = new Error('Mission not found'); e.status = 404; throw e }
  return { ...m }
}
export function createMission(payload) {
  const m = {
    id: 'M-' + (100 + MOCK_MISSIONS.length),
    name: payload.name,
    mapId: payload.mapId,
    nodeIds: payload.nodeIds,
    robotId: payload.robotId || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  MOCK_MISSIONS.push(m)
  return { ...m }
}
export function cancelMission(id) {
  const m = MOCK_MISSIONS.find((x) => x.id === id)
  if (m) { m.status = 'cancelled'; m.updatedAt = new Date().toISOString() }
  return null
}
