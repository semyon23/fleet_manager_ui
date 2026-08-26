import { test, expect } from '@playwright/test'

test.describe('Map Editor — базовые сценарии', () => {
  test.beforeEach(async ({ page, context }) => {
    // Чистая сессия — сбрасываем localStorage
    await context.clearCookies()
    await page.goto('maps')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByText(/Warehouse 25/).first().waitFor({ timeout: 20_000 })
    await page.getByText(/Warehouse 25/).first().click()
    await page.waitForURL(/\/maps\/[^/]+$/)
    await page.waitForTimeout(1500)
  })

  test('Sequential IDs даёт n001 на первой ноде', async ({ page }) => {
    await page.keyboard.press('n')
    const box = await page.locator('main').first().boundingBox()
    await page.mouse.click(box.x + 400, box.y + 300)
    await page.waitForTimeout(500)
    await expect(page.locator('text=n001').first()).toBeVisible()
  })

  test('Batch Lines рисует polyline (3 ноды → 2 edges)', async ({ page }) => {
    await page.keyboard.press('l')
    const box = await page.locator('main').first().boundingBox()
    await page.mouse.click(box.x + 300, box.y + 250)
    await page.waitForTimeout(300)
    await page.mouse.click(box.x + 400, box.y + 350)
    await page.waitForTimeout(300)
    await page.mouse.click(box.x + 500, box.y + 450)
    await page.waitForTimeout(500)
    const nodeCount = await page.locator('.v-ng-layer-nodes .v-ng-node').count()
    const edgeCount = await page.locator('.v-ng-layer-edges .v-ng-edge').count()
    expect(nodeCount).toBe(3)
    expect(edgeCount).toBe(2)
  })

  test('Undo Ctrl+Z убирает последнюю ноду', async ({ page }) => {
    await page.keyboard.press('n')
    const box = await page.locator('main').first().boundingBox()
    await page.mouse.click(box.x + 400, box.y + 300)
    await page.waitForTimeout(300)
    await page.mouse.click(box.x + 500, box.y + 400)
    await page.waitForTimeout(500)
    expect(await page.locator('.v-ng-layer-nodes .v-ng-node').count()).toBe(2)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(400)
    expect(await page.locator('.v-ng-layer-nodes .v-ng-node').count()).toBe(1)
  })

  test('Station создаётся как rounded rect (не circle) с иконкой', async ({ page }) => {
    await page.keyboard.press('s')
    const box = await page.locator('main').first().boundingBox()
    await page.mouse.click(box.x + 400, box.y + 300)
    await page.waitForTimeout(500)
    // Rect = station shape, а не circle
    const rects = await page.locator('.v-ng-layer-nodes rect').count()
    expect(rects).toBeGreaterThan(0)
  })

  test('Cheatsheet открывается по ?', async ({ page }) => {
    await page.keyboard.press('?')
    await expect(page.locator('text=Keyboard shortcuts')).toBeVisible()
  })

  test('SLAM toggle убирает PGM подложку', async ({ page }) => {
    expect(await page.locator('main svg image').count()).toBeGreaterThan(0)
    await page.locator('button[title^="Toggle SLAM"]').click()
    await page.waitForTimeout(300)
    expect(await page.locator('main svg image').count()).toBe(0)
  })

  test('Zoom controls: 4 кнопки, кликаются', async ({ page }) => {
    const zoomBtns = await page.locator('.zoom-btn').count()
    expect(zoomBtns).toBe(4)
    await page.locator('.zoom-btn').first().click()  // +
    await page.locator('.zoom-btn').nth(1).click()   // -
  })

  test('Метровые линейки: >= 3 X ticks и >= 3 Y ticks', async ({ page }) => {
    await page.waitForTimeout(500)
    const xTicks = await page.locator('div.absolute.left-0.top-0.h-5.w-full > div').count()
    const yTicks = await page.locator('div.absolute.left-0.top-0.h-full.w-8 > div').count()
    expect(xTicks).toBeGreaterThanOrEqual(3)
    expect(yTicks).toBeGreaterThanOrEqual(3)
  })

  test('Grid step number input рядом со ползунком', async ({ page }) => {
    const input = page.locator('input[type="number"][min="0.01"]')
    await expect(input).toBeVisible()
    await input.fill('0.5')
    await input.press('Enter')
    await expect(input).toHaveValue('0.5')
  })

  test('Copy/Paste ноды через Ctrl+C / Ctrl+V', async ({ page }) => {
    await page.keyboard.press('n')
    const box = await page.locator('main').first().boundingBox()
    await page.mouse.click(box.x + 400, box.y + 300)
    await page.waitForTimeout(400)
    expect(await page.locator('.v-ng-layer-nodes .v-ng-node').count()).toBe(1)
    await page.keyboard.press('Control+c')
    await page.waitForTimeout(200)
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(500)
    expect(await page.locator('.v-ng-layer-nodes .v-ng-node').count()).toBe(2)
  })

  test('Actions section с Add action', async ({ page }) => {
    await page.keyboard.press('n')
    const box = await page.locator('main').first().boundingBox()
    await page.mouse.click(box.x + 400, box.y + 300)
    await page.waitForTimeout(500)
    await expect(page.locator('text=/VDA5050 Actions/')).toBeVisible()
    await page.locator('button:has-text("+ Add action")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('input[placeholder*="pick"]').first()).toBeVisible()
  })
})
