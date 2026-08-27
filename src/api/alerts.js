import { request, getMockMode, withMockDelay } from './client'
import { Alert, AlertList } from './schemas'
import * as mocks from './mocks/alerts.mock'

/**
 * Alerts API.
 * - GET  /alerts                  → Alert[]
 * - POST /alerts/:id/ack          → Alert (acknowledged=true)
 */

export async function listAlerts() {
  if (getMockMode()) return withMockDelay(mocks.listAlerts())
  return request('GET', '/alerts', { schema: AlertList })
}
export async function ackAlert(id) {
  if (getMockMode()) return withMockDelay(mocks.ackAlert(id))
  return request('POST', `/alerts/${encodeURIComponent(id)}/ack`, { schema: Alert })
}
