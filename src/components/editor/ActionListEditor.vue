<script setup>
import { computed } from 'vue'
import { NAutoComplete, NInput, NCheckbox } from 'naive-ui'
import {
  BLOCKING_TYPES, BLOCKING_HINTS, actionsForScope, predefinedAction, parseParamValue, formatParamValue,
} from '../../lib/vda5050'
import { newActionId } from '../../lib/vdaLayout'

/**
 * Список action для узла, ребра или зоны.
 * scope — 'node' | 'edge' | 'zone': от него зависят подсказки типов.
 * withId — у action в узлах/рёбрах есть actionId; у zone action его нет (генерирует робот).
 */
const props = defineProps({
  actions: { type: Array, default: () => [] },
  scope: { type: String, required: true },
  withId: { type: Boolean, default: true },
  title: { type: String, default: 'Actions' },
})
const emit = defineEmits(['update:actions'])

const suggestions = computed(() => actionsForScope(props.scope).map((a) => a.type))

function typeOptions(value) {
  const q = (value || '').toLowerCase()
  return suggestions.value.filter((t) => t.toLowerCase().includes(q))
}

function commit(list) {
  emit('update:actions', list)
}

function addAction() {
  const a = { actionType: '', blockingType: 'NONE', actionDescriptor: '', actionParameters: [] }
  if (props.withId) a.actionId = newActionId()
  commit([...props.actions, a])
}

function removeAction(idx) {
  commit(props.actions.filter((_, i) => i !== idx))
}

function patchAction(idx, patch) {
  commit(props.actions.map((a, i) => (i === idx ? { ...a, ...patch } : a)))
}

function setParams(idx, params) {
  patchAction(idx, { actionParameters: params })
}

function addParam(idx) {
  setParams(idx, [...(props.actions[idx].actionParameters || []), { key: '', value: '' }])
}

function patchParam(idx, pi, patch) {
  setParams(idx, (props.actions[idx].actionParameters || []).map((p, j) => (j === pi ? { ...p, ...patch } : p)))
}

function removeParam(idx, pi) {
  setParams(idx, (props.actions[idx].actionParameters || []).filter((_, j) => j !== pi))
}

// Рекомендуемые параметры стандартного action, которых ещё нет у этого action.
function missingParams(a) {
  const def = predefinedAction(a.actionType)
  if (!def?.params) return []
  const have = new Set((a.actionParameters || []).map((p) => p.key))
  return def.params.filter((p) => !have.has(p.key))
}

// Добавить один рекомендуемый параметр. По одному — чтобы необязательные
// параметры с пустыми значениями не попадали в order.
function addKnownParam(idx, p) {
  const value = p.type === 'number' ? 0 : p.type === 'array' ? [] : ''
  setParams(idx, [...(props.actions[idx].actionParameters || []), { key: p.key, value }])
}

function paramHint(a, key) {
  const p = predefinedAction(a.actionType)?.params?.find((x) => x.key === key)
  if (!p) return 'value: text, number, true/false or JSON'
  return `${p.type}${p.optional ? ', optional' : ''}`
}
</script>

<template>
  <div>
    <div class="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
      <span>{{ title }} ({{ actions.length }})</span>
    </div>
    <div class="space-y-2">
      <div v-for="(a, i) in actions" :key="a.actionId || i" class="rounded border border-slate-200 dark:border-slate-700 p-2">
        <div class="mb-1.5 flex items-center gap-1">
          <NAutoComplete
            :value="a.actionType"
            :options="typeOptions(a.actionType)"
            :get-show="() => true"
            size="tiny"
            placeholder="Action type"
            style="flex: 1"
            @update:value="(v) => patchAction(i, { actionType: v })"
          />
          <select
            class="rounded border border-slate-200 dark:border-slate-700 px-1 py-1 font-mono text-[10px]"
            :value="a.blockingType"
            :title="BLOCKING_HINTS[a.blockingType]"
            @change="patchAction(i, { blockingType: $event.target.value })"
          >
            <option v-for="b in BLOCKING_TYPES" :key="b" :value="b" :title="BLOCKING_HINTS[b]">{{ b }}</option>
          </select>
          <button class="rounded px-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40" title="Remove action" @click="removeAction(i)">×</button>
        </div>
        <div class="mb-1.5 flex items-center gap-2">
          <NInput
            :value="a.actionDescriptor || ''"
            size="tiny"
            placeholder="Description (optional)"
            style="flex: 1"
            @update:value="(v) => patchAction(i, { actionDescriptor: v })"
          />
          <NCheckbox
            size="small"
            :checked="!!a.retriable"
            title="Robot may retry the action if it fails"
            @update:checked="(v) => patchAction(i, { retriable: v || undefined })"
          >
            <span class="text-[10px] text-slate-500 dark:text-slate-400">Retriable</span>
          </NCheckbox>
        </div>
        <div class="mb-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Parameters</span>
          <button class="text-brand-800 dark:text-brand-400 hover:underline" @click="addParam(i)">+ param</button>
        </div>
        <div v-if="missingParams(a).length" class="mb-1 flex flex-wrap gap-1">
          <button
            v-for="p in missingParams(a)"
            :key="p.key"
            :class="[
              'rounded border px-1.5 py-0.5 font-mono text-[10px] hover:border-brand-800 hover:text-brand-800 dark:hover:text-brand-400',
              p.optional ? 'border-dashed border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500' : 'border-slate-400 dark:border-slate-500 text-slate-600 dark:text-slate-300',
            ]"
            :title="`${p.type}${p.optional ? ', optional' : ', recommended'}`"
            @click="addKnownParam(i, p)"
          >+ {{ p.key }}</button>
        </div>
        <div v-for="(p, pi) in (a.actionParameters || [])" :key="pi" class="mb-1 flex gap-1">
          <NInput :value="p.key" size="tiny" placeholder="key" style="flex: 1" @update:value="(v) => patchParam(i, pi, { key: v })" />
          <NInput
            :value="formatParamValue(p.value)"
            size="tiny"
            :placeholder="paramHint(a, p.key)"
            :title="paramHint(a, p.key)"
            style="flex: 2"
            @update:value="(v) => patchParam(i, pi, { value: parseParamValue(v) })"
          />
          <button class="rounded px-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40" @click="removeParam(i, pi)">×</button>
        </div>
      </div>
      <button
        class="flex w-full items-center justify-center gap-2 rounded border border-dashed border-slate-300 dark:border-slate-600 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:border-brand-800 hover:text-brand-800 dark:hover:text-brand-400"
        @click="addAction"
      >
        + Add action
      </button>
    </div>
  </div>
</template>
