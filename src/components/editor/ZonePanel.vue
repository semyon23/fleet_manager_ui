<script setup>
import { computed } from 'vue'
import { NInput, NInputNumber } from 'naive-ui'
import ActionListEditor from './ActionListEditor.vue'
import {
  ZONE_TYPES, ZONE_TYPE_FIELDS, zoneTypeMeta, zoneDefaults,
  ZONE_RELEASE_LOSS, DIRECTED_LIMITATIONS, BIDIRECTED_LIMITATIONS,
} from '../../lib/vda5050'
import { pixelToWorld, worldToPixel } from '../../lib/nav2meta'
import { signedArea, isSimplePolygon, radToDeg, degToRad, normalizeAngle } from '../../lib/geometry'

const props = defineProps({
  zone: { type: Object, required: true },
  map: { type: Object, required: true },
})
const emit = defineEmits(['update', 'delete', 'save'])

const meta = computed(() => zoneTypeMeta(props.zone.type))

const LIMITATION_HINTS = {
  SOFT: 'May deviate, but should avoid it',
  RESTRICTED: 'May deviate to avoid obstacles, never the opposite way',
  STRICT: 'Keep the direction as precisely as possible',
}
const RELEASE_LOSS_HINTS = {
  STOP: 'Stop and report an error',
  CONTINUE: 'Keep driving along the path',
  EVACUATE: 'Leave the zone',
}

function update(patch) {
  const next = { ...props.zone, ...patch }
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
  emit('update', next)
}

// Смена типа: убираем поля старого типа, ставим значения по умолчанию нового
function setType(type) {
  if (type === props.zone.type) return
  const next = { ...props.zone, type }
  for (const f of ZONE_TYPE_FIELDS) delete next[f]
  emit('update', { ...next, ...zoneDefaults(type) })
}

const verticesWorld = computed(() =>
  (props.zone.vertices || []).map((p) => pixelToWorld(props.map.meta, p.u, p.v, props.map.height))
)

const areaM2 = computed(() => Math.abs(signedArea(verticesWorld.value)))
const isValidShape = computed(() => isSimplePolygon((props.zone.vertices || []).map((p) => ({ x: p.u, y: p.v }))))

function setVertex(idx, axis, value) {
  if (value === null || !Number.isFinite(value)) return
  const w = { ...verticesWorld.value[idx], [axis]: value }
  const { u, v } = worldToPixel(props.map.meta, w.x, w.y, props.map.height)
  update({ vertices: props.zone.vertices.map((p, i) => (i === idx ? { u, v } : p)) })
}

function removeVertex(idx) {
  if (props.zone.vertices.length <= 3) return
  update({ vertices: props.zone.vertices.filter((_, i) => i !== idx) })
}

const directionDeg = computed(() => (Number.isFinite(props.zone.direction) ? Number(radToDeg(props.zone.direction).toFixed(1)) : 0))
function setDirectionDeg(deg) {
  if (deg === null) return
  update({ direction: normalizeAngle(degToRad(deg)) })
}
</script>

