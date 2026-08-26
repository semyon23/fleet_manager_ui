/**
 * Единая палитра проекта. Использовать везде вместо hard-coded hex.
 *
 * Ссылки: цветовая семантика взята из HikVision MonitorClient
 * (Референсы/monitorclient/bin/MapBK/MapEle/) — green=charge/queue,
 * red=parking, purple=infrastructure, orange=warning.
 */

// === Общая палитра проекта ===
export const COLORS = {
  brand: {
    50:  '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  slate: {
    50:  '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    900: '#0f172a',
  },
  status: {
    moving:   '#22c55e',
    charging: '#eab308',
    idle:     '#64748b',
    error:    '#ef4444',
    offline:  '#94a3b8',
  },
  accent: {
    orange: '#f97316',
    red:    '#dc2626',
    green:  '#059669',
    blue:   '#2563eb',
  },
}

// === Станции: цвет + иконка по типу ===
// Используется в Map Editor'е (#override-node) и Live Map.
export const STATION_KINDS = [
  { label: 'Charge',  value: 'charge',  color: '#059669', icon: 'bolt' },
  { label: 'Loading', value: 'loading', color: '#ea580c', icon: 'loading' },
  { label: 'Parking', value: 'parking', color: '#dc2626', icon: 'p' },
  { label: 'Custom',  value: 'custom',  color: '#2563eb', icon: 'star' },
]
export function stationKindMeta(kind) {
  return STATION_KINDS.find((k) => k.value === kind) || STATION_KINDS[3]
}
export function stationColorFor(kind) {
  return stationKindMeta(kind).color
}
export function stationIconFor(kind) {
  return stationKindMeta(kind).icon
}

// === Ноды waypoint по умолчанию ===
export const WAYPOINT = {
  color:       '#94a3b8',   // slate-400
  colorHover:  '#6b7280',   // slate-500
  colorSelect: '#f97316',   // orange-500
  radius:      8,
  strokeWidth: 0,
  strokeColor: '#ffffff',
}

// === Edges ===
export const EDGE = {
  color:       '#9ca3af',
  colorHover:  '#6b7280',
  colorSelect: '#f97316',
  width:       2,
  widthHover:  3,
  dasharray:   '10 8',
  animationSpeed: 30,
}

// === Grid ===
export const GRID = {
  line:  { color: '#e5e7eb', width: 1, dasharray: 1 },
  thick: { color: '#9ca3af', width: 1, dasharray: 0 },
}
