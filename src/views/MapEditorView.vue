<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapsStore } from '../stores/maps'
import { useRobotsStore } from '../stores/robots'
import { pixelToWorld } from '../lib/nav2meta'
import { exportNav2GeoJson, downloadJson } from '../lib/exportGeoJson'
import { exportLif } from '../lib/exportLif'
import { NCard, NButton, NPopselect, useMessage } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const store = useMapsStore()
const robotsStore = useRobotsStore()
const msg = useMessage()

const map = computed(() => store.get(route.params.id))
const tool = ref('select')
const selectedId = ref(null)

const stageEl = ref(null)
let konva = null
let stage = null
let bgLayer = null
let drawLayer = null
let mapImage = null
let currentEdgeStart = null
let zoneDraft = null

const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const hoverWorld = ref(null)

onMounted(async () => {
  if (!map.value) {
    router.replace({ name: 'maps' })
    return
  }
  konva = (await import('konva')).default
  await nextTick()
  initStage()
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (stage) stage.destroy()
})

function onKey(e) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedId.value) {
      deleteSelected()
      e.preventDefault()
    }
  } else if (e.key === 'Escape') {
    selectedId.value = null
    currentEdgeStart = null
    zoneDraft = null
    redraw()
  }
}

function initStage() {
  const container = stageEl.value
  if (!container || !map.value) return

  const w = container.clientWidth
  const h = container.clientHeight

  stage = new konva.Stage({ container, width: w, height: h })
  bgLayer = new konva.Layer()
  drawLayer = new konva.Layer()
  stage.add(bgLayer)
  stage.add(drawLayer)

  const img = new Image()
  img.onload = () => {
    const fit = Math.min(w / img.width, h / img.height, 1)
    scale.value = fit
    offset.value = {
      x: (w - img.width * fit) / 2,
      y: (h - img.height * fit) / 2,
    }
    mapImage = new konva.Image({
      image: img,
      x: offset.value.x,
      y: offset.value.y,
      width: img.width * fit,
      height: img.height * fit,
      listening: false,
    })
    bgLayer.add(mapImage)
    bgLayer.draw()
    redraw()
  }
  img.src = map.value.pgmDataUrl

  stage.on('click tap', onStageClick)
  stage.on('wheel', onWheel)
  stage.on('mousemove', onMouseMove)
}

function toImagePx() {
  const pos = stage.getPointerPosition()
  const s = scale.value
  return {
    u: (pos.x - offset.value.x) / s,
    v: (pos.y - offset.value.y) / s,
  }
}
function fromImagePx(u, v) {
  return { x: offset.value.x + u * scale.value, y: offset.value.y + v * scale.value }
}

function onMouseMove() {
  if (!map.value || !mapImage) return
  const { u, v } = toImagePx()
  if (u < 0 || v < 0 || u > map.value.width || v > map.value.height) {
    hoverWorld.value = null
  } else {
    const { x, y } = pixelToWorld(map.value.meta, u, v, map.value.height)
    hoverWorld.value = { x, y, u, v }
  }
}

function onWheel(e) {
  e.evt.preventDefault()
  const oldScale = scale.value
  const pointer = stage.getPointerPosition()
  const mousePointTo = {
    x: (pointer.x - offset.value.x) / oldScale,
    y: (pointer.y - offset.value.y) / oldScale,
  }
  const dir = e.evt.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.max(0.05, Math.min(8, oldScale * dir))
  scale.value = newScale
  offset.value = {
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  }
  if (mapImage) {
    mapImage.setAttrs({
      x: offset.value.x,
      y: offset.value.y,
      width: map.value.width * newScale,
      height: map.value.height * newScale,
    })
    bgLayer.batchDraw()
  }
  redraw()
}

