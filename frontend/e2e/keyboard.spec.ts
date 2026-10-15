import { expect, test, type Page } from '@playwright/test'

// Keyboard-only pass (FE-9.1, WCAG 2.1.1, 2.4.3, 2.4.7): the main flows work without a mouse, focus moves in a
// sensible order and comes back after a panel closes, and every control shows where focus is.

/** Presses Tab until the focused element matches, so a test doesn't depend on an exact tab count. */
async function tabTo(page: Page, matches: (el: Element) => boolean, limit = 60) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    const found = await page.evaluateHandle(() => document.activeElement)
    if (await found.evaluate(matches)) return
  }
  throw new Error('Never reached the expected control by Tab')
}

/** Tabs through the page and returns any focused control that shows no outline or ring. */
async function focusWithoutRing(page: Page, steps: number) {
  const missing: string[] = []
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab')
    const report = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      const ring = (s.outlineStyle !== 'none' && s.outlineWidth !== '0px') || s.boxShadow !== 'none'
      return ring
        ? null
        : `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}"`
    })
    if (report) missing.push(report)
  }
  return missing
}

test('sign in with the keyboard alone', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused()
  await page.keyboard.type('anything')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Check your authenticator' })).toBeVisible()
  await expect(page.getByLabel('Digit 1')).toBeFocused()
  await page.keyboard.type('123456')
  await expect(page).toHaveURL(/\/m\/smith$/)
})

test('the skip link jumps past the sidebar to the conversation', async ({ page }) => {
  await page.goto('/m/smith/c/c-termination')
  await page.getByRole('article', { name: 'Answer' }).first().waitFor()
  // It is the first stop in the tab order, hidden until it has focus.
  const first = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll<HTMLElement>('a[href], button, input, textarea, [tabindex]'),
      ].find((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'))?.textContent,
  )
  expect(first).toBe('Skip to conversation')
  const skip = page.getByRole('link', { name: 'Skip to conversation' })
  await expect(skip).not.toBeInViewport()
  await skip.focus()
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

test('ask, open a cited passage and come back, by keyboard', async ({ page }) => {
  await page.goto('/m/smith')
  const composer = page.getByRole('textbox', { name: /Ask about/ })
  await expect(composer).toBeFocused()
  await page.keyboard.type('What notice do we need to terminate the MSA?')
  await page.keyboard.press('Enter')
  await expect(page.getByText('From your documents')).toBeVisible({ timeout: 15_000 })

  // The way a keyboard user gets from the composer back to the answer: the skip link, then Tab.
  await page.getByRole('link', { name: 'Skip to conversation' }).focus()
  await page.keyboard.press('Enter')
  await tabTo(page, (el) => (el.getAttribute('aria-label') ?? '').startsWith('Source 1:'))
  const chip = page.locator(':focus')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('complementary', { name: 'Document viewer' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary', { name: 'Document viewer' })).toBeHidden()
  await expect(chip).toBeFocused()
})

test('the command palette and the draft tabs work from the keyboard', async ({ page }) => {
  await page.goto('/m/smith')
  await page.getByRole('heading', { name: /What would you like/ }).waitFor()
  await page.keyboard.press('ControlOrMeta+K')
  await page.keyboard.type('reply to acme')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/c\/c-reply/)

  await page.goto('/m/smith/c/c-reply?draft=draft-reply')
  const letter = page.getByRole('tab', { name: 'Letter' })
  await letter.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: /Checks/ })).toBeFocused()
  await expect(page.getByRole('tab', { name: /Checks/ })).toHaveAttribute('aria-selected', 'true')
})

test('every control shows a focus ring', async ({ page }) => {
  for (const url of ['/m/smith', '/m/smith/documents', '/settings', '/matters']) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    await page.locator('body').focus()
    expect(await focusWithoutRing(page, 30), url).toEqual([])
  }
})
