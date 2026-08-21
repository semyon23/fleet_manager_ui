/**
 * PGM (Portable GrayMap) parser.
 * Поддерживает P2 (ASCII) и P5 (binary) — оба используются ROS map_server.
 *
 * @param {ArrayBuffer} buffer — сырое содержимое .pgm
 * @returns {{ width:number, height:number, maxVal:number, gray:Uint8Array, magic:'P2'|'P5' }}
 */
export function parsePGM(buffer) {
  const bytes = new Uint8Array(buffer)

  let cursor = 0
  const readLine = () => {
    let s = ''
    while (cursor < bytes.length) {
      const c = bytes[cursor++]
      if (c === 0x0a) return s
      s += String.fromCharCode(c)
    }
    return s
  }
  const nextToken = () => {
    let tok = ''
    while (cursor < bytes.length) {
      const c = bytes[cursor]
      if (c === 0x23) {
        while (cursor < bytes.length && bytes[cursor] !== 0x0a) cursor++
        continue
      }
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
        cursor++
        if (tok) return tok
        continue
      }
      tok += String.fromCharCode(c)
      cursor++
    }
    return tok
  }

  const magic = readLine().trim()
  if (magic !== 'P2' && magic !== 'P5') {
    throw new Error(`Unsupported PGM magic: ${magic}. Expected P2 or P5.`)
  }
  const width = parseInt(nextToken(), 10)
  const height = parseInt(nextToken(), 10)
  const maxVal = parseInt(nextToken(), 10)
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(maxVal)) {
    throw new Error('Malformed PGM header')
  }
  cursor++

  const total = width * height
  const gray = new Uint8Array(total)

  if (magic === 'P5') {
    const bytesPerPixel = maxVal < 256 ? 1 : 2
    if (bytesPerPixel === 1) {
      for (let i = 0; i < total; i++) gray[i] = bytes[cursor + i]
    } else {
      for (let i = 0; i < total; i++) {
        const hi = bytes[cursor + i * 2]
        const lo = bytes[cursor + i * 2 + 1]
        gray[i] = Math.round(((hi << 8) | lo) * (255 / maxVal))
      }
    }
  } else {
    let idx = 0
    while (idx < total && cursor < bytes.length) {
      const t = nextToken()
      if (!t) break
      const v = parseInt(t, 10)
      gray[idx++] = maxVal === 255 ? v : Math.round(v * (255 / maxVal))
    }
  }

  return { width, height, maxVal, gray, magic }
}

/**
 * Рисует PGM на HTMLCanvasElement.
 * Применяет Nav2-семантику: 0 = препятствие (чёрный), 254/255 = свободно (белый), 205 = unknown (серый).
 */
export function drawPGMToCanvas(pgm, canvas) {
  canvas.width = pgm.width
  canvas.height = pgm.height
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(pgm.width, pgm.height)
  for (let i = 0; i < pgm.gray.length; i++) {
    const v = pgm.gray[i]
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * PGM → dataURL для использования как image src / Konva Image.
 */
export function pgmToDataURL(pgm) {
  const canvas = document.createElement('canvas')
  drawPGMToCanvas(pgm, canvas)
  return canvas.toDataURL('image/png')
}
