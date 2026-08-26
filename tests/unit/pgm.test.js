import { describe, it, expect } from 'vitest'
import { parsePGM } from '../../src/lib/pgm'

// Helper: build ASCII PGM (P2) from string
function makeP2(text) {
  return new TextEncoder().encode(text).buffer
}
// Helper: build binary PGM (P5) with header + Uint8Array pixels
function makeP5(width, height, maxVal, pixels) {
  const header = `P5\n${width} ${height}\n${maxVal}\n`
  const headerBytes = new TextEncoder().encode(header)
  const combined = new Uint8Array(headerBytes.length + pixels.length)
  combined.set(headerBytes, 0)
  combined.set(pixels, headerBytes.length)
  return combined.buffer
}

describe('parsePGM', () => {
  it('P2 ASCII: парсит минимальный 2x2', () => {
    const p2 = makeP2('P2\n2 2\n255\n0 128\n255 64\n')
    const result = parsePGM(p2)
    expect(result.magic).toBe('P2')
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.maxVal).toBe(255)
    expect(Array.from(result.gray)).toEqual([0, 128, 255, 64])
  })

  it('P2: игнорирует # комментарии', () => {
    const p2 = makeP2('P2\n# comment 1\n# comment 2\n2 2\n255\n0 128 255 64\n')
    const r = parsePGM(p2)
    expect(r.width).toBe(2)
    expect(Array.from(r.gray)).toEqual([0, 128, 255, 64])
  })

  it('P5 binary: парсит 3x3 при maxVal=255', () => {
    const pixels = new Uint8Array([0, 254, 205,   50, 100, 150,   200, 30, 128])
    const p5 = makeP5(3, 3, 255, pixels)
    const r = parsePGM(p5)
    expect(r.magic).toBe('P5')
    expect(r.width).toBe(3)
    expect(r.height).toBe(3)
    expect(Array.from(r.gray)).toEqual([0, 254, 205, 50, 100, 150, 200, 30, 128])
  })

  it('падает на неправильном magic', () => {
    const bad = makeP2('P4\n2 2\n255\n')
    expect(() => parsePGM(bad)).toThrow(/Unsupported/)
  })

  it('падает на битом header', () => {
    const bad = makeP2('P2\nABC XYZ\n255\n')
    expect(() => parsePGM(bad)).toThrow(/Malformed/)
  })

  it('корректно распознаёт ROS-конвенцию: 0=obstacle, 254=free, 205=unknown', () => {
    // 4x1 = [obstacle, free, unknown, boundary]
    const pixels = new Uint8Array([0, 254, 205, 100])
    const p5 = makeP5(4, 1, 255, pixels)
    const r = parsePGM(p5)
    expect(r.gray[0]).toBe(0)    // obstacle
    expect(r.gray[1]).toBe(254)  // free
    expect(r.gray[2]).toBe(205)  // unknown
  })
})