<template>
  <div>
    <h3 class="mb-3 flex items-center gap-2 text-base font-semibold">
      <span class="inline-block h-3 w-3 rounded-sm" :style="{ background: meta.color }"></span>
      Edit Zone
    </h3>
    <div class="flex flex-col gap-3">
      <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        Zone Id
        <div class="font-mono text-sm text-slate-700 dark:text-slate-200">{{ zone.id }}</div>
      </label>
      <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        Name
        <NInput :value="zone.name || ''" size="small" placeholder="e.g. Loading dock" @update:value="(v) => update({ name: v })" />
      </label>

      <div>
        <div class="mb-1 text-xs text-slate-500 dark:text-slate-400">Type</div>
        <div class="grid grid-cols-2 gap-1">
          <button
            v-for="t in ZONE_TYPES"
            :key="t.value"
            :class="[
              'flex items-center gap-1.5 rounded border px-2 py-1 text-left text-[11px] transition',
              zone.type === t.value ? 'border-slate-800 dark:border-brand-500 bg-slate-800 dark:bg-brand-700 text-white' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
            ]"
            :title="t.hint"
            @click="setType(t.value)"
          >
            <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ background: t.color }"></span>
            {{ t.label }}
          </button>
        </div>
        <p class="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {{ meta.hint }}
          <span class="text-slate-400 dark:text-slate-500">
            {{ meta.category === 'contour' ? 'Counts when any part of the robot is inside.' : 'Counts when the robot center is inside.' }}
          </span>
        </p>
      </div>

      <!-- Параметры по типу -->
      <label v-if="zone.type === 'SPEED_LIMIT'" class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        Maximum speed (m/s)
        <NInputNumber :value="zone.maximumSpeed" size="small" :min="0" :step="0.1" @update:value="(v) => update({ maximumSpeed: v ?? undefined })" />
      </label>

      <div v-if="zone.type === 'RELEASE'" class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        If access is revoked while inside
        <div class="flex gap-1">
          <button
            v-for="b in ZONE_RELEASE_LOSS"
            :key="b"
            :class="['flex-1 rounded border px-2 py-1 text-[11px]', zone.releaseLossBehavior === b ? 'border-slate-800 dark:border-brand-500 bg-slate-800 dark:bg-brand-700 text-white' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800']"
            :title="RELEASE_LOSS_HINTS[b]"
            @click="update({ releaseLossBehavior: b })"
          >{{ b.charAt(0) + b.slice(1).toLowerCase() }}</button>
        </div>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">{{ RELEASE_LOSS_HINTS[zone.releaseLossBehavior] }}</span>
      </div>

      <label v-if="zone.type === 'PRIORITY'" class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        Preference (0 — none, 1 — maximum)
        <NInputNumber :value="zone.priorityFactor" size="small" :min="0" :max="1" :step="0.1" @update:value="(v) => update({ priorityFactor: v ?? undefined })" />
      </label>
      <label v-if="zone.type === 'PENALTY'" class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        Penalty (0 — none, 1 — use only if no other way)
        <NInputNumber :value="zone.penaltyFactor" size="small" :min="0" :max="1" :step="0.1" @update:value="(v) => update({ penaltyFactor: v ?? undefined })" />
      </label>

      <template v-if="zone.type === 'DIRECTED' || zone.type === 'BIDIRECTED'">
        <div class="flex items-end gap-3">
          <label class="flex flex-1 flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            Direction (°, 0 = +X, counter-clockwise)
            <NInputNumber :value="directionDeg" size="small" :step="15" @update:value="setDirectionDeg" />
          </label>
          <svg viewBox="-20 -20 40 40" width="40" height="40" class="shrink-0 rounded border border-slate-200 dark:border-slate-700">
            <g :transform="`rotate(${-directionDeg})`" :stroke="meta.color" :fill="meta.color">
              <line x1="-14" y1="0" x2="12" y2="0" stroke-width="2.5" />
              <path d="M 14 0 L 6 -5 L 6 5 Z" stroke="none" />
              <path v-if="zone.type === 'BIDIRECTED'" d="M -14 0 L -6 -5 L -6 5 Z" stroke="none" />
            </g>
          </svg>
        </div>
        <div class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Limitation
          <div class="flex gap-1">
            <button
              v-for="l in (zone.type === 'DIRECTED' ? DIRECTED_LIMITATIONS : BIDIRECTED_LIMITATIONS)"
              :key="l"
              :class="['flex-1 rounded border px-2 py-1 text-[11px]',
                       (zone.type === 'DIRECTED' ? zone.directedLimitation : zone.bidirectedLimitation) === l
                         ? 'border-slate-800 dark:border-brand-500 bg-slate-800 dark:bg-brand-700 text-white' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800']"
              :title="LIMITATION_HINTS[l]"
              @click="update(zone.type === 'DIRECTED' ? { directedLimitation: l } : { bidirectedLimitation: l })"
            >{{ l.charAt(0) + l.slice(1).toLowerCase() }}</button>
          </div>
          <span class="text-[11px] text-slate-400 dark:text-slate-500">
            {{ LIMITATION_HINTS[zone.type === 'DIRECTED' ? zone.directedLimitation : zone.bidirectedLimitation] }}
          </span>
        </div>
      </template>

      <template v-if="zone.type === 'ACTION'">
        <ActionListEditor
          scope="zone" :with-id="false" title="On entry"
          :actions="zone.entryActions || []" @update:actions="(v) => update({ entryActions: v })"
        />
        <ActionListEditor
          scope="zone" :with-id="false" title="While inside"
          :actions="zone.duringActions || []" @update:actions="(v) => update({ duringActions: v })"
        />
        <ActionListEditor
          scope="zone" :with-id="false" title="On exit"
          :actions="zone.exitActions || []" @update:actions="(v) => update({ exitActions: v })"
        />
      </template>

      <!-- Геометрия -->
      <div>
        <div class="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Vertices ({{ zone.vertices.length }})</span>
          <span class="font-mono text-[10px]" :class="isValidShape ? 'text-slate-400 dark:text-slate-500' : 'text-red-600'">
            {{ isValidShape ? `${areaM2.toFixed(2)} m²` : 'edges intersect' }}
          </span>
        </div>
        <div class="max-h-48 space-y-1 overflow-y-auto">
          <div v-for="(p, i) in verticesWorld" :key="i" class="flex items-center gap-1">
            <span class="w-4 text-right font-mono text-[10px] text-slate-400 dark:text-slate-500">{{ i + 1 }}</span>
            <NInputNumber :value="Number(p.x.toFixed(3))" size="tiny" :step="0.1" :show-button="false" style="flex: 1"
                          @update:value="(v) => setVertex(i, 'x', v)">
              <template #prefix><span class="text-[10px] text-slate-400 dark:text-slate-500">x</span></template>
            </NInputNumber>
            <NInputNumber :value="Number(p.y.toFixed(3))" size="tiny" :step="0.1" :show-button="false" style="flex: 1"
                          @update:value="(v) => setVertex(i, 'y', v)">
              <template #prefix><span class="text-[10px] text-slate-400 dark:text-slate-500">y</span></template>
            </NInputNumber>
            <button
              class="rounded px-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-30"
              :disabled="zone.vertices.length <= 3"
              title="Remove vertex"
              @click="removeVertex(i)"
            >×</button>
          </div>
        </div>
        <p class="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Drag corners on the map. Click a midpoint to add a corner.</p>
      </div>

      <div class="mt-2 flex gap-2">
        <button class="flex-1 rounded bg-brand-800 py-2 text-sm text-white hover:bg-brand-900" @click="emit('save')">Save</button>
        <button class="rounded border border-red-300 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40" @click="emit('delete')">Delete</button>
      </div>
    </div>
  </div>
</template>
