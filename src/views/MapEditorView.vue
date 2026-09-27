<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, reactive, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapsStore } from '../stores/maps'
import { pixelToWorld, worldToPixel } from '../lib/nav2meta'
import { exportNav2GeoJson, downloadJson } from '../lib/exportGeoJson'
import { exportLif } from '../lib/exportLif'
import { exportLifMulti } from '../lib/exportLifMulti'
import { parseLif } from '../lib/importLif'
import { validateMap } from '../lib/validateMap'
import { graphConfigs } from '../lib/graphConfig'
import * as api from '../api'
import { STATION_KINDS, stationColorFor, stationIconFor, WAYPOINT, GRID_DARK } from '../lib/theme'
import { useSequentialIds } from '../composables/useSequentialIds'
import { useAxisTicks } from '../composables/useAxisTicks'
import ActionListEditor from '../components/editor/ActionListEditor.vue'
import ZonePanel from '../components/editor/ZonePanel.vue'
import EdgePanel from '../components/editor/EdgePanel.vue'
import { ZONE_TYPES, zoneTypeMeta, zoneDefaults } from '../lib/vda5050'
import { buildZoneSet, edgeLengthMeters, nodeLookup } from '../lib/vdaLayout'
import { cornerAt, roundCorner } from '../lib/roadEdit'
import {
  pointInPolygon, signedArea, centroid, rectFromCorners, corridorPolygonPx, pointsAttr,
  worldAngleToSvgDeg, radToDeg, degToRad, normalizeAngle,
  unitVector, sampleSegment, arcThrough3, arcTangent, arcEndDirection, sampleArc, arcPoint, arcFixedRadius, filletCorner, clampArcSweep,
  snapDirection, snapToRay,
} from '../lib/geometry'
import { useTheme } from '../composables/useTheme'
import {
  NButton,
  NInput,
  NInputNumber,
  NSwitch,
  NDropdown,
  NModal,
  NTabs,
  NTabPane,
  NTag,
  useMessage,
} from 'naive-ui'

const route = useRoute()
const router = useRouter()
const store = useMapsStore()
const msg = useMessage()
const { isDark } = useTheme()

const map = computed(() => store.get(route.params.id))

const nodes = reactive({})
const edges = reactive({})
const layouts = reactive({ nodes: {} })
const selectedNodes = ref([])
const selectedEdges = ref([])
const graph = ref(null)

// Инструменты (соответствуют toolbar-иконкам сверху)
const tool = ref('select') // 'select' | 'node' | 'edge' | 'station'
const fastCreate = ref(true)
const doubleWay = ref(false)

// Search в левой панели
const search = ref('')

// Visibility toggles
const showGrid = ref(true)
const showLabels = ref(true)
const showBackground = ref(true)  // SLAM PGM подложка
// showNodes / showEdges убраны — computed-обёртка ломала реактивность
// v-network-graph. При необходимости показ можно сделать через configs.opacity.
const gridInterval = ref(1)
const snapToGrid = ref(false)
// Sequential IDs — вынесено в composables/useSequentialIds
const { sequentialIds, newNodeId, newStationId } = useSequentialIds(map)

// Округляет пиксельные (u, v) координаты к ближайшей вершине сетки.
// Шаг сетки в метрах = gridInterval, конвертируется в пиксели через meta.resolution.
function snapUV(u, v) {
  if (!snapToGrid.value || !map.value?.meta) return { u, v }
  const stepPx = gridInterval.value / map.value.meta.resolution
  if (!stepPx || stepPx < 0.001) return { u, v }
  return {
    u: Math.round(u / stepPx) * stepPx,
    v: Math.round(v / stepPx) * stepPx,
  }
}

// Edge draft (для tool='edge' — держим первую выбранную ноду)
let pendingEdgeStart = null

// Calibration draft (для tool='calibrate' — держим первую точку)
const pendingCalibrationStart = ref(null)  // { u, v }
// Ссылка на overlay-линию во время калибровки — рисуется в SVG слое поверх графа

// Копипаст: копируем выделенное в JS-переменную (не в system clipboard,
// чтобы работало offline и не требовало permissions). Paste ставит клон
// со сдвигом offset пиксельным и обновляет ID через nextNodeId/nextStationId.
const clipboardItems = ref({ waypoints: [], stations: [], edges: [] })
const PASTE_OFFSET_PX = 20  // ~1м при resolution=0.05

// Preview JSON модалка
const showPreview = ref(false)
const previewTab = ref('geojson')
const showHelp = ref(false)  // ? cheatsheet
const SHORTCUTS = [
  { keys: 'V', desc: 'Roam / Select — pan by drag, click node to select' },
  { keys: 'N', desc: 'Node — single point' },
  { keys: 'B', desc: 'Batch Points — chain of standalone points' },
  { keys: 'L', desc: 'Batch Lines — polyline (point + edge to previous)' },
  { keys: 'W', desc: 'Road — click points; every turn is rounded with radius R (empty R — sharp corners); Shift — 15° steps' },
  { keys: 'A', desc: 'Arc / turn up to 90° — Radius set: turn of that radius, angle in 15° steps (Shift — any); Radius empty: the click sets the turn' },
  { keys: 'Esc / Enter', desc: 'Finish the road' },
  { keys: 'E', desc: 'Edge — connect two existing nodes' },
  { keys: 'S', desc: 'Station' },
  { keys: 'Z', desc: 'Zone — click corners; click the first corner, double-click or Enter to finish' },
  { keys: 'R', desc: 'Rectangle zone — two opposite corners' },
  { keys: 'Backspace', desc: 'While drawing a zone — remove the last corner' },
  { keys: 'M', desc: 'Box select — rectangle-select nodes' },
  { keys: 'O', desc: 'Set Origin — click sets world (0, 0)' },
  { keys: 'K', desc: 'Calibrate — 2 clicks + meters → recompute m/px' },
  { keys: 'Del', desc: 'Delete selection' },
  { keys: 'Esc', desc: 'Clear selection / cancel draft edge or zone' },
  { keys: 'Ctrl+Z', desc: 'Undo' },
  { keys: 'Ctrl+Y or Ctrl+Shift+Z', desc: 'Redo' },
  { keys: 'Ctrl+C', desc: 'Copy selected nodes' },
  { keys: 'Ctrl+V', desc: 'Paste with offset' },
  { keys: '?', desc: 'This help' },
]
const previewGeoJson = computed(() => {
  if (!map.value) return ''
  try { return JSON.stringify(exportNav2GeoJson(map.value), null, 2) }
  catch (e) { return `// error: ${e.message}` }
})
const previewLif = computed(() => {
  if (!map.value) return ''
  try { return JSON.stringify(exportLif(map.value), null, 2) }
  catch (e) { return `// error: ${e.message}` }
})
const previewZoneSet = computed(() => {
  if (!map.value) return ''
  try { return JSON.stringify(buildZoneSet(map.value), null, 2) }
  catch (e) { return `// error: ${e.message}` }
})
const validation = computed(() => {
  if (!map.value) return { errors: [], warnings: [] }
  return validateMap(map.value)
})

// === Undo/Redo — shallow snapshot ===
// Все мутации в store делаются через spread `[...arr, new]` или `.map(...)` —
// новые массивы, а не изменённые старые. Значит достаточно сохранять
// ссылки на массивы, а не deep-copy каждого элемента. При 500 нодах это
// экономит ~5мс на снапшоте (deep clone был O(n) на каждый push).
// Плюс dedup: если ссылки не изменились — не пушим лишний снапшот.
const history = ref([])
const historyIdx = ref(-1)
const HISTORY_LIMIT = 50

function snapshotFromMap(m) {
  return {
    waypoints: m.waypoints,
    edges: m.edges,
    stations: m.stations || [],
    zones: m.zones || [],
  }
}
function snapshotsEqual(a, b) {
  return a && b &&
    a.waypoints === b.waypoints &&
    a.edges === b.edges &&
    a.stations === b.stations &&
    a.zones === b.zones
}
function pushHistory() {
  if (!map.value) return
  const snap = snapshotFromMap(map.value)
  const prev = history.value[historyIdx.value]
  if (snapshotsEqual(prev, snap)) return  // ничего не поменялось
  history.value = history.value.slice(0, historyIdx.value + 1)
  history.value.push(snap)
  historyIdx.value = history.value.length - 1
  if (history.value.length > HISTORY_LIMIT) {
    history.value.shift()
    historyIdx.value--
  }
}
function undo() {
  if (historyIdx.value <= 0) return
  historyIdx.value--
  applySnapshot(history.value[historyIdx.value])
}
function redo() {
  if (historyIdx.value >= history.value.length - 1) return
  historyIdx.value++
  applySnapshot(history.value[historyIdx.value])
}
function applySnapshot(snap) {
  if (!map.value) return
  // Передаём ссылки как есть — store сам сделает новый spread при апдейте
  store.update(map.value.id, {
    waypoints: snap.waypoints,
    edges: snap.edges,
    stations: snap.stations,
    zones: snap.zones,
  })
  if (selectedZoneId.value && !snap.zones.some((z) => z.id === selectedZoneId.value)) selectedZoneId.value = null
  syncFromStore()
}

// STATION_KINDS/stationColorFor/stationIconFor теперь в lib/theme.js (единая палитра)
const nextStationKind = ref('charge')

// === sync store <-> v-network-graph ===
function syncFromStore() {
  if (!map.value) return
  const wpIds = new Set(map.value.waypoints.map((w) => w.id))
  const stationIds = new Set((map.value.stations || []).map((s) => s.id))
  const edgeIds = new Set(map.value.edges.map((e) => e.id))
  const allIds = new Set([...wpIds, ...stationIds])

  for (const id of Object.keys(edges)) if (!edgeIds.has(id)) delete edges[id]
  for (const id of Object.keys(nodes)) if (!allIds.has(id)) delete nodes[id]
  for (const id of Object.keys(layouts.nodes)) if (!allIds.has(id)) delete layouts.nodes[id]

  for (const wp of map.value.waypoints) addNodeToGraph(wp)
  for (const s of map.value.stations || []) addStationToGraph(s)
  for (const e of map.value.edges) addEdgeToGraph(e)
}

// === Interactions ===
function eventToLayout(evt) {
  const nativeEvt = evt?.event
  if (!nativeEvt || !graph.value) return null
  try {
    // v-network-graph ожидает offset (клиентские координаты относительно SVG-target)
    return graph.value.translateFromDomToSvgCoordinates({
      x: nativeEvt.offsetX,
      y: nativeEvt.offsetY,
    })
  } catch { return null }
}

function onViewClick(evt) {
  if (!map.value) return
  // Клик, завершивший перетаскивание вершины зоны, — не клик по пустому месту
  if (Date.now() - lastZoneDragEnd < 300) return
  const pos = eventToLayout(evt)
  if (!pos) return
  // Origin и Calibrate работают с сырыми pixel-координатами (не snap)
  if (tool.value === 'set-origin') {
    handleSetOrigin(pos.x, pos.y)
    return
  }
  if (tool.value === 'calibrate') {
    handleCalibrateClick(pos.x, pos.y)
    return
  }
  const snapped = snapUV(pos.x, pos.y)
  const u = snapped.u, v = snapped.v

  if (isPathTool(tool.value)) {
    shiftHeld.value = !!evt.event?.shiftKey
    const near = nearestNode(pos.x, pos.y, NODE_SNAP_PX / (zoomLevel.value || 1))
    onPathClick(near ? pathPoint(near.x, near.y, near.id) : pathPoint(u, v))
  } else if (tool.value === 'zone' || tool.value === 'zone-rect') {
    addZoneDraftPoint(u, v)
  } else if (tool.value === 'node' || tool.value === 'batch-points' || tool.value === 'batch-lines') {
    createNodeAt(u, v)
  } else if (tool.value === 'station') {
    createStationAt(u, v)
  } else if (tool.value === 'select') {
    selectedNodes.value = []
    selectedEdges.value = []
    selectedZoneId.value = zoneAt(pos.x, pos.y)
  }
}

// === Set Origin: тычок мыши = сюда мы кладём world (0, 0) ===
// Формула: pixelToWorld(meta, u, v, H) = (0, 0)
//   0 = origin.x + u * resolution → origin.x = -u * resolution
//   0 = origin.y + (H - v) * resolution → origin.y = -(H - v) * resolution
function handleSetOrigin(u, v) {
  if (!map.value) return
  const res = map.value.meta.resolution
  const H = map.value.height
  const newOrigin = [
    -u * res,
    -(H - v) * res,
    map.value.meta.origin[2] || 0,
  ]
  store.updateMeta(map.value.id, { origin: newOrigin })
  msg.success(`Origin set: (${newOrigin[0].toFixed(3)}, ${newOrigin[1].toFixed(3)}) m`)
  tool.value = 'select'
}

// Reset origin в левый-нижний угол карты — стандарт ROS/Nav2 для новой карты
function resetOriginBottomLeft() {
  if (!map.value) return
  store.updateMeta(map.value.id, { origin: [0, 0, map.value.meta.origin[2] || 0] })
  msg.success('Origin reset to lower-left corner of the map')
}

// === Calibrate: два клика → диалог "введи реальное расстояние в метрах" ===
// resolution пересчитывается: newRes = realMeters / pixelDistance
function handleCalibrateClick(u, v) {
  if (!pendingCalibrationStart.value) {
    pendingCalibrationStart.value = { u, v }
    msg.info('Click the second point — a known distance')
    return
  }
  const a = pendingCalibrationStart.value
  const dx = u - a.u
  const dy = v - a.v
  const pixDist = Math.sqrt(dx * dx + dy * dy)
  pendingCalibrationStart.value = null
  if (pixDist < 3) {
    msg.error('Points are too close — calibration cancelled')
    return
  }
  const input = prompt(
    `Distance between points: ${pixDist.toFixed(1)} px\n\n` +
    `Enter the REAL distance in meters:`
  )
  if (input === null) return
  const meters = parseFloat(input.replace(',', '.'))
  if (!isFinite(meters) || meters <= 0) {
    msg.error('Invalid number')
    return
  }
  const newRes = meters / pixDist
  store.updateMeta(map.value.id, { resolution: newRes })
  msg.success(
    `Resolution calibrated: ${newRes.toFixed(5)} m/px ` +
    `(was ${map.value.meta.resolution.toFixed(5)})`
  )
  tool.value = 'select'
}

