import { ref, computed, onMounted, onBeforeUnmount, readonly } from 'vue'
import { getMockMode, getBaseUrl } from '../api/client'

/**
 * Пингует бэк раз в PING_MS, определяет 4 состояния: online / degraded / offline / mock.
 * Правило (по договорённости с Семёном 2026-09-01):
 *   - GET /api/health возвращает 200 за <2сек → online (зелёный)
 *   - GET /api/health возвращает 200 за >=2сек → degraded (жёлтый)
 *   - 3 подряд провала (сеть/таймаут/5xx/404) → offline (красный)
 *   - localStorage mock mode → mock (амбер-пульс)
 *
 * Singleton — один инстанс на всё приложение. Импортируется в топбаре и в других
 * местах если нужно; startPing() вызвать один раз в App.vue.onMounted.
 */

const PING_MS = 3000
const TIMEOUT_MS = 2000
const DEGRADED_MS = 2000
const FAIL_THRESHOLD = 3

const state = ref('unknown')  // 'online' | 'degraded' | 'offline' | 'mock' | 'unknown'
const latencyMs = ref(null)
const lastCheckedAt = ref(null)
let failStreak = 0
let timer = null

async function pingOnce() {
  if (getMockMode()) {
    state.value = 'mock'
    latencyMs.value = null
    lastCheckedAt.value = new Date()
    return
  }
  const controller = new AbortController()
  const to = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const t0 = performance.now()
  try {
    const res = await fetch(`${getBaseUrl()}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    })
    const dt = performance.now() - t0
    latencyMs.value = Math.round(dt)
    lastCheckedAt.value = new Date()
    if (!res.ok) {
      failStreak++
      if (failStreak >= FAIL_THRESHOLD) state.value = 'offline'
    } else {
      failStreak = 0
      state.value = dt >= DEGRADED_MS ? 'degraded' : 'online'
    }
  } catch (_e) {
    latencyMs.value = null
    lastCheckedAt.value = new Date()
    failStreak++
    if (failStreak >= FAIL_THRESHOLD) state.value = 'offline'
  } finally {
    clearTimeout(to)
  }
}

function startPing() {
  if (timer) return
  pingOnce()
  timer = setInterval(pingOnce, PING_MS)
}
function stopPing() {
  if (timer) { clearInterval(timer); timer = null }
}

export function useBackendHealth() {
  onMounted(startPing)
  onBeforeUnmount(() => { /* singleton — не останавливаем при unmount отдельного компонента */ })
  return {
    state: readonly(state),
    latencyMs: readonly(latencyMs),
    lastCheckedAt: readonly(lastCheckedAt),
    startPing,
    stopPing,
    // Доп. computed для UI
    color: computed(() => (
      state.value === 'online' ? '#22c55e' :
      state.value === 'degraded' ? '#eab308' :
      state.value === 'offline' ? '#ef4444' :
      state.value === 'mock' ? '#f59e0b' :
      '#94a3b8'
    )),
    label: computed(() => (
      state.value === 'online' ? 'Connected' :
      state.value === 'degraded' ? 'Slow connection' :
      state.value === 'offline' ? 'Not connected' :
      state.value === 'mock' ? 'Local mocks' :
      'Checking…'
    )),
  }
}