function onStageClick(e) {
  if (!map.value || !mapImage) return
  const { u, v } = toImagePx()
  if (u < 0 || v < 0 || u > map.value.width || v > map.value.height) return

  if (tool.value === 'select') {
    const wp = pickWaypointAt(u, v)
    selectedId.value = wp ? wp.id : null
    redraw()
  } else if (tool.value === 'waypoint') {
    const wp = { id: 'wp-' + Math.random().toString(36).slice(2, 6), u, v }
    store.update(map.value.id, { waypoints: [...map.value.waypoints, wp] })
    selectedId.value = wp.id
    redraw()
  } else if (tool.value === 'edge') {
    const wp = pickWaypointAt(u, v)
    if (!wp) return msg.warning('Click on a waypoint')
    if (!currentEdgeStart) {
      currentEdgeStart = wp
      msg.info(`Edge from ${wp.id} — click target waypoint`)
    } else if (currentEdgeStart.id !== wp.id) {
      const edge = {
        id: 'ed-' + Math.random().toString(36).slice(2, 6),
        from: currentEdgeStart.id,
        to: wp.id,
        cost: 0,
        maxSpeed: 1.0,
      }
      store.update(map.value.id, { edges: [...map.value.edges, edge] })
      currentEdgeStart = null
      redraw()
    }
  } else if (tool.value.startsWith('zone-')) {
    const kind = tool.value.replace('zone-', '')
    if (!zoneDraft) {
      zoneDraft = { kind, x1: u, y1: v }
      msg.info('Click second corner to finish zone')
    } else {
      const zone = {
        id: 'zn-' + Math.random().toString(36).slice(2, 6),
        kind,
        u1: Math.min(zoneDraft.x1, u),
        v1: Math.min(zoneDraft.y1, v),
        u2: Math.max(zoneDraft.x1, u),
        v2: Math.max(zoneDraft.y1, v),
      }
      store.update(map.value.id, { zones: [...map.value.zones, zone] })
      zoneDraft = null
      redraw()
    }
  }
}

function pickWaypointAt(u, v) {
  const r = 10 / scale.value
  return map.value.waypoints.find((w) => Math.hypot(w.u - u, w.v - v) < r) || null
}

function deleteSelected() {
  if (!selectedId.value || !map.value) return
  const id = selectedId.value
  if (id.startsWith('wp-')) {
    const waypoints = map.value.waypoints.filter((w) => w.id !== id)
    const edges = map.value.edges.filter((e) => e.from !== id && e.to !== id)
    store.update(map.value.id, { waypoints, edges })
    msg.info('Waypoint and its edges deleted')
  } else if (id.startsWith('ed-')) {
    store.update(map.value.id, { edges: map.value.edges.filter((e) => e.id !== id) })
    msg.info('Edge deleted')
  } else if (id.startsWith('zn-')) {
    store.update(map.value.id, { zones: map.value.zones.filter((z) => z.id !== id) })
    msg.info('Zone deleted')
  }
  selectedId.value = null
  redraw()
}

