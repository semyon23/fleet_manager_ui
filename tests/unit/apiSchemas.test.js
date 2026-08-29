import { describe, it, expect } from 'vitest'
import * as S from '../../src/api/schemas'

describe('API schemas — happy path', () => {
  it('LoginResponse parses valid payload', () => {
    const ok = S.LoginResponse.safeParse({
      token: 't', refreshToken: 'r',
      expiresAt: '2026-08-27T11:15:00Z',
      user: { id: 'u1', email: 'a@b.com', name: 'A', role: 'admin' },
    })
    expect(ok.success).toBe(true)
  })

  it('MapEntity accepts minimum fields', () => {
    const ok = S.MapEntity.safeParse({
      id: 'm1', name: 'M', width: 100, height: 100,
      meta: { resolution: 0.05, origin: [0, 0, 0] },
    })
    expect(ok.success).toBe(true)
  })

  it('Robot rejects battery > 100', () => {
    const bad = S.Robot.safeParse({
      id: 'r', model: 'T', status: 'idle', battery: 120, x: 0, y: 0, theta: 0,
    })
    expect(bad.success).toBe(false)
  })

  it('Robot rejects unknown status', () => {
    const bad = S.Robot.safeParse({
      id: 'r', model: 'T', status: 'flying', battery: 50, x: 0, y: 0, theta: 0,
    })
    expect(bad.success).toBe(false)
  })

  it('Mission requires createdAt as ISO', () => {
    const bad = S.Mission.safeParse({
      id: 'M', name: 'x', mapId: 'm', status: 'pending',
      robotId: null, nodeIds: [],
      createdAt: 'yesterday', updatedAt: 'yesterday',
    })
    expect(bad.success).toBe(false)
  })

  it('Alert acknowledged defaults to false', () => {
    const ok = S.Alert.parse({
      id: 'A', severity: 'info', robotId: null, message: 'x',
      createdAt: '2026-08-27T11:00:00Z',
    })
    expect(ok.acknowledged).toBe(false)
  })

  it('CreateMissionRequest requires >= 2 nodeIds', () => {
    const bad = S.CreateMissionRequest.safeParse({
      name: 'x', mapId: 'm', nodeIds: ['only-one'],
    })
    expect(bad.success).toBe(false)
  })

  it('Waypoint action blockingType must be enum', () => {
    const bad = S.Waypoint.safeParse({
      id: 'n1', u: 0, v: 0, name: 'n',
      actions: [{ actionId: 'a', actionType: 'pick', blockingType: 'HARDCORE' }],
    })
    expect(bad.success).toBe(false)
  })
})

describe('RobotWire → Robot mapper', () => {
  const wire = {
    name: 'amr-01',
    spec: { labels: [], battery: { critical_level: 20 } },
    status: {
      online: true,
      state: 'MOVING',
      battery_level: 78.4,
      pose: { x: 12.4, y: 8.2, theta: 1.57 },
      identifier: { agv_class: 'CARRIER', speed_max: 1.5 },
      hardware_version: { manufacturer: 'SomeCorp', serial_number: 'SN1' },
      software_version: { os: 'Linux', app: '1.0' },
      info_messages: [],
      errors: [],
    },
  }

  it('parses wire schema', () => {
    expect(S.RobotWire.safeParse(wire).success).toBe(true)
  })

  it('maps MOVING → moving, rounds battery, joins model', () => {
    const r = S.wireToRobot(wire)
    expect(r.id).toBe('amr-01')
    expect(r.status).toBe('moving')
    expect(r.battery).toBe(78)
    expect(r.x).toBe(12.4)
    expect(r.model).toBe('SomeCorp · CARRIER')
  })

  it('offline overrides state when status.online=false', () => {
    const r = S.wireToRobot({ ...wire, status: { ...wire.status, online: false } })
    expect(r.status).toBe('offline')
  })

  it('unknown state falls back to idle', () => {
    const r = S.wireToRobot({ ...wire, status: { ...wire.status, state: 'FLYING' } })
    expect(r.status).toBe('idle')
  })
})
