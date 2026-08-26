import { ref, onMounted, onBeforeUnmount } from 'vue'
import { pixelToWorld, worldToPixel } from '../lib/nav2meta'

const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500]

/**
 * Метровые линейки (X сверху, Y слева) для канваса v-network-graph.
 * Опрашивает viewBox каждые pollMs — библиотека не эмитит pan-события.
 *
 * @param {Ref<any>} graphRef — ref на v-network-graph instance
 * @param {Ref<object>} mapRef — { width, height, meta } из store
 * @param {object} [options]
 * @param {number} [options.pollMs=200] — период опроса viewBox
 * @param {number} [options.targetTickPx=90] — желаемое расстояние между тиками
 */
export function useAxisTicks(graphRef, mapRef, options = {}) {
  const pollMs = options.pollMs ?? 200
  const targetPx = options.targetTickPx ?? 90

  const xTicks = ref([])
  const yTicks = ref([])
  let timer = null

  function pickTickStep(metersPerPx) {
    const desired = metersPerPx * targetPx
    for (const s of TICK_STEPS) if (s >= desired) return s
    return TICK_STEPS[TICK_STEPS.length - 1]
  }
  function formatTick(m, step) {
    if (step >= 1) return m.toFixed(0) + 'm'
    if (step >= 0.1) return m.toFixed(1) + 'm'
    return m.toFixed(2) + 'm'
  }
  function compute() {
    if (!graphRef.value || !mapRef.value) return
    let vb, sizes
    try {
      vb = graphRef.value.getViewBox()
      sizes = graphRef.value.getSizes()
    } catch { return }
    if (!vb || !sizes) return
    const w = sizes.width, h = sizes.height
    const meta = mapRef.value.meta
    const H = mapRef.value.height

    const layoutPerPxX = (vb.right - vb.left) / w
    const layoutPerPxY = (vb.bottom - vb.top) / h
    const stepMx = pickTickStep(layoutPerPxX * meta.resolution)
    const stepMy = pickTickStep(layoutPerPxY * meta.resolution)

    const leftM = pixelToWorld(meta, vb.left, 0, H).x
    const rightM = pixelToWorld(meta, vb.right, 0, H).x
    const xArr = []
    const startX = Math.ceil(leftM / stepMx) * stepMx
    for (let m = startX; m <= rightM; m += stepMx) {
      const layoutX = worldToPixel(meta, m, 0, H).u
      const px = ((layoutX - vb.left) / (vb.right - vb.left)) * w
      xArr.push({ px: Math.round(px), label: formatTick(m, stepMx) })
      if (xArr.length > 60) break
    }
    xTicks.value = xArr

    const topM = pixelToWorld(meta, 0, vb.top, H).y
    const bottomM = pixelToWorld(meta, 0, vb.bottom, H).y
    const yArr = []
    const minY = Math.min(topM, bottomM), maxY = Math.max(topM, bottomM)
    const startY = Math.ceil(minY / stepMy) * stepMy
    for (let m = startY; m <= maxY; m += stepMy) {
      const layoutY = worldToPixel(meta, 0, m, H).v
      const py = ((layoutY - vb.top) / (vb.bottom - vb.top)) * h
      yArr.push({ py: Math.round(py), label: formatTick(m, stepMy) })
      if (yArr.length > 60) break
    }
    yTicks.value = yArr
  }
  function start() {
    if (timer) return
    compute()
    timer = setInterval(compute, pollMs)
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null }
  }

  onMounted(start)
  onBeforeUnmount(stop)

  return { xTicks, yTicks, compute, start, stop }
}