function redraw() {
  if (!drawLayer || !map.value) return
  drawLayer.destroyChildren()

  for (const z of map.value.zones) {
    const p1 = fromImagePx(z.u1, z.v1)
    const p2 = fromImagePx(z.u2, z.v2)
    const color = z.kind === 'forbidden' ? '#ef4444' : z.kind === 'charge' ? '#3b82f6' : '#eab308'
    const rect = new konva.Rect({
      x: p1.x,
      y: p1.y,
      width: p2.x - p1.x,
      height: p2.y - p1.y,
      fill: color,
      opacity: selectedId.value === z.id ? 0.35 : 0.18,
      stroke: color,
      strokeWidth: selectedId.value === z.id ? 3 : 1.5,
      dash: [4, 4],
    })
    rect.on('click', (e) => {
      e.cancelBubble = true
      selectedId.value = z.id
      redraw()
    })
    drawLayer.add(rect)
  }

  const byId = Object.fromEntries(map.value.waypoints.map((w) => [w.id, w]))
  for (const e of map.value.edges) {
    const a = byId[e.from]
    const b = byId[e.to]
    if (!a || !b) continue
    const p1 = fromImagePx(a.u, a.v)
    const p2 = fromImagePx(b.u, b.v)
    const arrow = new konva.Arrow({
      points: [p1.x, p1.y, p2.x, p2.y],
      stroke: selectedId.value === e.id ? '#f97316' : '#1e40af',
      fill: selectedId.value === e.id ? '#f97316' : '#1e40af',
      strokeWidth: selectedId.value === e.id ? 3.5 : 2,
      pointerLength: 10,
      pointerWidth: 10,
      hitStrokeWidth: 12,
    })
    arrow.on('click', (ev) => {
      ev.cancelBubble = true
      selectedId.value = e.id
      redraw()
    })
    drawLayer.add(arrow)
  }

  for (const w of map.value.waypoints) {
    const p = fromImagePx(w.u, w.v)
    const isSelected = selectedId.value === w.id
    const circle = new konva.Circle({
      x: p.x,
      y: p.y,
      radius: isSelected ? 8 : 6,
      fill: isSelected ? '#f97316' : '#1e40af',
      stroke: 'white',
      strokeWidth: 2,
      draggable: tool.value === 'select',
    })
    circle.on('click', (e) => {
      e.cancelBubble = true
      if (tool.value === 'select') {
        selectedId.value = w.id
        redraw()
      } else if (tool.value === 'edge') {
        if (!currentEdgeStart) {
          currentEdgeStart = w
          msg.info(`Edge from ${w.id} — click target waypoint`)
        } else if (currentEdgeStart.id !== w.id) {
          const edge = {
            id: 'ed-' + Math.random().toString(36).slice(2, 6),
            from: currentEdgeStart.id,
            to: w.id,
            cost: 0,
            maxSpeed: 1.0,
          }
          store.update(map.value.id, { edges: [...map.value.edges, edge] })
          currentEdgeStart = null
          redraw()
        }
      }
    })
    circle.on('dragmove', () => {
      const nx = circle.x()
      const ny = circle.y()
      const u = (nx - offset.value.x) / scale.value
      const v = (ny - offset.value.y) / scale.value
      const updated = map.value.waypoints.map((x) => (x.id === w.id ? { ...x, u, v } : x))
      store.update(map.value.id, { waypoints: updated })
      redrawEdgesOnly()
    })
    drawLayer.add(circle)
    drawLayer.add(
      new konva.Text({
        x: p.x + 10,
        y: p.y - 16,
        text: w.id,
        fontSize: 10,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fill: isSelected ? '#c2410c' : '#1e40af',
        listening: false,
      })
    )
  }

  drawLayer.batchDraw()
}

function redrawEdgesOnly() {
  redraw()
}

function clearAll() {
  if (!confirm('Delete all waypoints, edges and zones?')) return
  store.update(map.value.id, { waypoints: [], edges: [], zones: [] })
  currentEdgeStart = null
  zoneDraft = null
  selectedId.value = null
  redraw()
  msg.info('Cleared')
}

function saveToBackend() {
  msg.success(`Saved (mock). Backend: POST /api/maps/${map.value.id}`)
}

function doExportGeoJson() {
  const geo = exportNav2GeoJson(map.value)
  downloadJson(`${map.value.name.replace(/\s+/g, '_')}.geojson`, geo)
  msg.success(`Exported ${geo.features.length} features (Nav2 Route Server)`)
}
function doExportLif() {
  const lif = exportLif(map.value)
  downloadJson(`${map.value.name.replace(/\s+/g, '_')}.lif.json`, lif)
  msg.success(`Exported VDA5050 LIF ${lif.metaInformation.lifVersion}`)
}

const exportOptions = [
  { label: 'Nav2 GeoJSON (Route Server)', value: 'geojson' },
  { label: 'VDA5050 LIF 1.0.0', value: 'lif' },
]
function onExport(value) {
  if (value === 'geojson') doExportGeoJson()
  else if (value === 'lif') doExportLif()
}

const robotOptions = computed(() => robotsStore.robots.map((r) => ({ label: r.id, value: r.id })))
function toggleRobot(id) {
  const assigned = map.value.assignedRobots.includes(id)
    ? map.value.assignedRobots.filter((x) => x !== id)
    : [...map.value.assignedRobots, id]
  store.assignRobots(map.value.id, assigned)
  msg.info(`Assigned robots: ${assigned.join(', ') || '(none)'}`)
}

