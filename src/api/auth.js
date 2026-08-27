import { request, getMockMode, withMockDelay, setToken, setRefreshToken, getToken } from './client'
import { LoginResponse } from './schemas'
import * as mocks from './mocks/auth.mock'

/**
 * Auth API — JWT flow.
 * - POST /auth/login    { email, password } → { token, refreshToken, expiresAt, user }
 * - POST /auth/refresh  { refreshToken }     → тот же shape
 * - POST /auth/logout                        → 204
 * - GET  /auth/me                            → user
 */

export async function login(email, password) {
  const res = getMockMode()
    ? await withMockDelay(mocks.login(email, password))
    : await request('POST', '/auth/login', { body: { email, password }, schema: LoginResponse })
  setToken(res.token)
  setRefreshToken(res.refreshToken)
  return res
}

export async function logout() {
  try {
    if (!getMockMode()) await request('POST', '/auth/logout')
  } finally {
    setToken(null)
    setRefreshToken(null)
  }
}

export async function me() {
  if (getMockMode()) return withMockDelay(mocks.me())
  return request('GET', '/auth/me')
}

export function isLoggedIn() { return !!getToken() }
