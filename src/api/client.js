/**
 * HTTP-клиент Fleet Manager.
 *
 * Единая точка входа для всех запросов к бэку. Управляет:
 * - Base URL из env
 * - JWT-заголовком (auth interceptor)
 * - Автоматическим refresh токена при 401
 * - Единой обработкой ошибок
 * - Runtime-валидацией через Zod-схемы (опционально)
 *
 * Мок-режим включается через `getMockMode()` — если true, каждый вызов
 * функций из api/* проверяет флаг и вместо `client(...)` возвращает мок.
 */

const LS_TOKEN_KEY = 'fm.auth.token'
const LS_REFRESH_KEY = 'fm.auth.refreshToken'
const LS_MOCK_KEY = 'fm.api.useMocks'

// === Config ===
export function getBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL || '/api'
}

// === Mock mode ===
// Приоритет: localStorage (можно менять из UI) → env-переменная → default true (пока бэка нет)
export function getMockMode() {
  const ls = localStorage.getItem(LS_MOCK_KEY)
  if (ls === '1' || ls === 'true') return true
  if (ls === '0' || ls === 'false') return false
  const envVal = import.meta.env.VITE_USE_MOCKS
  if (envVal === 'false' || envVal === '0') return false
  return true  // default пока Семён не поднял бэк
}
export function setMockMode(useMocks) {
  localStorage.setItem(LS_MOCK_KEY, useMocks ? '1' : '0')
}

// === Token storage ===
export function getToken() { return localStorage.getItem(LS_TOKEN_KEY) }
export function setToken(t) {
  if (t) localStorage.setItem(LS_TOKEN_KEY, t)
  else localStorage.removeItem(LS_TOKEN_KEY)
}
export function getRefreshToken() { return localStorage.getItem(LS_REFRESH_KEY) }
export function setRefreshToken(t) {
  if (t) localStorage.setItem(LS_REFRESH_KEY, t)
  else localStorage.removeItem(LS_REFRESH_KEY)
}

// === API error ===
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Основная функция запроса. Все api/*.js должны идти через неё.
 *
 * @param {string} method — GET, POST, PATCH, DELETE
 * @param {string} path — /maps, /maps/:id и т.п.
 * @param {object} [options]
 * @param {any} [options.body] — сериализуется в JSON
 * @param {object} [options.query] — { key: value } → ?key=value
 * @param {object} [options.headers] — доп. заголовки
 * @param {import('zod').ZodSchema} [options.schema] — Zod-схема для парсинга ответа
 * @param {number} [options.timeoutMs=15000]
 * @returns {Promise<any>}
 */
export async function request(method, path, options = {}) {
  const url = buildUrl(path, options.query)
  const headers = {
    'Accept': 'application/json',
    ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 15000)

  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') throw new ApiError(0, 'TIMEOUT', 'Request timed out')
    throw new ApiError(0, 'NETWORK', e.message)
  }
  clearTimeout(timer)

  // 401 → пробуем refresh + повторить один раз
  if (res.status === 401 && path !== '/auth/refresh' && getRefreshToken()) {
    const refreshed = await tryRefresh()
    if (refreshed) return request(method, path, options)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(
      res.status,
      body.code || `HTTP_${res.status}`,
      body.message || res.statusText,
      body.details,
    )
  }

  // 204 No Content
  if (res.status === 204) return null

  const data = await res.json()
  if (options.schema) {
    const parsed = options.schema.safeParse(data)
    if (!parsed.success) {
      console.warn('[api] response schema mismatch:', parsed.error.issues)
      throw new ApiError(500, 'SCHEMA_MISMATCH', 'Backend response does not match schema', parsed.error.issues)
    }
    return parsed.data
  }
  return data
}

function buildUrl(path, query) {
  const base = getBaseUrl().replace(/\/$/, '')
  const clean = path.startsWith('/') ? path : '/' + path
  const qs = query
    ? '?' + Object.entries(query)
      .filter(([, v]) => v != null)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&')
    : ''
  return base + clean + qs
}

let refreshInFlight = null
async function tryRefresh() {
  if (refreshInFlight) return refreshInFlight
  const rt = getRefreshToken()
  if (!rt) return false
  refreshInFlight = (async () => {
    try {
      const url = buildUrl('/auth/refresh')
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      })
      if (!r.ok) return false
      const body = await r.json()
      if (body.token) setToken(body.token)
      if (body.refreshToken) setRefreshToken(body.refreshToken)
      return !!body.token
    } catch { return false }
    finally { refreshInFlight = null }
  })()
  return refreshInFlight
}

// === Хелперы для мок-режима ===
export function withMockDelay(value, minMs = 80, maxMs = 250) {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs))
  return new Promise((r) => setTimeout(() => r(value), ms))
}
