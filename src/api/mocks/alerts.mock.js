// Демо-алерты убраны 2026-08-31: пустой список пока бэк не поднимет стрим.
const MOCK_ALERTS = []

export function listAlerts() { return MOCK_ALERTS.map((a) => ({ ...a })) }
export function ackAlert(id) {
  const a = MOCK_ALERTS.find((x) => x.id === id)
  if (!a) { const e = new Error('Alert not found'); e.status = 404; throw e }
  a.acknowledged = true
  return { ...a }
}
