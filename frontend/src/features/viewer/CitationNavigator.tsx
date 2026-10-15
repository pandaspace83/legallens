import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'

// "Citation 2 of 3" with previous and next, over the citations of this document in the open chat (FE-5.6).
export interface CitePoint {
  page: number
  anchor: string
}

export function CitationNavigator({
  points,
  index,
  onGo,
}: {
  points: CitePoint[]
  index: number
  onGo(point: CitePoint): void
}) {
  if (points.length < 2 || index < 0) return null
  return (
    <span className="ml-auto flex items-center gap-0.5">
      <IconButton
        label="Previous citation"
        size="sm"
        disabled={index === 0}
        onClick={() => {
          const p = points[index - 1]
          if (p) onGo(p)
        }}
      >
        <ChevronLeft />
      </IconButton>
      <span className="px-1 text-[12px] font-medium text-fg-muted tabular-nums">
        {index + 1} of {points.length}
      </span>
      <IconButton
        label="Next citation"
        size="sm"
        disabled={index === points.length - 1}
        onClick={() => {
          const p = points[index + 1]
          if (p) onGo(p)
        }}
      >
        <ChevronRight />
      </IconButton>
    </span>
  )
}
