import { expect, test, type Page } from '@playwright/test'
import { axe } from './helpers.js'

// Accessibility audit (FE-9.1): every main screen, menu and dialog is opened and checked with axe against WCAG 2.1
// AA. The other browser tests check their own screens as they go; this sweep covers the states they don't reach.

type Step = (page: Page) => Promise<unknown>

const screens: [name: string, url: string, open?: Step][] = [
  ['sign-in', '/login', (p) => p.getByRole('heading', { name: 'Sign in' }).waitFor()],
  [
    'two-step code',
    '/login',
    async (p) => {
      await p.getByLabel('Password', { exact: true }).fill('anything')
      await p.getByRole('button', { name: 'Continue' }).click()
      await p.getByRole('heading', { name: 'Check your authenticator' }).waitFor()
    },
  ],
  ['matters', '/matters', (p) => p.getByRole('heading', { name: 'Your matters' }).waitFor()],
  [
    'matter switcher',
    '/m/smith',
    async (p) => {
      await p.getByRole('button', { name: /Smith v\. Acme Corp/ }).click()
      await p.getByRole('menuitem', { name: 'All matters' }).waitFor()
    },
  ],
  [
    'account menu',
    '/m/smith',
    async (p) => {
      await p.getByRole('button', { name: 'Account menu' }).click()
      await p.getByRole('menuitem', { name: 'Settings' }).waitFor()
    },
  ],
  [
    'command palette',
    '/m/smith',
    async (p) => {
      await p.getByRole('heading', { name: /What would you like/ }).waitFor()
      await p.keyboard.press('ControlOrMeta+K')
      await p.getByRole('option').first().waitFor()
    },
  ],
  [
    'shortcuts sheet',
    '/m/smith',
    async (p) => {
      await p.getByRole('heading', { name: /What would you like/ }).waitFor()
      // The composer takes focus on a new chat, and "?" there is text, so the shortcut is pressed elsewhere.
      await p.getByRole('heading', { name: /What would you like/ }).click()
      await p.keyboard.press('?')
      await p.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
    },
  ],
  [
    'runs-locally explainer',
    '/m/smith',
    async (p) => {
      await p.getByRole('button', { name: 'Runs locally' }).click()
      await p.getByText('Nothing leaves this computer').waitFor()
    },
  ],
  [
    'chat with an answer',
    '/m/smith/c/c-termination',
    (p) => p.getByRole('article', { name: 'Answer' }).first().waitFor(),
  ],
  [
    'upload dialog',
    '/m/smith/documents',
    async (p) => {
      await p.getByRole('button', { name: 'Upload documents' }).first().click()
      await p.getByRole('dialog', { name: 'Upload documents' }).waitFor()
    },
  ],
  [
    'document menu',
    '/m/smith/documents',
    async (p) => {
      await p.getByRole('button', { name: /^Options for Demand letter/ }).click()
      await p.getByRole('menuitem', { name: 'Summarize…' }).waitFor()
    },
  ],
  [
    'summarize dialog',
    '/m/smith/documents',
    async (p) => {
      await p.getByRole('button', { name: /^Options for Demand letter/ }).click()
      await p.getByRole('menuitem', { name: 'Summarize…' }).click()
      await p.getByRole('dialog').waitFor()
    },
  ],
  [
    'start-draft dialog',
    '/m/smith/documents',
    async (p) => {
      await p.getByRole('button', { name: /^Options for Demand letter/ }).click()
      await p.getByRole('menuitem', { name: 'Draft a reply…' }).click()
      await p.getByRole('dialog').waitFor()
    },
  ],
  [
    'delete-document dialog',
    '/m/smith/documents',
    async (p) => {
      await p.getByRole('button', { name: /^Options for Demand letter/ }).click()
      await p.getByRole('menuitem', { name: 'Delete…' }).click()
      await p.getByRole('alertdialog').or(p.getByRole('dialog')).first().waitFor()
    },
  ],
  [
    'document viewer',
    '/m/smith/c/c-termination?doc=doc-msa&page=12',
    (p) => p.getByRole('complementary', { name: 'Document viewer' }).waitFor(),
  ],
  [
    'summary',
    '/m/smith/c/c-demand?summary=sum-demand',
    (p) => p.getByRole('complementary', { name: 'Summary' }).waitFor(),
  ],
  [
    'draft letter',
    '/m/smith/c/c-reply?draft=draft-reply',
    (p) => p.getByRole('tab', { name: 'Letter' }).waitFor(),
  ],
  [
    'draft checks',
    '/m/smith/c/c-reply?draft=draft-reply',
    async (p) => {
      await p.getByRole('tab', { name: /Checks/ }).click()
      await p.getByRole('tabpanel').waitFor()
    },
  ],
  [
    'draft versions',
    '/m/smith/c/c-reply?draft=draft-reply',
    async (p) => {
      await p.getByRole('button', { name: 'Version history' }).click()
      await p.getByText('Version history').last().waitFor()
    },
  ],
  [
    'draft export menu',
    '/m/smith/c/c-reply?draft=draft-reply',
    async (p) => {
      await p.getByRole('button', { name: /^Export/ }).click()
      await p.getByRole('dialog').waitFor()
    },
  ],
  [
    'draft review dialog',
    '/m/smith/c/c-reply?draft=draft-reply',
    async (p) => {
      await p.getByRole('button', { name: 'Review and adopt' }).click()
      await p.getByRole('dialog').waitFor()
    },
  ],
  [
    'closed matter',
    '/m/henderson',
    (p) => p.getByRole('heading', { name: /What would you like/ }).waitFor(),
  ],
  ['settings', '/settings', (p) => p.getByRole('heading', { name: 'Settings' }).waitFor()],
  [
    'add a licensing state',
    '/settings',
    async (p) => {
      await p.getByRole('button', { name: 'Add a state' }).click()
      await p.getByRole('option').first().waitFor()
    },
  ],
  [
    'where your data goes',
    '/settings/data',
    (p) => p.getByRole('heading', { name: 'Where your data goes' }).waitFor(),
  ],
  ['not found', '/no-such-page', (p) => p.getByRole('heading', { level: 1 }).first().waitFor()],
]

for (const [name, url, open] of screens) {
  test(`no accessibility violations: ${name}`, async ({ page }) => {
    await page.goto(url)
    await open?.(page)
    await page.waitForTimeout(300)
    const { violations } = await axe(page)
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([])
  })
}
