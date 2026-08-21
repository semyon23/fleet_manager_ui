<script setup>
import { NCard, NInput, NButton, NTabs, NTabPane } from 'naive-ui'
</script>

<template>
  <NCard title="Settings" size="small" class="!bg-white">
    <NTabs type="line">
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
          <label class="text-sm text-slate-600">
            REST API base URL
            <NInput placeholder="https://backend.local/api" class="mt-1" />
          </label>
          <NButton type="primary" class="self-start">Save & reconnect</NButton>
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
