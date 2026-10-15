import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

test('draft a reply from the chat; the clean copy stays locked until every safeguard is met', async ({
  page,
}) => {
  await page.goto('/m/smith')
  await page.getByRole('button', { name: /Draft a reply to Acme’s demand letter/ }).click()
  await page.getByRole('button', { name: 'Open draft' }).click({ timeout: 30_000 })

  const panel = page.getByRole('complementary', { name: 'Draft' })
  const letter = panel.getByRole('article', { name: 'Letter' })
  await expect(panel.getByText('AI draft · not reviewed')).toBeVisible()
  expect((await axe(page)).violations).toEqual([])

  // The clean copy is locked, with the reasons listed.
  await panel.getByRole('button', { name: /Export/ }).click()
  await expect(page.getByRole('button', { name: /Clean copy to send/ })).toBeDisabled()
  await expect(page.getByText('Locked until:')).toBeVisible()
  await page.keyboard.press('Escape')

  // Placeholders are filled by the lawyer; untraceable authority is removed or vouched for.
  await letter.getByRole('button', { name: /Missing fact: DATE OF DISPUTE NOTICE/ }).click()
  await page.getByRole('textbox', { name: 'DATE OF DISPUTE NOTICE' }).fill('October 3, 2026')
  await page.getByRole('button', { name: 'Fill in' }).click()
  await expect(letter).toContainText('Smith gave that notice on October 3, 2026.')

  await letter.getByRole('button', { name: /Unverified authority/ }).click()
  await page.getByRole('button', { name: 'Remove the sentence that relies on it' }).click()
  await expect(letter).not.toContainText('Statutory interest')
  await expect(letter).toContainText('1.5% per month')

  await letter.getByRole('button', { name: /Citation needed: Smith/ }).click()
  await page.getByRole('textbox', { name: 'Source you rely on' }).fill('SLA incident log, Aug 2026')
  await page.getByRole('button', { name: 'Add source' }).click()
  await letter.getByRole('button', { name: /Missing fact: PROPOSED WEEK/ }).click()
  await page.getByRole('textbox', { name: 'PROPOSED WEEK' }).fill('October 19')
  await page.getByRole('button', { name: 'Fill in' }).click()
  await expect(letter.getByRole('button', { name: /Resolve$/ })).toHaveCount(0)

  // Each claim in the incoming letter is answered or deliberately set aside.
  await panel.getByRole('tab', { name: /Checks/ }).click()
  await panel.getByRole('button', { name: 'Draft a response' }).first().click()
  await panel.getByRole('button', { name: 'Add to the letter' }).click({ timeout: 10_000 })
  await expect(letter.getByRole('region', { name: 'Threatened lawsuit' })).toBeVisible()
  await letter.getByRole('button', { name: /Citation needed: the text of Section 15.4/ }).click()
  await page.getByRole('button', { name: 'Remove the flag' }).click()

  await panel.getByRole('tab', { name: /Checks/ }).click()
  await panel.getByRole('button', { name: 'Set aside' }).click()
  await expect(panel.getByText('You chose not to answer this point')).toBeVisible()

  // Every authority is acknowledged, one by one, including the lawyer's own source. Contract clauses are
  // evidence, not authority, so they are not in the checklist.
  await expect(panel.getByRole('checkbox', { name: /§6.4/ })).toHaveCount(0)
  await panel.getByRole('checkbox', { name: /SLA incident log/ }).click()
  await panel.getByRole('switch', { name: 'FRE 408 header' }).click()
  await expect(panel.getByRole('list', { name: 'Export checklist' })).toContainText(
    'Every citation acknowledged',
  )
  expect((await axe(page)).violations).toEqual([])

  // Review and adopt, then export the clean copy.
  await panel.getByRole('button', { name: 'Review and adopt' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Review and adopt this draft' })
  await expect(dialog.getByRole('button', { name: 'Adopt as my own' })).toBeDisabled()
  await dialog.getByRole('checkbox').click()
  await dialog.getByRole('button', { name: 'Adopt as my own' }).click()
  await expect(panel.getByText('Reviewed and adopted by you', { exact: true })).toBeVisible()

  await panel.getByRole('button', { name: /Export/ }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Clean copy to send/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^Letter – .*\.doc$/)

  // Any change after adoption puts the watermark back.
  await panel.getByRole('tab', { name: /Checks/ }).click()
  await panel.getByRole('switch', { name: 'Reservation of rights' }).click()
  await expect(panel.getByText('AI draft · not reviewed')).toBeVisible()
})

test('refine a section: the change is shown and applied only when accepted', async ({ page }) => {
  await page.goto('/m/smith/c/c-reply?draft=draft-reply')
  const letter = page.getByRole('article', { name: 'Letter' })
  const interest = letter.getByRole('region', { name: 'Interest' })
  await interest.hover()
  await interest.getByRole('button', { name: /Refine/ }).click()
  await interest.getByRole('button', { name: 'Make it shorter' }).click()
  await expect(interest.getByText(/Proposed change ·/)).toBeVisible({ timeout: 10_000 })
  await expect(interest).toContainText('Even if any amount were owed')
  await interest.getByRole('button', { name: 'Accept change' }).click()
  await expect(interest).not.toContainText('Even if any amount were owed')
  await expect(page.getByText(/Version 2 · saved/)).toBeVisible()
})

test('start a memo from a document in the library', async ({ page }) => {
  await page.goto('/m/smith/documents')
  await page
    .getByRole('button', { name: 'Options for Demand letter – Whitfield & Crane.pdf' })
    .click()
  await page.getByRole('menuitem', { name: 'Draft a reply…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Draft a reply' })
  await dialog.getByRole('radio', { name: /Internal memo/ }).click()
  await expect(
    dialog.getByText(/states law only from opinions, statutes or regulations/),
  ).toBeVisible()
  expect((await axe(page)).violations).toEqual([])
  await dialog.getByRole('button', { name: 'Start draft' }).click()

  const panel = page.getByRole('complementary', { name: 'Draft' })
  await expect(panel.getByRole('article', { name: 'Memo' })).toBeVisible({ timeout: 30_000 })
  await expect(panel.getByRole('region', { name: 'Question presented' })).toBeVisible()
  await expect(panel.getByRole('button', { name: /Rule needed/ })).toBeVisible()
})
