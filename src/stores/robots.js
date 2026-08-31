import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const BASE = import.meta.env.BASE_URL

const AMR_SPRITES = {
  n: `${BASE}robots/amr-01/n.png`,
  ne: `${BASE}robots/amr-01/ne.png`,
  e: `${BASE}robots/amr-01/e.png`,
  se: `${BASE}robots/amr-01/se.png`,
  s: `${BASE}robots/amr-01/s.png`,
  sw: `${BASE}robots/amr-01/sw.png`,
  w: `${BASE}robots/amr-01/w.png`,
  nw: `${BASE}robots/amr-01/nw.png`,
  top: `${BASE}robots/amr-01/top.png`,
}

export const useRobotsStore = defineStore('robots', () => {
  // Стартуем ВСЕГДА с пустого списка — и в mock, и в real.
  // Демо-роботы удалены по фидбеку Семёна 2026-08-31: пользователь должен
  // видеть только реальных зарегистрированных роботов.
  const robots = ref([])

  const counts = computed(() => ({
    moving: robots.value.filter((r) => r.status === 'moving').length,
    charging: robots.value.filter((r) => r.status === 'charging').length,
    idle: robots.value.filter((r) => r.status === 'idle').length,
    error: robots.value.filter((r) => r.status === 'error').length,
    offline: robots.value.filter((r) => r.status === 'offline').length,
    teleop: robots.value.filter((r) => r.status === 'teleop').length,
    deploying: robots.value.filter((r) => r.status === 'deploying').length,
    total: robots.value.length,
  }))

  const totalBattery = computed(() => {
    if (!robots.value.length) return 0
    return Math.round(robots.value.reduce((s, r) => s + r.battery, 0) / robots.value.length)
  })

  // === Глобальный polling: GET /fms/robots каждую секунду ===
  // Запускается один раз из App.vue.onMounted, доступен во всех views.
  const POLL_MS = 1000
  const pollingActive = ref(false)
  const lastPollAt = ref(null)
  const lastPollError = ref(null)
  let pollTimer = null

  async function pollOnce() {
    // Ленивый импорт — иначе циклическая зависимость stores/api.
    const api = await import('../api')
    try {
      const fresh = await api.robots.listRobots()
      mergeRobots(fresh)
      lastPollAt.value = new Date()
      lastPollError.value = null
    } catch (e) {
      lastPollError.value = e.code ? `${e.code} — ${e.message}` : (e.message || 'poll failed')
    }
  }

  function startPolling() {
    if (pollTimer) return
    pollingActive.value = true
    pollOnce()
    pollTimer = setInterval(pollOnce, POLL_MS)
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    pollingActive.value = false
  }

  // Локально добавить только что зарегистрированного робота (после успешного
  // ответа api.robots.registerRobot). Стартовые значения — offline / 0, дальше
  // WebSocket от бэка обновит реальную позицию/статус.
  function addRobot({ name, manufacturer, amr_class }) {
    robots.value.push({
      id: name,
      model: manufacturer ? `${manufacturer} · ${amr_class}` : amr_class,
      sprites: AMR_SPRITES,
      status: 'offline',
      battery: 0, x: 0, y: 0, theta: 0,
      mission: null, uptime: '0h',
    })
  }

  // Локально убрать робота по id (после успешного api.robots.deleteRobot).
  // Polling всё равно догонит через 1 сек, но UX отзывчивее сразу.
  function removeRobot(id) {
    robots.value = robots.value.filter((r) => r.id !== id)
  }

  // Замерджить свежий список с бэка (GET /fms/robots). Известным роботам
  // сохраняем sprites — их бэк не отдаёт, это фронтовое поле.
  function mergeRobots(freshList) {
    const spritesById = new Map(robots.value.map((r) => [r.id, r.sprites]))
    robots.value = freshList.map((r) => ({
      ...r,
      sprites: spritesById.get(r.id) || AMR_SPRITES,
    }))
  }

  return {
    robots, counts, totalBattery,
    addRobot, mergeRobots, removeRobot,
    pollingActive, lastPollAt, lastPollError,
    startPolling, stopPolling,
  }
})
