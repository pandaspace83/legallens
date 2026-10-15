import { expect, test } from '@playwright/test'
import { axe, devPanel } from './helpers.js'

test('the app degrades gracefully when the AI engine stops', async ({ page }) => {
  await page.goto('/m/smith')
  await expect(page.getByRole('heading', { name: /What would you like to know/ })).toBeVisible()
  const panel = await devPanel(page)
  await panel.getByRole('switch', { name: 'AI engine offline' }).click()
  await panel.getByRole('button', { name: 'Close dev panel' }).click()

  await expect(page.getByText('The local AI engine isn’t running.')).toBeVisible()
  await page.getByRole('textbox', { name: /Ask about/ }).fill('What notice do we need?')
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled()
  await expect(page.getByText(/New questions are paused/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Summarize Acme’s demand letter/ })).toBeDisabled()
  expect((await axe(page)).violations).toEqual([])

  // Reading still works.
  await page.getByRole('link', { name: 'Termination notice in the MSA' }).click()
  await expect(page.getByRole('article', { name: 'Answer' }).first()).toBeVisible()

  const again = await devPanel(page)
  await again.getByRole('switch', { name: 'AI engine offline' }).click()
  await expect(page.getByText('The local AI engine isn’t running.')).toBeHidden()
})

test('an idle session warns, then locks, and needs a full sign-in to continue', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/m/smith/c/c-reply?draft=draft-reply')
  await expect(page.getByRole('complementary', { name: 'Draft' })).toBeVisible()
  const panel = await devPanel(page)
  await panel.getByRole('switch', { name: 'Lock after 30 seconds idle' }).click()
  await panel.getByRole('button', { name: 'Close dev panel' }).click()

  await page.clock.fastForward(21_000)
  const warning = page.getByRole('dialog', { name: 'Still there?' })
  await expect(warning).toBeVisible()
  await warning.getByRole('button', { name: 'Stay signed in' }).click()
  await expect(warning).toBeHidden()

  await page.clock.fastForward(31_000)
  const lock = page.getByRole('dialog', { name: 'LegalLens is locked' })
  await expect(lock).toBeVisible()
  // The page stays loaded underneath, so work in progress survives, but it is covered and hidden from assistive tech.
  await expect(page.getByRole('complementary', { name: 'Draft' })).toHaveCount(0)
  expect((await axe(page)).violations).toEqual([])

  await lock.getByRole('textbox', { name: 'Password' }).fill('anything')
  await lock.getByRole('button', { name: 'Continue' }).click()
  await expect(lock.getByText('Enter the 6-digit code')).toBeVisible()
  await page.keyboard.type('123456')
  await expect(lock).toBeHidden()
  await expect(page).toHaveURL(/draft=draft-reply/)
})

test('settings: licensing states, security, shortcuts and components', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  const states = page.getByRole('list', { name: 'Your licensing states' })
  await page.getByRole('button', { name: 'Add a state' }).click()
  await page.getByPlaceholder('Search states').fill('new york')
  await page.getByRole('option', { name: /New York/ }).click()
  await page.keyboard.press('Escape')
  await expect(states).toContainText('New York')
  await states.getByRole('button', { name: 'Remove New York' }).click()
  await expect(states).not.toContainText('New York')

  await expect(page.getByRole('list', { name: 'Components' })).toContainText('AI engine')
  await expect(page.getByRole('list', { name: 'Components' })).not.toContainText('Not working')
  expect((await axe(page)).violations).toEqual([])

  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
})

test('the first-run guide in a new matter', async ({ page }) => {
  await page.goto('/m/smith')
  await expect(page.getByRole('heading', { name: /What would you like to know/ })).toBeVisible()
  const panel = await devPanel(page)
  await panel.getByRole('button', { name: 'Add an empty matter' }).click()
  await panel.getByRole('button', { name: 'Close dev panel' }).click()

  const guide = page.getByRole('region', { name: 'Getting started' })
  await expect(guide).toBeVisible()
  await expect(guide).toContainText('1 of 3 done')
  expect((await axe(page)).violations).toEqual([])
  await guide.getByRole('button', { name: 'Upload' }).click()
  await expect(page.getByRole('dialog', { name: /Upload/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await guide.getByRole('button', { name: 'Hide this guide' }).click()
  await expect(guide).toBeHidden()
})

test('when LegalLens stops answering, loaded work stays readable and new loads say so', async ({
  page,
}) => {
  await page.goto('/m/smith/c/c-termination')
  await expect(page.getByRole('article', { name: 'Answer' }).first()).toBeVisible()
  const panel = await devPanel(page)
  await panel.getByRole('switch', { name: 'LegalLens not responding' }).click()
  await panel.getByRole('button', { name: 'Close dev panel' }).click()

  await expect(page.getByText('LegalLens isn’t responding on this computer.')).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByRole('article', { name: 'Answer' }).first()).toBeVisible()

  // A chat that never loaded says it couldn't load; it doesn't claim the chat was deleted.
  await page.getByRole('link', { name: 'Late fee claimed vs. the MSA' }).click()
  await expect(page.getByText('This chat couldn’t load')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/may have been deleted/)).toBeHidden()
  expect((await axe(page)).violations).toEqual([])

  const again = await devPanel(page)
  await again.getByRole('switch', { name: 'LegalLens not responding' }).click()
  await again.getByRole('button', { name: 'Close dev panel' }).click()
  // Once it answers again, the chat loads by itself.
  await expect(page.getByRole('article', { name: 'Answer' }).first()).toBeVisible()
})
