import { describe, it, expect } from 'vitest'
import { validateMap } from '../../src/lib/validateMap'

function makeMap(overrides = {}) {
  return {
    id: 'test',
    waypoints: [],
    edges: [],
    stations: [],
    ...overrides,
  }
}

describe('validateMap', () => {
  it('пустая карта — 0 ошибок, 0 warning', () => {
    const v = validateMap(makeMap())
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
  })

  it('null map возвращает ошибку', () => {
    const v = validateMap(null)
    expect(v.errors.length).toBe(1)
  })

  it('ловит дубликат waypoint ID', () => {
    const v = validateMap(makeMap({
      waypoints: [
        { id: 'n1', u: 0, v: 0 },
        { id: 'n1', u: 10, v: 10 },
      ],
    }))
    expect(v.errors.some((e) => e.includes('Duplicate'))).toBe(true)
  })

  it('ловит конфликт waypoint vs station по ID', () => {
    const v = validateMap(makeMap({
      waypoints: [{ id: 'x', u: 0, v: 0 }],
      stations: [{ id: 'x', u: 0, v: 0, kind: 'charge' }],
    }))
    expect(v.errors.some((e) => e.includes('station conflicts'))).toBe(true)
  })

  it('ловит дубликат edge ID', () => {
    const v = validateMap(makeMap({
      waypoints: [{ id: 'a', u: 0, v: 0 }, { id: 'b', u: 1, v: 1 }],
      edges: [
        { id: 'e1', from: 'a', to: 'b' },
        { id: 'e1', from: 'a', to: 'b' },
      ],
    }))
    expect(v.errors.some((e) => e.includes('Duplicate edge'))).toBe(true)
  })

  it('ловит orphan edge (from не существует)', () => {
    const v = validateMap(makeMap({
      waypoints: [{ id: 'a', u: 0, v: 0 }],
      edges: [{ id: 'e1', from: 'ghost', to: 'a' }],
    }))
    expect(v.errors.some((e) => e.includes('ghost'))).toBe(true)
  })

  it('ловит orphan edge (to не существует)', () => {
    const v = validateMap(makeMap({
      waypoints: [{ id: 'a', u: 0, v: 0 }],
      edges: [{ id: 'e1', from: 'a', to: 'nowhere' }],
    }))
    expect(v.errors.some((e) => e.includes('nowhere'))).toBe(true)
  })

  it('warning на self-loop (from == to)', () => {
    const v = validateMap(makeMap({
      waypoints: [{ id: 'a', u: 0, v: 0 }],
      edges: [{ id: 'e1', from: 'a', to: 'a' }],
    }))
    expect(v.warnings.some((w) => w.includes('self-loop'))).toBe(true)
    // Не ошибка — сцена может быть валидной с self-loop (rotate on spot)
    expect(v.errors).toEqual([])
  })

  it('warning на изолированной ноде (без edges)', () => {
    const v = validateMap(makeMap({
      waypoints: [{ id: 'a', u: 0, v: 0 }, { id: 'b', u: 1, v: 1 }],
      edges: [{ id: 'e1', from: 'a', to: 'a' }],
    }))
    expect(v.warnings.some((w) => w.includes('isolated'))).toBe(true)
  })

  it('warning на дубликате (from, to) пары', () => {
    const v = validateMap(makeMap({
      waypoints: [{ id: 'a', u: 0, v: 0 }, { id: 'b', u: 1, v: 1 }],
      edges: [
        { id: 'e1', from: 'a', to: 'b' },
        { id: 'e2', from: 'a', to: 'b' },
      ],
    }))
    expect(v.warnings.some((w) => w.includes('Duplicate edge a → b'))).toBe(true)
  })

  it('warning на station без interactionNodeIds', () => {
    const v = validateMap(makeMap({
      stations: [{ id: 's1', u: 0, v: 0, kind: 'charge', interactionNodeIds: [] }],
    }))
    expect(v.warnings.some((w) => w.includes('interactionNodeIds пусто'))).toBe(true)
  })

  it('ошибка на отрицательный maxSpeed', () => {
    const v = validateMap(makeMap({
      waypoints: [{ id: 'a', u: 0, v: 0 }, { id: 'b', u: 1, v: 1 }],
      edges: [{ id: 'e1', from: 'a', to: 'b', maxSpeed: -1 }],
    }))
    expect(v.errors.some((e) => e.includes('maxSpeed < 0'))).toBe(true)
  })

  it('валидная сцена: 2 ноды, 1 edge — чисто', () => {
    const v = validateMap(makeMap({
      waypoints: [{ id: 'a', u: 0, v: 0 }, { id: 'b', u: 1, v: 1 }],
      edges: [{ id: 'e1', from: 'a', to: 'b', maxSpeed: 1.5 }],
    }))
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
  })
})
