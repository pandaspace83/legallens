import { CircleCheck, CircleDashed, CircleStop, SearchX } from 'lucide-react'
import type { AnswerState } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { COPY } from '@/lib/copy'

// From your documents / Partially found / Not found in your documents (FE-4.7, DEC-37).
export function AnswerStateBadge({ state, stopped }: { state?: AnswerState; stopped?: boolean }) {
  if (stopped) {
    return (
      <Badge tone="neutral">
        <CircleStop aria-hidden /> Stopped
      </Badge>
    )
  }
  if (state === 'found') {
    return (
      <Badge tone="success">
        <CircleCheck aria-hidden /> {COPY.answerFound}
      </Badge>
    )
  }
  if (state === 'partial') {
    return (
      <Badge tone="warning">
        <CircleDashed aria-hidden /> {COPY.answerPartial}
      </Badge>
    )
  }
  if (state === 'not_found') {
    return (
      <Badge tone="info">
        <SearchX aria-hidden /> {COPY.answerNotFound}
      </Badge>
    )
  }
  return null
}
