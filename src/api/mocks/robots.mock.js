/**
 * Мок роботов. Возвращает в API-совместимом виде (без sprites — те живут во фронте).
 * sprites добавит store при необходимости.
 */
const MOCK_ROBOTS = [
  { id: 'amr-01', model: 'Transporter T-1', status: 'moving',   battery: 78, x: 12.4, y: 8.2,  theta: 1.57,  mission: 'M-104', uptime: '3d 12h' },
  { id: 'amr-02', model: 'Transporter T-1', status: 'charging', battery: 34, x: 2.1,  y: 1.5,  theta: 0,     mission: null,    uptime: '2d 4h'  },
  { id: 'amr-03', model: 'Transporter T-1', status: 'idle',     battery: 92, x: 6.8,  y: 4.3,  theta: 3.14,  mission: null,    uptime: '5d 22h' },
  { id: 'amr-04', model: 'Transporter T-1', status: 'moving',   battery: 55, x: 18.9, y: 12.7, theta: -1.57, mission: 'M-107', uptime: '1d 8h'  },
  { id: 'amr-05', model: 'Transporter T-1', status: 'error',    battery: 61, x: 9.2,  y: 6.1,  theta: 0.5,   mission: null,    uptime: '0h'     },
  { id: 'amr-06', model: 'Transporter T-1', status: 'moving',   battery: 47, x: 14.5, y: 3.8,  theta: 2.35,  mission: 'M-108', uptime: '4d 1h'  },
  { id: 'amr-07', model: 'Transporter T-1', status: 'idle',     battery: 88, x: 4.6,  y: 10.9, theta: 0.79,  mission: null,    uptime: '6d 5h'  },
  { id: 'amr-08', model: 'Transporter T-1', status: 'moving',   battery: 72, x: 20.3, y: 7.4,  theta: -0.79, mission: 'M-109', uptime: '2d 19h' },
  { id: 'amr-09', model: 'Transporter T-1', status: 'offline',  battery: 0,  x: 0,    y: 0,    theta: 0,     mission: null,    uptime: '—'      },
]

export function listRobots() { return MOCK_ROBOTS.map((r) => ({ ...r })) }
export function getRobot(id) {
  const r = MOCK_ROBOTS.find((x) => x.id === id)
  if (!r) { const e = new Error('Robot not found'); e.status = 404; throw e }
  return { ...r }
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
