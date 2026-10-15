import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

test('upload a document, tag who it came from, and watch it become ready', async ({ page }) => {
  await page.goto('/m/smith/documents')
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible()
  expect((await axe(page)).violations).toEqual([])

  await page.getByRole('button', { name: 'Upload documents' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Upload documents' })
  await dialog.getByLabel('Choose files to upload').setInputFiles([
    {
      name: 'Exhibit C.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7 exhibit C'),
    },
    {
      name: 'contract.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('MZ not really a pdf'),
    },
  ])
  await expect(dialog.getByText('its contents aren’t a PDF file')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Tag 1 file to continue' })).toBeDisabled()
  expect((await axe(page)).violations).toEqual([])

  await dialog.getByRole('radio', { name: 'Our client' }).click()
  await dialog.getByRole('button', { name: 'Upload 1 file' }).click()
  await expect(
    page.getByRole('dialog', { name: /Processing documents|Documents processed/ }),
  ).toBeVisible()
  await expect(page.getByText(/Ready to search · \d+ pages? read/)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('row', { name: /Exhibit C\.pdf/ })).toBeVisible()

  // The coverage report says what was actually read (FE-9.5 flow 3).
  await page.getByRole('row', { name: /Exhibit C\.pdf/ }).click()
  const viewer = page.getByRole('complementary', { name: 'Document viewer' })
  await viewer.getByRole('button', { name: 'Coverage' }).click()
  await expect(page.getByText('Coverage report')).toBeVisible()
  await expect(page.getByText(/^\d+ of \d+ pages? read$/)).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Pages read' })).toBeVisible()
  expect((await axe(page)).violations).toEqual([])
})

test('hidden content from the other side needs a deliberate step to view', async ({ page }) => {
  await page.goto('/m/smith?doc=doc-acme-resp')
  const viewer = page.getByRole('complementary', { name: 'Document viewer' })
  await expect(viewer.getByText('contains hidden content')).toBeVisible()
  await expect(viewer.getByText('Don’t concede the July outage')).toHaveCount(0)

  await viewer.getByRole('button', { name: 'Review hidden content' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Review the other side’s hidden content?' }),
  ).toContainText('Rule 4.4(b)')
  await page.getByRole('button', { name: 'Show hidden content' }).click()
  await expect(viewer.getByText('Don’t concede the July outage')).toBeVisible()
  expect((await axe(page)).violations).toEqual([])
})

test('deleting a document lists what will be removed', async ({ page }) => {
  await page.goto('/m/smith/documents')
  await page.getByRole('button', { name: 'Options for Invoice INV-2207.pdf' }).click()
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this document?' })
  await expect(dialog).toContainText('The original file (1 page)')
  await dialog.getByRole('button', { name: 'Delete document' }).click()
  await expect(page.getByRole('row', { name: /Invoice INV-2207\.pdf/ })).toHaveCount(0)
  await expect(page.getByText('Invoice INV-2207.pdf was deleted')).toBeVisible()
})
