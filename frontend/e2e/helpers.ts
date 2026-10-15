import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

// Shared by the browser tests: the WCAG 2.1 AA check, and opening the development-only dev panel.

export const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

/** The dev panel loads lazily, so the shortcut is retried until the panel is there to answer it. */
export async function devPanel(page: Page) {
  const panel = page.getByRole('complementary', { name: 'Dev panel' })
  await expect(async () => {
    if (!(await panel.isVisible())) await page.keyboard.press('ControlOrMeta+Shift+D')
    await expect(panel).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
  return panel
}
