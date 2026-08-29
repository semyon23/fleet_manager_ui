import { request, getMockMode, withMockDelay } from './client'
import { Mission, MissionList } from './schemas'
import * as mocks from './mocks/missions.mock'

/**
 * Missions API.
 * - GET  /missions                → Mission[]
 * - GET  /missions/:id            → Mission
 * - POST /missions                → Mission (создание, бэк потом отправит в робота как VDA5050 Order)
 * - POST /missions/:id/cancel     → 204
 */

export async function listMissions() {
  if (getMockMode()) return withMockDelay(mocks.listMissions())
  return request('GET', '/fms/missions', { schema: MissionList })
}
export async function getMission(id) {
  if (getMockMode()) return withMockDelay(mocks.getMission(id))
  return request('GET', `/fms/missions/${encodeURIComponent(id)}`, { schema: Mission })
}
export async function createMission(payload) {
  if (getMockMode()) return withMockDelay(mocks.createMission(payload))
  return request('POST', '/fms/missions', { body: payload, schema: Mission })
}
export async function cancelMission(id) {
  if (getMockMode()) return withMockDelay(mocks.cancelMission(id))
  return request('POST', `/fms/missions/${encodeURIComponent(id)}/cancel`)
}
