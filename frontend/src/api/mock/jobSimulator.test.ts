import { describe, expect, it } from 'vitest'
import type { MatterEvent } from '@/api/events'
import { createMockApiClient } from '@/api/mock/MockApiClient'

function uploadAndWait(
  name: string,
  sizeBytes = 120_000,
  origin: 'client' | 'other_party' = 'client',
) {
  const api = createMockApiClient()
  const events: MatterEvent[] = []
  return new Promise<{ events: MatterEvent[]; api: typeof api }>((resolve) => {
    api.subscribeMatterEvents('smith', (event) => {
      events.push(event)
      if (event.type !== 'job.progress' && 'name' in event && event.name === name)
        resolve({ events, api })
    })
    void api.uploadDocument('smith', new File([name.padEnd(sizeBytes || 1, 'x')], name), origin)
  })
}

describe('ingest job simulator', () => {
  it('reports progress through the pipeline and finishes with a coverage report', async () => {
    const { events, api } = await uploadAndWait('Exhibit C.pdf')
    const steps = events.flatMap((e) =>
      e.type === 'job.progress' && e.detail.length ? [e.step] : [],
    )
    expect(steps).toEqual(expect.arrayContaining(['checking', 'scanning', 'reading', 'indexing']))
    expect(events.at(-1)).toMatchObject({
      type: 'document.ready',
      coverage: { pagesRead: 3, unreadablePages: [] },
    })
    expect((await api.listDocuments('smith')).find((d) => d.name === 'Exhibit C.pdf')?.status).toBe(
      'ready',
    )
  })

  it('runs OCR on scans and reports unreadable pages', async () => {
    const { events } = await uploadAndWait('Signed scan.pdf', 600_000)
    expect(events.some((e) => e.type === 'job.progress' && e.step === 'ocr')).toBe(true)
    expect(events.at(-1)).toMatchObject({
      type: 'document.ready',
      coverage: { unreadablePages: [8] },
    })
  })

  it('quarantines a file the malware scan flags', async () => {
    const { events } = await uploadAndWait('eicar-test.pdf')
    expect(events.at(-1)).toMatchObject({ type: 'document.failed', quarantined: true })
  })

  it('refuses documents over 300 pages', async () => {
    const { events } = await uploadAndWait('Deposition transcript.pdf', 46_000 * 412)
    expect(events.at(-1)).toMatchObject({ type: 'document.failed', quarantined: false })
  })

  it('flags hidden content in Word files from the other side', async () => {
    const { api } = await uploadAndWait('Redline from Acme.docx', 90_000, 'other_party')
    const doc = (await api.listDocuments('smith')).find((d) => d.name === 'Redline from Acme.docx')
    expect(doc).toMatchObject({ hiddenContent: true })
  })
})