// Точный порядок и deep-clone взяты из эталонного lif_editor
// (layout.controller.ts createNode:376): сначала nodes[id], потом layouts.nodes[id].
// JSON.parse(JSON.stringify(...)) даёт plain object без Vue-proxy, чтобы
// v-network-graph гарантированно перевычислил normal.color для новой ноды.
function addNodeToGraph(wp) {
  // Цвет узла не задаём — его берёт конфиг графа по теме
  nodes[wp.id] = JSON.parse(JSON.stringify({
    name: wp.name || wp.id,
    __kind: 'waypoint',
  }))
  layouts.nodes[wp.id] = { x: wp.u, y: wp.v }
}
function addStationToGraph(s) {
  nodes[s.id] = JSON.parse(JSON.stringify({
    name: s.name || s.id,
    color: stationColorFor(s.kind),
    __kind: 'station',
    __stationKind: s.kind,
    __stationIcon: stationIconFor(s.kind),
  }))
  layouts.nodes[s.id] = { x: s.u, y: s.v }
}
function addEdgeToGraph(e) {
  edges[e.id] = JSON.parse(JSON.stringify({
    source: e.from, target: e.to, name: e.id, cost: e.cost, maxSpeed: e.maxSpeed,
  }))
}

// Определяем нужно ли автосвязывать новую ноду с предыдущей выделенной:
// - batch-lines: всегда да (полилиния)
// - batch-points: всегда нет (только точки)
// - node: как в тумблере Fast Create
function shouldAutoConnect() {
  if (tool.value === 'batch-lines') return true
  if (tool.value === 'batch-points') return false
  return fastCreate.value
}

function createNodeAt(u, v) {
  const id = newNodeId()
  const wp = { id, u, v, name: id, description: '', mapId: '' }

  // Собираем возможные edges для fast-create
  const addedEdges = []
  if (shouldAutoConnect() && selectedNodes.value.length === 1) {
    const fromId = selectedNodes.value[0]
    const fromExists = map.value.waypoints.some((x) => x.id === fromId) ||
      (map.value.stations || []).some((s) => s.id === fromId)
    if (fromExists) {
      addedEdges.push(makeEdge(fromId, id))
      if (doubleWay.value) addedEdges.push(makeEdge(id, fromId))
    }
  }

  // Store update
  store.update(map.value.id, {
    waypoints: [...map.value.waypoints, wp],
    edges: [...map.value.edges, ...addedEdges],
  })

  // Incremental update reactive нод и edges — БЕЗ полного syncFromStore,
  // чтобы v-network-graph не терял свои внутренние references
  addNodeToGraph(wp)
  for (const e of addedEdges) addEdgeToGraph(e)

  // Selection после того как v-network-graph отрендерит новую ноду
  nextTick(() => { selectedNodes.value = [id] })
  pushHistory()
}

function createStationAt(u, v) {
  const id = newStationId()
  const station = {
    id, u, v, name: id, description: '',
    kind: nextStationKind.value,
    interactionNodeIds: [],
  }
  store.update(map.value.id, { stations: [...(map.value.stations || []), station] })
  addStationToGraph(station)
  nextTick(() => { selectedNodes.value = [id] })
  pushHistory()
}

function makeEdge(fromId, toId) {
  return {
    id: fromId + '_' + toId,
    from: fromId,
    to: toId,
    cost: 0,
    maxSpeed: 1.0,
  }
}

function onNodeClick({ node, event }) {
  if (isPathTool(tool.value)) {
    const p = layouts.nodes[node]
    shiftHeld.value = !!event?.shiftKey
    if (p) onPathClick(pathPoint(p.x, p.y, node))
    return
  }
  if (tool.value === 'zone' || tool.value === 'zone-rect') {
    const p = layouts.nodes[node]
    if (p) addZoneDraftPoint(p.x, p.y)
    return
  }
  if (tool.value === 'edge') {
    if (!pendingEdgeStart) {
      pendingEdgeStart = node
      msg.info('Edge from ' + node + ' — click target')
    } else if (pendingEdgeStart !== node) {
      const eNew = makeEdge(pendingEdgeStart, node)
      const added = [eNew]
      if (doubleWay.value) added.push(makeEdge(node, pendingEdgeStart))
      store.update(map.value.id, { edges: [...map.value.edges, ...added] })
      for (const e of added) addEdgeToGraph(e)
      pendingEdgeStart = null
      pushHistory()
    }
    return
  }
  if ((tool.value === 'node' || tool.value === 'batch-lines') && shouldAutoConnect() && selectedNodes.value.length === 1 && selectedNodes.value[0] !== node) {
    const eNew = makeEdge(selectedNodes.value[0], node)
    const added = [eNew]
    if (doubleWay.value) added.push(makeEdge(node, selectedNodes.value[0]))
    store.update(map.value.id, { edges: [...map.value.edges, ...added] })
    for (const e of added) addEdgeToGraph(e)
    pushHistory()
  }
}

function onNodeDragEnd() {
  if (!map.value) return
  const wUpd = map.value.waypoints.map((wp) => {
    const lp = layouts.nodes[wp.id]
    if (!lp) return wp
    const s = snapUV(lp.x, lp.y)
    if (snapToGrid.value) layouts.nodes[wp.id] = { x: s.u, y: s.v }
    return { ...wp, u: s.u, v: s.v }
  })
  const sUpd = (map.value.stations || []).map((st) => {
    const lp = layouts.nodes[st.id]
    if (!lp) return st
    const s = snapUV(lp.x, lp.y)
    if (snapToGrid.value) layouts.nodes[st.id] = { x: s.u, y: s.v }
    return { ...st, u: s.u, v: s.v }
  })
  store.update(map.value.id, { waypoints: wUpd, stations: sUpd })
  pushHistory()
}

// === Rubber-band multi-select через встроенный v-network-graph API ===
// Одноразовый режим: клик кнопки → следующий drag выделяет ноды в прямоугольнике,
// потом автоматически возвращаемся в normal.
function startBoxSelect() {
  if (!graph.value) return
  try {
    graph.value.startBoxSelection({
      stop: 'pointerup',
      type: 'append',
      withShiftKey: 'invert',
    })
    msg.info('Draw a box to select nodes')
  } catch (e) {
    msg.error('Box selection unavailable: ' + e.message)
  }
}

// === Align tools ===
// Выравнивает выделенные ноды (waypoints и stations) по X (вертикальная линия)
// или по Y (горизонтальная). Точка выравнивания — среднее значение по группе.
function alignSelected(axis /* 'x' | 'y' */) {
  if (!map.value) return
  const ids = new Set(selectedNodes.value)
  if (ids.size < 2) { msg.info('Select at least 2 nodes to align'); return }

  // Собираем текущие позиции из layouts (актуальнее чем из store после drag)
  const positions = [...ids].map((id) => layouts.nodes[id]).filter(Boolean)
  if (!positions.length) return
  const target = axis === 'x'
    ? positions.reduce((s, p) => s + p.x, 0) / positions.length
    : positions.reduce((s, p) => s + p.y, 0) / positions.length

  const wUpd = map.value.waypoints.map((w) => {
    if (!ids.has(w.id)) return w
    return axis === 'x' ? { ...w, u: target } : { ...w, v: target }
  })
  const sUpd = (map.value.stations || []).map((s) => {
    if (!ids.has(s.id)) return s
    return axis === 'x' ? { ...s, u: target } : { ...s, v: target }
  })
  // Синхронизируем layouts сразу чтобы v-network-graph подхватил
  for (const id of ids) {
    const lp = layouts.nodes[id]
    if (lp) layouts.nodes[id] = axis === 'x' ? { x: target, y: lp.y } : { x: lp.x, y: target }
  }
  store.update(map.value.id, { waypoints: wUpd, stations: sUpd })
  pushHistory()
  msg.success(`Aligned ${ids.size} nodes on ${axis.toUpperCase()}`)
}

function copySelected() {
  if (!map.value) return
  const ids = new Set(selectedNodes.value)
  if (!ids.size) { msg.info('Nothing to copy'); return }
  const wps = map.value.waypoints.filter((w) => ids.has(w.id))
  const sts = (map.value.stations || []).filter((s) => ids.has(s.id))
  // Копируем ТОЛЬКО те edges, у которых оба конца попадают в выделение
  const es = map.value.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
  clipboardItems.value = {
    waypoints: wps.map((w) => ({ ...w })),
    stations: sts.map((s) => ({ ...s })),
    edges: es.map((e) => ({ ...e })),
  }
  msg.success(`Copied ${wps.length + sts.length} nodes, ${es.length} edges`)
}
function pasteClipboard() {
  if (!map.value) return
  const clip = clipboardItems.value
  if (!clip.waypoints.length && !clip.stations.length) return
  const idMap = {}  // старый ID → новый
  const newWps = clip.waypoints.map((w) => {
    const nid = newNodeId()
    idMap[w.id] = nid
    return { ...w, id: nid, name: nid, u: w.u + PASTE_OFFSET_PX, v: w.v + PASTE_OFFSET_PX }
  })
  const newSts = clip.stations.map((s) => {
    const nid = newStationId()
    idMap[s.id] = nid
    return { ...s, id: nid, name: nid, u: s.u + PASTE_OFFSET_PX, v: s.v + PASTE_OFFSET_PX }
  })
  const newEdges = clip.edges
    .filter((e) => idMap[e.from] && idMap[e.to])
    .map((e) => ({
      ...e,
      id: idMap[e.from] + '_' + idMap[e.to],
      from: idMap[e.from],
      to: idMap[e.to],
    }))
  store.update(map.value.id, {
    waypoints: [...map.value.waypoints, ...newWps],
    stations: [...(map.value.stations || []), ...newSts],
    edges: [...map.value.edges, ...newEdges],
  })
  for (const w of newWps) addNodeToGraph(w)
  for (const s of newSts) addStationToGraph(s)
  for (const e of newEdges) addEdgeToGraph(e)
  selectedNodes.value = [...newWps.map((w) => w.id), ...newSts.map((s) => s.id)]
  pushHistory()
  msg.success(`Pasted ${newWps.length + newSts.length} nodes, ${newEdges.length} edges`)
}

function deleteSelected() {
  if (!map.value) return
  if (selectedZoneId.value) {
    store.update(map.value.id, { zones: (map.value.zones || []).filter((z) => z.id !== selectedZoneId.value) })
    selectedZoneId.value = null
    pushHistory()
    return
  }
  const nIds = new Set(selectedNodes.value)
  const eIds = new Set(selectedEdges.value)
  if (!nIds.size && !eIds.size) return
  const wps = map.value.waypoints.filter((w) => !nIds.has(w.id))
  const sts = (map.value.stations || []).filter((s) => !nIds.has(s.id))
  const es = map.value.edges.filter((e) => !eIds.has(e.id) && !nIds.has(e.from) && !nIds.has(e.to))
  store.update(map.value.id, { waypoints: wps, edges: es, stations: sts })
  selectedNodes.value = []
  selectedEdges.value = []
  syncFromStore()
  pushHistory()
}

function clearAll() {
  if (!confirm('Delete everything on this map?')) return
  store.update(map.value.id, { waypoints: [], edges: [], stations: [], zones: [] })
  pendingEdgeStart = null
  zoneDraft.value = null
  selectedZoneId.value = null
  selectedNodes.value = []
  selectedEdges.value = []
  syncFromStore()
  pushHistory()
}

// === Grid step перерасчёт в layout-единицы ===
const gridIntervalInLayout = computed(() => {
  const res = map.value?.meta?.resolution || 0.05
  return Math.max(0.5, gridInterval.value / res)
})

// Computed поверх reactive(initialConfigs) — точь-в-точь как эталон
// NetworkGraph.vue:179 dynamicConfigs. Spread копия нужна чтобы v-network-graph
// увидел смену prop и подхватил visibility/grid interval. reactive base
// обеспечивает что normal.color-функция остаётся живой ссылкой.
// Цвета, зависящие от темы: обводка узлов, подписи, сетка.
const nodeStroke = computed(() => (isDark.value ? WAYPOINT.strokeColorDark : WAYPOINT.strokeColor))
const nodeFill = computed(() => (isDark.value ? WAYPOINT.colorDark : WAYPOINT.color))
const nodeFillHover = computed(() => (isDark.value ? WAYPOINT.colorHoverDark : WAYPOINT.colorHover))
const dynamicConfig = computed(() => ({
  ...graphConfigs,
  node: {
    ...graphConfigs.node,
    normal: { ...graphConfigs.node.normal, strokeColor: nodeStroke.value, color: (n) => n.color || nodeFill.value },
    hover: { ...graphConfigs.node.hover, strokeColor: nodeStroke.value, color: (n) => n.color || nodeFillHover.value },
    selected: { ...graphConfigs.node.selected, strokeColor: nodeStroke.value },
    label: {
      ...graphConfigs.node.label,
      visible: showLabels.value,
      color: isDark.value ? '#cbd5e1' : '#374151',
    },
  },
  edge: {
    ...graphConfigs.edge,
    label: { ...graphConfigs.edge.label, visible: showLabels.value },
  },
  view: {
    ...graphConfigs.view,
    grid: {
      ...graphConfigs.view.grid,
      ...(isDark.value ? GRID_DARK : {}),
      visible: showGrid.value,
      interval: gridIntervalInLayout.value,
    },
  },
}))

const eventHandlers = {
  'view:click': onViewClick,
  'view:dblclick': onViewDblClick,
  'node:click': onNodeClick,
  'node:dragend': onNodeDragEnd,
}

const backgroundImage = computed(() =>
  map.value ? {
    href: map.value.pgmDataUrl,
    x: 0, y: 0,
    width: map.value.width,
    height: map.value.height,
  } : null
)

// Метровые линейки — в composables/useAxisTicks (сам стартует и останавливает интервал)
const { xTicks, yTicks, originScreen } = useAxisTicks(graph, map)

// === Zoom controls ===
function zoomIn() {
  try { graph.value?.zoomIn() } catch {}
}
function zoomOut() {
  try { graph.value?.zoomOut() } catch {}
}
// Ставит зум 1:1 — 1 layout unit (1 пиксель карты) = 1 CSS-пиксель на экране.
// setViewBox width = SVG DOM width — тогда viewport покрывает столько unit,
// сколько пикселей у SVG-элемента.
function zoomOneToOne() {
  if (!graph.value) return
  try {
    const sizes = graph.value.getSizes()
    const w = sizes?.width || 800
    const h = sizes?.height || 600
    graph.value.setViewBox({ left: 0, top: 0, right: w, bottom: h })
  } catch {}
}

// === fit-to-map ===
function fitToMap() {
  if (!graph.value || !map.value) return
  const w = map.value.width, h = map.value.height
  try {
    const margin = Math.max(w, h) * 0.05
    graph.value.setViewBox({
      left: -margin,
      top: -margin,
      right: w + margin,
      bottom: h + margin,
    })
  } catch {}
}

