import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

// Closeout items from FRONTEND_TODO: the feedback form, ask again, and a resizable panel (FE-4.8, FE-3.6).
async function askOne(page: import('@playwright/test').Page) {
  await page.goto('/m/smith')
  await page.getByRole('button', { name: /What notice do we need to terminate the MSA/ }).click()
  await expect(page.getByText('From your documents')).toBeVisible({ timeout: 15_000 })
}

test('not helpful opens a form with the reasons, and the note is sent', async ({ page }) => {
  await askOne(page)
  await page.getByRole('button', { name: 'Not helpful' }).click()
  const dialog = page.getByRole('dialog', { name: 'What was wrong with this answer?' })
  await expect(dialog).toBeVisible()
  expect((await axe(page)).violations).toEqual([])
  await dialog.getByLabel(/Missed something/).check()
  await dialog.getByLabel('Note (optional)').fill('The notice period is also in Schedule 2.')
  await dialog.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByText('Feedback saved')).toBeVisible()
  await expect(dialog).toBeHidden()
})

test('ask again sends the same question once more', async ({ page }) => {
  await askOne(page)
  await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Ask again' }).click()
  await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(2, { timeout: 20_000 })
})

test('the panel can be resized with the keyboard and keeps its width', async ({ page }) => {
  await askOne(page)
  await page
    .getByRole('button', { name: /Source 1:/ })
    .first()
    .click()
  const panel = page.getByRole('complementary', { name: 'Document viewer' })
  await expect(panel).toBeVisible()
  const before = (await panel.boundingBox())!.width
  const handle = panel.getByRole('separator', { name: 'Resize panel' })
  await handle.focus()
  await handle.press('ArrowLeft')
  await handle.press('ArrowLeft')
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(before + 40)
  await page.reload()
  await expect(panel).toBeVisible()
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(before + 40)
})

test('the UI gallery shows every component and has no accessibility violations', async ({
  page,
}) => {
  await page.goto('/dev/ui')
  await expect(page.getByRole('heading', { name: 'UI components' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Danger' })).toBeVisible()
  await expect(page.getByLabel('Audience')).toBeVisible()
  expect((await axe(page)).violations).toEqual([])
})
