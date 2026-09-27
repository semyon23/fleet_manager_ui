/**
 * Справочники VDA 5050 v3.0.0 для редактора карт (docs/VDA5050_EN.md).
 * Только данные: типы зон, предопределённые action, enum'ы полей.
 * В UI слово "VDA5050" не показываем — это внутреннее знание.
 */

export const BLOCKING_TYPES = ['NONE', 'SINGLE', 'SOFT', 'HARD']

export const BLOCKING_HINTS = {
  NONE: 'Driving and other actions allowed',
  SINGLE: 'Driving allowed, no parallel actions',
  SOFT: 'No driving, parallel actions allowed',
  HARD: 'No driving, no parallel actions',
}

// === Зоны (6.4.1, 7.6) ===
// category: 'contour' — вход/выход по контуру робота с грузом,
//           'kinematic' — по кинематическому центру.
// fields: какие параметры зоны обязательны для типа (имена как в zoneSet JSON).
export const ZONE_TYPES = [
  {
    value: 'BLOCKED', label: 'Blocked', color: '#dc2626', category: 'contour', fields: [],
    hint: 'Robots must not enter. Entering stops the robot with a critical error.',
  },
  {
    value: 'LINE_GUIDED', label: 'Line guided', color: '#2563eb', category: 'contour', fields: [],
    hint: 'No free navigation: robots follow edge trajectories only.',
  },
  {
    value: 'RELEASE', label: 'Release', color: '#ea580c', category: 'contour', fields: ['releaseLossBehavior'],
    hint: 'Robots enter only after the fleet control grants access.',
  },
  {
    value: 'COORDINATED_REPLANNING', label: 'Coordinated replanning', color: '#7c3aed', category: 'contour', fields: [],
    hint: 'Robots may change their path here only with permission.',
  },
  {
    value: 'SPEED_LIMIT', label: 'Speed limit', color: '#ca8a04', category: 'contour', fields: ['maximumSpeed'],
    hint: 'Robots must not exceed the maximum speed inside.',
  },
  {
    value: 'ACTION', label: 'Action', color: '#059669', category: 'contour',
    fields: ['entryActions', 'duringActions', 'exitActions'],
    hint: 'Robots run actions when entering, crossing or leaving.',
  },
  {
    value: 'PRIORITY', label: 'Priority', color: '#0d9488', category: 'kinematic', fields: ['priorityFactor'],
    hint: 'Path planning prefers this area.',
  },
  {
    value: 'PENALTY', label: 'Penalty', color: '#db2777', category: 'kinematic', fields: ['penaltyFactor'],
    hint: 'Path planning avoids this area when possible.',
  },
  {
    value: 'DIRECTED', label: 'One-way', color: '#0284c7', category: 'kinematic',
    fields: ['direction', 'directedLimitation'],
    hint: 'Robots travel in one direction only.',
  },
  {
    value: 'BIDIRECTED', label: 'Two-way lane', color: '#4f46e5', category: 'kinematic',
    fields: ['direction', 'bidirectedLimitation'],
    hint: 'Robots travel along the direction or its opposite only.',
  },
]

export function zoneTypeMeta(type) {
  return ZONE_TYPES.find((z) => z.value === type) || ZONE_TYPES[0]
}

export const ZONE_RELEASE_LOSS = ['STOP', 'CONTINUE', 'EVACUATE']
export const DIRECTED_LIMITATIONS = ['SOFT', 'RESTRICTED', 'STRICT']
export const BIDIRECTED_LIMITATIONS = ['SOFT', 'RESTRICTED']

// Значения по умолчанию при создании зоны / смене типа.
export function zoneDefaults(type) {
  switch (type) {
    case 'RELEASE': return { releaseLossBehavior: 'STOP' }
    case 'SPEED_LIMIT': return { maximumSpeed: 0.5 }
    case 'ACTION': return { entryActions: [], duringActions: [], exitActions: [] }
    case 'PRIORITY': return { priorityFactor: 0.5 }
    case 'PENALTY': return { penaltyFactor: 0.5 }
    case 'DIRECTED': return { direction: 0, directedLimitation: 'RESTRICTED' }
    case 'BIDIRECTED': return { direction: 0, bidirectedLimitation: 'RESTRICTED' }
    default: return {}
  }
}

// Все поля, специфичные для типа. При смене типа лишние удаляем.
export const ZONE_TYPE_FIELDS = [
  'maximumSpeed', 'entryActions', 'duringActions', 'exitActions', 'releaseLossBehavior',
  'priorityFactor', 'penaltyFactor', 'direction', 'directedLimitation', 'bidirectedLimitation',
]