// === Экспорт ===
// Проверка перед экспортом. errors → показать модалку с подтверждением
// или отказом. warnings → сообщение, но всё равно выгружаем.
function checkBeforeExport() {
  const v = validateMap(map.value)
  if (v.errors.length) {
    const list = v.errors.slice(0, 8).join('\n• ')
    const more = v.errors.length > 8 ? `\n… and ${v.errors.length - 8} more` : ''
    const ok = confirm(
      `Found ${v.errors.length} errors:\n\n• ${list}${more}\n\nExport anyway?`
    )
    return ok
  }
  if (v.warnings.length) {
    msg.warning(`Exported (${v.warnings.length} warnings — see Preview JSON)`)
  }
  return true
}
function doExportGeoJson() {
  if (!checkBeforeExport()) return
  const g = exportNav2GeoJson(map.value)
  downloadJson(`${map.value.name.replace(/\s+/g, '_')}.geojson`, g)
  msg.success(`Exported ${g.features.length} features`)
}
function doExportLif() {
  if (!checkBeforeExport()) return
  const l = exportLif(map.value)
  downloadJson(`${map.value.name.replace(/\s+/g, '_')}.lif.json`, l)
  msg.success(`Exported LIF ${l.metaInformation.lifVersion}`)
}
function doExportZoneSet() {
  if (!checkBeforeExport()) return
  const zs = buildZoneSet(map.value)
  downloadJson(`${map.value.name.replace(/\s+/g, '_')}.zoneset.json`, zs)
  msg.success(`Exported ${zs.zones.length} zones`)
}
function doExportLifMulti() {
  if (!store.maps.length) return
  const l = exportLifMulti(store.maps)
  downloadJson(`fleet-manager-multi.lif.json`, l)
  msg.success(`Exported multi-layout LIF: ${l.layouts.length} layouts`)
}
// Идёт через API-слой: в mock-режиме локально сохраняет, в real шлёт PATCH /maps/:id
async function saveToBackend() {
  try {
    const patch = {
      name: map.value.name,
      meta: map.value.meta,
      waypoints: map.value.waypoints,
      edges: map.value.edges,
      stations: map.value.stations,
      zones: map.value.zones || [],
      // Готовый zoneSet в метрах — диспетчеру не нужно пересчитывать пиксели
      zoneSet: buildZoneSet(map.value),
    }
    await api.maps.updateMap(map.value.id, patch)
    const mode = api.getMockMode() ? '(mock)' : ''
    msg.success(`Saved ${mode}`.trim())
  } catch (e) {
    if (e instanceof api.ApiError) {
      msg.error(`Save failed: ${e.code} — ${e.message}`)
    } else {
      msg.error('Save failed: ' + (e.message || String(e)))
    }
  }
}

// === Import LIF: подмена nodes/edges/stations на данные из JSON-файла ===
function doImportLif() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const lif = JSON.parse(text)
      const layoutCount = Array.isArray(lif.layouts) ? lif.layouts.length : 0
      let layoutIdx = 0
      if (layoutCount > 1) {
        const names = lif.layouts.map((l, i) => `${i}: ${l.layoutName || l.layoutId || 'layout'}`).join('\n')
        const pick = prompt(
          `File contains ${layoutCount} layouts. Enter the index to import (0..${layoutCount - 1}):\n\n${names}`,
          '0'
        )
        if (pick === null) return
        layoutIdx = Math.max(0, Math.min(layoutCount - 1, parseInt(pick, 10) || 0))
      }
      const parsed = parseLif(lif, map.value, layoutIdx)
      const total = parsed.waypoints.length + parsed.stations.length
      const existing = map.value.waypoints.length + (map.value.stations?.length || 0)
      if (existing > 0 && !confirm(
        `Replace this map's content (layout "${parsed.layoutName || layoutIdx}")?\n\nCurrent: ${existing} nodes/stations.\nInside the file: ${total} (+ ${parsed.edges.length} edges).`
      )) return
      store.update(map.value.id, {
        waypoints: parsed.waypoints,
        edges: parsed.edges,
        stations: parsed.stations,
      })
      syncFromStore()
      pushHistory()
      msg.success(`Imported LIF: ${parsed.waypoints.length} nodes, ${parsed.edges.length} edges, ${parsed.stations.length} stations`)
    } catch (e) {
      msg.error('Import failed: ' + e.message)
    }
  }
  input.click()
}
async function copyToClipboard(text, label) {
  try { await navigator.clipboard.writeText(text); msg.success(`${label} copied`) }
  catch { msg.error('Clipboard denied') }
}

// === Menu bar options ===
const fileMenu = [
  { label: 'Save', key: 'save' },
  { label: 'Preview JSON', key: 'preview' },
  { type: 'divider' },
  { label: 'Import LIF…', key: 'import-lif' },
  { type: 'divider' },
  { label: 'Export Nav2 GeoJSON', key: 'export-geo' },
  { label: 'Export LIF (this map)', key: 'export-lif' },
  { label: 'Export multi-layout LIF (all maps)', key: 'export-lif-multi' },
  { label: 'Export zone set', key: 'export-zones' },
  { type: 'divider' },
  { label: '← Back to Maps', key: 'back' },
]
function onFileMenu(key) {
  if (key === 'save') saveToBackend()
  else if (key === 'preview') showPreview.value = true
  else if (key === 'import-lif') doImportLif()
  else if (key === 'export-geo') doExportGeoJson()
  else if (key === 'export-lif') doExportLif()
  else if (key === 'export-lif-multi') doExportLifMulti()
  else if (key === 'export-zones') doExportZoneSet()
  else if (key === 'back') router.push({ name: 'maps' })
}

const editMenu = [
  { label: 'Undo (Ctrl+Z)', key: 'undo' },
  { label: 'Redo (Ctrl+Y)', key: 'redo' },
  { type: 'divider' },
  { label: 'Delete Selected (Del)', key: 'delete' },
  { label: 'Clear all', key: 'clear' },
]
function onEditMenu(key) {
  if (key === 'undo') undo()
  else if (key === 'redo') redo()
  else if (key === 'delete') deleteSelected()
  else if (key === 'clear') clearAll()
}

const viewMenu = computed(() => [
  { label: (showLabels.value ? '✓ ' : '  ') + 'Labels', key: 'toggle-labels' },
  { label: (showGrid.value ? '✓ ' : '  ') + 'Grid', key: 'toggle-grid' },
  { label: (showBackground.value ? '✓ ' : '  ') + 'SLAM background', key: 'toggle-bg' },
  { label: (showZones.value ? '✓ ' : '  ') + 'Zones', key: 'toggle-zones' },
  { label: (showNodeHints.value ? '✓ ' : '  ') + 'Node orientation & tolerance', key: 'toggle-node-hints' },
  { label: (showCorridors.value ? '✓ ' : '  ') + 'Edge corridors', key: 'toggle-corridors' },
  { type: 'divider' },
  { label: 'Fit to map', key: 'fit' },
  { label: 'Reset origin → lower-left corner', key: 'reset-origin' },
])
function onViewMenu(key) {
  if (key === 'toggle-labels') showLabels.value = !showLabels.value
  else if (key === 'toggle-grid') showGrid.value = !showGrid.value
  else if (key === 'toggle-bg') showBackground.value = !showBackground.value
  else if (key === 'toggle-zones') showZones.value = !showZones.value
  else if (key === 'toggle-node-hints') showNodeHints.value = !showNodeHints.value
  else if (key === 'toggle-corridors') showCorridors.value = !showCorridors.value
  else if (key === 'fit') fitToMap()
  else if (key === 'reset-origin') resetOriginBottomLeft()
}

const helpMenu = [
  { label: 'Keyboard shortcuts (?)', key: 'shortcuts' },
  { label: 'Docs', key: 'docs' },
  { label: 'About', key: 'about' },
]
function onHelpMenu(k) {
  if (k === 'shortcuts') showHelp.value = true
  else if (k === 'docs') msg.info('See docs/ folder in repo')
  else if (k === 'about') msg.info('Fleet Manager · Map Editor · LIF, zone sets, Nav2 GeoJSON')
}

// === Left sidebar lists ===
const filteredWaypoints = computed(() => {
  if (!map.value) return []
  const q = search.value.toLowerCase()
  return map.value.waypoints.filter((w) =>
    !q || w.id.toLowerCase().includes(q) || (w.name || '').toLowerCase().includes(q)
  )
})
const filteredStations = computed(() => {
  if (!map.value) return []
  const q = search.value.toLowerCase()
  return (map.value.stations || []).filter((s) =>
    !q || s.id.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q)
  )
})
const filteredZones = computed(() => {
  if (!map.value) return []
  const q = search.value.toLowerCase()
  return (map.value.zones || []).filter((z) =>
    !q || z.id.toLowerCase().includes(q) || (z.name || '').toLowerCase().includes(q) || z.type.toLowerCase().includes(q)
  )
})
const filteredEdges = computed(() => {
  if (!map.value) return []
  const q = search.value.toLowerCase()
  return map.value.edges.filter((e) => !q || e.id.toLowerCase().includes(q))
})

function selectNode(id) {
  selectedNodes.value = [id]
  selectedEdges.value = []
  tool.value = 'select'
  panToNode(id)
}
function selectEdge(id) {
  selectedEdges.value = [id]
  selectedNodes.value = []
  tool.value = 'select'
  // Панимся к середине edge (усредняем позиции from/to)
  const e = map.value?.edges.find((x) => x.id === id)
  if (e) {
    const a = layouts.nodes[e.from]
    const b = layouts.nodes[e.to]
    if (a && b) panToLayout((a.x + b.x) / 2, (a.y + b.y) / 2)
  }
}
function selectZone(id) {
  selectedZoneId.value = id
  selectedNodes.value = []
  selectedEdges.value = []
  const z = map.value?.zones?.find((x) => x.id === id)
  if (z?.vertices?.length) {
    const c = centroid(z.vertices.map((p) => ({ x: p.u, y: p.v })))
    panToLayout(c.x, c.y)
  }
}
function panToNode(id) {
  const p = layouts.nodes[id]
  if (p) panToLayout(p.x, p.y)
}
// Центрирует viewbox на заданной layout-точке, сохраняя текущий масштаб.
function panToLayout(x, y) {
  if (!graph.value) return
  try {
    const vb = graph.value.getViewBox()
    const w = vb.right - vb.left
    const h = vb.bottom - vb.top
    graph.value.setViewBox({
      left: x - w / 2,
      top: y - h / 2,
      right: x + w / 2,
      bottom: y + h / 2,
    })
  } catch {}
}

// === Right sidebar Edit form ===
const selectedWaypoint = computed(() => {
  if (selectedNodes.value.length !== 1) return null
  return map.value?.waypoints.find((w) => w.id === selectedNodes.value[0]) || null
})
const selectedStation = computed(() => {
  if (selectedNodes.value.length !== 1) return null
  return map.value?.stations?.find((s) => s.id === selectedNodes.value[0]) || null
})
const selectedEdge = computed(() => {
  if (selectedEdges.value.length !== 1) return null
  return map.value?.edges.find((e) => e.id === selectedEdges.value[0]) || null
})

const selectedWorld = computed(() => {
  const n = selectedWaypoint.value || selectedStation.value
  if (!n) return null
  return pixelToWorld(map.value.meta, n.u, n.v, map.value.height)
})
const connectedNodes = computed(() => {
  const n = selectedWaypoint.value || selectedStation.value
  if (!n) return []
  const set = new Set()
  for (const e of map.value.edges) {
    if (e.from === n.id) set.add(e.to)
    if (e.to === n.id) set.add(e.from)
  }
  return [...set]
})

// === Actions на ноде — редактор в components/editor/ActionListEditor.vue ===
function updateWaypointActions(newActions) {
  if (!selectedWaypoint.value) return
  const list = map.value.waypoints.map((w) =>
    w.id === selectedWaypoint.value.id ? { ...w, actions: newActions } : w
  )
  store.update(map.value.id, { waypoints: list })
}

function updateWaypointField(field, val) {
  if (!selectedWaypoint.value) return
  const list = map.value.waypoints.map((w) =>
    w.id === selectedWaypoint.value.id ? { ...w, [field]: val } : w
  )
  store.update(map.value.id, { waypoints: list })
}
function updateStationField(field, val) {
  if (!selectedStation.value) return
  const list = map.value.stations.map((s) =>
    s.id === selectedStation.value.id ? { ...s, [field]: val } : s
  )
  store.update(map.value.id, { stations: list })
  syncFromStore()
}
function updateEdgeField(field, val) {
  if (!selectedEdge.value) return
  const list = map.value.edges.map((e) =>
    e.id === selectedEdge.value.id ? { ...e, [field]: val } : e
  )
  store.update(map.value.id, { edges: list })
}
// Patch от EdgePanel: undefined — удалить необязательный атрибут
function updateEdge(patch) {
  if (!selectedEdge.value) return
  const list = map.value.edges.map((e) => {
    if (e.id !== selectedEdge.value.id) return e
    const next = { ...e, ...patch }
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
    return next
  })
  store.update(map.value.id, { edges: list })
}
const selectedEdgeLength = computed(() => {
  if (!selectedEdge.value || !map.value) return null
  return edgeLengthMeters(map.value, selectedEdge.value, nodeLookup(map.value))
})

// Необязательные атрибуты узла v3. Углы в UI — градусы, в модели — мировые радианы.
function setWaypointOptional(field, value) {
  if (!selectedWaypoint.value) return
  const list = map.value.waypoints.map((w) => {
    if (w.id !== selectedWaypoint.value.id) return w
    const next = { ...w, [field]: value }
    if (value === undefined) delete next[field]
    return next
  })
  store.update(map.value.id, { waypoints: list })
}
const waypointThetaDeg = computed(() =>
  Number.isFinite(selectedWaypoint.value?.theta) ? Number(radToDeg(selectedWaypoint.value.theta).toFixed(1)) : null
)
const waypointAngleTolDeg = computed(() =>
  Number.isFinite(selectedWaypoint.value?.allowedDeviationTheta) ? Number(radToDeg(selectedWaypoint.value.allowedDeviationTheta).toFixed(1)) : null
)
function patchDeviationXY(patch) {
  const cur = selectedWaypoint.value?.allowedDeviationXY || { a: 0.1, b: 0.1, theta: 0 }
  setWaypointOptional('allowedDeviationXY', { ...cur, ...patch })
}

