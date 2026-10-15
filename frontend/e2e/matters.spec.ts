import { expect, test } from '@playwright/test'
import { axe } from './helpers.ts'

// FE-3.8, FE-3.9: create a matter in three steps, edit its details, close it, export it and delete it.
test('create a matter, edit it, close it, and delete it with the typed name', async ({ page }) => {
  await page.goto('/matters')
  await page.getByRole('button', { name: 'New matter' }).click()
  const dialog = page.getByRole('dialog', { name: 'New matter' })

  // Step 1 needs its three required fields.
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByText('Required').first()).toBeVisible()
  await dialog.getByLabel('Matter name').fill('Okafor v. Dalton')
  await dialog.getByLabel('Our client').fill('Ada Okafor')
  await dialog.getByLabel('Our side').fill('Plaintiff')
  await dialog.getByRole('button', { name: 'Next' }).click()

  await dialog.getByLabel('Other side').fill('Dalton Holdings')
  await dialog.getByLabel('Their counsel').fill('R. Ellis')
  await dialog.getByLabel('Their firm').fill('Ellis & Park')
  await dialog.getByRole('button', { name: 'Next' }).click()

  await dialog.getByLabel('Court').fill('Superior Court, Alameda County')
  await dialog.getByRole('radio', { name: 'Given' }).click()
  expect((await axe(page)).violations).toEqual([])
  await dialog.getByRole('button', { name: 'Create matter' }).click()
  await expect(page).toHaveURL(/\/m\/.+/)

  // Matter details show what was entered, and can be edited.
  await page.getByRole('button', { name: /switch matter/ }).click()
  await page.getByRole('menuitem', { name: 'Matter details' }).click()
  await expect(page.getByRole('heading', { name: 'Okafor v. Dalton' })).toBeVisible()
  await expect(page.getByText('Dalton Holdings')).toBeVisible()
  await page.getByRole('button', { name: 'Edit details' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit matter details' })
  await edit.getByLabel('Practice area').fill('Landlord–tenant')
  await edit.getByRole('button', { name: 'Next' }).click()
  await edit.getByRole('button', { name: 'Next' }).click()
  await edit.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByText('Landlord–tenant')).toBeVisible()

  // Close: read-only from then on.
  await page.getByRole('button', { name: 'Close matter' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close the matter' }).click()
  await expect(page.getByText('Closed, read-only')).toBeVisible()

  // Delete: export prompt, then the name typed exactly.
  await page.getByRole('button', { name: 'Delete matter' }).click()
  const del = page.getByRole('dialog', { name: /Delete Okafor v. Dalton/ })
  await del.getByRole('button', { name: 'Continue without exporting' }).click()
  const confirm = del.getByRole('button', { name: 'Delete the matter' })
  await expect(confirm).toBeDisabled()
  await del.getByLabel(/Type/).fill('Okafor v. Dalton')
  await confirm.click()
  await expect(page).toHaveURL(/\/matters$/)
  await expect(page.getByText('Okafor v. Dalton')).toHaveCount(0)
})
