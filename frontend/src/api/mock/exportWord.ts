import type { Draft, Summary } from '@/api/types'
import { parseAnswer, pinpoint, type Inline } from '@/lib/citations'
import { cleanText } from '@/lib/drafts'
import { AUDIENCE_LABELS, TEMPLATE_LABELS } from '@/lib/summaries'
import { reservationOfRights } from '@/lib/drafts'

// The mock's stand-in for the backend's .docx export: HTML that Word opens. Screens never import this; they
// call exportDraft and exportSummary and save the file they get back (INT-3.4).

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const inline = (parts: Inline[]) =>
  parts
    .map((p) =>
      p.kind === 'bold'
        ? `<b>${escape(p.text)}</b>`
        : p.kind === 'cite'
          ? `<sup>[${p.n}]</sup>`
          : escape(p.text),
    )
    .join('')

function bodyHtml(text: string) {
  return parseAnswer(text)
    .map((b) =>
      b.kind === 'p'
        ? `<p>${inline(b.parts)}</p>`
        : `<${b.kind}>${b.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${b.kind}>`,
    )
    .join('')
}

export function summaryToWordHtml(summary: Summary) {
  const sections = summary.sections
    .map(
      (s) =>
        `<h2>${escape(s.title)}</h2>${s.body ? bodyHtml(s.body) : '<p><i>Not found in this document.</i></p>'}`,
    )
    .join('')
  const sources = summary.citations
    .map(
      (c) =>
        `<li>${escape(c.documentName)}, page ${c.page}, ${escape(pinpoint(c.para))}: “${escape(c.quote)}”</li>`,
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Summary – ${escape(summary.documentName)}</title>
<style>body{font-family:Georgia,serif;font-size:11.5pt;line-height:1.5;color:#1f1e1c}h1{font-size:18pt}h2{font-size:12.5pt;margin-top:14pt}.stamp{font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.06em;color:#a8261f}.meta{font-family:Arial,sans-serif;font-size:9pt;color:#5c5a55}</style></head>
<body><p class="stamp">PRIVILEGED &amp; CONFIDENTIAL · ATTORNEY WORK PRODUCT · AI SUMMARY, CHECK EVERY CITATION</p>
<h1>Summary: ${escape(summary.documentName)}</h1>
<p class="meta">${escape(TEMPLATE_LABELS[summary.template])} · ${escape(AUDIENCE_LABELS[summary.audience])} · ${new Date(summary.createdAt).toLocaleDateString('en-US', { dateStyle: 'long' })} · ${escape(summary.modelLabel)}</p>
${sections}${sources ? `<h2>Sources</h2><ol>${sources}</ol>` : ''}</body></html>`
}

export const wordBlob = (html: string) => new Blob(['\ufeff', html], { type: 'application/msword' })

// ---------- drafts (DEC-50) ----------

const draftBody = (text: string, clean: boolean) => bodyHtml(clean ? cleanText(text) : text)

/**
 * The clean copy goes to the other side: no source citations, no margin labels, no AI notes, no watermark,
 * no author metadata. The working copy keeps the sources and is stamped privileged; it is never sent.
 */
export function draftToWordHtml(
  draft: Draft,
  kind: 'clean' | 'working',
  signer: { name: string; clientName: string },
) {
  const clean = kind === 'clean'
  const letter = draft.type === 'response_letter'
  const stamp = clean
    ? ''
    : '<p class="stamp">PRIVILEGED &amp; CONFIDENTIAL · ATTORNEY WORK PRODUCT · DO NOT SEND</p>'
  const fre408 =
    letter && draft.safeguards.fre408
      ? '<p><b>CONFIDENTIAL SETTLEMENT COMMUNICATION: FRE 408 / CAL. EVID. CODE § 1152</b></p>'
      : ''
  const head = letter
    ? `<p>${escape(draft.dateLine)}</p><p class="meta">By email and certified mail</p>
<p>${[draft.addressee?.name, draft.addressee?.firm, ...(draft.addressee?.address ?? [])]
        .filter(Boolean)
        .map((l) => escape(l ?? ''))
        .join('<br>')}</p>
<p><b>Re: ${escape(draft.title)}</b></p><p>Dear Counsel:</p>`
    : `<h1>Memorandum</h1><p class="meta">To: ${escape(draft.memoHeader?.to ?? '')}<br>From: ${escape(draft.memoHeader?.from ?? '')}<br>Date: ${escape(draft.dateLine)}<br>Re: ${escape(draft.memoHeader?.re ?? '')}</p>`
  const body = draft.sections
    .map((s) => `${letter ? '' : `<h2>${escape(s.label)}</h2>`}${draftBody(s.body, clean)}`)
    .join('')
  const reservation =
    letter && draft.safeguards.reservationOfRights
      ? `<p>${escape(reservationOfRights(signer.clientName))}</p>`
      : ''
  const sign = letter
    ? `<p>Sincerely,</p><p>${escape(signer.name)}<br>Counsel for ${escape(signer.clientName)}</p>`
    : ''
  const sources =
    !clean && draft.citations.length
      ? `<h2>Sources (working copy only)</h2><ol>${draft.citations
          .map(
            (c) =>
              `<li>${escape(c.documentName)}, page ${c.page}, ${escape(pinpoint(c.para))}</li>`,
          )
          .join('')}</ol>`
      : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title></title>
<style>body{font-family:Georgia,serif;font-size:11.5pt;line-height:1.5;color:#1f1e1c}h1{font-size:16pt}h2{font-size:12pt;margin-top:12pt}.stamp{font-family:Arial,sans-serif;font-size:9pt;letter-spacing:.06em;color:#a8261f}.meta{font-family:Arial,sans-serif;font-size:9.5pt;color:#5c5a55}</style></head>
<body>${stamp}${fre408}${head}${body}${reservation}${sign}${sources}</body></html>`
}