function renameWaypoint(newId) {
  if (!selectedWaypoint.value || !newId || newId === selectedWaypoint.value.id) return
  const safe = newId.trim()
  if (!safe) return
  if (map.value.waypoints.some((w) => w.id === safe) || map.value.stations?.some((s) => s.id === safe)) {
    return msg.error('ID must be unique')
  }
  const oldId = selectedWaypoint.value.id
  const wps = map.value.waypoints.map((w) => (w.id === oldId ? { ...w, id: safe } : w))
  const es = map.value.edges.map((e) => ({
    ...e,
    from: e.from === oldId ? safe : e.from,
    to: e.to === oldId ? safe : e.to,
  }))
  store.update(map.value.id, { waypoints: wps, edges: es })
  selectedNodes.value = [safe]
  syncFromStore()
}
function removeConnectionTo(otherId) {
  const n = selectedWaypoint.value || selectedStation.value
  if (!n) return
  const es = map.value.edges.filter(
    (e) => !((e.from === n.id && e.to === otherId) || (e.to === n.id && e.from === otherId))
  )
  store.update(map.value.id, { edges: es })
  syncFromStore()
}

// === Клавиатура ===
function onKey(e) {
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault(); undo(); return
  }
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault(); redo(); return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    e.preventDefault(); copySelected(); return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    e.preventDefault(); pasteClipboard(); return
  }
  if (zoneDraft.value && e.key === 'Backspace') {
    e.preventDefault()
    zoneDraft.value = { ...zoneDraft.value, points: zoneDraft.value.points.slice(0, -1) }
    if (!zoneDraft.value.points.length) zoneDraft.value = null
    return
  }
  if (zoneDraft.value && e.key === 'Enter') {
    e.preventDefault(); finishZoneDraft(); return
  }
  if (pathDraft.value && (e.key === 'Enter' || e.key === 'Escape')) {
    e.preventDefault(); pathDraft.value = null; return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault(); deleteSelected()
  } else if (e.key === 'Escape') {
    pendingEdgeStart = null
    pendingCalibrationStart.value = null
    if (zoneDraft.value) { zoneDraft.value = null; return }
    selectedNodes.value = []
    selectedEdges.value = []
    selectedZoneId.value = null
  } else if (e.key === 'v') tool.value = 'select'
  else if (e.key === 'z') tool.value = 'zone'
  else if (e.key === 'r') tool.value = 'zone-rect'
  else if (e.key === 'n') tool.value = 'node'
  else if (e.key === 'b') tool.value = 'batch-points'
  else if (e.key === 'l') tool.value = 'batch-lines'
  else if (e.key === 'e') tool.value = 'edge'
  else if (e.key === 'w') tool.value = 'road'
  else if (e.key === 'a') tool.value = 'arc'
  else if (e.key === 's') tool.value = 'station'
  else if (e.key === 'o') tool.value = 'set-origin'
  else if (e.key === 'k') tool.value = 'calibrate'
  else if (e.key === 'm') startBoxSelect()
  else if (e.key === '?') showHelp.value = true
}

onMounted(async () => {
  if (!map.value) { router.replace({ name: 'maps' }); return }
  syncFromStore()
  pushHistory()
  window.addEventListener('keydown', onKey)
  await new Promise((r) => setTimeout(r, 300))
  fitToMap()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})

// Курсор в мировых координатах — через translateFromDomToSvgCoordinates
const cursorWorld = ref(null)
function onGraphMouseMove(evt) {
  if (!map.value || !graph.value) return
  try {
    // Ищем ближайший SVG target — offsetX/Y относительно svg-корня графа
    const svgEl = evt.currentTarget?.querySelector('svg')
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const svgPt = graph.value.translateFromDomToSvgCoordinates({
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
    })
    cursorWorld.value = pixelToWorld(map.value.meta, svgPt.x, svgPt.y, map.value.height)
    cursorLayout.value = zoneDraft.value || pathDraft.value ? snapUV(svgPt.x, svgPt.y) : null
    shiftHeld.value = evt.shiftKey
  } catch {}
}

// Selector карт для переключения
const allMapsOptions = computed(() =>
  store.maps.map((m) => ({ label: m.name, value: m.id }))
)
function switchMap(id) {
  if (id && id !== map.value?.id) router.replace({ name: 'map-editor', params: { id } })
}

const TOOLS = [
  { key: 'select', label: 'Roam / Select (V) — pan by drag, click node to select', icon: 'cursor' },
  { key: 'node', label: 'Node (N)', icon: 'circle' },
  { key: 'batch-points', label: 'Batch Points (B) — chain of standalone nodes, no auto-edges', icon: 'batch-points' },
  { key: 'batch-lines', label: 'Batch Lines (L) — polyline: each click adds node + edge to prev', icon: 'batch-lines' },
  { key: 'road', label: 'Straight road (W)', icon: 'road' },
  { key: 'arc', label: 'Arc / turn (A)', icon: 'arc' },
  { key: 'edge', label: 'Edge (E)', icon: 'arrow' },
  { key: 'station', label: 'Station (S)', icon: 'square' },
  { key: 'zone', label: 'Zone (Z) — click corners; click the first corner, double-click or Enter to finish', icon: 'polygon' },
  { key: 'zone-rect', label: 'Rectangle zone (R) — click two opposite corners', icon: 'zone-rect' },
  { key: 'set-origin', label: 'Set Origin (O) — click sets world (0, 0)', icon: 'origin' },
  { key: 'calibrate', label: 'Calibrate (K) — 2 clicks + meters → recompute m/px', icon: 'ruler' },
]

// ============================================================================
// Дороги: прямая (W) и дуга (A). Вершины ставятся с плотностью nodesPerM по всей длине,
// рёбра — между соседними вершинами. Конец участка становится началом следующего
// вместе с направлением, поэтому прямая → дуга → прямая стыкуются без излома.
// ============================================================================

const nodesPerM = ref(1)                 // узлов на метр дороги (шаг = 1 / nodesPerM м)
// [m] радиус поворотов: W скругляет им каждый поворот дороги, A строит поворот этого радиуса.
// Пусто — у W острые углы, у A радиус задаёт клик.
const turnRadius = ref(2)
// Сколько узлов на дуге (оба конца включены). Пусто — по плотности nodesPerM.
const arcPoints = ref(7)
const ARC_MAX_RAD = Math.PI / 2          // дуга инструмента A — не больше 90°
const NODE_SNAP_PX = 12   // клик ближе этого (в экранных px) к узлу — клик по узлу
const ROAD_SNAP_RAD = degToRad(15)       // Shift — направление кратно 15°
const ROAD_KEEP_RAD = degToRad(4)        // почти по продолжению → строго по продолжению
// Черновик: { start: { x, y, nodeId }, dir: {x, y} | null, end: { x, y, nodeId } | null }
// dir — направление, в котором дорога выходит из start; end — конец дуги по трём точкам.
const pathDraft = ref(null)
const shiftHeld = ref(false)

const isPathTool = (t) => t === 'road' || t === 'arc'
const turnRadiusPx = computed(() => (turnRadius.value > 0 ? turnRadius.value / (map.value?.meta?.resolution || 0.05) : 0))
const roadStepPx = computed(() => Math.max(0.5, 1 / (nodesPerM.value || 1) / (map.value?.meta?.resolution || 0.05)))
const pathPoint = (x, y, nodeId = null) => ({ x, y, nodeId })
const arcSample = (arc) => sampleArc(arc, roadStepPx.value, undefined, arcPoints.value || 0)

// Свободные id для пачки новых узлов: newNodeId() смотрит в store, а он обновится только после commit.
function reserveNodeIds(count) {
  const taken = new Set([...map.value.waypoints.map((w) => w.id), ...(map.value.stations || []).map((s) => s.id)])
  const out = []
  let next = newNodeId()
  while (out.length < count) {
    if (!taken.has(next)) { out.push(next); taken.add(next) }
    const m = next.match(/^n(\d+)$/)
    next = sequentialIds.value && m ? 'n' + String(+m[1] + 1).padStart(3, '0') : newNodeId()
  }
  return out
}

// Направление, в котором дорога выходит из узла: продолжение его единственного ребра.
function nodeTangent(nodeId) {
  const p = layouts.nodes[nodeId]
  if (!p) return null
  const others = new Set()
  for (const e of map.value.edges) {
    if (e.to === nodeId) others.add(e.from)
    if (e.from === nodeId) others.add(e.to)
  }
  if (others.size !== 1) return null
  const q = layouts.nodes[[...others][0]]
  return q ? unitVector(q, p) : null
}

function nearestNode(x, y, maxDist) {
  let best = null
  for (const [id, p] of Object.entries(layouts.nodes)) {
    const d = Math.hypot(p.x - x, p.y - y)
    if (d <= maxDist && (!best || d < best.d)) best = { id, x: p.x, y: p.y, d }
  }
  return best
}

// Поворот в начале нового прямого участка (W с радиусом): дуга между приходящей
// дорогой и участком start → end. null — поворота нет (продолжение прямо или разворот).
function roadTurn(d, end) {
  if (!turnRadiusPx.value || !d.dir || !d.start.nodeId) return null
  const u = unitVector(d.start, end)
  if (!u || u.x * d.dir.x + u.y * d.dir.y > Math.cos(degToRad(1))) return null
  const back = d.straightLen ?? 1e6
  const from = { x: d.start.x - d.dir.x * back, y: d.start.y - d.dir.y * back }
  let f = filletCorner(from, d.start, end, turnRadiusPx.value)
  if (f.error === 'too-big' && f.maxR > 1) f = filletCorner(from, d.start, end, f.maxR * 0.999)
  return f.error ? null : f
}

// Точки участка от start до target. null — участок не определён;
// pending — дуге без направления нужна ещё точка (пока показываем хорду).
function pathSegment(target, shift) {
  const d = pathDraft.value
  if (!d || !target) return null
  if (tool.value === 'road') {
    let end = target
    if (!target.nodeId) {
      const snapped = shift
        ? snapDirection(d.start, target, ROAD_SNAP_RAD)
        : (d.dir && snapToRay(d.start, d.dir, target, ROAD_KEEP_RAD))
      if (snapped) end = pathPoint(snapped.x, snapped.y)
    }
    if (Math.hypot(end.x - d.start.x, end.y - d.start.y) < 1) return null
    const turn = roadTurn(d, end)
    return {
      points: sampleSegment(d.start, end, roadStepPx.value),
      end,
      dir: unitVector(d.start, end),
      // Для превью: как участок будет выглядеть после скругления поворота
      preview: turn ? [...arcSample(turn.arc), ...sampleSegment(turn.t2, end, roadStepPx.value).slice(1)] : null,
      radiusPx: turn?.arc.r,
      sweep: turn?.arc.sweep,
      turn: !!turn,
    }
  }
  // Заданный радиус: сторона поворота — по курсору, угол кратен 15° (Shift — любой).
  // Без направления сначала кликают, куда робот выезжает из начальной точки.
  if (turnRadiusPx.value) {
    if (!d.dir) return { points: [d.start, target], end: target, pending: true }
    const fixed = arcFixedRadius(d.start, d.dir, target, turnRadiusPx.value, shift ? 0 : ROAD_SNAP_RAD, ARC_MAX_RAD)
    if (!fixed) return null
    const e = arcPoint(fixed, 1)
    return {
      points: arcSample(fixed),
      end: pathPoint(e.x, e.y),
      dir: arcEndDirection(fixed),
      radiusPx: fixed.r,
      sweep: fixed.sweep,
    }
  }
  if (!d.dir && !d.end) return { points: [d.start, target], end: target, pending: true }
  const raw = d.dir ? arcTangent(d.start, d.dir, target) : arcThrough3(d.start, target, d.end)
  if (!raw) return null
  const arc = clampArcSweep(raw, ARC_MAX_RAD)
  const clamped = arc !== raw
  const e = arcPoint(arc, 1)
  return {
    points: arcSample(arc),
    end: clamped ? pathPoint(e.x, e.y) : (d.dir ? target : d.end),
    dir: arcEndDirection(arc),
    radiusPx: arc.r,
    sweep: arc.sweep,
  }
}

function onPathClick(p) {
  const d = pathDraft.value
  if (!d) {
    pathDraft.value = { start: p, dir: p.nodeId ? nodeTangent(p.nodeId) : null, end: null }
    selectedZoneId.value = null
    return
  }
  if (tool.value === 'arc' && !d.dir && turnRadiusPx.value) {
    const dir = unitVector(d.start, p)
    if (dir) pathDraft.value = { ...d, dir }
    return
  }
  if (tool.value === 'arc' && !d.dir && !d.end) {
    if (Math.hypot(p.x - d.start.x, p.y - d.start.y) >= 1) pathDraft.value = { ...d, end: p }
    return
  }
  const seg = pathSegment(p, shiftHeld.value)
  if (!seg) {
    if (tool.value === 'arc') msg.info('The point is straight ahead — use Straight road (W)')
    return
  }
  const endId = commitPath(seg.points, d.start, seg.end)
  let straightLen = tool.value === 'road' ? Math.hypot(seg.end.x - d.start.x, seg.end.y - d.start.y) : 0
  if (seg.turn) straightLen -= roundTurnAt(d.start.nodeId)
  pushHistory()
  pathDraft.value = { start: pathPoint(seg.end.x, seg.end.y, endId), dir: seg.dir, end: null, straightLen }
}

// Скругляет поворот дороги в узле радиусом turnRadius (или меньшим, если прямые короткие).
// Возвращает, сколько прямой съела дуга с каждой стороны (px).
function roundTurnAt(nodeId) {
  const c = cornerAt(map.value, nodeId)
  if (!c) return 0
  const res = map.value.meta.resolution
  const r = Math.min(turnRadiusPx.value, c.maxRPx)
  if (r < turnRadiusPx.value - 0.5) msg.warning(`Turn radius reduced to ${(r * res).toFixed(2)} m — the road is too short`)
  const out = roundCorner(map.value, nodeId, r, roadStepPx.value, reserveNodeIds, arcPoints.value || 0)
  if (out.error) return 0
  store.update(map.value.id, { waypoints: out.waypoints, edges: out.edges })
  syncFromStore()
  return r / Math.tan(c.theta / 2)
}

