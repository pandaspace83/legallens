// Screenshots of every main screen for the write-up and the Technical Architecture doc (FE-9.6). Needs the
// mock dev server on :5173 (`npm run dev`); run with `npm run screenshots`. Toasts are hidden so the demo's
// background notices don't cover the screens. See ../architecture/screens/README.md for the list.
import { chromium } from '@playwright/test'

const OUT = process.argv[2] ?? '../architecture/screens'
const B = 'http://localhost:5173'
const b = await chromium.launch()
const hideToasts = (p) =>
  p.addStyleTag({ content: '[data-sonner-toaster]{display:none!important}' })
async function shot(name, url, { width = 1440, height = 900, before } = {}) {
  const p = await b.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
  await p.goto(B + url, { waitUntil: 'networkidle' })
  await hideToasts(p)
  if (before) await before(p)
  await p.waitForTimeout(700)
  await p.screenshot({ path: `${OUT}/${name}.png` })
  await p.close()
  console.log('saved', name)
}
const devPanel = async (p) => {
  const panel = p.getByRole('complementary', { name: 'Dev panel' })
  for (let i = 0; i < 10 && !(await panel.isVisible()); i++) {
    await p.keyboard.press('ControlOrMeta+Shift+D')
    await p.waitForTimeout(300)
  }
  return panel
}
await shot('01-sign-in', '/login')
await shot('02-two-step-code', '/login', {
  before: async (p) => {
    await p.getByLabel('Password', { exact: true }).fill('demo')
    await p.getByRole('button', { name: 'Continue' }).click()
    await p.getByRole('heading', { name: 'Check your authenticator' }).waitFor()
  },
})
await shot('03-matters', '/matters')
await shot('04-new-chat', '/m/smith')
await shot('05-answer-with-citations', '/m/smith', {
  before: async (p) => {
    await p.getByRole('button', { name: /What notice do we need to terminate the MSA/ }).click()
    await p.getByText('From your documents').waitFor({ timeout: 20000 })
    await p.waitForTimeout(1200)
  },
})
await shot('06-cited-passage', '/m/smith/c/c-termination', {
  before: async (p) => {
    await p
      .getByRole('button', { name: /^Source 1:/ })
      .first()
      .click()
    await p.locator('[data-active]').first().waitFor()
  },
})
await shot('07-document-library', '/m/smith/documents')
await shot('08-upload-dialog', '/m/smith/documents', {
  before: async (p) => {
    await p.getByRole('button', { name: 'Upload documents' }).first().click()
    const d = p.getByRole('dialog', { name: 'Upload documents' })
    await d.getByLabel('Choose files to upload').setInputFiles([
      {
        name: 'Exhibit C – Amendment 2.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7 C'),
      },
      {
        name: 'Letter from Whitfield & Crane, Oct 2.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7 L'),
      },
    ])
    await d.getByRole('radio', { name: 'Our client' }).first().click()
  },
})
await shot('09-coverage-report', '/m/smith/documents?doc=doc-demand', {
  before: async (p) => {
    await p
      .getByRole('complementary', { name: 'Document viewer' })
      .getByRole('button', { name: 'Coverage' })
      .click()
  },
})
await shot('10-summary', '/m/smith/c/c-demand?summary=sum-demand')
await shot('11-draft-letter', '/m/smith/c/c-reply?draft=draft-reply')
await shot('12-draft-checks', '/m/smith/c/c-reply?draft=draft-reply', {
  before: async (p) => {
    await p.getByRole('tab', { name: /Checks/ }).click()
  },
})
await shot('13-draft-review', '/m/smith/c/c-reply?draft=draft-reply', {
  before: async (p) => {
    await p.getByRole('button', { name: 'Review and adopt' }).click()
  },
})
await shot('14-command-palette', '/m/smith', {
  before: async (p) => {
    await p.getByRole('heading', { name: /What would you like/ }).waitFor()
    await p.keyboard.press('ControlOrMeta+K')
    await p.keyboard.type('notice')
  },
})
await shot('15-matter-details', '/m/smith/profile')
await shot('16-closed-matter', '/m/henderson')
await shot('17-settings', '/settings')
await shot('18-where-your-data-goes', '/settings/data')
await shot('19-engine-offline', '/m/smith', {
  before: async (p) => {
    const panel = await devPanel(p)
    await panel.getByRole('switch', { name: 'AI engine offline' }).click()
    await panel.getByRole('switch', { name: 'Storage almost full' }).click()
    await panel.getByRole('button', { name: 'Close dev panel' }).click()
    await p
      .getByRole('textbox', { name: /Ask about/ })
      .fill('What notice do we need to end the MSA?')
  },
})
await shot('20-lock-screen', '/m/smith', {
  before: async (p) => {
    const panel = await devPanel(p)
    await panel.getByRole('button', { name: 'Lock now' }).click()
    await p.getByRole('heading', { name: 'LegalLens is locked' }).waitFor()
  },
})
await shot('21-first-run-guide', '/m/smith', {
  before: async (p) => {
    const panel = await devPanel(p)
    await panel.getByRole('button', { name: 'Add an empty matter' }).click()
    await panel.getByRole('button', { name: 'Close dev panel' }).click()
    await p.getByText('Getting started').waitFor()
  },
})
await shot('22-phone-answer', '/m/smith/c/c-termination', { width: 390, height: 844 })
await shot('23-phone-sidebar', '/m/smith/c/c-termination', {
  width: 390,
  height: 844,
  before: async (p) => {
    await p.getByRole('button', { name: 'Chats and documents', exact: true }).click()
  },
})
await shot('24-phone-cited-passage', '/m/smith/c/c-termination', {
  width: 390,
  height: 844,
  before: async (p) => {
    await p
      .getByRole('button', { name: /^Source 1:/ })
      .first()
      .click()
    await p.locator('[data-active]').first().waitFor()
  },
})
await shot('25-tablet-draft', '/m/smith/c/c-reply?draft=draft-reply', { width: 1024, height: 768 })
await b.close()
