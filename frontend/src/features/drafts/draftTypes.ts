import { FileText, NotebookPen } from 'lucide-react'
import type { DraftType } from '@/api/types'

// The two kinds of draft (DEC-43, DEC-45), as the start dialog and the composer offer them.
export const DRAFT_TYPES: {
  type: DraftType
  label: string
  hint: string
  Icon: typeof FileText
}[] = [
  {
    type: 'response_letter',
    label: 'Response letter',
    hint: 'A reply to the other side, for you to review, adopt and send',
    Icon: FileText,
  },
  {
    type: 'memo',
    label: 'Internal memo',
    hint: 'An analysis for your file; never sent',
    Icon: NotebookPen,
  },
]
