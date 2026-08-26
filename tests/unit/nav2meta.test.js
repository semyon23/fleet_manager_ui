import { describe, it, expect } from 'vitest'
import {
  parseNav2Meta,
  pixelToWorld,
  worldToPixel,
  serializeNav2Meta,
} from '../../src/lib/nav2meta'

describe('parseNav2Meta', () => {
  it('парсит стандартный ROS2 Nav2 YAML', () => {
    const yaml = `
image: warehouse.pgm
resolution: 0.05
origin: [-10.0, -10.0, 0.0]
occupied_thresh: 0.65
free_thresh: 0.196
negate: 0
mode: trinary
`
    const meta = parseNav2Meta(yaml)
    expect(meta.image).toBe('warehouse.pgm')
    expect(meta.resolution).toBe(0.05)
    expect(meta.origin).toEqual([-10, -10, 0])
    expect(meta.occupiedThresh).toBe(0.65)
    expect(meta.freeThresh).toBe(0.196)
    expect(meta.negate).toBe(0)
    expect(meta.mode).toBe('trinary')
  })

  it('падает на пустом входе', () => {
    expect(() => parseNav2Meta('null')).toThrow(/mapping/)
  })

  it('заполняет дефолты когда поля отсутствуют', () => {
    const meta = parseNav2Meta('image: x.pgm')
    expect(meta.resolution).toBe(0.05)  // default
    expect(meta.origin).toEqual([0, 0, 0])
    expect(meta.negate).toBe(0)
    expect(meta.mode).toBe('trinary')
  })

  it('приводит negate = 1 из truthy', () => {
    const meta = parseNav2Meta('image: x.pgm\nnegate: 1')
    expect(meta.negate).toBe(1)
  })
})

describe('pixelToWorld / worldToPixel round-trip', () => {
  const meta = { origin: [0, 0, 0], resolution: 0.05 }
  const imageHeight = 400

  it('прямая конвертация: (0,0) пикселей → (0, 20) метров при height=400', () => {
    // pixel (0,0) = top-left corner. В ROS2 world y=0 у нижнего края.
    // origin.y=0 + (400-0)*0.05 = 20
    const { x, y } = pixelToWorld(meta, 0, 0, imageHeight)
    expect(x).toBe(0)
    expect(y).toBe(20)
  })

  it('обратная: (0, 20) метров → (0, 0) пикселей', () => {
    const { u, v } = worldToPixel(meta, 0, 20, imageHeight)
    expect(u).toBe(0)
    expect(v).toBe(0)
  })

  it('round-trip pixel → world → pixel сохраняет значение', () => {
    for (const [u, v] of [[100, 100], [250, 350], [499, 399]]) {
      const w = pixelToWorld(meta, u, v, imageHeight)
      const p = worldToPixel(meta, w.x, w.y, imageHeight)
      expect(p.u).toBeCloseTo(u, 6)
      expect(p.v).toBeCloseTo(v, 6)
    }
  })

  it('учитывает origin offset', () => {
    const offsetMeta = { origin: [-5, -10, 0], resolution: 0.1 }
    const w = pixelToWorld(offsetMeta, 100, 100, 200)
    // x = -5 + 100*0.1 = 5
    // y = -10 + (200-100)*0.1 = 0
    expect(w.x).toBeCloseTo(5)
    expect(w.y).toBeCloseTo(0)
  })
})

describe('serializeNav2Meta', () => {
  it('возвращает валидный YAML который парсится обратно', () => {
    const meta = {
      image: 'test.pgm',
      resolution: 0.1,
      origin: [1, 2, 0.5],
      occupiedThresh: 0.7,
      freeThresh: 0.2,
      negate: 0,
      mode: 'scale',
    }
    const yaml = serializeNav2Meta(meta)
    expect(yaml).toContain('image: test.pgm')
    expect(yaml).toContain('resolution: 0.1')
    const re = parseNav2Meta(yaml)
    expect(re.origin).toEqual([1, 2, 0.5])
    expect(re.mode).toBe('scale')
  })
})
