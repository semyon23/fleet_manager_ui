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
      state: 'ON_TASK',
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

  it('maps ON_TASK → moving, rounds battery, joins model', () => {
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

  it('maps MAP_DEPLOYMENT and TELEOP correctly', () => {
    expect(S.wireToRobot({ ...wire, status: { ...wire.status, state: 'MAP_DEPLOYMENT' } }).status).toBe('deploying')
    expect(S.wireToRobot({ ...wire, status: { ...wire.status, state: 'TELEOP' } }).status).toBe('teleop')
  })

  it('unknown state falls back to idle', () => {
    const r = S.wireToRobot({ ...wire, status: { ...wire.status, state: 'FLYING' } })
    expect(r.status).toBe('idle')
  })
})

describe('MapEntity — поля VDA 5050 v3 и зоны', () => {
  const base = {
    id: 'm1', name: 'F1', width: 100, height: 100,
    meta: { resolution: 0.05, origin: [0, 0, 0] },
  }

  it('сохраняет атрибуты узла/ребра и зоны', () => {
    const m = S.MapEntity.parse({
      ...base,
      waypoints: [{ id: 'n1', u: 1, v: 2, name: 'n1', theta: 1.57, allowedDeviationXY: { a: 0.2, b: 0.1, theta: 0 },
        actions: [{ actionId: 'a', actionType: 'waitForTrigger', blockingType: 'HARD', actionParameters: [{ key: 'triggerType', value: ['LOCAL'] }] }] }],
      edges: [{ id: 'e', from: 'n1', to: 'n1', maxSpeed: 1, corridor: { leftWidth: 0.5, rightWidth: 0.5, releaseRequired: true, releaseLossBehavior: 'RETURN' } }],
      zones: [{ id: 'z1', type: 'SPEED_LIMIT', vertices: [{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 10, v: 10 }], maximumSpeed: 0.3 }],
    })
    expect(m.waypoints[0].theta).toBe(1.57)
    expect(m.waypoints[0].actions[0].actionParameters[0].value).toEqual(['LOCAL'])
    expect(m.edges[0].corridor.releaseLossBehavior).toBe('RETURN')
    expect(m.zones[0].maximumSpeed).toBe(0.3)
  })

  it('отклоняет зону с неизвестным типом или < 3 вершин', () => {
    expect(() => S.MapEntity.parse({ ...base, zones: [{ id: 'z', type: 'LAVA', vertices: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }] }] })).toThrow()
    expect(() => S.MapEntity.parse({ ...base, zones: [{ id: 'z', type: 'BLOCKED', vertices: [{ u: 0, v: 0 }] }] })).toThrow()
  })
})
