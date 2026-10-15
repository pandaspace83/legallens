import { expect, test } from '@playwright/test'
import { axe, devPanel } from './helpers.js'

// Large-data mode (FE-9.2, DEC-14): with 2,000 chats and 200 documents in one matter, the sidebar, the library
// and the ⌘K palette render only what is in view or worth showing, and everything stays reachable.
test('a matter with 2,000 chats and 200 documents stays quick to use', async ({ page }) => {
  await page.goto('/m/smith')
  await expect(page.getByRole('heading', { name: /What would you like to know/ })).toBeVisible()
  const panel = await devPanel(page)
  await panel.getByRole('button', { name: 'Add 2,000 chats and 200 documents' }).click()
  await panel.getByRole('button', { name: 'Close dev panel' }).click()

  const sidebar = page.getByRole('navigation', { name: 'Chats and documents', exact: true })
  await expect(sidebar.getByRole('link', { name: /\(#1\)$/ })).toBeVisible()
  expect(await sidebar.getByRole('link').count()).toBeLessThan(80)

  // Any chat can still be found by searching.
  await sidebar.getByRole('searchbox', { name: 'Search chats' }).fill('#1500)')
  await expect(sidebar.getByRole('link', { name: /\(#1500\)$/ })).toBeVisible()
  await sidebar.getByRole('searchbox', { name: 'Search chats' }).fill('')

  // The palette lists a few recent items, then the matches for every word typed.
  await page.keyboard.press('ControlOrMeta+K')
  expect(await page.getByRole('option').count()).toBeLessThan(30)
  await page.keyboard.type('deposition 3104')
  await expect(
    page.getByRole('option', { name: /Deposition transcript – witness 3104\.pdf/ }),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  // The library renders the rows in view, keeps the full count for screen readers, and reaches the last row.
  await page.getByRole('link', { name: 'Open the document library' }).click()
  const table = page.getByRole('table')
  await expect(table).toHaveAttribute('aria-rowcount', '213')
  await expect(table.locator('tbody tr[data-index]').first()).toBeVisible()
  expect(await table.locator('tbody tr[data-index]').count()).toBeLessThan(40)
  expect((await axe(page)).violations).toEqual([])

  await page
    .locator('#main .overflow-y-auto')
    .first()
    .evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
  await expect(table.locator('tbody tr[aria-rowindex="213"]')).toBeVisible()
})
