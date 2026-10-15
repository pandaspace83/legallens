import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

test('summarize from the chat, open the summary, rewrite it for the client', async ({ page }) => {
  await page.goto('/m/smith')
  await page.getByRole('button', { name: /Summarize Acme’s demand letter/ }).click()
  await expect(page.getByText('Summary · Demand letter – Whitfield & Crane.pdf')).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Open summary' }).click({ timeout: 20_000 })

  const panel = page.getByRole('complementary', { name: 'Summary' })
  await expect(panel.getByRole('region', { name: 'Who is asking' })).toContainText(
    'Whitfield & Crane LLP',
  )
  await expect(panel.getByText('Covers all 3 pages')).toBeVisible()
  expect((await axe(page)).violations).toEqual([])

  await panel.getByRole('radio', { name: 'Plain English' }).click()
  await expect(panel.getByRole('region', { name: 'Who is asking' })).toContainText('A law firm', {
    timeout: 20_000,
  })
})

test('a letter that sets no deadline says so instead of guessing', async ({ page }) => {
  await page.goto('/m/smith/documents')
  await page.getByRole('button', { name: 'Options for Acme response to SLA complaint.pdf' }).click()
  await page.getByRole('menuitem', { name: 'Summarize…' }).click()
  await page
    .getByRole('dialog', { name: 'Summarize this document' })
    .getByRole('button', { name: 'Summarize' })
    .click()

  const panel = page.getByRole('complementary', { name: 'Summary' })
  await expect(panel.getByRole('region', { name: 'By when' })).toContainText(
    'Not found in this document',
    { timeout: 20_000 },
  )
  await expect(panel.getByRole('region', { name: 'Claims made' })).toContainText('99.2%')
})
