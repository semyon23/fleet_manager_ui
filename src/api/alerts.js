import { request, getMockMode, withMockDelay } from './client'
import { Alert, AlertList } from './schemas'
import * as mocks from './mocks/alerts.mock'

/**
 * Alerts API. Все пути под префиксом /fms/ (единый стандарт Семёна, 2026-08-29).
 * - GET  /fms/alerts                  → Alert[]
 * - POST /fms/alerts/:id/ack          → Alert (acknowledged=true)
 */

export async function listAlerts() {
  if (getMockMode()) return withMockDelay(mocks.listAlerts())
  return request('GET', '/fms/alerts', { schema: AlertList })
}
export async function ackAlert(id) {
  if (getMockMode()) return withMockDelay(mocks.ackAlert(id))
  return request('POST', `/fms/alerts/${encodeURIComponent(id)}/ack`, { schema: Alert })
}
