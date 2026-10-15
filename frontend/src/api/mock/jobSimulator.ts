import type { MatterEvent } from '@/api/events'
import type {
  Draft,
  DraftStep,
  HiddenItem,
  IngestStep,
  LegalDocument,
  Summary,
  SummaryStep,
} from '@/api/types'
import { AUDIENCE_LABELS, TEMPLATE_FIELDS } from '@/lib/summaries'

// Plays an ingest job the way the worker would (Technical Architecture, frame 6) and reports it on the matter
// event stream (FE-2.5). File names steer the demo: "eicar" or "virus" is quarantined, "scan", "fax" or
// "photo" goes through OCR, and anything over 300 pages is refused.

interface Frame {
  pct: number
  step: IngestStep
  detail: string
}

const isTest = import.meta.env.MODE === 'test'
const MAX_PAGES = 300

const HIDDEN: HiddenItem[] = [
  {
    kind: 'tracked_change',
    description: 'Tracked changes: 4 insertions and 2 deletions by the other side',
  },
  { kind: 'comment', description: '3 margin comments by the drafting attorney' },
  { kind: 'metadata', description: 'Author, company and edit history in the document properties' },
]

export function isScanned(name: string) {
  return /scan|fax|photo/i.test(name)
}

function framesFor(doc: LegalDocument): Frame[] {
  const frames: Frame[] = [
    { pct: 3, step: 'checking', detail: 'Checking file type and size' },
    { pct: 8, step: 'scanning', detail: 'Scanning for malware on this computer' },
  ]
  const stride = Math.max(1, Math.ceil(doc.pages / 6))
  for (let page = stride; page < doc.pages + stride; page += stride) {
    const p = Math.min(page, doc.pages)
    frames.push({
      pct: Math.round(10 + (55 * p) / doc.pages),
      step: 'reading',
      detail: `Reading page ${p} of ${doc.pages}`,
    })
  }
  if (isScanned(doc.name)) {
    for (const share of [0.33, 0.66, 1]) {
      const p = Math.max(1, Math.round(doc.pages * share))
      frames.push({
        pct: Math.round(66 + 18 * share),
        step: 'ocr',
        detail: `Reading scanned page ${p} of ${doc.pages} (OCR)`,
      })
    }
  }
  frames.push({
    pct: 90,
    step: 'indexing',
    detail: `Indexing ${doc.pages * 8} passages for search`,
  })
  frames.push({ pct: 97, step: 'indexing', detail: 'Writing to the encrypted database' })
  return frames
}

function failure(doc: LegalDocument): { reason: string; quarantined: boolean } | null {
  if (/eicar|virus|malware/i.test(doc.name)) {
    return {
      quarantined: true,
      reason: 'The malware scan found a threat. The file was quarantined and not read.',
    }
  }
  if (doc.pages > MAX_PAGES) {
    return {
      quarantined: false,
      reason: `This file has ${doc.pages} pages; the limit is ${MAX_PAGES}. Split it into parts and upload each one.`,
    }
  }
  return null
}

function finish(doc: LegalDocument) {
  const scanned = isScanned(doc.name)
  const unreadable = scanned && doc.pages > 6 ? [Math.ceil(doc.pages * 0.6)] : []
  Object.assign(doc, {
    status: 'ready',
    progress: undefined,
    step: undefined,
    stepDetail: undefined,
    ocrConfidence: scanned ? 0.9 : undefined,
    coverage: {
      pagesRead: doc.pages - unreadable.length,
      unreadablePages: unreadable,
      lowConfidencePages: scanned ? [{ page: Math.min(2, doc.pages), confidence: 0.76 }] : [],
    },
  } satisfies Partial<LegalDocument>)
  if (doc.origin === 'other_party' && doc.kind === 'docx') {
    doc.hiddenContent = true
    doc.hiddenItems = HIDDEN
  }
}

/** Runs the job in the background, mutating `doc` and emitting events. Returns a cancel function. */
export function runIngest(doc: LegalDocument, jobId: string, emit: (event: MatterEvent) => void) {
  const frames = framesFor(doc).filter((f) => f.pct > (doc.progress ?? 0))
  const failsWith = failure(doc)
  let timer: ReturnType<typeof setTimeout> | undefined
  let i = 0

  const next = () => {
    const frame = frames[i++]
    if (failsWith && (!frame || frame.step === 'reading')) {
      Object.assign(doc, {
        status: failsWith.quarantined ? 'quarantined' : 'failed',
        progress: undefined,
        step: undefined,
        stepDetail: undefined,
        error: failsWith.reason,
      } satisfies Partial<LegalDocument>)
      return emit({ type: 'document.failed', documentId: doc.id, name: doc.name, ...failsWith })
    }
    if (!frame) {
      finish(doc)
      return emit({
        type: 'document.ready',
        documentId: doc.id,
        name: doc.name,
        coverage: doc.coverage!,
      })
    }
    Object.assign(doc, {
      status: 'processing',
      progress: frame.pct,
      step: frame.step,
      stepDetail: frame.detail,
    })
    emit({
      type: 'job.progress',
      kind: 'ingest',
      jobId,
      documentId: doc.id,
      pct: frame.pct,
      step: frame.step,
      detail: frame.detail,
    })
    timer = setTimeout(next, isTest ? 0 : 380 + Math.random() * 320)
  }

  timer = setTimeout(next, isTest ? 0 : 500)
  return () => clearTimeout(timer)
}

