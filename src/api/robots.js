import { request, getMockMode, withMockDelay } from './client'
import { Robot, RobotList, RegisterRobotResponse } from './schemas'
import * as mocks from './mocks/robots.mock'

/**
 * Robots API.
 * - GET  /robots                   → Robot[]
 * - GET  /robots/:id               → Robot
 * - POST /fms/robots               { name, manufacturer, amr_class } → { status, robot_id }
 * - POST /robots/:id/command       { action } → 204
 * - POST /robots/:id/teleop        { linear:{x,y,z}, angular:{x,y,z} } → 204
 *
 * Live state (позиции, статусы) поступает через WebSocket/MQTT — этот HTTP
 * API нужен только для snapshot и командных запросов.
 */

export async function listRobots() {
  if (getMockMode()) return withMockDelay(mocks.listRobots())
  return request('GET', '/robots', { schema: RobotList })
}

export async function getRobot(id) {
  if (getMockMode()) return withMockDelay(mocks.getRobot(id))
  return request('GET', `/robots/${encodeURIComponent(id)}`, { schema: Robot })
}

// Регистрация нового робота в fleet. Формат Семёна: POST /fms/robots.
// Возвращает { status: 'success', robot_id }.
export async function registerRobot(payload) {
  if (getMockMode()) return withMockDelay(mocks.registerRobot(payload))
  return request('POST', '/fms/robots', { body: payload, schema: RegisterRobotResponse })
}

export async function sendCommand(id, action) {
  if (getMockMode()) return withMockDelay(mocks.sendCommand(id, action))
  return request('POST', `/robots/${encodeURIComponent(id)}/command`, { body: { action } })
}

export async function teleop(id, twist) {
  if (getMockMode()) return withMockDelay(mocks.teleop(id, twist))
  return request('POST', `/robots/${encodeURIComponent(id)}/teleop`, { body: twist })
}