// Создаёт узлы и рёбра по точкам участка; концы — существующие узлы (nodeId) или новые.
// Возвращает id последнего узла.
function commitPath(points, start, end) {
  const pts = [start, ...points.slice(1, -1), end]
  const ids = reserveNodeIds(pts.filter((p) => !p.nodeId).length)
  const newWps = []
  const chain = pts.map((p) => {
    if (p.nodeId) return p.nodeId
    const id = ids.shift()
    newWps.push({ id, u: p.x, v: p.y, name: id, description: '', mapId: '' })
    return id
  })
  const existing = new Set(map.value.edges.map((e) => e.id))
  const newEdges = []
  const add = (from, to) => {
    const e = makeEdge(from, to)
    if (from === to || existing.has(e.id)) return
    existing.add(e.id)
    newEdges.push(e)
  }
  for (let i = 1; i < chain.length; i++) {
    add(chain[i - 1], chain[i])
    if (doubleWay.value) add(chain[i], chain[i - 1])
  }
  store.update(map.value.id, {
    waypoints: [...map.value.waypoints, ...newWps],
    edges: [...map.value.edges, ...newEdges],
  })
  for (const w of newWps) addNodeToGraph(w)
  for (const e of newEdges) addEdgeToGraph(e)
  const last = chain[chain.length - 1]
  nextTick(() => { selectedNodes.value = [last] })
  return last
}

// Прямая ↔ дуга продолжают ту же цепочку, другие инструменты её сбрасывают
watch(tool, (t, prev) => {
  if (isPathTool(t) && isPathTool(prev) && pathDraft.value) pathDraft.value = { ...pathDraft.value, end: null }
  else pathDraft.value = null
})

const pathPreview = computed(() => {
  const d = pathDraft.value
  if (!d || !isPathTool(tool.value)) return null
  const cur = cursorLayout.value
  const seg = cur ? pathSegment(pathPoint(cur.u, cur.v), shiftHeld.value) : null
  const res = map.value.meta.resolution
  let lengthM = 0
  if (seg) for (let i = 1; i < seg.points.length; i++) {
    lengthM += Math.hypot(seg.points[i].x - seg.points[i - 1].x, seg.points[i].y - seg.points[i - 1].y) * res
  }
  return {
    start: d.start,
    anchor: d.end,
    polyline: seg ? (seg.preview || seg.points).map((p) => `${p.x},${p.y}`).join(' ') : '',
    dots: seg && !seg.pending ? (seg.preview || seg.points) : [],
    pending: !!seg?.pending,
    lengthM,
    radiusM: seg?.radiusPx ? seg.radiusPx * res : null,
    turnDeg: seg?.sweep ? Math.round(Math.abs(radToDeg(seg.sweep))) : null,
  }
})

const pathToolHint = computed(() => {
  if (!isPathTool(tool.value)) return ''
  const d = pathDraft.value
  const pv = pathPreview.value
  if (!d) return tool.value === 'road' ? 'click the start point or a node' : 'click the start point or the end of a road'
  const len = pv?.lengthM ? `${pv.lengthM.toFixed(2)} m` : ''
  if (tool.value === 'road') {
    const turn = pv?.radiusM ? `turn R ${pv.radiusM.toFixed(2)} m · ${pv.turnDeg}° · ` : ''
    return `${turn}${len} — click to place · Shift — 15° steps · Esc — finish`
  }
  const r = pv?.radiusM ? `R ${pv.radiusM.toFixed(2)} m · ${pv.turnDeg}° · ${len}` : ''
  if (turnRadiusPx.value) {
    if (!d.dir) return 'click the direction the robot leaves the start point'
    return `${r} — move to the side of the turn, click · Shift — any angle · Esc — finish`
  }
  if (d.dir) return `${r} — click the end of the turn · Esc — finish`
  if (!d.end) return 'click the end of the turn'
  return `${r} — click a point the arc passes through`
})

// --- Скругление угла в выбранном узле (lib/roadEdit.js) ---
// Угол ищется вдоль прямых участков дороги, поэтому радиус ограничен их длиной, а не шагом вершин.
const filletRadius = ref(2)   // [m]

const cornerInfo = computed(() => {
  const w = selectedWaypoint.value
  if (!w || !map.value) return null
  const c = cornerAt(map.value, w.id)
  return c ? { maxR: c.maxRPx * map.value.meta.resolution, deg: Math.round(radToDeg(Math.PI - c.theta)) } : null
})

function roundSelectedCorner() {
  const w = selectedWaypoint.value
  if (!w) return
  const res = map.value.meta.resolution
  const r = roundCorner(map.value, w.id, (filletRadius.value || 0) / res, roadStepPx.value, reserveNodeIds, arcPoints.value || 0)
  if (r.error === 'too-big') {
    msg.error(`Radius is too big for this corner — max ${(r.maxRPx * res).toFixed(2)} m`)
    return
  }
  if (r.error) return
  store.update(map.value.id, { waypoints: r.waypoints, edges: r.edges })
  syncFromStore()
  pushHistory()
  msg.success(`Corner rounded: R ${Number(filletRadius.value).toFixed(2)} m`)
}

// ============================================================================
// Зоны (VDA 5050 v3, 6.4): рисование, выбор, перетаскивание вершин, отрисовка
// ============================================================================

const selectedZoneId = ref(null)
const nextZoneType = ref('BLOCKED')
// Черновик: { kind: 'poly' | 'rect', points: [{ u, v }] }
const zoneDraft = ref(null)
const cursorLayout = ref(null)   // курсор в пикселях карты, пока рисуем зону
const zoomLevel = ref(1)
const showZones = ref(true)
const showNodeHints = ref(true)
const showCorridors = ref(true)
let lastZoneDragEnd = 0

const selectedZone = computed(() =>
  selectedZoneId.value ? (map.value?.zones || []).find((z) => z.id === selectedZoneId.value) || null : null
)

// Выбор узла/ребра снимает выбор зоны
watch([selectedNodes, selectedEdges], ([n, e]) => {
  if (n.length || e.length) selectedZoneId.value = null
})
// Смена инструмента или карты сбрасывает черновик
watch(tool, () => { zoneDraft.value = null })
watch(() => route.params.id, () => { zoneDraft.value = null; selectedZoneId.value = null })

