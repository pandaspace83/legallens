import { describe, expect, it } from 'vitest'
import { inspectFile, MAX_BYTES } from '@/features/documents/validateUpload'

const pdf = (name = 'Exhibit C.pdf', extra = '') =>
  new File([`%PDF-1.7\n${extra}`], name, { type: 'application/pdf' })

describe('inspectFile', () => {
  it('accepts a real PDF and fingerprints it', async () => {
    const check = await inspectFile(pdf(), [])
    expect(check).toMatchObject({ status: 'ok', kind: 'pdf' })
    expect(check.status === 'ok' && check.sha256).toMatch(/^[0-9a-f]+$/)
  })

  it('refuses a file type that is not on the allowlist', async () => {
    expect(await inspectFile(new File(['x'], 'photo.heic'), [])).toMatchObject({ status: 'error' })
  })

  it('judges the type by the bytes, not the name', async () => {
    const fake = new File(['MZ executable'], 'contract.pdf')
    expect(await inspectFile(fake, [])).toEqual({
      status: 'error',
      message: 'This file is named .pdf but its contents aren’t a PDF file.',
    })
  })

  it('catches a renamed copy of a document already in the matter', async () => {
    const first = await inspectFile(pdf('a.pdf', 'same'), [])
    const sha256 = first.status === 'ok' ? first.sha256 : ''
    const again = await inspectFile(pdf('renamed.pdf', 'same'), [{ name: 'a.pdf', sha256 }])
    expect(again).toEqual({ status: 'error', message: 'Already in this matter as “a.pdf”.' })
  })

  it('enforces the 50 MB limit', async () => {
    const big = new File(['%PDF'], 'big.pdf')
    Object.defineProperty(big, 'size', { value: MAX_BYTES + 1 })
    expect(await inspectFile(big, [])).toMatchObject({ status: 'error' })
  })
})
