const MOCK_USER = {
  id: 'u-1',
  email: 'operator@fleet.local',
  name: 'Aleksey',
  role: 'admin',
}

export function login(email /*, password */) {
  return {
    token: 'mock.jwt.' + Math.random().toString(36).slice(2),
    refreshToken: 'mock.refresh.' + Math.random().toString(36).slice(2),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    user: { ...MOCK_USER, email: email || MOCK_USER.email },
  }
}
export function me() { return { ...MOCK_USER } }
