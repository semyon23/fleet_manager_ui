import { request, getMockMode, withMockDelay } from './client'
import { RobotWireList, RegisterRobotResponse, wireToRobot } from './schemas'
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
  // Бэк Семёна отдаёт wire-формат (name/spec/status/...); мапим в внутренний Robot.
  const wire = await request('GET', '/fms/robots', { schema: RobotWireList })
  return wire.map(wireToRobot)
}

export async function getRobot(id) {
  if (getMockMode()) return withMockDelay(mocks.getRobot(id))
  const wire = await request('GET', `/fms/robots/${encodeURIComponent(id)}`)
  return wireToRobot(wire)
}

// Регистрация нового робота в fleet. Формат Семёна: POST /fms/robots.
// Возвращает { status: 'success', robot_id }.
export async function registerRobot(payload) {
  if (getMockMode()) return withMockDelay(mocks.registerRobot(payload))
  return request('POST', '/fms/robots', { body: payload, schema: RegisterRobotResponse })
}

// Удаление робота из fleet. Семён (2026-08-30) договорились: только name в body,
// manufacturer больше не требуется.
export async function deleteRobot(name) {
  if (getMockMode()) return withMockDelay(mocks.deleteRobot(name))
  return request('DELETE', '/fms/robots', { body: { name } })
}

export async function sendCommand(id, action) {
  if (getMockMode()) return withMockDelay(mocks.sendCommand(id, action))
  return request('POST', `/fms/robots/${encodeURIComponent(id)}/command`, { body: { action } })
}

export async function teleop(id, twist) {
  if (getMockMode()) return withMockDelay(mocks.teleop(id, twist))
  return request('POST', `/fms/robots/${encodeURIComponent(id)}/teleop`, { body: twist })
}
