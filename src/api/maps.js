import { request, getMockMode, withMockDelay } from './client'
import { MapEntity, MapList } from './schemas'
import * as mocks from './mocks/maps.mock'

/**
 * Maps API.
 * Endpoints (mocks и real одинаково):
 * - GET  /maps          → Map[]
 * - GET  /maps/:id      → Map
 * - POST /maps          → Map (создание)
 * - PATCH /maps/:id     → Map (частичный апдейт: name, waypoints, edges, stations, meta …)
 * - DELETE /maps/:id    → 204
 * - POST /maps/:id/assign-robots → Map (список robotIds)
 */

export async function listMaps() {
  if (getMockMode()) return withMockDelay(mocks.listMaps())
  return request('GET', '/fms/maps', { schema: MapList })
}

export async function getMap(id) {
  if (getMockMode()) return withMockDelay(mocks.getMap(id))
  return request('GET', `/fms/maps/${encodeURIComponent(id)}`, { schema: MapEntity })
}

export async function createMap(payload) {
  if (getMockMode()) return withMockDelay(mocks.createMap(payload))
  return request('POST', '/fms/maps', { body: payload, schema: MapEntity })
}

export async function updateMap(id, patch) {
  if (getMockMode()) return withMockDelay(mocks.updateMap(id, patch))
  return request('PATCH', `/fms/maps/${encodeURIComponent(id)}`, { body: patch, schema: MapEntity })
}

export async function deleteMap(id) {
  if (getMockMode()) return withMockDelay(mocks.deleteMap(id))
  return request('DELETE', `/fms/maps/${encodeURIComponent(id)}`)
}

export async function assignRobots(id, robotIds) {
  if (getMockMode()) return withMockDelay(mocks.assignRobots(id, robotIds))
  return request('POST', `/fms/maps/${encodeURIComponent(id)}/assign-robots`,
    { body: { robotIds }, schema: MapEntity })
}
