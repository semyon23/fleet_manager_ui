<script setup>
import { computed } from 'vue'
import { NInput, NInputNumber, NSwitch } from 'naive-ui'
import ActionListEditor from './ActionListEditor.vue'
import { ORIENTATION_TYPES, CORRIDOR_REFERENCE_POINTS, CORRIDOR_RELEASE_LOSS } from '../../lib/vda5050'
import { radToDeg, degToRad, normalizeAngle } from '../../lib/geometry'

const props = defineProps({
  edge: { type: Object, required: true },
  lengthMeters: { type: Number, default: null },
})
const emit = defineEmits(['update', 'delete', 'save'])

// undefined в patch — удалить поле (необязательный атрибут не задан)
function update(patch) {
  emit('update', patch)
}
const num = (v) => (v === null || v === undefined || !Number.isFinite(v) ? undefined : v)

const hasOrientation = computed(() => Number.isFinite(props.edge.orientation))
const orientationDeg = computed(() => (hasOrientation.value ? Number(radToDeg(props.edge.orientation).toFixed(1)) : null))

function toggleOrientation(on) {
  update(on ? { orientation: 0, orientationType: 'TANGENTIAL' } : { orientation: undefined, orientationType: undefined, reachOrientationBeforeEntering: undefined })
}

const corridor = computed(() => props.edge.corridor || null)
function toggleCorridor(on) {
  update({ corridor: on ? { leftWidth: 0.5, rightWidth: 0.5 } : undefined })
}
function patchCorridor(patch) {
  const next = { ...corridor.value, ...patch }
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
  update({ corridor: next })
}

const ORIENTATION_HINTS = {
  TANGENTIAL: 'Relative to the path: 0° forward, 180° backward',
  GLOBAL: 'Relative to the map (omnidirectional robots only)',
}
</script>

