import { ref, readonly } from 'vue'
import mqtt from 'mqtt'
import { getMockMode } from '../api/client'
import { useRobotsStore } from '../stores/robots'

/**
 * MQTT over WebSocket: позиции и online/offline роботов напрямую от брокера.
 * Схема и ACL: docs/MOSQUITTO_SETUP.md (пользователь fleet-ui, только чтение).
 *
 * Топики VDA5050 на робота:
 *   uagv/v2/<manufacturer>/<serialNumber>/visualization  → agvPosition {x, y, theta}
 *   uagv/v2/<manufacturer>/<serialNumber>/connection     → connectionState
 *
 * serialNumber = name робота (он же robot_id и логин робота в брокере).
 * manufacturer берём из формы регистрации: подписываемся только после того,
 * как бэк ответил success на POST /fms/robots. Пустой manufacturer (бэк это
 * разрешает) → wildcard `+`.
 *
 * После F5 подписки восстанавливаются из GET /fms/robots (см. syncRobots).
 *
 * Конфиг: window.__FLEET_CONFIG__.mqttUrl / mqttUser / mqttPassword.
 * Пустой mqttUrl или mock-режим → MQTT выключен, позиции идут из WS control.
 */

const INTERFACE = 'uagv'
const VERSION = 'v2'

function cfg() {
  return (typeof window !== 'undefined' && window.__FLEET_CONFIG__) || {}
}

function topicsFor(robotId, manufacturer) {
  const m = (manufacturer && String(manufacturer).trim()) || '+'
  const base = `${INTERFACE}/${VERSION}/${m}/${robotId}`
  return [`${base}/visualization`, `${base}/connection`]
}

const state = ref('idle')  // 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'disabled'
const lastError = ref(null)
let client = null
// robotId → manufacturer ('' = wildcard). Источник правды для подписок:
// при реконнекте переподписываемся по этой карте.
const subscriptions = new Map()

// visualization может идти с высокой частотой — копим последнее значение
// и применяем к стору раз в кадр.
const pendingPose = new Map()
let rafId = null

function flushPoses() {
  rafId = null
  const store = useRobotsStore()
  for (const [robotId, pose] of pendingPose) store.applyTelemetry(robotId, pose)
  pendingPose.clear()
}

function schedulePose(robotId, pose) {
  pendingPose.set(robotId, pose)
  if (rafId == null) rafId = requestAnimationFrame(flushPoses)
}

function handleMessage(topic, payload) {
  // uagv/v2/<manufacturer>/<serialNumber>/<subtopic>
  const parts = topic.split('/')
  if (parts.length !== 5) return
  const robotId = parts[3]
  const sub = parts[4]
  if (!subscriptions.has(robotId)) return

  let msg
  try { msg = JSON.parse(payload.toString()) } catch { return }

  if (sub === 'visualization') {
    const p = msg?.agvPosition
    if (!p) return
    schedulePose(robotId, {
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      theta: Number(p.theta) || 0,
    })
  } else if (sub === 'connection') {
    // ONLINE → статус не трогаем, его отдаёт control (WS/poll).
    // OFFLINE / CONNECTIONBROKEN → сразу offline, не дожидаясь poll.
    if (msg?.connectionState && msg.connectionState !== 'ONLINE') {
      useRobotsStore().applyTelemetry(robotId, { status: 'offline' })
    }
  }
}

function doSubscribe(robotId, manufacturer) {
  if (!client?.connected) return  // подпишемся в on('connect')
  client.subscribe(topicsFor(robotId, manufacturer), { qos: 0 }, (err) => {
    if (err) lastError.value = `subscribe ${robotId}: ${err.message}`
  })
}

function doUnsubscribe(robotId, manufacturer) {
  if (!client?.connected) return
  client.unsubscribe(topicsFor(robotId, manufacturer))
}

export function connect() {
  const { mqttUrl, mqttUser, mqttPassword } = cfg()
  if (getMockMode() || !mqttUrl || !String(mqttUrl).trim()) { state.value = 'disabled'; return }
  if (client) return

  state.value = 'connecting'
  client = mqtt.connect(String(mqttUrl).trim(), {
    username: mqttUser || undefined,
    password: mqttPassword || undefined,
    clientId: `fleet-ui-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
  })

  client.on('connect', () => {
    state.value = 'open'
    lastError.value = null
    // clean session: после каждого (пере)подключения подписки надо восстановить
    for (const [robotId, manufacturer] of subscriptions) doSubscribe(robotId, manufacturer)
  })
  client.on('message', handleMessage)
  client.on('error', (e) => { state.value = 'error'; lastError.value = e.message })
  client.on('close', () => { if (state.value !== 'idle') state.value = 'closed' })
}

export function disconnect() {
  state.value = 'idle'
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null }
  pendingPose.clear()
  if (client) { client.end(true); client = null }
}

// Подписаться на робота. Вызывать после успешного POST /fms/robots.
export function subscribeRobot(robotId, manufacturer = '') {
  if (!robotId) return
  const m = (manufacturer || '').trim()
  const prev = subscriptions.get(robotId)
  if (prev === m) return
  if (prev !== undefined) doUnsubscribe(robotId, prev)
  subscriptions.set(robotId, m)
  doSubscribe(robotId, m)
}

// Отписаться от робота. Вызывать после успешного DELETE /fms/robots.
export function unsubscribeRobot(robotId) {
  if (!subscriptions.has(robotId)) return
  doUnsubscribe(robotId, subscriptions.get(robotId))
  subscriptions.delete(robotId)
  pendingPose.delete(robotId)
}

// Досподписка по списку с бэка (после F5 карта подписок пустая).
// Уже подписанных с явным manufacturer не трогаем: manufacturer из формы
// регистрации точнее, чем hardware_version, которое робот ещё мог не прислать.
// Отписку здесь не делаем: poll, стартовавший до POST, может вернуть список
// без только что добавленного робота. Отписка только через unsubscribeRobot.
export function syncRobots(robots) {
  for (const r of robots) {
    const known = subscriptions.get(r.id)
    if (known === undefined || (known === '' && r.manufacturer)) subscribeRobot(r.id, r.manufacturer || '')
  }
}

export function useRobotMqtt() {
  return {
    state: readonly(state),
    lastError: readonly(lastError),
    connect,
    disconnect,
    subscribeRobot,
    unsubscribeRobot,
    syncRobots,
  }
}
