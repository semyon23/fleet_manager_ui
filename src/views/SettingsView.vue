<script setup>
import { ref } from 'vue'
import { NCard, NInput, NButton, NTabs, NTabPane, NSwitch, NTag, useMessage } from 'naive-ui'
import { getMockMode, setMockMode, getBaseUrl } from '../api'

const msg = useMessage()
const useMocks = ref(getMockMode())
const baseUrl = ref(getBaseUrl())

function toggleMocks(v) {
  useMocks.value = v
  setMockMode(v)
  msg.success(v ? 'Mock-режим включён — данные из localStorage' : 'Real-режим — запросы к бэку')
}
</script>

<template>
  <NCard title="Settings" size="small" class="!bg-white">
    <NTabs type="line">
      <NTabPane name="api" tab="API">
        <div class="grid max-w-2xl grid-cols-1 gap-6">
          <div class="rounded border border-slate-200 p-4">
            <div class="mb-3 flex items-center justify-between">
              <div>
                <div class="text-sm font-semibold">Mock mode</div>
                <div class="text-xs text-slate-500">
                  Включён — все запросы идут в localStorage-стабы.
                  Выключен — реальные HTTP-запросы к бэкенду.
                </div>
              </div>
              <NSwitch :value="useMocks" @update:value="toggleMocks" />
            </div>
            <div class="flex items-center gap-2 text-xs">
              Статус:
              <NTag v-if="useMocks" type="warning" size="small">MOCKS</NTag>
              <NTag v-else type="success" size="small">REAL</NTag>
              <span class="text-slate-500">·</span>
              <span class="font-mono text-slate-600">{{ baseUrl }}</span>
            </div>
          </div>

          <label class="text-sm text-slate-600">
            REST API base URL
            <NInput v-model:value="baseUrl" placeholder="/api" class="mt-1" />
            <div class="mt-1 text-[10px] text-slate-500">
              Настраивается через <code class="rounded bg-slate-100 px-1">VITE_API_BASE_URL</code> при билде.
              Runtime-подмена — планируем на следующей итерации.
            </div>
          </label>
        </div>
      </NTabPane>

      <NTabPane name="conn" tab="Backend connection">
        <div class="grid max-w-lg grid-cols-1 gap-4">
          <label class="text-sm text-slate-600">
            MQTT broker URL
            <NInput placeholder="mqtt://backend.local:1883" class="mt-1" />
          </label>
          <label class="text-sm text-slate-600">
            WebSocket endpoint (visualization)
            <NInput placeholder="ws://backend.local:9090" class="mt-1" />
          </label>
          <NButton type="primary" class="self-start" disabled>
            Save & reconnect (coming soon)
          </NButton>
        </div>
      </NTabPane>

      <NTabPane name="users" tab="Users">
        <p class="text-sm text-slate-500">Admin can register operators / engineers here.</p>
      </NTabPane>

      <NTabPane name="general" tab="General">
        <p class="text-sm text-slate-500">Timezone, units, theme.</p>
      </NTabPane>
    </NTabs>
  </NCard>
</template>