const tools = [
  { key: 'select', label: 'Select / move', hint: 'Click element to select. Drag waypoint to move. Del to remove.' },
  { key: 'waypoint', label: 'Waypoint', hint: 'Click to add a waypoint.' },
  { key: 'edge', label: 'Edge / route', hint: 'Click two waypoints to connect.' },
  { key: 'zone-forbidden', label: 'Forbidden zone', hint: 'Click two corners.' },
  { key: 'zone-charge', label: 'Charge zone', hint: 'Click two corners.' },
  { key: 'zone-loading', label: 'Loading zone', hint: 'Click two corners.' },
]

const selectedInfo = computed(() => {
  if (!selectedId.value || !map.value) return null
  const id = selectedId.value
  if (id.startsWith('wp-')) {
    const wp = map.value.waypoints.find((w) => w.id === id)
    if (!wp) return null
    const { x, y } = pixelToWorld(map.value.meta, wp.u, wp.v, map.value.height)
    return { kind: 'waypoint', id, world: { x, y } }
  }
  if (id.startsWith('ed-')) {
    const e = map.value.edges.find((x) => x.id === id)
    if (!e) return null
    return { kind: 'edge', id, from: e.from, to: e.to, cost: e.cost, maxSpeed: e.maxSpeed }
  }
  if (id.startsWith('zn-')) {
    const z = map.value.zones.find((x) => x.id === id)
    if (!z) return null
    return { kind: 'zone', id, zoneKind: z.kind }
  }
  return null
})

function updateEdgeCost(v) {
  if (!selectedId.value) return
  const edges = map.value.edges.map((e) => (e.id === selectedId.value ? { ...e, cost: Number(v) } : e))
  store.update(map.value.id, { edges })
}
function updateEdgeSpeed(v) {
  if (!selectedId.value) return
  const edges = map.value.edges.map((e) => (e.id === selectedId.value ? { ...e, maxSpeed: Number(v) } : e))
  store.update(map.value.id, { edges })
}

watch(tool, () => {
  currentEdgeStart = null
  zoneDraft = null
  redraw()
})
</script>

