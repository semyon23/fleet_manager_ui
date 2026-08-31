/**
 * Мок роботов. Возвращает в API-совместимом виде (без sprites — те живут во фронте).
 * sprites добавит store при необходимости.
 */
// Демо-роботы убраны 2026-08-31 по фидбеку Семёна. Mock-режим стартует
// с пустого fleet — пользователь регистрирует роботов через UI как и в real.
const MOCK_ROBOTS = []

export function listRobots() { return MOCK_ROBOTS.map((r) => ({ ...r })) }
export function getRobot(id) {
  const r = MOCK_ROBOTS.find((x) => x.id === id)
  if (!r) { const e = new Error('Robot not found'); e.status = 404; throw e }
  return { ...r }
}
export function deleteRobot(name) {
  const i = MOCK_ROBOTS.findIndex((r) => r.id === name)
  if (i === -1) { const e = new Error('Robot not found'); e.status = 404; throw e }
  MOCK_ROBOTS.splice(i, 1)
  return null
}

// Регистрация нового робота. Возвращаем в формате бэка Семёна.
export function registerRobot({ name, manufacturer, amr_class = 'CARRIER' }) {
  if (MOCK_ROBOTS.some((r) => r.id === name)) {
    const e = new Error(`Robot with name '${name}' already exists`)
    e.status = 409
    throw e
  }
  MOCK_ROBOTS.push({
    id: name,
    model: manufacturer ? `${manufacturer} · ${amr_class}` : amr_class,
    status: 'offline', battery: 0, x: 0, y: 0, theta: 0, mission: null, uptime: '0h',
  })
  return { status: 'success', robot_id: name }
}

export function sendCommand(id, action) {
  // Мок принимает команду, но реально ничего не делает
  console.log('[mock] robot command:', id, action)
  return null
}
export function teleop(id, twist) {
  console.log('[mock] teleop:', id, twist)
  return null
}
