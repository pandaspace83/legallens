import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG).analyze()

test('sign in with MFA lands in the workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect((await axe(page)).violations).toEqual([])

  await page.getByLabel('Password', { exact: true }).fill('anything')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Check your authenticator' })).toBeVisible()
  await page.getByLabel('Digit 1').fill('1')
  await page.getByLabel('Digit 2').fill('2')
  await page.getByLabel('Digit 3').fill('3')
  await page.getByLabel('Digit 4').fill('4')
  await page.getByLabel('Digit 5').fill('5')
  await page.getByLabel('Digit 6').fill('6')
  await expect(page).toHaveURL(/\/m\/smith$/)
})

test('ask a question, get a cited answer, open the highlighted passage', async ({ page }) => {
  await page.goto('/m/smith')
  await expect(
    page.getByRole('heading', { name: /What would you like to know about/ }),
  ).toBeVisible()
  expect((await axe(page)).violations).toEqual([])

  await page.getByRole('button', { name: /What notice do we need to terminate the MSA/ }).click()
  await expect(page).toHaveURL(/\/m\/smith\/c\//)
  await expect(page.getByText('From your documents')).toBeVisible({ timeout: 15_000 })

  await page
    .getByRole('button', {
      name: /Source 1: Master Services Agreement v3\.pdf, page 6, §4\.2\(a\)/,
    })
    .first()
    .click()
  await expect(page.getByRole('complementary', { name: 'Document viewer' })).toBeVisible()
  await expect(page.locator('[data-active] ').first()).toContainText('sixty (60) days')
  expect((await axe(page)).violations).toEqual([])
})
