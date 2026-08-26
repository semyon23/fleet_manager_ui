<script setup>
import { computed, ref, onMounted, onBeforeUnmount, reactive, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapsStore } from '../stores/maps'
import { pixelToWorld, worldToPixel } from '../lib/nav2meta'
import { exportNav2GeoJson, downloadJson } from '../lib/exportGeoJson'
import { exportLif } from '../lib/exportLif'
import { exportLifMulti } from '../lib/exportLifMulti'
import { parseLif } from '../lib/importLif'
import { validateMap } from '../lib/validateMap'
import { graphConfigs } from '../lib/graphConfig'
import { STATION_KINDS, stationColorFor, stationIconFor } from '../lib/theme'
import { useSequentialIds } from '../composables/useSequentialIds'
import { useAxisTicks } from '../composables/useAxisTicks'
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
  { keys: 'N', desc: 'Node — одиночная точка' },
  { keys: 'B', desc: 'Batch Points — цепочка отдельных точек' },
  { keys: 'L', desc: 'Batch Lines — polyline (точка + edge к предыдущей)' },
  { keys: 'E', desc: 'Edge — соединить 2 существующие ноды' },
  { keys: 'S', desc: 'Station' },
  { keys: 'M', desc: 'Box select — обвести ноды прямоугольником' },
  { keys: 'Del', desc: 'Удалить выделенное' },
  { keys: 'Esc', desc: 'Снять выделение / отменить draft edge' },
  { keys: 'Ctrl+Z', desc: 'Undo' },
  { keys: 'Ctrl+Y или Ctrl+Shift+Z', desc: 'Redo' },
  { keys: 'Ctrl+C', desc: 'Копировать выделенные ноды' },
  { keys: 'Ctrl+V', desc: 'Вставить с оффсетом' },
  { keys: '?', desc: 'Эта справка' },
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
  }
}
function snapshotsEqual(a, b) {
  return a && b &&
    a.waypoints === b.waypoints &&
    a.edges === b.edges &&
    a.stations === b.stations
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
  })
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
  const pos = eventToLayout(evt)
  if (!pos) return
  const snapped = snapUV(pos.x, pos.y)
  const u = snapped.u, v = snapped.v

  if (tool.value === 'node' || tool.value === 'batch-points' || tool.value === 'batch-lines') {
    createNodeAt(u, v)
  } else if (tool.value === 'station') {
    createStationAt(u, v)
  } else if (tool.value === 'select') {
    selectedNodes.value = []
    selectedEdges.value = []
  }
}

