import { ref, readonly } from 'vue'
import { getBaseUrl, getMockMode } from '../api/client'
import { useRobotsStore } from '../stores/robots'

/**
 * WebSocket-клиент телеметрии роботов.
 *
 * Формат сообщений от Семёна (согласовано 2026-09-08):
 *   { type: "state", robot_id: "amr-01", data: { x, y, theta, battery, status } }
 *
 * URL:
 *   - runtime config `window.__FLEET_CONFIG__.wsUrl` в приоритете (если задан)
 *   - иначе derive из apiBaseUrl: http(s)://host/api → ws(s)://host
 *
 * Автопереподключение с экспоненциальным backoff (1с → 2 → 5 → 10 → 30 max).
 * В mock-режиме WS не подключается — телеметрию имитировать некому.
 *
 * Использование: один инстанс на всё приложение, connect() из App.vue.onMounted.
 */

// Enum статусов от Семёна на WS (заглавные, более человеческий чем на HTTP).
// Различается с HTTP STATE_MAP (там ON_TASK, здесь MOVING).
const WS_STATE_MAP = {
  IDLE: 'idle',
  MOVING: 'moving',
  CHARGING: 'charging',
  ERROR: 'error',
  OFFLINE: 'offline',
  TELEOP: 'teleop',
  DEPLOYING: 'deploying',
  MAP_DEPLOYMENT: 'deploying',
  ON_TASK: 'moving',   // на случай если Семён отдаст HTTP-нотацию
}

function deriveWsUrl() {
  const rt = (typeof window !== 'undefined' && window.__FLEET_CONFIG__?.wsUrl) || ''
  if (rt && String(rt).trim()) return String(rt).trim()

  const base = getBaseUrl()  // напр. "http://192.168.0.111:5000/api"
  try {
    const u = new URL(base, window.location.origin)
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProto}//${u.host}`
  } catch {
    return null
  }
}

const state = ref('idle')  // 'idle' | 'connecting' | 'open' | 'closed' | 'error'
const lastMessageAt = ref(null)
const lastError = ref(null)
let ws = null
let reconnectTimer = null
let reconnectAttempt = 0
let stopping = false

function scheduleReconnect() {
  if (stopping) return
  if (reconnectTimer) return
  const backoff = [1000, 2000, 5000, 10000, 30000]
  const wait = backoff[Math.min(reconnectAttempt, backoff.length - 1)]
  reconnectAttempt++
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, wait)
}

function handleMessage(raw) {
  lastMessageAt.value = new Date()
  let msg
  try { msg = JSON.parse(raw) } catch { return }
  if (!msg || msg.type !== 'state' || !msg.robot_id || !msg.data) return

  const store = useRobotsStore()
  const rawStatus = String(msg.data.status || '').toUpperCase()
  const status = WS_STATE_MAP[rawStatus] || 'idle'
  store.applyTelemetry(msg.robot_id, {
    x: Number(msg.data.x) || 0,
    y: Number(msg.data.y) || 0,
    theta: Number(msg.data.theta) || 0,
    battery: Math.round(Number(msg.data.battery) || 0),
    status,
  })
}

export function connect() {
  if (getMockMode()) { state.value = 'idle'; return }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  const url = deriveWsUrl()
  if (!url) { state.value = 'error'; lastError.value = 'Cannot derive WS URL'; return }

  stopping = false
  state.value = 'connecting'
  try {
    ws = new WebSocket(url)
  } catch (e) {
    state.value = 'error'
    lastError.value = e.message
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    state.value = 'open'
    lastError.value = null
    reconnectAttempt = 0
  }
  ws.onmessage = (ev) => handleMessage(ev.data)
  ws.onerror = () => {
    state.value = 'error'
    lastError.value = 'WebSocket error'
  }
  ws.onclose = () => {
    state.value = 'closed'
    if (!stopping) scheduleReconnect()
  }
}

export function disconnect() {
  stopping = true
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) {
    try { ws.close() } catch { /* ignore */ }
    ws = null
  }
  state.value = 'idle'
}

export function useTelemetryWs() {
  return {
    state: readonly(state),
    lastMessageAt: readonly(lastMessageAt),
    lastError: readonly(lastError),
    connect,
    disconnect,
  }
}
