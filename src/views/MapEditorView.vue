<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapsStore } from '../stores/maps'
import { useRobotsStore } from '../stores/robots'
import { pixelToWorld } from '../lib/nav2meta'
import { NCard, NButton, useMessage } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const store = useMapsStore()
const robotsStore = useRobotsStore()
const msg = useMessage()

const map = computed(() => store.get(route.params.id))
const tool = ref('select')

const stageEl = ref(null)
let konva = null
let stage = null
let bgLayer = null
let drawLayer = null
let uiLayer = null
let mapImage = null
let currentEdgeStart = null
let zoneDraft = null

const scale = ref(1)
const offset = ref({ x: 0, y: 0 })

onMounted(async () => {
  if (!map.value) {
    router.replace({ name: 'maps' })
    return
  }
  konva = (await import('konva')).default
  await nextTick()
  initStage()
})

onBeforeUnmount(() => {
  if (stage) stage.destroy()
})

function initStage() {
  const container = stageEl.value
  if (!container || !map.value) return

  const w = container.clientWidth
  const h = container.clientHeight

  stage = new konva.Stage({ container, width: w, height: h })
  bgLayer = new konva.Layer()
  drawLayer = new konva.Layer()
  uiLayer = new konva.Layer()
  stage.add(bgLayer)
  stage.add(drawLayer)
  stage.add(uiLayer)

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
}

function toImagePx(evt) {
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
  const { u, v } = toImagePx(e)
  if (u < 0 || v < 0 || u > map.value.width || v > map.value.height) return

  if (tool.value === 'waypoint') {
    const wp = {
      id: 'wp-' + Math.random().toString(36).slice(2, 6),
      u,
      v,
    }
    store.update(map.value.id, { waypoints: [...map.value.waypoints, wp] })
    redraw()
  } else if (tool.value === 'edge') {
    const wp = pickWaypointAt(u, v)
    if (!wp) return msg.warning('Click on a waypoint')
    if (!currentEdgeStart) {
      currentEdgeStart = wp
      msg.info(`Edge from ${wp.id} — click target waypoint`)
    } else if (currentEdgeStart.id !== wp.id) {
      const edge = { id: 'ed-' + Math.random().toString(36).slice(2, 6), from: currentEdgeStart.id, to: wp.id }
      store.update(map.value.id, { edges: [...map.value.edges, edge] })
      currentEdgeStart = null
      redraw()
    }
  } else if (tool.value === 'zone-forbidden' || tool.value === 'zone-charge' || tool.value === 'zone-loading') {
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

function redraw() {
  if (!drawLayer || !map.value) return
  drawLayer.destroyChildren()

  for (const z of map.value.zones) {
    const p1 = fromImagePx(z.u1, z.v1)
    const p2 = fromImagePx(z.u2, z.v2)
    const color = z.kind === 'forbidden' ? '#ef4444' : z.kind === 'charge' ? '#3b82f6' : '#eab308'
    drawLayer.add(
      new konva.Rect({
        x: p1.x,
        y: p1.y,
        width: p2.x - p1.x,
        height: p2.y - p1.y,
        fill: color,
        opacity: 0.18,
        stroke: color,
        strokeWidth: 1.5,
        dash: [4, 4],
      })
    )
  }

  const byId = Object.fromEntries(map.value.waypoints.map((w) => [w.id, w]))
  for (const e of map.value.edges) {
    const a = byId[e.from]
    const b = byId[e.to]
    if (!a || !b) continue
    const p1 = fromImagePx(a.u, a.v)
    const p2 = fromImagePx(b.u, b.v)
    drawLayer.add(
      new konva.Arrow({
        points: [p1.x, p1.y, p2.x, p2.y],
        stroke: '#1e40af',
        fill: '#1e40af',
        strokeWidth: 2,
        pointerLength: 8,
        pointerWidth: 8,
      })
    )
  }

  for (const w of map.value.waypoints) {
    const p = fromImagePx(w.u, w.v)
    drawLayer.add(
      new konva.Circle({
        x: p.x,
        y: p.y,
        radius: 6,
        fill: '#1e40af',
        stroke: 'white',
        strokeWidth: 2,
      })
    )
    drawLayer.add(
      new konva.Text({
        x: p.x + 8,
        y: p.y - 14,
        text: w.id,
        fontSize: 10,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fill: '#1e40af',
      })
    )
  }

  drawLayer.batchDraw()
}

function clearAll() {
  if (!confirm('Delete all waypoints, edges and zones?')) return
  store.update(map.value.id, { waypoints: [], edges: [], zones: [] })
  currentEdgeStart = null
  zoneDraft = null
  redraw()
  msg.info('Cleared')
}

function saveToBackend() {
  msg.success('Saved (mock). Backend: POST /api/maps/' + map.value.id)
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
  { key: 'select', label: 'Select', hint: 'Pan the map, hover waypoints' },
  { key: 'waypoint', label: 'Waypoint', hint: 'Click to add a waypoint' },
  { key: 'edge', label: 'Edge / route', hint: 'Click two waypoints to connect' },
  { key: 'zone-forbidden', label: 'Forbidden zone', hint: 'Click two corners' },
  { key: 'zone-charge', label: 'Charge zone', hint: 'Click two corners' },
  { key: 'zone-loading', label: 'Loading zone', hint: 'Click two corners' },
]
</script>

<template>
  <div v-if="!map" class="grid place-items-center py-20 text-slate-500">Loading map…</div>
  <div v-else class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <div class="flex items-baseline gap-3">
        <h2 class="text-xl font-semibold text-slate-900">{{ map.name }}</h2>
        <span class="font-mono text-xs text-slate-500">{{ map.id }} · {{ map.width }}×{{ map.height }}px · {{ map.meta.resolution }} m/px · origin ({{ map.meta.origin[0] }}, {{ map.meta.origin[1] }})</span>
      </div>
      <div class="flex gap-2">
        <NButton size="small" @click="router.push({ name: 'maps' })">← Back</NButton>
        <NButton size="small" ghost @click="clearAll">Clear</NButton>
        <NButton size="small" type="primary" ghost>Export LIF</NButton>
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
            @click="tool = t.key; currentEdgeStart = null; zoneDraft = null"
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
      </NCard>

      <NCard title="Canvas" size="small" class="!bg-white lg:col-span-4">
        <div ref="stageEl" class="h-[640px] w-full overflow-hidden rounded border border-slate-200 bg-slate-100" />
      </NCard>
    </div>
  </div>
</template>