function newZoneId() {
  const existing = new Set((map.value?.zones || []).map((z) => z.id))
  let max = 0
  for (const id of existing) {
    const m = id.match(/^z(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return 'z' + String(max + 1).padStart(3, '0')
}

// Зона под точкой: самая маленькая из содержащих (чтобы достать вложенную)
function zoneAt(u, v) {
  if (!showZones.value) return null
  let best = null
  let bestArea = Infinity
  for (const z of map.value?.zones || []) {
    const poly = (z.vertices || []).map((p) => ({ x: p.u, y: p.v }))
    if (poly.length < 3 || !pointInPolygon({ x: u, y: v }, poly)) continue
    const a = Math.abs(signedArea(poly))
    if (a < bestArea) { best = z.id; bestArea = a }
  }
  return best
}

function addZoneDraftPoint(u, v) {
  const kind = tool.value === 'zone-rect' ? 'rect' : 'poly'
  if (!zoneDraft.value) {
    zoneDraft.value = { kind, points: [{ u, v }] }
    selectedZoneId.value = null
    return
  }
  const pts = zoneDraft.value.points
  if (kind === 'rect') {
    zoneDraft.value = { kind, points: [pts[0], { u, v }] }
    finishZoneDraft()
    return
  }
  // Клик рядом с первой вершиной замыкает полигон
  const first = pts[0]
  const tol = 10 / (zoomLevel.value || 1)
  if (pts.length >= 3 && Math.hypot(u - first.u, v - first.v) < tol) {
    finishZoneDraft()
    return
  }
  zoneDraft.value = { kind, points: [...pts, { u, v }] }
}

// Браузер шлёт dblclick и на два быстрых клика по РАЗНЫМ углам — тогда это не
// "завершить", а просто быстрое рисование. Завершаем, только если два последних
// клика легли в одну точку.
function onViewDblClick() {
  const d = zoneDraft.value
  if (d?.kind !== 'poly' || d.points.length < 4) return
  const [p, q] = d.points.slice(-2)
  if (Math.hypot(p.u - q.u, p.v - q.v) < 4 / (zoomLevel.value || 1)) finishZoneDraft()
}

function finishZoneDraft() {
  const d = zoneDraft.value
  if (!d || !map.value) return
  let vertices
  if (d.kind === 'rect') {
    if (d.points.length < 2) return
    const [a, b] = d.points
    if (Math.abs(a.u - b.u) < 1 || Math.abs(a.v - b.v) < 1) {
      msg.error('Rectangle is too small')
      zoneDraft.value = null
      return
    }
    vertices = rectFromCorners({ x: a.u, y: a.v }, { x: b.u, y: b.v }).map((p) => ({ u: p.x, v: p.y }))
  } else {
    // Двойной клик добавляет две одинаковые точки — убираем почти совпадающие соседние
    vertices = []
    for (const p of d.points) {
      const prev = vertices[vertices.length - 1]
      if (!prev || Math.hypot(p.u - prev.u, p.v - prev.v) > 0.5) vertices.push(p)
    }
    const f = vertices[0]
    const l = vertices[vertices.length - 1]
    if (vertices.length > 1 && Math.hypot(f.u - l.u, f.v - l.v) < 0.5) vertices.pop()
    if (vertices.length < 3) {
      msg.error('A zone needs at least 3 corners')
      return
    }
  }
  const zone = { id: newZoneId(), type: nextZoneType.value, name: '', vertices, ...zoneDefaults(nextZoneType.value) }
  store.update(map.value.id, { zones: [...(map.value.zones || []), zone] })
  zoneDraft.value = null
  cursorLayout.value = null
  selectedNodes.value = []
  selectedEdges.value = []
  selectedZoneId.value = zone.id
  pushHistory()
}

function updateZone(next) {
  if (!map.value) return
  store.update(map.value.id, { zones: (map.value.zones || []).map((z) => (z.id === next.id ? next : z)) })
}
function updateZoneWithHistory(next) {
  updateZone(next)
  pushHistory()
}

// --- Перетаскивание вершин / всей зоны ---
const mainRef = ref(null)
const dragVertices = ref(null)   // вершины выбранной зоны во время drag
let dragState = null

function clientToLayout(clientX, clientY) {
  const svgEl = mainRef.value?.querySelector('svg')
  if (!svgEl || !graph.value) return null
  const rect = svgEl.getBoundingClientRect()
  try {
    return graph.value.translateFromDomToSvgCoordinates({ x: clientX - rect.left, y: clientY - rect.top })
  } catch { return null }
}

function startZoneDrag(evt, mode, index) {
  const z = selectedZone.value
  const start = clientToLayout(evt.clientX, evt.clientY)
  if (!z || !start) return
  dragState = { mode, index, start, orig: z.vertices.map((p) => ({ ...p })) }
  dragVertices.value = dragState.orig
  window.addEventListener('pointermove', onZoneDragMove)
  window.addEventListener('pointerup', onZoneDragEnd, { once: true })
}

function onZoneDragMove(evt) {
  if (!dragState) return
  const p = clientToLayout(evt.clientX, evt.clientY)
  if (!p) return
  if (dragState.mode === 'vertex') {
    const s = snapUV(p.x, p.y)
    dragVertices.value = dragState.orig.map((q, i) => (i === dragState.index ? { u: s.u, v: s.v } : q))
  } else {
    // Сдвиг всей зоны: привязываем к сетке первую вершину, остальные — тем же сдвигом
    const du = p.x - dragState.start.x
    const dv = p.y - dragState.start.y
    const a = dragState.orig[0]
    const s = snapUV(a.u + du, a.v + dv)
    dragVertices.value = dragState.orig.map((q) => ({ u: q.u + (s.u - a.u), v: q.v + (s.v - a.v) }))
  }
}

function onZoneDragEnd() {
  window.removeEventListener('pointermove', onZoneDragMove)
  if (dragState && dragVertices.value && selectedZone.value) {
    const changed = dragVertices.value.some((p, i) => p.u !== dragState.orig[i].u || p.v !== dragState.orig[i].v)
    if (changed) updateZoneWithHistory({ ...selectedZone.value, vertices: dragVertices.value })
  }
  dragState = null
  dragVertices.value = null
  lastZoneDragEnd = Date.now()
}

// Клик по середине стороны — новая вершина там
function insertZoneVertex(afterIdx) {
  const z = selectedZone.value
  if (!z) return
  const a = z.vertices[afterIdx]
  const b = z.vertices[(afterIdx + 1) % z.vertices.length]
  const vertices = [...z.vertices]
  vertices.splice(afterIdx + 1, 0, { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 })
  updateZoneWithHistory({ ...z, vertices })
  lastZoneDragEnd = Date.now()
}

onBeforeUnmount(() => window.removeEventListener('pointermove', onZoneDragMove))

// --- Данные для отрисовки ---
const zoneShapes = computed(() => {
  if (!showZones.value || !map.value) return []
  return (map.value.zones || []).map((z) => {
    const verts = z.id === selectedZoneId.value && dragVertices.value ? dragVertices.value : z.vertices
    const poly = verts.map((p) => ({ x: p.u, y: p.v }))
    const meta = zoneTypeMeta(z.type)
    const xs = poly.map((p) => p.x)
    const ys = poly.map((p) => p.y)
    const span = poly.length ? Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 0
    return {
      id: z.id,
      type: z.type,
      color: meta.color,
      label: z.name || meta.label,
      points: pointsAttr(poly),
      center: poly.length >= 3 ? centroid(poly) : poly[0] || { x: 0, y: 0 },
      selected: z.id === selectedZoneId.value,
      arrow: (z.type === 'DIRECTED' || z.type === 'BIDIRECTED')
        ? { deg: worldAngleToSvgDeg(z.direction), half: Math.max(6, span * 0.3), both: z.type === 'BIDIRECTED' }
        : null,
      dashed: z.type === 'RELEASE' || z.type === 'COORDINATED_REPLANNING',
      hatched: z.type === 'BLOCKED',
    }
  })
})

const selectedZoneHandles = computed(() => {
  const z = selectedZone.value
  if (!z || zoneDraft.value || !showZones.value) return null
  const verts = dragVertices.value || z.vertices
  return {
    color: zoneTypeMeta(z.type).color,
    vertices: verts,
    midpoints: verts.map((p, i) => {
      const q = verts[(i + 1) % verts.length]
      return { u: (p.u + q.u) / 2, v: (p.v + q.v) / 2 }
    }),
    center: centroid(verts.map((p) => ({ x: p.u, y: p.v }))),
  }
})

const draftShape = computed(() => {
  const d = zoneDraft.value
  if (!d) return null
  const color = zoneTypeMeta(nextZoneType.value).color
  const cur = cursorLayout.value
  if (d.kind === 'rect') {
    const a = d.points[0]
    const b = cur || a
    return { color, rect: { x: Math.min(a.u, b.u), y: Math.min(a.v, b.v), w: Math.abs(a.u - b.u), h: Math.abs(a.v - b.v) }, points: d.points }
  }
  const pts = [...d.points, ...(cur ? [cur] : [])]
  return { color, polyline: pts.map((p) => `${p.u},${p.v}`).join(' '), points: d.points }
})

const corridorShapes = computed(() => {
  if (!showCorridors.value || !map.value) return []
  const res = map.value.meta.resolution
  const out = []
  for (const e of map.value.edges) {
    const c = e.corridor
    if (!c) continue
    const a = layouts.nodes[e.from]
    const b = layouts.nodes[e.to]
    if (!a || !b) continue
    const poly = corridorPolygonPx(a, b, (c.leftWidth || 0) / res, (c.rightWidth || 0) / res)
    if (poly.length) out.push({ id: e.id, points: pointsAttr(poly), selected: selectedEdges.value.includes(e.id) })
  }
  return out
})

const nodeHints = computed(() => {
  if (!showNodeHints.value || !map.value) return []
  const res = map.value.meta.resolution
  const out = []
  for (const w of map.value.waypoints) {
    const p = layouts.nodes[w.id]
    if (!p) continue
    const d = w.allowedDeviationXY
    const hasTheta = Number.isFinite(w.theta)
    if (!d && !hasTheta) continue
    out.push({
      id: w.id,
      x: p.x,
      y: p.y,
      ellipse: d ? { rx: Math.max(0, d.a || 0) / res, ry: Math.max(0, d.b || 0) / res, deg: worldAngleToSvgDeg(d.theta) } : null,
      headingDeg: hasTheta ? worldAngleToSvgDeg(w.theta) : null,
      selected: selectedNodes.value.includes(w.id),
    })
  }
  return out
})

const zoneToolHint = computed(() => {
  if (tool.value !== 'zone' && tool.value !== 'zone-rect') return ''
  const d = zoneDraft.value
  if (tool.value === 'zone-rect') return d ? 'click the opposite corner' : 'click the first corner'
  if (!d) return 'click the first corner'
  return d.points.length < 3
    ? `${d.points.length} corner(s) — keep clicking`
    : `${d.points.length} corners — click the first corner, double-click or Enter to finish`
})

</script>

<template>
  <div v-if="!map" class="grid place-items-center py-20 text-slate-500 dark:text-slate-400">Loading map…</div>

  <div v-else class="editor-root flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <!-- Menu bar -->
    <div class="flex h-9 shrink-0 items-center gap-1 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm">
      <NDropdown trigger="click" :options="fileMenu" @select="onFileMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">File</button>
      </NDropdown>
      <NDropdown trigger="click" :options="editMenu" @select="onEditMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Edit</button>
      </NDropdown>
      <NDropdown trigger="click" :options="viewMenu" @select="onViewMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">View</button>
      </NDropdown>
      <NDropdown trigger="click" :options="helpMenu" @select="onHelpMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Help</button>
      </NDropdown>

      <div class="mx-3 h-4 w-px bg-slate-200 dark:bg-slate-700" />

      <select
        class="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-xs"
        :value="map.id"
        @change="switchMap($event.target.value)"
      >
        <option v-for="m in allMapsOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>
      <span class="font-mono text-[10px] text-slate-500 dark:text-slate-400">
        {{ map.width }}×{{ map.height }} px
      </span>
      <span
        class="cursor-pointer font-mono text-[10px] text-slate-500 dark:text-slate-400 hover:text-brand-800 dark:hover:text-brand-400"
        title="Click to reset origin to the lower-left corner"
        @click="resetOriginBottomLeft"
      >
        · {{ Number(map.meta.resolution).toFixed(5) }} m/px
        · origin ({{ Number(map.meta.origin[0] || 0).toFixed(2) }},
                   {{ Number(map.meta.origin[1] || 0).toFixed(2) }})
      </span>

      <div class="flex-1" />

      <div class="font-mono text-[11px] text-slate-500 dark:text-slate-400">
        <span v-if="cursorWorld">
          cursor · {{ cursorWorld.x.toFixed(2) }} m, {{ cursorWorld.y.toFixed(2) }} m
        </span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex min-h-11 shrink-0 flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3">
      <button
        v-for="t in TOOLS"
        :key="t.key"
        :class="[
          'tool-btn',
          tool === t.key ? 'active' : '',
        ]"
        :title="t.label"
        @click="tool = t.key; pendingEdgeStart = null; pendingCalibrationStart.value = null"
      >
        <svg v-if="t.icon === 'cursor'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.5 18 2.4-8.1L21 10.5 3 3z"/></svg>
        <svg v-if="t.icon === 'circle'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
        <svg v-if="t.icon === 'batch-points'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="5" r="2.2"/><circle cx="12" cy="9" r="2.2"/><circle cx="19" cy="6" r="2.2"/><circle cx="7" cy="16" r="2.2"/><circle cx="16" cy="19" r="2.2"/></svg>
        <svg v-if="t.icon === 'batch-lines'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18L9 8l4 6 7-10"/><circle cx="4" cy="18" r="1.6" fill="currentColor"/><circle cx="9" cy="8" r="1.6" fill="currentColor"/><circle cx="13" cy="14" r="1.6" fill="currentColor"/><circle cx="20" cy="4" r="1.6" fill="currentColor"/></svg>
        <svg v-if="t.icon === 'road'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19L20 5"/><circle cx="4" cy="19" r="1.8" fill="currentColor"/><circle cx="9.3" cy="14.3" r="1.8" fill="currentColor"/><circle cx="14.7" cy="9.7" r="1.8" fill="currentColor"/><circle cx="20" cy="5" r="1.8" fill="currentColor"/></svg>
        <svg v-if="t.icon === 'arc'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V13a9 9 0 019-9h7"/><circle cx="4" cy="20" r="1.8" fill="currentColor"/><circle cx="6.6" cy="7.6" r="1.8" fill="currentColor"/><circle cx="20" cy="4" r="1.8" fill="currentColor"/></svg>
        <svg v-if="t.icon === 'arrow'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <svg v-if="t.icon === 'square'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
        <svg v-if="t.icon === 'polygon'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9l7-5 9 4-2 11-12 1z" fill="currentColor" fill-opacity="0.2"/></svg>
        <svg v-if="t.icon === 'zone-rect'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="1" fill="currentColor" fill-opacity="0.2"/></svg>
        <svg v-if="t.icon === 'origin'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>
        <svg v-if="t.icon === 'ruler'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20L20 4"/><path d="M8 16L6 18M11 13L9 15M14 10L12 12M17 7L15 9"/></svg>
      </button>

      <label v-if="tool === 'zone' || tool === 'zone-rect'" class="ml-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300" title="Type of the next zone">
        <span class="inline-block h-3 w-3 rounded-sm" :style="{ background: zoneTypeMeta(nextZoneType).color }"></span>
        <select v-model="nextZoneType" class="rounded border border-slate-200 dark:border-slate-700 px-1 py-0.5 text-xs">
          <option v-for="t in ZONE_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </label>

      <label v-if="tool === 'road' || (tool === 'arc' && !arcPoints)" class="ml-1 flex items-center whitespace-nowrap gap-1.5 text-xs text-slate-600 dark:text-slate-300" title="Nodes per meter of road (0.5 — a node every 2 m)">
        Nodes
        <input
          type="number" min="0.01" max="20" step="1"
          :value="nodesPerM"
          @change="nodesPerM = Math.min(20, Math.max(0.01, Number($event.target.value) || 1)); $event.target.value = nodesPerM"
          class="w-14 rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 font-mono text-[10px] focus:border-brand-800 focus:outline-none"
        />
        <span class="text-[10px] text-slate-500 dark:text-slate-400">per m</span>
      </label>
      <label v-if="tool === 'road' || tool === 'arc'" class="ml-2 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300" title="Turn radius — every turn of the road is rounded with it. Empty — sharp corners">
        R
        <input
          type="number" min="0" max="1000" step="0.5" placeholder="free"
          :value="turnRadius ?? ''"
          @input="turnRadius = $event.target.value === '' ? null : Math.max(0, Number($event.target.value) || 0)"
          class="w-14 rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 font-mono text-[10px] focus:border-brand-800 focus:outline-none"
        />
        <span class="text-[10px] text-slate-500 dark:text-slate-400">m</span>
      </label>
      <label v-if="tool === 'road' || tool === 'arc'" class="ml-2 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300" title="Nodes on every arc, both ends included. Empty — by nodes per meter">
        Arc nodes
        <input
          type="number" min="3" max="100" step="1" placeholder="step"
          :value="arcPoints ?? ''"
          @change="arcPoints = $event.target.value === '' ? null : Math.min(100, Math.max(3, Math.round(Number($event.target.value)) || 3))"
          class="w-12 rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 font-mono text-[10px] focus:border-brand-800 focus:outline-none"
        />
      </label>

      <div class="mx-2 h-6 w-px bg-slate-200 dark:bg-slate-700" />

      <button class="tool-btn" @click="undo" :disabled="historyIdx <= 0" title="Undo (Ctrl+Z)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 010 10h-4"/></svg>
      </button>
      <button class="tool-btn" @click="redo" :disabled="historyIdx >= history.length - 1" title="Redo (Ctrl+Y)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l4-4-4-4"/><path d="M19 10h-9a5 5 0 000 10h4"/></svg>
      </button>
      <button class="tool-btn text-red-600" @click="deleteSelected" title="Delete (Del)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M6 6v14a2 2 0 002 2h8a2 2 0 002-2V6"/></svg>
      </button>

      <div class="mx-2 h-6 w-px bg-slate-200 dark:bg-slate-700" />

      <button class="tool-btn" @click="startBoxSelect" title="Box select (M) — draw a rectangle to select multiple nodes">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="3 3"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="14" cy="14" r="1.5" fill="currentColor"/></svg>
      </button>

      <!-- Align tools: работают когда выделено >= 2 нод -->
      <button class="tool-btn" @click="alignSelected('x')" :disabled="selectedNodes.length < 2" title="Align vertically (same X — column)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><circle cx="12" cy="6" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="18" r="2" fill="currentColor"/></svg>
      </button>
      <button class="tool-btn" @click="alignSelected('y')" :disabled="selectedNodes.length < 2" title="Align horizontally (same Y — row)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><circle cx="6" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>
      </button>

      <div class="mx-2 h-6 w-px bg-slate-200 dark:bg-slate-700" />

      <button class="tool-btn" :class="{ active: showGrid }" @click="showGrid = !showGrid" title="Toggle grid">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
      </button>
      <button class="tool-btn" :class="{ active: showLabels }" @click="showLabels = !showLabels" title="Toggle labels">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
      </button>
      <button class="tool-btn" @click="fitToMap" title="Fit to map">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/></svg>
      </button>
      <button
        class="tool-btn"
        :class="{ active: showBackground }"
        @click="showBackground = !showBackground"
        title="Toggle SLAM background"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h10"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5-9 9"/>
        </svg>
      </button>
      <button
        class="tool-btn"
        :class="{ active: snapToGrid }"
        @click="snapToGrid = !snapToGrid"
        title="Snap to grid — new points and dragging stick to the grid"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 3v18h18M9 21V9M15 21V15M21 9H9M21 15H15"/>
          <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
        </svg>
      </button>
      <button
        class="tool-btn"
        :class="{ active: sequentialIds }"
        @click="sequentialIds = !sequentialIds"
        title="Sequential IDs (n001, n002...) vs Random"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <text x="12" y="16" text-anchor="middle" font-size="11" font-weight="700" font-family="system-ui, sans-serif" fill="currentColor" stroke="none">#01</text>
        </svg>
      </button>

      <div class="mx-2 h-6 w-px bg-slate-200 dark:bg-slate-700" />

      <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        Fast <NSwitch v-model:value="fastCreate" size="small" />
      </label>
      <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        Double Way <NSwitch v-model:value="doubleWay" size="small" />
      </label>

      <div class="mx-2 h-6 w-px bg-slate-200 dark:bg-slate-700" />

      <div class="flex items-center gap-2 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300" title="Grid step">
        Grid
        <input type="range" min="0.1" max="10" step="0.1" v-model.number="gridInterval" class="w-16 accent-brand-800" />
        <input
          type="number"
          min="0.01" max="1000" step="0.1"
          :value="gridInterval"
          @input="gridInterval = Math.max(0.01, Number($event.target.value) || 0.01)"
          class="w-14 rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:text-slate-200 focus:border-brand-800 focus:outline-none"
        />
        <span class="text-[10px] text-slate-500 dark:text-slate-400">m</span>
      </div>

      <div class="flex-1" />

      <button class="rounded border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800" @click="showPreview = true">Preview JSON</button>
      <button class="rounded bg-brand-800 px-3 py-1 text-xs text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
    </div>

    <!-- Main split: left list | center graph | right form -->
    <div class="flex flex-1 overflow-hidden">
      <!-- LEFT SIDEBAR -->
      <aside class="flex w-64 shrink-0 flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div class="border-b border-slate-100 dark:border-slate-800 p-3">
          <input
            v-model="search"
            type="search"
            placeholder="Search elements…"
            class="w-full rounded border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-brand-800"
          />
        </div>
        <div class="flex-1 overflow-y-auto p-3 text-sm">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Nodes ({{ filteredWaypoints.length }})
          </div>
          <div class="mb-4 flex flex-col gap-0.5">
            <button
              v-for="w in filteredWaypoints"
              :key="w.id"
              :class="[
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition',
                selectedNodes[0] === w.id ? 'bg-brand-50 dark:bg-brand-900/50 text-brand-900 dark:text-brand-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800',
              ]"
              @click="selectNode(w.id)"
            >
              <span class="grid h-3 w-3 place-items-center rounded-full border border-slate-400 dark:border-slate-500"></span>
              <div class="flex flex-1 flex-col overflow-hidden">
                <span class="truncate font-medium">{{ w.name || w.id }}</span>
                <span class="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">{{ w.id }}</span>
              </div>
            </button>
          </div>

          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Stations ({{ filteredStations.length }})
          </div>
          <div class="mb-4 flex flex-col gap-0.5">
            <button
              v-for="s in filteredStations"
              :key="s.id"
              :class="[
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition',
                selectedNodes[0] === s.id ? 'bg-brand-50 dark:bg-brand-900/50 text-brand-900 dark:text-brand-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800',
              ]"
              @click="selectNode(s.id)"
            >
              <span class="h-3 w-3 rounded-sm" :style="`background: ${stationColorFor(s.kind)}`"></span>
              <div class="flex flex-1 flex-col overflow-hidden">
                <span class="truncate font-medium">{{ s.name || s.id }}</span>
                <span class="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">{{ s.kind }} · {{ s.id }}</span>
              </div>
            </button>
          </div>

          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Zones ({{ filteredZones.length }})
          </div>
          <div class="mb-4 flex flex-col gap-0.5">
            <button
              v-for="z in filteredZones"
              :key="z.id"
              :class="[
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition',
                selectedZoneId === z.id ? 'bg-brand-50 dark:bg-brand-900/50 text-brand-900 dark:text-brand-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800',
              ]"
              @click="selectZone(z.id)"
            >
              <span class="h-3 w-3 rounded-sm opacity-80" :style="`background: ${zoneTypeMeta(z.type).color}`"></span>
              <div class="flex flex-1 flex-col overflow-hidden">
                <span class="truncate font-medium">{{ z.name || zoneTypeMeta(z.type).label }}</span>
                <span class="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">{{ zoneTypeMeta(z.type).label }} · {{ z.id }}</span>
              </div>
            </button>
          </div>

          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Edges ({{ filteredEdges.length }})
          </div>
          <div class="flex flex-col gap-0.5">
            <button
              v-for="e in filteredEdges"
              :key="e.id"
              :class="[
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition',
                selectedEdges[0] === e.id ? 'bg-brand-50 dark:bg-brand-900/50 text-brand-900 dark:text-brand-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800',
              ]"
              @click="selectEdge(e.id)"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-500 dark:text-slate-400"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              <span class="truncate font-mono text-[10px]">{{ e.from }} → {{ e.to }}</span>
            </button>
          </div>
        </div>
        <div class="border-t border-slate-100 dark:border-slate-800 px-3 py-2 text-[10px] text-slate-500 dark:text-slate-400">
          {{ (map.waypoints.length + (map.stations || []).length + map.edges.length + (map.zones || []).length) }} items
        </div>
      </aside>

      <!-- CENTER GRAPH -->
      <main ref="mainRef" class="relative flex-1 overflow-hidden bg-white dark:bg-slate-900" @mousemove="onGraphMouseMove">
        <v-network-graph
          ref="graph"
          :nodes="nodes"
          :edges="edges"
          v-model:layouts="layouts"
          v-model:selected-nodes="selectedNodes"
          v-model:selected-edges="selectedEdges"
          v-model:zoom-level="zoomLevel"
          :configs="dynamicConfig"
          :event-handlers="eventHandlers"
          :layers="{ map: 'base', zones: 'base', handles: 'nodes' }"
          class="absolute inset-0"
        >
          <template #map v-if="backgroundImage && showBackground">
            <image
              :href="backgroundImage.href"
              :x="backgroundImage.x"
              :y="backgroundImage.y"
              :width="backgroundImage.width"
              :height="backgroundImage.height"
              opacity="0.55"
              pointer-events="none"
              :style="isDark ? 'filter: invert(1) hue-rotate(180deg)' : null"
            />
          </template>

          <!-- Зоны, коридоры рёбер, допуски узлов — под графом, клики не перехватывают.
               Выбор зоны — hit-test в onViewClick. Размеры подписей/стрелок делим на zoomLevel,
               чтобы на экране они были постоянными (scale из слота при scalingObjects=false — не зум). -->
          <template #zones>
            <g pointer-events="none">
              <defs>
                <pattern id="zone-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#dc2626" stroke-width="2" stroke-opacity="0.35" />
                </pattern>
              </defs>

              <polygon
                v-for="c in corridorShapes" :key="'c-' + c.id"
                :points="c.points"
                fill="#a855f7" :fill-opacity="c.selected ? 0.22 : 0.1"
                stroke="#a855f7" :stroke-opacity="0.6" :stroke-width="1 / zoomLevel" :stroke-dasharray="`${4 / zoomLevel} ${3 / zoomLevel}`"
              />

              <g v-for="z in zoneShapes" :key="'z-' + z.id">
                <polygon
                  :points="z.points"
                  :fill="z.hatched ? 'url(#zone-hatch)' : z.color"
                  :fill-opacity="z.hatched ? 1 : (z.selected ? 0.28 : 0.16)"
                  :stroke="z.color"
                  :stroke-width="(z.selected ? 2.5 : 1.5) / zoomLevel"
                  :stroke-dasharray="z.dashed ? `${6 / zoomLevel} ${4 / zoomLevel}` : null"
                  stroke-linejoin="round"
                />
                <g v-if="z.arrow" :transform="`translate(${z.center.x} ${z.center.y}) rotate(${z.arrow.deg})`" :fill="z.color" :stroke="z.color">
                  <line :x1="-z.arrow.half" y1="0" :x2="z.arrow.half" y2="0" :stroke-width="3 / zoomLevel" />
                  <path :d="`M ${z.arrow.half + 8 / zoomLevel} 0 L ${z.arrow.half - 4 / zoomLevel} ${-6 / zoomLevel} L ${z.arrow.half - 4 / zoomLevel} ${6 / zoomLevel} Z`" stroke="none" />
                  <path v-if="z.arrow.both" :d="`M ${-z.arrow.half - 8 / zoomLevel} 0 L ${-z.arrow.half + 4 / zoomLevel} ${-6 / zoomLevel} L ${-z.arrow.half + 4 / zoomLevel} ${6 / zoomLevel} Z`" stroke="none" />
                </g>
                <text
                  v-if="showLabels"
                  :x="z.center.x" :y="z.center.y + (z.arrow ? 14 / zoomLevel : 0) - (z.selected ? 20 / zoomLevel : 0)"
                  text-anchor="middle" dominant-baseline="middle"
                  :font-size="11 / zoomLevel" font-weight="600" font-family="system-ui, sans-serif"
                  :fill="z.color" :stroke="isDark ? '#0f172a' : '#ffffff'" :stroke-width="3 / zoomLevel" paint-order="stroke"
                >{{ z.label }}</text>
              </g>

              <g v-for="h in nodeHints" :key="'h-' + h.id" :transform="`translate(${h.x} ${h.y})`">
                <ellipse
                  v-if="h.ellipse"
                  :rx="h.ellipse.rx" :ry="h.ellipse.ry" :transform="`rotate(${h.ellipse.deg})`"
                  fill="#f97316" :fill-opacity="h.selected ? 0.12 : 0.05"
                  stroke="#f97316" :stroke-opacity="h.selected ? 0.9 : 0.5"
                  :stroke-width="1 / zoomLevel" :stroke-dasharray="`${3 / zoomLevel} ${2 / zoomLevel}`"
                />
                <g v-if="h.headingDeg !== null" :transform="`rotate(${h.headingDeg}) scale(${1 / zoomLevel})`" :fill="isDark ? '#e2e8f0' : '#0f172a'" :stroke="isDark ? '#e2e8f0' : '#0f172a'">
                  <line x1="0" y1="0" x2="18" y2="0" stroke-width="2" />
                  <path d="M 24 0 L 16 -4.5 L 16 4.5 Z" stroke="none" />
                </g>
              </g>

              <!-- Черновик зоны -->
              <g v-if="draftShape">
                <rect
                  v-if="draftShape.rect"
                  :x="draftShape.rect.x" :y="draftShape.rect.y" :width="draftShape.rect.w" :height="draftShape.rect.h"
                  :fill="draftShape.color" fill-opacity="0.15" :stroke="draftShape.color" :stroke-width="1.5 / zoomLevel"
                  :stroke-dasharray="`${5 / zoomLevel} ${3 / zoomLevel}`"
                />
                <polyline
                  v-else
                  :points="draftShape.polyline"
                  :fill="draftShape.color" fill-opacity="0.12" :stroke="draftShape.color" :stroke-width="1.5 / zoomLevel"
                  :stroke-dasharray="`${5 / zoomLevel} ${3 / zoomLevel}`"
                />
                <circle
                  v-for="(p, i) in draftShape.points" :key="'dp' + i"
                  :cx="p.u" :cy="p.v" :r="(i === 0 ? 6 : 4) / zoomLevel"
                  :fill="i === 0 ? '#ffffff' : draftShape.color" :stroke="draftShape.color" :stroke-width="2 / zoomLevel"
                />
              </g>

              <!-- Черновик дороги: участок до курсора и будущие вершины -->
              <g v-if="pathPreview">
                <polyline
                  v-if="pathPreview.polyline"
                  :points="pathPreview.polyline" fill="none" stroke="#2563eb"
                  :stroke-width="2 / zoomLevel" stroke-linecap="round" stroke-linejoin="round"
                  :stroke-dasharray="pathPreview.pending ? `${5 / zoomLevel} ${4 / zoomLevel}` : null"
                  :stroke-opacity="pathPreview.pending ? 0.6 : 0.9"
                />
                <circle
                  v-for="(p, i) in pathPreview.dots" :key="'pp' + i"
                  :cx="p.x" :cy="p.y" :r="3 / zoomLevel"
                  fill="#2563eb" :stroke="isDark ? '#0f172a' : '#ffffff'" :stroke-width="1 / zoomLevel"
                />
                <circle
                  :cx="pathPreview.start.x" :cy="pathPreview.start.y" :r="5 / zoomLevel"
                  fill="none" stroke="#2563eb" :stroke-width="2 / zoomLevel"
                />
                <circle
                  v-if="pathPreview.anchor"
                  :cx="pathPreview.anchor.x" :cy="pathPreview.anchor.y" :r="5 / zoomLevel"
                  fill="none" stroke="#2563eb" :stroke-width="2 / zoomLevel"
                />
              </g>
            </g>
          </template>

          <!-- Ручки выбранной зоны — поверх узлов. pointerdown.prevent гасит и pan графа. -->
          <template #handles>
            <g v-if="selectedZoneHandles">
              <circle
                v-for="(p, i) in selectedZoneHandles.midpoints" :key="'m' + i"
                :cx="p.u" :cy="p.v" :r="4 / zoomLevel"
                :fill="selectedZoneHandles.color" fill-opacity="0.45" stroke="#ffffff" :stroke-width="1 / zoomLevel"
                style="cursor: copy"
                @pointerdown.stop.prevent="insertZoneVertex(i)" @mousedown.stop @click.stop
              >
                <title>Add a corner here</title>
              </circle>
              <circle
                v-for="(p, i) in selectedZoneHandles.vertices" :key="'v' + i"
                :cx="p.u" :cy="p.v" :r="6 / zoomLevel"
                fill="#ffffff" :stroke="selectedZoneHandles.color" :stroke-width="2 / zoomLevel"
                style="cursor: move"
                @pointerdown.stop.prevent="startZoneDrag($event, 'vertex', i)" @mousedown.stop @click.stop
              />
              <g
                :transform="`translate(${selectedZoneHandles.center.x} ${selectedZoneHandles.center.y}) scale(${1 / zoomLevel})`"
                style="cursor: move"
                @pointerdown.stop.prevent="startZoneDrag($event, 'move')" @mousedown.stop @click.stop
              >
                <title>Drag to move the zone</title>
                <circle r="10" fill="#ffffff" :stroke="selectedZoneHandles.color" stroke-width="2" />
                <path d="M0 -6 L0 6 M-6 0 L6 0" :stroke="selectedZoneHandles.color" stroke-width="2" />
              </g>
            </g>
          </template>

          <!-- Кастомный рендер нод: waypoint = круг (дефолт из config),
               station = rounded square + белая иконка типа.
               Реализовано через #override-node — координаты (0,0) уже
               центрированы в позиции ноды через parent <g transform="…"> -->
          <template #override-node="{ nodeId, config }">
            <template v-if="nodes[nodeId]?.__kind === 'station'">
              <rect
                x="-16" y="-16" width="32" height="32" rx="6"
                :fill="nodes[nodeId].color"
                stroke="#ffffff" stroke-width="1.5"
              />
              <!-- Иконка внутри квадрата -->
              <g pointer-events="none" fill="#ffffff" stroke="none">
                <template v-if="nodes[nodeId].__stationIcon === 'bolt'">
                  <path d="M-3 -9 L 4 -1 L 0 -1 L 3 9 L -4 1 L 0 1 Z" />
                </template>
                <template v-else-if="nodes[nodeId].__stationIcon === 'p'">
                  <text x="0" y="5" text-anchor="middle" font-size="16" font-weight="700" font-family="system-ui, sans-serif">P</text>
                </template>
                <template v-else-if="nodes[nodeId].__stationIcon === 'loading'">
                  <path d="M0 -9 L 4 -3 L 1 -3 L 1 3 L 4 3 L 0 9 L -4 3 L -1 3 L -1 -3 L -4 -3 Z" />
                </template>
                <template v-else-if="nodes[nodeId].__stationIcon === 'star'">
                  <polygon points="0,-9 2.6,-2.8 9,-2.8 3.9,1.2 5.9,7.4 0,3.6 -5.9,7.4 -3.9,1.2 -9,-2.8 -2.6,-2.8" />
                </template>
              </g>
            </template>
            <!-- Waypoint (дефолтный кружок из config) -->
            <circle
              v-else
              cx="0" cy="0"
              :r="typeof config.radius === 'function' ? config.radius(nodes[nodeId]) : config.radius"
              :fill="typeof config.color === 'function' ? config.color(nodes[nodeId]) : config.color"
              :stroke="typeof config.strokeColor === 'function' ? config.strokeColor(nodes[nodeId]) : (config.strokeColor || '#ffffff')"
              :stroke-width="typeof config.strokeWidth === 'function' ? config.strokeWidth(nodes[nodeId]) : (config.strokeWidth || 0)"
            />
          </template>
        </v-network-graph>

        <!-- Tool hint -->
        <div class="pointer-events-none absolute bottom-2 right-3 rounded bg-white dark:bg-slate-900 px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 shadow">
          Tool: <span class="font-semibold">{{ TOOLS.find(t => t.key === tool)?.label }}</span>
          <span v-if="pendingEdgeStart" class="ml-2 text-brand-800 dark:text-brand-400">— from {{ pendingEdgeStart }}</span>
          <span v-if="zoneToolHint" class="ml-2 text-brand-800 dark:text-brand-400">— {{ zoneToolHint }}</span>
          <span v-if="pathToolHint" class="ml-2 text-brand-800 dark:text-brand-400">— {{ pathToolHint }}</span>
        </div>

        <!-- Метровая линейка X (сверху) -->
        <div class="pointer-events-none absolute left-0 top-0 h-5 w-full border-b border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <div
            v-for="(t, i) in xTicks"
            :key="'x' + i"
            class="absolute top-0 h-full text-[9px] font-mono text-slate-500 dark:text-slate-400"
            :style="{ left: t.px + 'px' }"
          >
            <div class="absolute top-0 h-2 w-px bg-slate-300 dark:bg-slate-600"></div>
            <div class="absolute left-1 top-1">{{ t.label }}</div>
          </div>
        </div>

        <!-- Метровая линейка Y (слева) -->
        <div class="pointer-events-none absolute left-0 top-0 h-full w-8 border-r border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <div
            v-for="(t, i) in yTicks"
            :key="'y' + i"
            class="absolute left-0 w-full text-[9px] font-mono text-slate-500 dark:text-slate-400"
            :style="{ top: t.py + 'px' }"
          >
            <div class="absolute right-0 top-0 h-px w-2 bg-slate-300 dark:bg-slate-600"></div>
            <div class="absolute left-0.5 -top-1.5">{{ t.label }}</div>
          </div>
        </div>

        <!-- Маркер мировой (0, 0): красный крест + ярлык "(0, 0)". Помогает
             понять, куда сдвинулся Origin относительно карты — все точки
             левее/ниже него получат отрицательные X/Y. -->
        <div
          v-if="originScreen.visible"
          class="pointer-events-none absolute z-10"
          :style="{ left: originScreen.px + 'px', top: originScreen.py + 'px' }"
        >
          <svg viewBox="-10 -10 20 20" width="20" height="20" style="transform: translate(-10px, -10px);">
            <line x1="-8" y1="0" x2="8" y2="0" stroke="#dc2626" stroke-width="1.5" />
            <line x1="0" y1="-8" x2="0" y2="8" stroke="#dc2626" stroke-width="1.5" />
            <circle cx="0" cy="0" r="2" fill="#dc2626" />
          </svg>
          <div class="absolute left-3 top-3 whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-mono text-white shadow">
            (0, 0)
          </div>
        </div>
        <!-- Origin вне viewBox: маленькая стрелка в углу канваса, куда он ушёл -->
        <div
          v-else
          class="pointer-events-none absolute left-10 top-8 z-10 rounded bg-red-600/90 px-2 py-1 text-[10px] font-mono text-white shadow"
        >
          Origin (0, 0) is outside the current view
        </div>

        <!-- Zoom controls -->
        <div class="absolute right-3 top-3 flex flex-col overflow-hidden rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <button class="zoom-btn" @click="zoomIn" title="Zoom in">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="zoom-btn" @click="zoomOut" title="Zoom out">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
          <button class="zoom-btn" @click="zoomOneToOne" title="Zoom 1:1">
            <span class="text-[9px] font-semibold">1:1</span>
          </button>
          <button class="zoom-btn" @click="fitToMap" title="Fit to map">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/></svg>
          </button>
        </div>
      </main>

      <!-- RIGHT SIDEBAR — Edit form -->
      <aside class="flex w-80 shrink-0 flex-col border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <ZonePanel
            v-if="selectedZone"
            :zone="selectedZone"
            :map="map"
            @update="updateZoneWithHistory"
            @delete="deleteSelected"
            @save="saveToBackend"
          />
          <div v-else-if="selectedWaypoint">
            <h3 class="mb-3 text-base font-semibold">Edit Node</h3>
            <div class="flex flex-col gap-3">
              <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                Node Id
                <NInput :value="selectedWaypoint.id" @update:value="renameWaypoint" size="small" />
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                Node Name
                <NInput :value="selectedWaypoint.name || ''" @update:value="(v) => updateWaypointField('name', v)" size="small" />
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                Node Description
                <NInput
                  type="textarea"
                  :value="selectedWaypoint.description || ''"
                  @update:value="(v) => updateWaypointField('description', v)"
                  size="small"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                />
              </label>
              <div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                  Node X (m)
                  <div class="font-mono text-sm text-slate-700 dark:text-slate-200">{{ selectedWorld.x.toFixed(3) }}</div>
                </label>
                <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                  Node Y (m)
                  <div class="font-mono text-sm text-slate-700 dark:text-slate-200">{{ selectedWorld.y.toFixed(3) }}</div>
                </label>
              </div>
              <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                Map Id
                <NInput
                  :value="selectedWaypoint.mapId || ''"
                  @update:value="(v) => updateWaypointField('mapId', v)"
                  size="small"
                  placeholder="e.g. warehouse-f1"
                />
              </label>
              <div>
                <div class="mb-1 text-xs text-slate-500 dark:text-slate-400">Connected Nodes</div>
                <div class="flex flex-wrap gap-1 rounded border border-slate-200 dark:border-slate-700 p-2 min-h-[36px]">
                  <NTag
                    v-for="id in connectedNodes"
                    :key="id"
                    size="small"
                    closable
                    @close="removeConnectionTo(id)"
                  >
                    {{ id }}
                  </NTag>
                  <span v-if="!connectedNodes.length" class="text-[10px] text-slate-400 dark:text-slate-500">Nodes…</span>
                </div>
              </div>
              <div class="rounded border border-slate-200 dark:border-slate-700 p-2">
                <div class="grid grid-cols-2 gap-2">
                  <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400" title="Orientation the robot must reach on this node. Empty — any.">
                    Orientation (°)
                    <NInputNumber
                      :value="waypointThetaDeg" size="small" :step="90" clearable placeholder="any"
                      @update:value="(v) => setWaypointOptional('theta', v === null ? undefined : normalizeAngle(degToRad(v)))"
                    />
                  </label>
                  <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400" title="How precisely the orientation must be matched">
                    Angle tolerance (°)
                    <NInputNumber
                      :value="waypointAngleTolDeg" size="small" :min="0" :max="180" :step="5" clearable placeholder="exact"
                      @update:value="(v) => setWaypointOptional('allowedDeviationTheta', v === null ? undefined : degToRad(v))"
                    />
                  </label>
                </div>
                <label class="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300" title="Ellipse around the node the robot must pass through">
                  Position tolerance
                  <NSwitch
                    size="small" :value="!!selectedWaypoint.allowedDeviationXY"
                    @update:value="(on) => setWaypointOptional('allowedDeviationXY', on ? { a: 0.1, b: 0.1, theta: 0 } : undefined)"
                  />
                </label>
                <div v-if="selectedWaypoint.allowedDeviationXY" class="mt-2 grid grid-cols-3 gap-2">
                  <label class="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Long (m)
                    <NInputNumber :value="selectedWaypoint.allowedDeviationXY.a" size="tiny" :min="0" :step="0.05" :show-button="false"
                                  @update:value="(v) => patchDeviationXY({ a: v ?? 0 })" />
                  </label>
                  <label class="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Short (m)
                    <NInputNumber :value="selectedWaypoint.allowedDeviationXY.b" size="tiny" :min="0" :step="0.05" :show-button="false"
                                  @update:value="(v) => patchDeviationXY({ b: v ?? 0 })" />
                  </label>
                  <label class="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Turn (°)
                    <NInputNumber :value="Number(radToDeg(selectedWaypoint.allowedDeviationXY.theta || 0).toFixed(1))" size="tiny" :step="15" :show-button="false"
                                  @update:value="(v) => patchDeviationXY({ theta: normalizeAngle(degToRad(v ?? 0)) })" />
                  </label>
                </div>
              </div>
              <div v-if="cornerInfo" class="rounded border border-slate-200 dark:border-slate-700 p-2">
                <div class="mb-1 text-xs text-slate-600 dark:text-slate-300" title="Replace the corner with an arc of nodes the robot drives along">
                  Round corner
                </div>
                <div class="flex items-center gap-2">
                  <NInputNumber
                    v-model:value="filletRadius" size="small" :min="0.05" :step="0.25"
                    class="flex-1" placeholder="radius"
                  >
                    <template #suffix>m</template>
                  </NInputNumber>
                  <NButton size="small" type="primary" :disabled="!filletRadius" @click="roundSelectedCorner">Round</NButton>
                </div>
                <div class="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                  Turn {{ cornerInfo.deg }}° · max radius {{ cornerInfo.maxR.toFixed(2) }} m · {{ arcPoints ? `${arcPoints} nodes on the arc` : `${nodesPerM} nodes per m` }}
                </div>
              </div>
              <ActionListEditor scope="node" :actions="selectedWaypoint.actions || []" @update:actions="updateWaypointActions" />
              <div class="mt-2 flex gap-2">
                <button class="flex-1 rounded bg-brand-800 py-2 text-sm text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
                <button class="rounded border border-red-300 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40" @click="deleteSelected">Delete</button>
              </div>
            </div>
          </div>

          <div v-else-if="selectedStation">
            <h3 class="mb-3 text-base font-semibold">Edit Station</h3>
            <div class="flex flex-col gap-3">
              <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                Station Id
                <div class="font-mono text-sm">{{ selectedStation.id }}</div>
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                Name
                <NInput :value="selectedStation.name || selectedStation.id" @update:value="(v) => updateStationField('name', v)" size="small" />
              </label>
              <div>
                <div class="mb-1 text-xs text-slate-500 dark:text-slate-400">Kind</div>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="k in STATION_KINDS"
                    :key="k.value"
                    :class="[
                      'rounded border px-2 py-1 text-xs transition',
                      selectedStation.kind === k.value ? 'border-slate-800 dark:border-brand-500 bg-slate-800 dark:bg-brand-700 text-white' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
                    ]"
                    :style="selectedStation.kind === k.value ? '' : `color: ${k.color}; border-color: ${k.color}`"
                    @click="updateStationField('kind', k.value)"
                  >{{ k.label }}</button>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                  X (m)
                  <div class="font-mono text-sm text-slate-700 dark:text-slate-200">{{ selectedWorld.x.toFixed(3) }}</div>
                </div>
                <div class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                  Y (m)
                  <div class="font-mono text-sm text-slate-700 dark:text-slate-200">{{ selectedWorld.y.toFixed(3) }}</div>
                </div>
              </div>
              <div class="mt-2 flex gap-2">
                <button class="flex-1 rounded bg-brand-800 py-2 text-sm text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
                <button class="rounded border border-red-300 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40" @click="deleteSelected">Delete</button>
              </div>
            </div>
          </div>

          <EdgePanel
            v-else-if="selectedEdge"
            :edge="selectedEdge"
            :length-meters="selectedEdgeLength"
            @update="updateEdge"
            @delete="deleteSelected"
            @save="saveToBackend"
          />

          <div v-else class="text-center text-xs text-slate-400 dark:text-slate-500 py-8">
            <div class="mb-2 text-3xl">◯</div>
            Select a node, station, edge or zone to edit
          </div>
        </div>
      </aside>
    </div>

    <NModal
      v-model:show="showPreview"
      preset="card"
      title="Export preview"
      style="width: 90vw; max-width: 900px"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <NTabs v-model:value="previewTab" type="line">
        <NTabPane name="geojson" tab="Nav2 GeoJSON (Route Server)">
          <div class="mb-2 flex justify-end gap-2">
            <NButton size="tiny" @click="copyToClipboard(previewGeoJson, 'GeoJSON')">Copy</NButton>
            <NButton size="tiny" type="primary" @click="doExportGeoJson">Download</NButton>
          </div>
          <pre class="max-h-[60vh] overflow-auto rounded bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-emerald-200">{{ previewGeoJson }}</pre>
        </NTabPane>
        <NTabPane name="lif" tab="LIF 1.0.0">
          <div class="mb-2 flex justify-end gap-2">
            <NButton size="tiny" @click="copyToClipboard(previewLif, 'LIF')">Copy</NButton>
            <NButton size="tiny" type="primary" @click="doExportLif">Download</NButton>
          </div>
          <pre class="max-h-[60vh] overflow-auto rounded bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-sky-200">{{ previewLif }}</pre>
        </NTabPane>
        <NTabPane name="zoneset" :tab="`Zone set (${(map.zones || []).length})`">
          <div class="mb-2 flex justify-end gap-2">
            <NButton size="tiny" @click="copyToClipboard(previewZoneSet, 'Zone set')">Copy</NButton>
            <NButton size="tiny" type="primary" @click="doExportZoneSet">Download</NButton>
          </div>
          <pre class="max-h-[60vh] overflow-auto rounded bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-amber-200">{{ previewZoneSet }}</pre>
        </NTabPane>
        <NTabPane name="validate" :tab="`Validate (${validation.errors.length}⛔ / ${validation.warnings.length}⚠)`">
          <div v-if="!validation.errors.length && !validation.warnings.length" class="rounded bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-800 dark:text-emerald-300">
            ✅ No problems found — safe to export.
          </div>
          <div v-else class="space-y-3">
            <div v-if="validation.errors.length">
              <div class="mb-1 text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">Errors ({{ validation.errors.length }})</div>
              <ul class="space-y-1 rounded bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-900 dark:text-red-200">
                <li v-for="(e, i) in validation.errors" :key="'e' + i" class="font-mono">⛔ {{ e }}</li>
              </ul>
            </div>
            <div v-if="validation.warnings.length">
              <div class="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Warnings ({{ validation.warnings.length }})</div>
              <ul class="space-y-1 rounded bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
                <li v-for="(w, i) in validation.warnings" :key="'w' + i" class="font-mono">⚠ {{ w }}</li>
              </ul>
            </div>
          </div>
        </NTabPane>
      </NTabs>
    </NModal>

    <NModal
      v-model:show="showHelp"
      preset="card"
      title="Keyboard shortcuts"
      style="width: 560px"
      :bordered="false"
    >
      <div class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        <template v-for="s in SHORTCUTS" :key="s.keys">
          <kbd class="rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 font-mono text-xs">{{ s.keys }}</kbd>
          <span class="text-slate-700 dark:text-slate-200">{{ s.desc }}</span>
        </template>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.editor-root {
  height: calc(100vh - 56px);
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  color: #475569;
  transition: background 0.15s;
}
.tool-btn:hover:not(:disabled) {
  background: #f1f5f9;
}
.tool-btn.active {
  background: #1e40af;
  color: #ffffff;
}
.tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: #475569;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.15s;
}
.zoom-btn:last-child { border-bottom: none; }
.zoom-btn:hover { background: #f8fafc; }

/* Тёмная тема: нативные select/input тоже тёмные */
.dark .editor-root { color-scheme: dark; }
.dark .tool-btn { color: #cbd5e1; }
.dark .tool-btn:hover:not(:disabled) { background: #1e293b; }
.dark .tool-btn.active { background: #2563eb; color: #ffffff; }
.dark .zoom-btn { color: #cbd5e1; border-bottom-color: #1e293b; }
.dark .zoom-btn:hover { background: #1e293b; }
</style>
