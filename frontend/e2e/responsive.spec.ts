import { expect, test } from '@playwright/test'
import { axe } from './helpers.js'

// Narrower screens (FE-9.3): below 1024 px the sidebar is a drawer, and below 1280 px the side panel covers
// the conversation as a modal sheet, full width on a phone.

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the sidebar is a drawer that closes once a chat is chosen', async ({ page }) => {
    await page.goto('/m/smith')
    await expect(page.getByRole('heading', { name: /What would you like to know/ })).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Chats and documents', exact: true }),
    ).toBeHidden()
    expect((await axe(page)).violations).toEqual([])

    await page.getByRole('button', { name: 'Chats and documents', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'Chats and documents', exact: true })
    await expect(drawer).toBeVisible()
    // Esc in a search with text clears the search and leaves the drawer open.
    const search = drawer.getByRole('searchbox', { name: 'Search chats' })
    await search.fill('late fee')
    await search.press('Escape')
    await expect(search).toHaveValue('')
    await expect(drawer).toBeVisible()
    expect((await axe(page)).violations).toEqual([])

    await drawer.getByRole('link', { name: 'Late fee claimed vs. the MSA' }).click()
    await expect(page).toHaveURL(/\/c\/c-latefee/)
    await expect(drawer).toBeHidden()
  })

  test('a cited passage opens full width, and closing it returns to the answer', async ({
    page,
  }) => {
    await page.goto('/m/smith/c/c-termination')
    const chip = page.getByRole('button', { name: /^Source 1:/ }).first()
    await chip.click()
    const viewer = page.getByRole('dialog', { name: 'Document viewer' })
    await expect(viewer).toBeVisible()
    expect((await viewer.boundingBox())?.width).toBe(390)
    expect((await axe(page)).violations).toEqual([])

    await viewer.getByRole('button', { name: 'Close viewer' }).click()
    await expect(viewer).toBeHidden()
    await expect(chip).toBeFocused()
  })

  test('every page fits the screen without sideways scrolling', async ({ page }) => {
    for (const url of [
      '/login',
      '/matters',
      '/m/smith/documents',
      '/m/smith/c/c-reply?draft=draft-reply',
      '/settings',
      '/settings/data',
    ]) {
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      const wider = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .map((el) => el.tagName),
      )
      expect(wider, url).toEqual([])
    }
  })
})

test.describe('on a small laptop', () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test('the side panel covers the conversation; Esc closes find first, then the document', async ({
    page,
  }) => {
    await page.goto('/m/smith/c/c-demand')
    await expect(
      page.getByRole('navigation', { name: 'Chats and documents', exact: true }),
    ).toBeVisible()

    await page.goto('/m/smith/c/c-demand?summary=sum-demand')
    const summary = page.getByRole('dialog', { name: 'Summary' })
    await expect(summary).toBeVisible()
    await summary
      .getByRole('button', { name: /^Source 1:/ })
      .first()
      .click()
    const viewer = page.getByRole('dialog', { name: 'Document viewer' })
    await expect(viewer.locator('[data-active]').first()).toBeVisible()

    await page.keyboard.press('ControlOrMeta+F')
    const find = viewer.getByRole('textbox', { name: 'Find in document' })
    await find.fill('notice')
    await find.press('Escape')
    await expect(find).toBeHidden()
    await expect(viewer).toBeVisible()

    // A document opened from a summary closes back to the summary.
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
    await expect(page.getByRole('dialog', { name: 'Summary' })).toBeVisible()
    expect((await axe(page)).violations).toEqual([])
  })
})
