const MOCK_MISSIONS = [
  { id: 'M-104', name: 'Pickup zone A → Charge', mapId: 'demo', status: 'running',   robotId: 'amr-01', nodeIds: ['n001', 'n002', 'n003'], createdAt: '2026-08-27T09:12:00Z', updatedAt: '2026-08-27T10:15:00Z' },
  { id: 'M-107', name: 'Loading dock → Storage 3', mapId: 'demo', status: 'pending', robotId: 'amr-04', nodeIds: ['n010', 'n011'],          createdAt: '2026-08-27T10:00:00Z', updatedAt: '2026-08-27T10:00:00Z' },
  { id: 'M-108', name: 'Battery swap', mapId: 'demo', status: 'running',              robotId: 'amr-06', nodeIds: ['n020', 'n021'],          createdAt: '2026-08-27T09:45:00Z', updatedAt: '2026-08-27T10:10:00Z' },
  { id: 'M-102', name: 'Warehouse tour', mapId: 'demo', status: 'succeeded',          robotId: 'amr-01', nodeIds: ['n001', 'n002'],          createdAt: '2026-08-27T08:00:00Z', updatedAt: '2026-08-27T09:00:00Z' },
]

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
