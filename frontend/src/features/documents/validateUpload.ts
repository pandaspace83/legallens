import type { DocumentKind, LegalDocument } from '@/api/types'
import { sha256 } from '@/lib/hash'
import { formatBytes } from '@/lib/format'

// Checks a file in the browser before upload (FE-5.2, DEC-59): the type by its first bytes, not its name;
// the 50 MB limit; and duplicates by SHA-256, so a renamed copy is still caught. The server checks again.

export const MAX_BYTES = 50 * 1024 * 1024
export const ACCEPT = '.pdf,.docx,.eml,.msg,.txt'
const KINDS: Record<string, DocumentKind> = {
  pdf: 'pdf',
  docx: 'docx',
  eml: 'eml',
  msg: 'msg',
  txt: 'txt',
}

export type FileCheck =
  | { status: 'checking' }
  | { status: 'ok'; kind: DocumentKind; sha256: string }
  | { status: 'error'; message: string }

function extensionOf(name: string) {
  return name.toLowerCase().split('.').pop() ?? ''
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((b, i) => bytes[i] === b)
}

/** Does the file's content match what its extension claims? */
function contentMatches(kind: DocumentKind, head: Uint8Array) {
  switch (kind) {
    case 'pdf':
      return startsWith(head, [0x25, 0x50, 0x44, 0x46]) // %PDF
    case 'docx':
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]) // ZIP container
    case 'msg':
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) // Outlook (OLE)
    case 'eml':
    case 'txt':
      return !head.includes(0) // plain text has no NUL bytes
  }
}

export async function inspectFile(
  file: File,
  existing: Pick<LegalDocument, 'name' | 'sha256'>[],
  siblings: { sha256?: string }[] = [],
): Promise<FileCheck> {
  const kind = KINDS[extensionOf(file.name)]
  if (!kind)
    return { status: 'error', message: 'Only PDF, DOCX, EML, MSG and TXT files can be uploaded.' }
  if (file.size === 0) return { status: 'error', message: 'This file is empty.' }
  if (file.size > MAX_BYTES)
    return {
      status: 'error',
      message: `This file is ${formatBytes(file.size)}; the limit is 50 MB.`,
    }

  const buffer = await file.arrayBuffer()
  if (!contentMatches(kind, new Uint8Array(buffer.slice(0, 512)))) {
    return {
      status: 'error',
      message: `This file is named .${kind} but its contents aren’t a ${kind.toUpperCase()} file.`,
    }
  }

  const hash = await sha256(buffer)
  const same = existing.find((d) => (d.sha256 ? d.sha256 === hash : d.name === file.name))
  if (same) return { status: 'error', message: `Already in this matter as “${same.name}”.` }
  if (siblings.some((s) => s.sha256 === hash))
    return { status: 'error', message: 'This file is already in this upload.' }

  return { status: 'ok', kind, sha256: hash }
}
