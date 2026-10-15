import { FileText, FileType2, Mail, type LucideProps } from 'lucide-react'
import type { DocumentKind } from '@/api/types'

// One icon per document type, used in the sidebar, library, viewer and upload dialog.
const ICONS = {
  pdf: FileText,
  docx: FileType2,
  eml: Mail,
  msg: Mail,
  txt: FileText,
} satisfies Record<DocumentKind, unknown>

export function DocumentIcon({ kind, ...props }: { kind: DocumentKind } & LucideProps) {
  const Icon = ICONS[kind]
  return <Icon aria-hidden {...props} />
}
