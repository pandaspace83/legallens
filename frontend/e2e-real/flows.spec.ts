import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// INT-4.2: the main flows against the real backend (a throw-away data folder, the fast converter, the stub
// engine). One signed-in browser page walks them in order, because each flow builds on the one before it.
const samples = join(process.env.LEGALLENS_E2E_DIR ?? join(tmpdir(), 'legallens-e2e'), 'samples')
const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

test.describe.configure({ mode: 'serial' })

let page: Page
let matterPath = ''
test.beforeAll(async ({ browser }) => {
  // A context of its own (axe needs one), so the signed-in session carries from flow to flow.
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5175',
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  page = await context.newPage()
})
test.afterAll(async () => page.context().close())

test('1 · sign in with both steps', async () => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  // The dev user the backend's seed creates.
  await page.getByLabel('Email').fill('lawyer@legallens.local')
  await page.getByLabel('Password', { exact: true }).fill('anything')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Check your authenticator' })).toBeVisible()
  for (const [i, digit] of ['1', '2', '3', '4', '5', '6'].entries())
    await page.getByLabel(`Digit ${i + 1}`).fill(digit)
  await expect(page).toHaveURL(/\/matters$/)
})

test('2 · open a matter', async () => {
  await expect(page.getByRole('heading', { name: 'Your matters' })).toBeVisible()
  expect((await axe(page)).violations).toEqual([])
  await page.getByRole('link', { name: /Smith v\. Acme Corp/ }).click()
  await expect(page).toHaveURL(/\/m\/[^/]+$/)
  await expect(
    page.getByRole('heading', { name: /What would you like to know about/ }),
  ).toBeVisible()
  matterPath = new URL(page.url()).pathname
})