// === Предопределённые action (таблица 4) ===
// scopes — где action допустим: instant / node / edge / zone.
// params — рекомендуемые параметры: { key, type: 'string'|'number'|'array', optional }.
export const PREDEFINED_ACTIONS = [
  { type: 'startPause', scopes: ['instant'] },
  { type: 'stopPause', scopes: ['instant'] },
  { type: 'startHibernation', scopes: ['instant'], params: [{ key: 'wakeUpTime', type: 'string', optional: true }] },
  { type: 'stopHibernation', scopes: ['instant'] },
  { type: 'shutdown', scopes: ['instant'] },
  { type: 'startCharging', scopes: ['instant', 'node'] },
  { type: 'stopCharging', scopes: ['instant', 'node'] },
  {
    type: 'initializePosition', scopes: ['instant', 'node'],
    params: [
      { key: 'x', type: 'number' }, { key: 'y', type: 'number' }, { key: 'theta', type: 'number' },
      { key: 'mapId', type: 'string' }, { key: 'lastNodeId', type: 'string' },
    ],
  },
  { type: 'enableMap', scopes: ['instant', 'node'], params: [{ key: 'mapId', type: 'string' }, { key: 'mapVersion', type: 'string' }] },
  {
    type: 'downloadMap', scopes: ['instant'],
    params: [
      { key: 'mapId', type: 'string' }, { key: 'mapVersion', type: 'string' },
      { key: 'mapDownloadLink', type: 'string' }, { key: 'mapHash', type: 'string', optional: true },
    ],
  },
  { type: 'deleteMap', scopes: ['instant'], params: [{ key: 'mapId', type: 'string' }, { key: 'mapVersion', type: 'string' }] },
  {
    type: 'downloadZoneSet', scopes: ['instant'],
    params: [
      { key: 'zoneSetId', type: 'string' }, { key: 'zoneSetDownloadLink', type: 'string' },
      { key: 'zoneSetHash', type: 'string', optional: true },
    ],
  },
  { type: 'enableZoneSet', scopes: ['instant', 'node'], params: [{ key: 'zoneSetId', type: 'string' }] },
  { type: 'deleteZoneSet', scopes: ['instant'], params: [{ key: 'zoneSetId', type: 'string' }] },
  { type: 'clearInstantActions', scopes: ['instant', 'node'] },
  { type: 'clearZoneActions', scopes: ['instant', 'node'] },
  { type: 'stateRequest', scopes: ['instant'] },
  { type: 'logReport', scopes: ['instant'], params: [{ key: 'reason', type: 'string' }] },
  {
    type: 'pick', scopes: ['node', 'edge'],
    params: [
      { key: 'lhd', type: 'string', optional: true }, { key: 'stationType', type: 'string', optional: true },
      { key: 'stationName', type: 'string', optional: true }, { key: 'loadType', type: 'string', optional: true },
      { key: 'loadId', type: 'string', optional: true }, { key: 'height', type: 'number', optional: true },
      { key: 'depth', type: 'number', optional: true }, { key: 'side', type: 'string', optional: true },
    ],
  },
  {
    type: 'drop', scopes: ['node', 'edge'],
    params: [
      { key: 'lhd', type: 'string', optional: true }, { key: 'stationType', type: 'string', optional: true },
      { key: 'stationName', type: 'string', optional: true }, { key: 'loadType', type: 'string', optional: true },
      { key: 'loadId', type: 'string', optional: true }, { key: 'height', type: 'number', optional: true },
      { key: 'depth', type: 'number', optional: true },
    ],
  },
  { type: 'detectObject', scopes: ['node', 'edge', 'zone'], params: [{ key: 'objectType', type: 'string', optional: true }] },
  {
    type: 'finePositioning', scopes: ['node', 'edge', 'zone'],
    params: [{ key: 'stationType', type: 'string', optional: true }, { key: 'stationName', type: 'string', optional: true }],
  },
  { type: 'waitForTrigger', scopes: ['node', 'zone'], params: [{ key: 'triggerType', type: 'array' }] },
  { type: 'trigger', scopes: ['instant'] },
  { type: 'retry', scopes: ['instant'], params: [{ key: 'actionId', type: 'string' }] },
  { type: 'skipRetry', scopes: ['instant'], params: [{ key: 'actionId', type: 'string' }] },
  { type: 'cancelOrder', scopes: ['instant'], params: [{ key: 'orderId', type: 'string', optional: true }] },
  { type: 'factsheetRequest', scopes: ['instant'] },
  {
    type: 'updateCertificate', scopes: ['instant'],
    params: [
      { key: 'service', type: 'string' }, { key: 'keyDownloadLink', type: 'string' },
      { key: 'certificateDownloadLink', type: 'string' },
      { key: 'certificateAuthorityDownloadLink', type: 'string', optional: true },
    ],
  },
]

export function actionsForScope(scope) {
  return PREDEFINED_ACTIONS.filter((a) => a.scopes.includes(scope))
}

export function predefinedAction(type) {
  return PREDEFINED_ACTIONS.find((a) => a.type === type) || null
}

// === Рёбра (7.3) ===
export const ORIENTATION_TYPES = ['TANGENTIAL', 'GLOBAL']
export const CORRIDOR_REFERENCE_POINTS = ['KINEMATIC_CENTER', 'CONTOUR']
export const CORRIDOR_RELEASE_LOSS = ['STOP', 'RETURN']

// === Значения параметров action ===
// Параметр может быть любым JSON. В поле ввода — текст: пытаемся распознать
// true/false, число, массив/объект; иначе строка.
export function parseParamValue(text) {
  if (typeof text !== 'string') return text
  const t = text.trim()
  if (t === '') return ''
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t)
  const quoted = t.length >= 2 && t.startsWith('"') && t.endsWith('"')
  if (quoted || (t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
    try { return JSON.parse(t) } catch { /* остаётся строкой */ }
  }
  return text
}

// Строку, которая иначе распозналась бы как число/bool/JSON, показываем в кавычках,
// чтобы после редактирования она осталась строкой.
export function formatParamValue(value) {
  if (typeof value === 'string') return parseParamValue(value) === value ? value : JSON.stringify(value)
  if (value === undefined || value === null) return ''
  return JSON.stringify(value)
}
