import { test, expect } from '@playwright/test'

// Smoke tests — verify the app shell loads and serves critical assets
// without requiring authentication (no Supabase credentials needed).

test('app loads and redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/')
  // Unauthenticated users are redirected to /login
  await page.waitForURL(/\/login/, { timeout: 15000 })
  expect(page.url()).toContain('/login')
})

test('login page renders a form', async ({ page }) => {
  await page.goto('/login')
  // There should be at least one input (email) and the page should not be blank
  const inputs = page.locator('input')
  await expect(inputs.first()).toBeVisible({ timeout: 15000 })
})

test('PWA manifest is served and valid', async ({ request }) => {
  const res = await request.get('/manifest.json')
  expect(res.ok()).toBeTruthy()
  const manifest = await res.json()
  expect(manifest.name).toBeTruthy()
  expect(manifest.display).toBe('standalone')
  expect(Array.isArray(manifest.icons)).toBeTruthy()
  expect(manifest.icons.length).toBeGreaterThan(0)
})

test('service worker file is served', async ({ request }) => {
  const res = await request.get('/sw.js')
  expect(res.ok()).toBeTruthy()
  const body = await res.text()
  expect(body).toContain('addEventListener')
})

test('PWA icons are served as valid images', async ({ request }) => {
  for (const icon of ['/icon-192.png', '/icon-512.png']) {
    const res = await request.get(icon)
    expect(res.ok()).toBeTruthy()
    expect(res.headers()['content-type']).toContain('image')
  }
})

test('app has no uncaught console errors on login page', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/login')
  await page.waitForTimeout(2000)
  // Allow network/Supabase warnings but fail on JS runtime errors like
  // "cannot access X before initialization" or "X is not defined"
  const fatal = errors.filter(e =>
    /before initialization|is not defined|is not a function|Cannot read/.test(e)
  )
  expect(fatal).toEqual([])
})