/** A plausible page count from the file's size and type, as the worker would find after reading it. */
export function estimatePages(kind: LegalDocument['kind'], sizeBytes: number) {
  const perPage = { pdf: 46_000, docx: 24_000, eml: 6_000, msg: 9_000, txt: 3_000 }[kind]
  return Math.max(1, Math.round(sizeBytes / perPage))
}

/**
 * Plays a summarize job (Technical Architecture, frame 4, Summarize lane): read every page in order, extract
 * each template field, write for the audience, check citations. `complete` fills in the finished summary.
 */
export function runSummary(
  summary: Summary,
  pages: number,
  jobId: string,
  emit: (event: MatterEvent) => void,
  complete: () => void,
) {
  const fields =
    summary.audience === 'one_paragraph'
      ? [{ title: 'Summary' }]
      : TEMPLATE_FIELDS[summary.template]
  const frames: { pct: number; step: SummaryStep; detail: string }[] = [
    {
      pct: 10,
      step: 'reading',
      detail: `Reading all ${pages} ${pages === 1 ? 'page' : 'pages'} in order`,
    },
    ...fields.map((f, i) => ({
      pct: Math.round(20 + (50 * (i + 1)) / fields.length),
      step: 'extracting' as const,
      detail: `Extracting “${f.title}”`,
    })),
    {
      pct: 82,
      step: 'writing',
      detail: `Writing the ${AUDIENCE_LABELS[summary.audience].toLowerCase()}`,
    },
    { pct: 93, step: 'verifying', detail: 'Checking every citation against its passage' },
  ]
  let i = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const next = () => {
    const frame = frames[i++]
    if (!frame) {
      complete()
      return emit({
        type: 'job.done',
        kind: 'summarize',
        jobId,
        summaryId: summary.id,
        documentName: summary.documentName,
      })
    }
    Object.assign(summary, { progress: frame.pct, step: frame.step, stepDetail: frame.detail })
    emit({ type: 'job.progress', kind: 'summarize', jobId, summaryId: summary.id, ...frame })
    timer = setTimeout(next, isTest ? 0 : 420 + Math.random() * 300)
  }
  timer = setTimeout(next, isTest ? 0 : 400)
  return () => clearTimeout(timer)
}

/**
 * Plays a draft job (frame 4, Draft lane): read the incoming document, list its claims, find facts for each,
 * draft section by section, check the addressee (Rule 4.2), then check every citation (DEC-43 to DEC-48).
 */
export function runDraft(
  draft: Draft,
  pages: number,
  sectionLabels: string[],
  jobId: string,
  emit: (event: MatterEvent) => void,
  complete: () => void,
) {
  const memo = draft.type === 'memo'
  const claimCount = memo ? 0 : 6
  const frames: { pct: number; step: DraftStep; detail: string }[] = [
    {
      pct: 6,
      step: 'reading',
      detail: `Reading ${draft.incomingDocumentName} (${pages} ${pages === 1 ? 'page' : 'pages'})`,
    },
    memo
      ? { pct: 14, step: 'claims', detail: 'Framing the question presented' }
      : { pct: 14, step: 'claims', detail: `Listing each claim and demand: ${claimCount} found` },
    ...(memo
      ? [
          {
            pct: 30,
            step: 'retrieving' as const,
            detail: 'Finding the governing provisions in your documents',
          },
        ]
      : Array.from({ length: claimCount }, (_, i) => ({
          pct: Math.round(18 + (32 * (i + 1)) / claimCount),
          step: 'retrieving' as const,
          detail: `Finding facts for claim ${i + 1} of ${claimCount}`,
        }))),
    ...sectionLabels.map((label, i) => ({
      pct: Math.round(52 + (34 * (i + 1)) / sectionLabels.length),
      step: 'drafting' as const,
      detail: `Drafting “${label}”`,
    })),
    memo
      ? {
          pct: 90,
          step: 'safeguards',
          detail: 'Marking every rule without uploaded authority (DEC-45)',
        }
      : {
          pct: 90,
          step: 'safeguards',
          detail: 'Checking the addressee: Acme has counsel (Model Rule 4.2)',
        },
    { pct: 96, step: 'verifying', detail: 'Checking every citation against its passage' },
  ]
  let i = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const next = () => {
    const frame = frames[i++]
    if (!frame) {
      complete()
      return emit({ type: 'job.done', kind: 'draft', jobId, draftId: draft.id, title: draft.title })
    }
    Object.assign(draft, { progress: frame.pct, step: frame.step, stepDetail: frame.detail })
    emit({ type: 'job.progress', kind: 'draft', jobId, draftId: draft.id, ...frame })
    timer = setTimeout(next, isTest ? 0 : 300 + Math.random() * 260)
  }
  timer = setTimeout(next, isTest ? 0 : 400)
  return () => clearTimeout(timer)
}
