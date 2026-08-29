import { request, getMockMode, withMockDelay, setToken, setRefreshToken, getToken } from './client'
import { LoginResponse } from './schemas'
import * as mocks from './mocks/auth.mock'

/**
 * Auth API — JWT flow. Пути под префиксом /fms/ (Семён, 2026-08-29). Уточнить —
 * может auth стоит держать отдельно от /fms/, но пока для консистентности здесь.
 * - POST /fms/auth/login    { email, password } → { token, refreshToken, expiresAt, user }
 * - POST /fms/auth/refresh  { refreshToken }     → тот же shape
 * - POST /fms/auth/logout                        → 204
 * - GET  /fms/auth/me                            → user
 */

export async function login(email, password) {
  const res = getMockMode()
    ? await withMockDelay(mocks.login(email, password))
    : await request('POST', '/fms/auth/login', { body: { email, password }, schema: LoginResponse })
  setToken(res.token)
  setRefreshToken(res.refreshToken)
  return res
}

export async function logout() {
  try {
    if (!getMockMode()) await request('POST', '/fms/auth/logout')
  } finally {
    setToken(null)
    setRefreshToken(null)
  }
}

export async function me() {
  if (getMockMode()) return withMockDelay(mocks.me())
  return request('GET', '/fms/auth/me')
}

export function isLoggedIn() { return !!getToken() }