<template>
  <div v-if="!map" class="grid place-items-center py-20 text-slate-500">Loading map…</div>
  <div v-else class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <div class="flex items-baseline gap-3">
        <h2 class="text-xl font-semibold text-slate-900">{{ map.name }}</h2>
        <span class="font-mono text-xs text-slate-500">
          {{ map.id }} · {{ map.width }}×{{ map.height }}px · {{ map.meta.resolution }} m/px · origin ({{ map.meta.origin[0] }}, {{ map.meta.origin[1] }})
        </span>
      </div>
      <div class="flex gap-2">
        <NButton size="small" @click="router.push({ name: 'maps' })">← Back</NButton>
        <NButton size="small" ghost @click="clearAll">Clear</NButton>
        <NPopselect :options="exportOptions" @update:value="onExport" trigger="click">
          <NButton size="small" type="primary" ghost>Export ▾</NButton>
        </NPopselect>
        <NButton size="small" type="primary" @click="saveToBackend">Save</NButton>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <NCard title="Tools" size="small" class="!bg-white lg:col-span-1">
        <div class="flex flex-col gap-1">
          <button
            v-for="t in tools"
            :key="t.key"
            :class="[
              'rounded border px-3 py-2 text-left text-sm transition',
              tool === t.key
                ? 'border-brand-800 bg-brand-800 text-white'
                : 'border-slate-200 hover:bg-brand-50',
            ]"
            @click="tool = t.key"
          >
            {{ t.label }}
          </button>
        </div>
        <div class="mt-4 rounded bg-slate-50 p-3 text-xs text-slate-600">
          {{ tools.find(t => t.key === tool)?.hint }}
        </div>

        <div class="mt-4">
          <div class="mb-2 text-xs uppercase tracking-wider text-slate-500">Assigned to robots</div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="opt in robotOptions"
              :key="opt.value"
              :class="[
                'rounded border px-2 py-1 font-mono text-xs transition',
                map.assignedRobots.includes(opt.value)
                  ? 'border-brand-800 bg-brand-800 text-white'
                  : 'border-slate-200 hover:bg-brand-50',
              ]"
              @click="toggleRobot(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="mt-4 flex flex-col gap-1 font-mono text-xs text-slate-500">
          <div>Waypoints: <span class="text-brand-800">{{ map.waypoints.length }}</span></div>
          <div>Edges: <span class="text-brand-800">{{ map.edges.length }}</span></div>
          <div>Zones: <span class="text-brand-800">{{ map.zones.length }}</span></div>
          <div>Zoom: <span class="text-brand-800">{{ scale.toFixed(2) }}×</span></div>
        </div>

        <div v-if="hoverWorld" class="mt-2 rounded bg-slate-900 p-2 font-mono text-[10px] text-emerald-300">
          x: {{ hoverWorld.x.toFixed(3) }} m<br />
          y: {{ hoverWorld.y.toFixed(3) }} m
        </div>
      </NCard>

      <NCard title="Canvas" size="small" class="!bg-white lg:col-span-3">
        <div ref="stageEl" class="h-[640px] w-full overflow-hidden rounded border border-slate-200 bg-slate-100" />
      </NCard>

      <NCard title="Selected" size="small" class="!bg-white lg:col-span-1">
        <div v-if="!selectedInfo" class="text-xs text-slate-500">Select an element on the canvas.</div>

        <div v-else-if="selectedInfo.kind === 'waypoint'" class="flex flex-col gap-2 text-sm">
          <div class="flex justify-between"><span class="text-slate-500">Type</span><span class="font-mono text-xs">Waypoint</span></div>
          <div class="flex justify-between"><span class="text-slate-500">ID</span><span class="font-mono text-xs text-brand-800">{{ selectedInfo.id }}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">X</span><span class="font-mono text-xs">{{ selectedInfo.world.x.toFixed(3) }} m</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Y</span><span class="font-mono text-xs">{{ selectedInfo.world.y.toFixed(3) }} m</span></div>
          <NButton size="small" type="error" ghost @click="deleteSelected">Delete</NButton>
        </div>

        <div v-else-if="selectedInfo.kind === 'edge'" class="flex flex-col gap-2 text-sm">
          <div class="flex justify-between"><span class="text-slate-500">Type</span><span class="font-mono text-xs">Edge</span></div>
          <div class="flex justify-between"><span class="text-slate-500">ID</span><span class="font-mono text-xs text-brand-800">{{ selectedInfo.id }}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">From</span><span class="font-mono text-xs">{{ selectedInfo.from }}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">To</span><span class="font-mono text-xs">{{ selectedInfo.to }}</span></div>
          <label class="mt-2 text-xs text-slate-500">
            Cost
            <input
              type="number"
              step="0.1"
              :value="selectedInfo.cost"
              @input="updateEdgeCost($event.target.value)"
              class="mt-1 w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
            />
          </label>
          <label class="text-xs text-slate-500">
            Max speed (m/s)
            <input
              type="number"
              step="0.1"
              min="0"
              :value="selectedInfo.maxSpeed"
              @input="updateEdgeSpeed($event.target.value)"
              class="mt-1 w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
            />
          </label>
          <NButton size="small" type="error" ghost @click="deleteSelected">Delete</NButton>
        </div>

        <div v-else-if="selectedInfo.kind === 'zone'" class="flex flex-col gap-2 text-sm">
          <div class="flex justify-between"><span class="text-slate-500">Type</span><span class="font-mono text-xs">Zone</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Kind</span><span class="font-mono text-xs">{{ selectedInfo.zoneKind }}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">ID</span><span class="font-mono text-xs text-brand-800">{{ selectedInfo.id }}</span></div>
          <NButton size="small" type="error" ghost @click="deleteSelected">Delete</NButton>
        </div>
      </NCard>
    </div>
  </div>
</template>