<template>
  <div>
    <h3 class="mb-3 text-base font-semibold">Edit Edge</h3>
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span class="font-mono">{{ edge.from }} → {{ edge.to }}</span>
        <span v-if="lengthMeters != null" class="font-mono">{{ lengthMeters.toFixed(2) }} m</span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Max speed (m/s)
          <NInputNumber :value="edge.maxSpeed" size="small" :min="0" :step="0.1" @update:value="(v) => update({ maxSpeed: v ?? 1 })" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Cost
          <NInputNumber :value="edge.cost" size="small" :min="0" :step="0.1" @update:value="(v) => update({ cost: v ?? 0 })" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400" title="Maximum height of the robot with its load">
          Max robot height (m)
          <NInputNumber :value="edge.maximumMobileRobotHeight ?? null" size="small" :min="0" :step="0.1" clearable placeholder="any"
                        @update:value="(v) => update({ maximumMobileRobotHeight: num(v) })" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400" title="Minimum height of the load handling device">
          Min fork height (m)
          <NInputNumber :value="edge.minimumLoadHandlingDeviceHeight ?? null" size="small" :min="0" :step="0.05" clearable placeholder="any"
                        @update:value="(v) => update({ minimumLoadHandlingDeviceHeight: num(v) })" />
        </label>
        <label class="col-span-2 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Max rotation speed (rad/s)
          <NInputNumber :value="edge.maximumRotationSpeed ?? null" size="small" :min="0" :step="0.1" clearable placeholder="no limit"
                        @update:value="(v) => update({ maximumRotationSpeed: num(v) })" />
        </label>
      </div>

      <!-- Ориентация робота на ребре -->
      <div class="rounded border border-slate-200 dark:border-slate-700 p-2">
        <label class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
          Fixed robot orientation
          <NSwitch size="small" :value="hasOrientation" @update:value="toggleOrientation" />
        </label>
        <template v-if="hasOrientation">
          <div class="mt-2 grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              Angle (°)
              <NInputNumber :value="orientationDeg" size="small" :step="90"
                            @update:value="(v) => v !== null && update({ orientation: normalizeAngle(degToRad(v)) })" />
            </label>
            <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              Relative to
              <select class="rounded border border-slate-200 dark:border-slate-700 px-1 py-1.5 text-xs" :value="edge.orientationType || 'TANGENTIAL'"
                      @change="update({ orientationType: $event.target.value })">
                <option v-for="o in ORIENTATION_TYPES" :key="o" :value="o">{{ o === 'TANGENTIAL' ? 'Path' : 'Map' }}</option>
              </select>
            </label>
          </div>
          <p class="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{{ ORIENTATION_HINTS[edge.orientationType || 'TANGENTIAL'] }}</p>
          <label class="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400" title="Omnidirectional robots only">
            Turn before entering the edge
            <NSwitch size="small" :value="!!edge.reachOrientationBeforeEntering"
                     @update:value="(v) => update({ reachOrientationBeforeEntering: v || undefined })" />
          </label>
        </template>
      </div>

      <!-- Коридор для объезда препятствий -->
      <div class="rounded border border-slate-200 dark:border-slate-700 p-2">
        <label class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
          Corridor (obstacle avoidance)
          <NSwitch size="small" :value="!!corridor" @update:value="toggleCorridor" />
        </label>
        <template v-if="corridor">
          <div class="mt-2 grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              Left (m)
              <NInputNumber :value="corridor.leftWidth" size="small" :min="0" :step="0.1" @update:value="(v) => patchCorridor({ leftWidth: v ?? 0 })" />
            </label>
            <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              Right (m)
              <NInputNumber :value="corridor.rightWidth" size="small" :min="0" :step="0.1" @update:value="(v) => patchCorridor({ rightWidth: v ?? 0 })" />
            </label>
          </div>
          <label class="mt-2 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            Boundary applies to
            <select class="rounded border border-slate-200 dark:border-slate-700 px-1 py-1.5 text-xs" :value="corridor.corridorReferencePoint || 'KINEMATIC_CENTER'"
                    @change="patchCorridor({ corridorReferencePoint: $event.target.value })">
              <option v-for="r in CORRIDOR_REFERENCE_POINTS" :key="r" :value="r">{{ r === 'CONTOUR' ? 'Robot contour' : 'Robot center' }}</option>
            </select>
          </label>
          <label class="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            Robot must ask before leaving the path
            <NSwitch size="small" :value="!!corridor.releaseRequired"
                     @update:value="(v) => patchCorridor({ releaseRequired: v || undefined, releaseLossBehavior: v ? (corridor.releaseLossBehavior || 'STOP') : undefined })" />
          </label>
          <label v-if="corridor.releaseRequired" class="mt-2 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            If permission is lost
            <select class="rounded border border-slate-200 dark:border-slate-700 px-1 py-1.5 text-xs" :value="corridor.releaseLossBehavior || 'STOP'"
                    @change="patchCorridor({ releaseLossBehavior: $event.target.value })">
              <option v-for="b in CORRIDOR_RELEASE_LOSS" :key="b" :value="b">{{ b === 'STOP' ? 'Stop and wait' : 'Return to the path' }}</option>
            </select>
          </label>
        </template>
      </div>

      <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400" title="Only for robots following a physical line">
        Junction direction (line-following robots)
        <NInput :value="edge.direction || ''" size="small" placeholder="e.g. left, straight"
                @update:value="(v) => update({ direction: v || undefined })" />
      </label>

      <ActionListEditor scope="edge" :actions="edge.actions || []" @update:actions="(v) => update({ actions: v })" />

      <div class="mt-2 flex gap-2">
        <button class="flex-1 rounded bg-brand-800 py-2 text-sm text-white hover:bg-brand-900" @click="emit('save')">Save</button>
        <button class="rounded border border-red-300 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40" @click="emit('delete')">Delete</button>
      </div>
    </div>
  </div>
</template>
