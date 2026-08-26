import { test, expect } from '@playwright/test'

const ROUTES = ['/dashboard', '/live', '/maps', '/robots', '/missions', '/alerts', '/teleop', '/settings']

test.describe('Smoke: все роуты рендерятся без ошибок', () => {
  for (const route of ROUTES) {
    test(`route ${route}`, async ({ page }) => {
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text())
      })
      await page.goto(route)
      await page.waitForTimeout(1500)
      expect(errors, `Errors on ${route}: ${errors.join('|')}`).toEqual([])
    })
  }
})