test('3 · upload three samples and watch them ingest', async () => {
  // The session is a cookie, so a fresh page load stays signed in.
  await page.goto(`${matterPath}/documents`)
  await page.getByRole('button', { name: 'Upload documents' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Upload documents' })
  const files = [
    ['smith_msa_v3.pdf', 'Our client'],
    ['acme_demand_letter_scanned.pdf', 'Other side'],
    ['exhibit_b_invoices.pdf', 'Our client'],
  ] as const
  await dialog
    .getByLabel('Choose files to upload')
    .setInputFiles(files.map(([name]) => join(samples, name)))
  for (const [name, origin] of files)
    await dialog
      .getByRole('radiogroup', { name: `${name} is from` })
      .getByRole('radio', { name: origin })
      .click()
  await dialog.getByRole('button', { name: 'Upload 3 files' }).click()
  await expect(page.getByRole('dialog', { name: 'Documents processed' })).toBeVisible({
    timeout: 120_000,
  })
  await page.getByRole('button', { name: 'Done' }).click()
  for (const [name] of files)
    await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible()
  expect((await axe(page)).violations).toEqual([])
})

// With LEGALLENS_ORCHESTRATOR=local a 7B model answers (about 15-30 s, longer on a cold start) and may mark an
// answer partial; the stub answers at once and always says "From your documents".
const local = process.env.LEGALLENS_ORCHESTRATOR !== 'stub'
const answerWait = local ? 180_000 : 30_000
// A summary of the sample letter takes about 4 minutes on the 14B, a draft about 2.
const jobWait = local ? 420_000 : 60_000

const ask = async (question: string) => {
  const composer = page.locator('textarea').first()
  await composer.fill(question)
  await composer.press('Enter')
}

test('4 · ask, open a citation and see the passage highlighted', async () => {
  await page.goto(matterPath)
  await ask('What notice is required to terminate the agreement?')
  await expect(
    page.getByText(local ? /From your documents|Partially found/ : 'From your documents').first(),
  ).toBeVisible({ timeout: answerWait })
  await page
    .getByRole('button', { name: /^Source 1:/ })
    .first()
    .click()
  const viewer = page.getByRole('complementary', { name: 'Document viewer' })
  await expect(viewer).toBeVisible()
  await expect(page.locator('[data-active]').first()).toBeVisible()
  expect((await axe(page)).violations).toEqual([])
})

test('5 · a not-found answer and an outside-law answer', async () => {
  await page.goto(matterPath)
  await ask('What is the weather forecast for Tokyo tomorrow?')
  await expect(page.getByText('Not found in your documents').first()).toBeVisible({
    timeout: answerWait,
  })

  await page.goto(matterPath)
  await ask('Is the late fee clause enforceable under California law?')
  await expect(page.getByText('needs law that isn’t in your documents')).toBeVisible({
    timeout: answerWait,
  })
})

test('6 · summarize the demand letter and export it', async () => {
  await page.goto(matterPath)
  await ask('Summarize acme_demand_letter_scanned')
  await page.getByRole('button', { name: 'Open summary' }).click({ timeout: jobWait })
  const panel = page.getByRole('complementary', { name: 'Summary' })
  await expect(panel.getByRole('region').first()).toBeVisible({ timeout: jobWait })
  expect((await axe(page)).violations).toEqual([])
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Export to Word' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.docx$/)
})

test('7 · start a draft from the demand letter', async () => {
  await page.goto(matterPath)
  await ask('Draft a reply to acme_demand_letter_scanned')
  await page.getByRole('button', { name: 'Open draft' }).click({ timeout: jobWait })
  const panel = page.getByRole('complementary', { name: 'Draft' })
  await expect(panel.getByText('AI draft · not reviewed')).toBeVisible({ timeout: jobWait })
  await expect(panel.getByRole('article', { name: 'Letter' })).toBeVisible()
  expect((await axe(page)).violations).toEqual([])
})

test('8 · resolve the draft, acknowledge the checklist, review and export the clean copy', async () => {
  const panel = page.getByRole('complementary', { name: 'Draft' })
  const letter = panel.getByRole('article', { name: 'Letter' })
  const tokens = letter.getByRole('button', { name: /^(Missing fact|Citation needed|Rule needed)/ })

  // The clean copy is locked, and says why.
  await panel.getByRole('button', { name: /Export/ }).click()
  await expect(page.getByRole('button', { name: /Clean copy to send/ })).toBeDisabled()
  await expect(page.getByText('Locked until:')).toBeVisible()
  await page.keyboard.press('Escape')

  // Placeholders are the lawyer's to fill: a fact goes in, an unneeded flag comes out.
  for (let guard = 0; guard < 40; guard++) {
    const left = await tokens.count()
    if (!left) break
    const label = (await tokens.first().getAttribute('aria-label')) ?? ''
    await tokens.first().click()
    if (label.startsWith('Missing fact')) {
      await page.getByRole('textbox').last().fill('October 15, 2026')
      await page.getByRole('button', { name: 'Fill in' }).click()
    } else {
      await page.getByRole('button', { name: 'Remove the flag' }).click()
    }
    await expect(tokens).toHaveCount(left - 1, { timeout: 15_000 })
  }
  await expect(tokens).toHaveCount(0)

  // Every authority is acknowledged: for an [UNVERIFIED] one the tick is the lawyer's own vouching.
  await panel.getByRole('tab', { name: /Checks/ }).click()
  const rows = panel.getByRole('checkbox', { name: /I’ve checked/ })
  await expect(rows).toHaveCount(2)
  for (let i = 0; i < 2; i++) {
    await rows.nth(i).click()
    await expect(rows.nth(i)).toBeChecked()
  }
  await expect(panel.getByRole('list', { name: 'Export checklist' })).toContainText(
    'Every citation acknowledged',
    { timeout: 15_000 },
  )
  expect((await axe(page)).violations).toEqual([])

  // Review and adopt, then export the clean copy.
  await panel.getByRole('button', { name: 'Review and adopt' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Review and adopt this draft' })
  await dialog.getByRole('checkbox').click()
  await dialog.getByRole('button', { name: 'Adopt as my own' }).click()
  await expect(panel.getByText('Reviewed and adopted by you', { exact: true })).toBeVisible()

  await panel.getByRole('button', { name: /Export/ }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Clean copy to send/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.docx$/)
})

test('9 · one matter never shows another’s documents, chats or citations', async () => {
  await page.goto('/matters')
  await page.getByRole('link', { name: /Rivera lease dispute/ }).click()
  await expect(page).toHaveURL(/\/m\/[^/]+$/)
  const rivera = new URL(page.url()).pathname
  expect(rivera).not.toBe(matterPath)

  // No chats, no documents of Smith's.
  await expect(page.getByText('No chats yet')).toBeVisible()
  await expect(page.getByText('acme_demand_letter_scanned')).toHaveCount(0)
  await page.goto(`${rivera}/documents`)
  await expect(page.getByText('acme_demand_letter_scanned')).toHaveCount(0)
  await expect(page.getByText('smith_msa_v3')).toHaveCount(0)

  // A question that Smith's documents answer gets no citation from them here.
  await page.goto(rivera)
  await ask('What notice is required to terminate the agreement?')
  await expect(
    page.getByText(/Not found in your documents|From your documents|Partially/).first(),
  ).toBeVisible({
    timeout: answerWait,
  })
  await expect(page.getByText(/smith_msa_v3|acme_demand/)).toHaveCount(0)
  expect((await axe(page)).violations).toEqual([])
})

test('10 · delete a document, then the matter', async () => {
  await page.goto(`${matterPath}/documents`)
  await page.getByRole('button', { name: /^Options for exhibit_b_invoices/ }).click()
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this document?' })
  await expect(dialog).toContainText('The original file')
  await dialog.getByRole('button', { name: 'Delete document' }).click()
  await expect(page.getByRole('row', { name: /exhibit_b_invoices/ })).toHaveCount(0)

  await page.goto(`${matterPath}/profile`)
  await page.getByRole('button', { name: 'Delete matter' }).click()
  const del = page.getByRole('dialog', { name: /Delete Smith v\. Acme Corp/ })
  await del.getByRole('button', { name: 'Continue without exporting' }).click()
  await del.getByLabel(/Type/).fill('Smith v. Acme Corp')
  await del.getByRole('button', { name: 'Delete the matter' }).click()
  await expect(page).toHaveURL(/\/matters$/)
  await expect(page.getByRole('link', { name: /Smith v\. Acme Corp/ })).toHaveCount(0)
})
