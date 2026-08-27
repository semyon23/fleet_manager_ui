const MOCK_ALERTS = [
  { id: 'A-001', severity: 'error',   robotId: 'amr-05', message: 'Obstacle detected, halted', code: 'OBSTACLE', createdAt: '2026-08-27T10:15:00Z', acknowledged: false },
  { id: 'A-002', severity: 'warning', robotId: 'amr-02', message: 'Battery below 40%',          code: 'LOW_BAT',  createdAt: '2026-08-27T10:10:00Z', acknowledged: false },
  { id: 'A-003', severity: 'info',    robotId: 'amr-01', message: 'Mission M-104 started',      code: 'MISSION',  createdAt: '2026-08-27T09:45:00Z', acknowledged: true  },
  { id: 'A-004', severity: 'error',   robotId: null,     message: 'MQTT broker disconnected',   code: 'BROKER',   createdAt: '2026-08-27T09:00:00Z', acknowledged: false },
]

export function listAlerts() { return MOCK_ALERTS.map((a) => ({ ...a })) }
export function ackAlert(id) {
  const a = MOCK_ALERTS.find((x) => x.id === id)
  if (!a) { const e = new Error('Alert not found'); e.status = 404; throw e }
  a.acknowledged = true
  return { ...a }
}