// Точный порядок и deep-clone взяты из эталона vda5050_lif_editor
// (layout.controller.ts createNode:376): сначала nodes[id], потом layouts.nodes[id].
// JSON.parse(JSON.stringify(...)) даёт plain object без Vue-proxy, чтобы
// v-network-graph гарантированно перевычислил normal.color для новой ноды.
function addNodeToGraph(wp) {
  nodes[wp.id] = JSON.parse(JSON.stringify({
    name: wp.name || wp.id,
    color: '#94a3b8',
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

function onNodeClick({ node }) {
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
  store.update(map.value.id, { waypoints: [], edges: [], stations: [] })
  pendingEdgeStart = null
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
const dynamicConfig = computed(() => ({
  ...graphConfigs,
  node: {
    ...graphConfigs.node,
    label: { ...graphConfigs.node.label, visible: showLabels.value },
  },
  edge: {
    ...graphConfigs.edge,
    label: { ...graphConfigs.edge.label, visible: showLabels.value },
  },
  view: {
    ...graphConfigs.view,
    grid: {
      ...graphConfigs.view.grid,
      visible: showGrid.value,
      interval: gridIntervalInLayout.value,
    },
  },
}))

const eventHandlers = {
  'view:click': onViewClick,
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
const { xTicks, yTicks } = useAxisTicks(graph, map)

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
    const more = v.errors.length > 8 ? `\n… и ещё ${v.errors.length - 8}` : ''
    const ok = confirm(
      `Найдено ${v.errors.length} ошибок:\n\n• ${list}${more}\n\nВсё равно экспортировать?`
    )
    return ok
  }
  if (v.warnings.length) {
    msg.warning(`Экспортировано (${v.warnings.length} предупреждений — см. Preview JSON)`)
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
function doExportLifMulti() {
  if (!store.maps.length) return
  const l = exportLifMulti(store.maps)
  downloadJson(`fleet-manager-multi.lif.json`, l)
  msg.success(`Exported multi-layout LIF: ${l.layouts.length} layouts`)
}
function saveToBackend() {
  msg.success(`Saved (mock). Backend: POST /api/maps/${map.value.id}`)
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
          `Файл содержит ${layoutCount} layouts. Введи номер для импорта (0..${layoutCount - 1}):\n\n${names}`,
          '0'
        )
        if (pick === null) return
        layoutIdx = Math.max(0, Math.min(layoutCount - 1, parseInt(pick, 10) || 0))
      }
      const parsed = parseLif(lif, map.value, layoutIdx)
      const total = parsed.waypoints.length + parsed.stations.length
      const existing = map.value.waypoints.length + (map.value.stations?.length || 0)
      if (existing > 0 && !confirm(
        `Заменить содержимое карты (layout "${parsed.layoutName || layoutIdx}")?\n\nСейчас: ${existing} нод/станций.\nВ файле: ${total} (+ ${parsed.edges.length} edges).`
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
  { label: 'Import VDA5050 LIF…', key: 'import-lif' },
  { type: 'divider' },
  { label: 'Export Nav2 GeoJSON', key: 'export-geo' },
  { label: 'Export VDA5050 LIF (this map)', key: 'export-lif' },
  { label: 'Export multi-layout LIF (all maps)', key: 'export-lif-multi' },
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
  { type: 'divider' },
  { label: 'Fit to map', key: 'fit' },
])
function onViewMenu(key) {
  if (key === 'toggle-labels') showLabels.value = !showLabels.value
  else if (key === 'toggle-grid') showGrid.value = !showGrid.value
  else if (key === 'toggle-bg') showBackground.value = !showBackground.value
  else if (key === 'fit') fitToMap()
}

const helpMenu = [
  { label: 'Keyboard shortcuts (?)', key: 'shortcuts' },
  { label: 'Docs', key: 'docs' },
  { label: 'About', key: 'about' },
]
function onHelpMenu(k) {
  if (k === 'shortcuts') showHelp.value = true
  else if (k === 'docs') msg.info('See docs/ folder in repo')
  else if (k === 'about') msg.info('Fleet Manager · Map Editor · VDA5050 LIF + Nav2 GeoJSON')
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

// === VDA5050 Actions на ноде ===
function makeAction() {
  return {
    actionId: 'a-' + Math.random().toString(36).slice(2, 8),
    actionType: '',
    blockingType: 'NONE',
    actionDescriptor: '',
    actionParameters: [],
  }
}
function updateWaypointActions(newActions) {
  if (!selectedWaypoint.value) return
  const list = map.value.waypoints.map((w) =>
    w.id === selectedWaypoint.value.id ? { ...w, actions: newActions } : w
  )
  store.update(map.value.id, { waypoints: list })
}
function addAction() {
  const current = selectedWaypoint.value?.actions || []
  updateWaypointActions([...current, makeAction()])
}
function removeAction(idx) {
  const current = [...(selectedWaypoint.value?.actions || [])]
  current.splice(idx, 1)
  updateWaypointActions(current)
}
function updateActionField(idx, field, val) {
  const current = (selectedWaypoint.value?.actions || []).map((a, i) =>
    i === idx ? { ...a, [field]: val } : a
  )
  updateWaypointActions(current)
}
function addActionParam(actIdx) {
  const current = (selectedWaypoint.value?.actions || []).map((a, i) => {
    if (i !== actIdx) return a
    return { ...a, actionParameters: [...(a.actionParameters || []), { key: '', value: '' }] }
  })
  updateWaypointActions(current)
}
function removeActionParam(actIdx, paramIdx) {
  const current = (selectedWaypoint.value?.actions || []).map((a, i) => {
    if (i !== actIdx) return a
    const params = [...(a.actionParameters || [])]
    params.splice(paramIdx, 1)
    return { ...a, actionParameters: params }
  })
  updateWaypointActions(current)
}
function updateActionParam(actIdx, paramIdx, field, val) {
  const current = (selectedWaypoint.value?.actions || []).map((a, i) => {
    if (i !== actIdx) return a
    const params = (a.actionParameters || []).map((p, pi) =>
      pi === paramIdx ? { ...p, [field]: val } : p
    )
    return { ...a, actionParameters: params }
  })
  updateWaypointActions(current)
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
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault(); deleteSelected()
  } else if (e.key === 'Escape') {
    pendingEdgeStart = null
    selectedNodes.value = []
    selectedEdges.value = []
  } else if (e.key === 'v') tool.value = 'select'
  else if (e.key === 'n') tool.value = 'node'
  else if (e.key === 'b') tool.value = 'batch-points'
  else if (e.key === 'l') tool.value = 'batch-lines'
  else if (e.key === 'e') tool.value = 'edge'
  else if (e.key === 's') tool.value = 'station'
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
  { key: 'edge', label: 'Edge (E)', icon: 'arrow' },
  { key: 'station', label: 'Station (S)', icon: 'square' },
]
</script>

<template>
  <div v-if="!map" class="grid place-items-center py-20 text-slate-500">Loading map…</div>

  <div v-else class="editor-root flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-slate-50">
    <!-- Menu bar -->
    <div class="flex h-9 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3 text-sm">
      <NDropdown trigger="click" :options="fileMenu" @select="onFileMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100">File</button>
      </NDropdown>
      <NDropdown trigger="click" :options="editMenu" @select="onEditMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100">Edit</button>
      </NDropdown>
      <NDropdown trigger="click" :options="viewMenu" @select="onViewMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100">View</button>
      </NDropdown>
      <NDropdown trigger="click" :options="helpMenu" @select="onHelpMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100">Help</button>
      </NDropdown>

      <div class="mx-3 h-4 w-px bg-slate-200" />

      <select
        class="rounded border border-slate-200 px-2 py-0.5 text-xs"
        :value="map.id"
        @change="switchMap($event.target.value)"
      >
        <option v-for="m in allMapsOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>
      <span class="font-mono text-[10px] text-slate-500">
        {{ map.width }}×{{ map.height }} · {{ map.meta.resolution }} m/px
      </span>

      <div class="flex-1" />

      <div class="font-mono text-[11px] text-slate-500">
        <span v-if="cursorWorld">
          cursor · {{ cursorWorld.x.toFixed(2) }} m, {{ cursorWorld.y.toFixed(2) }} m
        </span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex h-11 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3">
      <button
        v-for="t in TOOLS"
        :key="t.key"
        :class="[
          'tool-btn',
          tool === t.key ? 'active' : '',
        ]"
        :title="t.label"
        @click="tool = t.key; pendingEdgeStart = null"
      >
        <svg v-if="t.icon === 'cursor'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.5 18 2.4-8.1L21 10.5 3 3z"/></svg>
        <svg v-if="t.icon === 'circle'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
        <svg v-if="t.icon === 'batch-points'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="5" r="2.2"/><circle cx="12" cy="9" r="2.2"/><circle cx="19" cy="6" r="2.2"/><circle cx="7" cy="16" r="2.2"/><circle cx="16" cy="19" r="2.2"/></svg>
        <svg v-if="t.icon === 'batch-lines'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18L9 8l4 6 7-10"/><circle cx="4" cy="18" r="1.6" fill="currentColor"/><circle cx="9" cy="8" r="1.6" fill="currentColor"/><circle cx="13" cy="14" r="1.6" fill="currentColor"/><circle cx="20" cy="4" r="1.6" fill="currentColor"/></svg>
        <svg v-if="t.icon === 'arrow'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <svg v-if="t.icon === 'square'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
      </button>

      <div class="mx-2 h-6 w-px bg-slate-200" />

      <button class="tool-btn" @click="undo" :disabled="historyIdx <= 0" title="Undo (Ctrl+Z)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 010 10h-4"/></svg>
      </button>
      <button class="tool-btn" @click="redo" :disabled="historyIdx >= history.length - 1" title="Redo (Ctrl+Y)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l4-4-4-4"/><path d="M19 10h-9a5 5 0 000 10h4"/></svg>
      </button>
      <button class="tool-btn text-red-600" @click="deleteSelected" title="Delete (Del)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M6 6v14a2 2 0 002 2h8a2 2 0 002-2V6"/></svg>
      </button>

      <div class="mx-2 h-6 w-px bg-slate-200" />

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

      <div class="mx-2 h-6 w-px bg-slate-200" />

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
        title="Snap to grid — новые точки и drag прилипают к сетке"
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

      <div class="mx-2 h-6 w-px bg-slate-200" />

      <label class="flex items-center gap-2 text-xs text-slate-600">
        Fast <NSwitch v-model:value="fastCreate" size="small" />
      </label>
      <label class="flex items-center gap-2 text-xs text-slate-600">
        Double Way <NSwitch v-model:value="doubleWay" size="small" />
      </label>

      <div class="mx-2 h-6 w-px bg-slate-200" />

      <div class="flex items-center gap-2 text-xs text-slate-600">
        Grid step
        <input type="range" min="0.1" max="10" step="0.1" v-model.number="gridInterval" class="w-24 accent-brand-800" />
        <input
          type="number"
          min="0.01" max="1000" step="0.1"
          :value="gridInterval"
          @input="gridInterval = Math.max(0.01, Number($event.target.value) || 0.01)"
          class="w-14 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 focus:border-brand-800 focus:outline-none"
        />
        <span class="text-[10px] text-slate-500">m</span>
      </div>

      <div class="flex-1" />

      <button class="rounded border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50" @click="showPreview = true">Preview JSON</button>
      <button class="rounded bg-brand-800 px-3 py-1 text-xs text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
    </div>

    <!-- Main split: left list | center graph | right form -->
    <div class="flex flex-1 overflow-hidden">
      <!-- LEFT SIDEBAR -->
      <aside class="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div class="border-b border-slate-100 p-3">
          <input
            v-model="search"
            type="search"
            placeholder="Search elements…"
            class="w-full rounded border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-800"
          />
        </div>
        <div class="flex-1 overflow-y-auto p-3 text-sm">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Nodes ({{ filteredWaypoints.length }})
          </div>
          <div class="mb-4 flex flex-col gap-0.5">
            <button
              v-for="w in filteredWaypoints"
              :key="w.id"
              :class="[
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition',
                selectedNodes[0] === w.id ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50',
              ]"
              @click="selectNode(w.id)"
            >
              <span class="grid h-3 w-3 place-items-center rounded-full border border-slate-400"></span>
              <div class="flex flex-1 flex-col overflow-hidden">
                <span class="truncate font-medium">{{ w.name || w.id }}</span>
                <span class="truncate font-mono text-[10px] text-slate-500">{{ w.id }}</span>
              </div>
            </button>
          </div>

          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Stations ({{ filteredStations.length }})
          </div>
          <div class="mb-4 flex flex-col gap-0.5">
            <button
              v-for="s in filteredStations"
              :key="s.id"
              :class="[
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition',
                selectedNodes[0] === s.id ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50',
              ]"
              @click="selectNode(s.id)"
            >
              <span class="h-3 w-3 rounded-sm" :style="`background: ${stationColorFor(s.kind)}`"></span>
              <div class="flex flex-1 flex-col overflow-hidden">
                <span class="truncate font-medium">{{ s.name || s.id }}</span>
                <span class="truncate font-mono text-[10px] text-slate-500">{{ s.kind }} · {{ s.id }}</span>
              </div>
            </button>
          </div>

          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Edges ({{ filteredEdges.length }})
          </div>
          <div class="flex flex-col gap-0.5">
            <button
              v-for="e in filteredEdges"
              :key="e.id"
              :class="[
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition',
                selectedEdges[0] === e.id ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50',
              ]"
              @click="selectEdge(e.id)"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-500"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              <span class="truncate font-mono text-[10px]">{{ e.from }} → {{ e.to }}</span>
            </button>
          </div>
        </div>
        <div class="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">
          {{ (map.waypoints.length + (map.stations || []).length + map.edges.length) }} items
        </div>
      </aside>

      <!-- CENTER GRAPH -->
      <main class="relative flex-1 overflow-hidden bg-white" @mousemove="onGraphMouseMove">
        <v-network-graph
          ref="graph"
          :nodes="nodes"
          :edges="edges"
          v-model:layouts="layouts"
          v-model:selected-nodes="selectedNodes"
          v-model:selected-edges="selectedEdges"
          :configs="dynamicConfig"
          :event-handlers="eventHandlers"
          :layers="{ map: 'base' }"
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
            />
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
        <div class="pointer-events-none absolute bottom-2 right-3 rounded bg-white px-2 py-1 text-[10px] text-slate-500 shadow">
          Tool: <span class="font-semibold">{{ TOOLS.find(t => t.key === tool)?.label }}</span>
          <span v-if="pendingEdgeStart" class="ml-2 text-brand-800">— from {{ pendingEdgeStart }}</span>
        </div>

        <!-- Метровая линейка X (сверху) -->
        <div class="pointer-events-none absolute left-0 top-0 h-5 w-full border-b border-slate-200 bg-white/70 backdrop-blur-sm">
          <div
            v-for="(t, i) in xTicks"
            :key="'x' + i"
            class="absolute top-0 h-full text-[9px] font-mono text-slate-500"
            :style="{ left: t.px + 'px' }"
          >
            <div class="absolute top-0 h-2 w-px bg-slate-300"></div>
            <div class="absolute left-1 top-1">{{ t.label }}</div>
          </div>
        </div>

        <!-- Метровая линейка Y (слева) -->
        <div class="pointer-events-none absolute left-0 top-0 h-full w-8 border-r border-slate-200 bg-white/70 backdrop-blur-sm">
          <div
            v-for="(t, i) in yTicks"
            :key="'y' + i"
            class="absolute left-0 w-full text-[9px] font-mono text-slate-500"
            :style="{ top: t.py + 'px' }"
          >
            <div class="absolute right-0 top-0 h-px w-2 bg-slate-300"></div>
            <div class="absolute left-0.5 -top-1.5">{{ t.label }}</div>
          </div>
        </div>

        <!-- Zoom controls -->
        <div class="absolute right-3 top-3 flex flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
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
      <aside class="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
        <div class="border-b border-slate-100 p-4">
          <div v-if="selectedWaypoint">
            <h3 class="mb-3 text-base font-semibold">Edit Node</h3>
            <div class="flex flex-col gap-3">
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Node Id
                <NInput :value="selectedWaypoint.id" @update:value="renameWaypoint" size="small" />
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Node Name
                <NInput :value="selectedWaypoint.name || ''" @update:value="(v) => updateWaypointField('name', v)" size="small" />
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
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
                <label class="flex flex-col gap-1 text-xs text-slate-500">
                  Node X (m)
                  <div class="font-mono text-sm text-slate-700">{{ selectedWorld.x.toFixed(3) }}</div>
                </label>
                <label class="flex flex-col gap-1 text-xs text-slate-500">
                  Node Y (m)
                  <div class="font-mono text-sm text-slate-700">{{ selectedWorld.y.toFixed(3) }}</div>
                </label>
              </div>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Map Id
                <NInput
                  :value="selectedWaypoint.mapId || ''"
                  @update:value="(v) => updateWaypointField('mapId', v)"
                  size="small"
                  placeholder="e.g. warehouse-f1"
                />
              </label>
              <div>
                <div class="mb-1 text-xs text-slate-500">Connected Nodes</div>
                <div class="flex flex-wrap gap-1 rounded border border-slate-200 p-2 min-h-[36px]">
                  <NTag
                    v-for="id in connectedNodes"
                    :key="id"
                    size="small"
                    closable
                    @close="removeConnectionTo(id)"
                  >
                    {{ id }}
                  </NTag>
                  <span v-if="!connectedNodes.length" class="text-[10px] text-slate-400">Nodes…</span>
                </div>
              </div>
              <div>
                <div class="mb-1 text-xs text-slate-500">
                  VDA5050 Actions ({{ (selectedWaypoint.actions || []).length }})
                </div>
                <div class="space-y-2">
                  <div
                    v-for="(a, i) in (selectedWaypoint.actions || [])"
                    :key="i"
                    class="rounded border border-slate-200 p-2"
                  >
                    <div class="mb-2 flex items-center gap-1">
                      <NInput
                        :value="a.actionType"
                        @update:value="(v) => updateActionField(i, 'actionType', v)"
                        size="tiny" placeholder="pick / drop / charge / wait…"
                        style="flex: 1"
                      />
                      <select
                        class="rounded border border-slate-200 px-1 py-1 text-[10px] font-mono"
                        :value="a.blockingType"
                        @change="updateActionField(i, 'blockingType', $event.target.value)"
                      >
                        <option>NONE</option><option>SOFT</option>
                        <option>SINGLE</option><option>HARD</option>
                      </select>
                      <button
                        class="rounded p-1 text-red-500 hover:bg-red-50"
                        @click="removeAction(i)" title="Delete action"
                      >×</button>
                    </div>
                    <div class="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                      Params
                      <button class="text-brand-800 hover:underline" @click="addActionParam(i)">
                        + param
                      </button>
                    </div>
                    <div
                      v-for="(p, pi) in (a.actionParameters || [])"
                      :key="pi"
                      class="mb-1 flex gap-1"
                    >
                      <NInput :value="p.key" @update:value="(v) => updateActionParam(i, pi, 'key', v)"
                              size="tiny" placeholder="key" style="flex: 1" />
                      <NInput :value="p.value" @update:value="(v) => updateActionParam(i, pi, 'value', v)"
                              size="tiny" placeholder="value" style="flex: 2" />
                      <button class="rounded px-1 text-red-500 hover:bg-red-50" @click="removeActionParam(i, pi)">×</button>
                    </div>
                  </div>
                  <button
                    class="flex w-full items-center justify-center gap-2 rounded border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:border-brand-800 hover:text-brand-800"
                    @click="addAction"
                  >
                    + Add action
                  </button>
                </div>
              </div>
              <div class="mt-2 flex gap-2">
                <button class="flex-1 rounded bg-brand-800 py-2 text-sm text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
                <button class="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50" @click="deleteSelected">Delete</button>
              </div>
            </div>
          </div>

          <div v-else-if="selectedStation">
            <h3 class="mb-3 text-base font-semibold">Edit Station</h3>
            <div class="flex flex-col gap-3">
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Station Id
                <div class="font-mono text-sm">{{ selectedStation.id }}</div>
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Name
                <NInput :value="selectedStation.name || selectedStation.id" @update:value="(v) => updateStationField('name', v)" size="small" />
              </label>
              <div>
                <div class="mb-1 text-xs text-slate-500">Kind</div>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="k in STATION_KINDS"
                    :key="k.value"
                    :class="[
                      'rounded border px-2 py-1 text-xs transition',
                      selectedStation.kind === k.value ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 hover:bg-slate-50',
                    ]"
                    :style="selectedStation.kind === k.value ? '' : `color: ${k.color}; border-color: ${k.color}`"
                    @click="updateStationField('kind', k.value)"
                  >{{ k.label }}</button>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="flex flex-col gap-1 text-xs text-slate-500">
                  X (m)
                  <div class="font-mono text-sm text-slate-700">{{ selectedWorld.x.toFixed(3) }}</div>
                </div>
                <div class="flex flex-col gap-1 text-xs text-slate-500">
                  Y (m)
                  <div class="font-mono text-sm text-slate-700">{{ selectedWorld.y.toFixed(3) }}</div>
                </div>
              </div>
              <div class="mt-2 flex gap-2">
                <button class="flex-1 rounded bg-brand-800 py-2 text-sm text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
                <button class="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50" @click="deleteSelected">Delete</button>
              </div>
            </div>
          </div>

          <div v-else-if="selectedEdge">
            <h3 class="mb-3 text-base font-semibold">Edit Edge</h3>
            <div class="flex flex-col gap-3">
              <div class="text-xs text-slate-500">
                {{ selectedEdge.from }} → {{ selectedEdge.to }}
              </div>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Cost
                <NInputNumber :value="selectedEdge.cost" @update:value="(v) => updateEdgeField('cost', v)" size="small" :step="0.1" />
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Max speed (m/s)
                <NInputNumber :value="selectedEdge.maxSpeed" @update:value="(v) => updateEdgeField('maxSpeed', v)" size="small" :min="0" :step="0.1" />
              </label>
              <div class="mt-2 flex gap-2">
                <button class="flex-1 rounded bg-brand-800 py-2 text-sm text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
                <button class="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50" @click="deleteSelected">Delete</button>
              </div>
            </div>
          </div>

          <div v-else class="text-center text-xs text-slate-400 py-8">
            <div class="mb-2 text-3xl">◯</div>
            Select a node, station or edge to edit
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
        <NTabPane name="lif" tab="VDA5050 LIF 1.0.0">
          <div class="mb-2 flex justify-end gap-2">
            <NButton size="tiny" @click="copyToClipboard(previewLif, 'LIF')">Copy</NButton>
            <NButton size="tiny" type="primary" @click="doExportLif">Download</NButton>
          </div>
          <pre class="max-h-[60vh] overflow-auto rounded bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-sky-200">{{ previewLif }}</pre>
        </NTabPane>
        <NTabPane name="validate" :tab="`Validate (${validation.errors.length}⛔ / ${validation.warnings.length}⚠)`">
          <div v-if="!validation.errors.length && !validation.warnings.length" class="rounded bg-emerald-50 p-4 text-sm text-emerald-800">
            ✅ Всё чисто — экспортировать безопасно.
          </div>
          <div v-else class="space-y-3">
            <div v-if="validation.errors.length">
              <div class="mb-1 text-xs font-semibold uppercase tracking-wider text-red-700">Errors ({{ validation.errors.length }})</div>
              <ul class="space-y-1 rounded bg-red-50 p-3 text-xs text-red-900">
                <li v-for="(e, i) in validation.errors" :key="'e' + i" class="font-mono">⛔ {{ e }}</li>
              </ul>
            </div>
            <div v-if="validation.warnings.length">
              <div class="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700">Warnings ({{ validation.warnings.length }})</div>
              <ul class="space-y-1 rounded bg-amber-50 p-3 text-xs text-amber-900">
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
          <kbd class="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs">{{ s.keys }}</kbd>
          <span class="text-slate-700">{{ s.desc }}</span>
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
</style>
