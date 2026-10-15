import { Minus, Plus, Search } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { FindInDocument } from '@/features/viewer/FindInDocument'

// Page jump, zoom and find (FE-5.6).
interface ViewerToolbarProps {
  pages: number[]
  totalPages: number
  onGoToPage(page: number): void
  zoom: number
  onZoom(zoom: number): void
  finding: boolean
  onFinding(open: boolean): void
  find: string
  onFind(query: string): void
  matchCount: number
  matchIndex: number
  onMatch(index: number): void
}

const ZOOMS = [0.8, 0.9, 1, 1.15, 1.3, 1.5]

export function ViewerToolbar(props: ViewerToolbarProps) {
  const { pages, totalPages, onGoToPage, zoom, onZoom, finding, onFinding } = props
  const z = ZOOMS.indexOf(zoom)

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-surface px-3">
      {finding ? (
        <FindInDocument {...props} onClose={() => onFinding(false)} />
      ) : (
        <>
          {pages.length ? (
            <label className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
              Page
              <select
                aria-label="Go to page"
                onChange={(e) => onGoToPage(Number(e.target.value))}
                defaultValue=""
                className="h-7 rounded-md border border-line bg-surface px-1.5 text-[12.5px] text-fg outline-none focus:border-primary"
              >
                <option value="" disabled>
                  —
                </option>
                {pages.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <span className="text-fg-subtle">of {totalPages}</span>
            </label>
          ) : null}
          <div className="flex-1" />
          <IconButton
            label="Zoom out"
            size="sm"
            disabled={z <= 0}
            onClick={() => onZoom(ZOOMS[z - 1] ?? zoom)}
          >
            <Minus />
          </IconButton>
          <span className="w-11 text-center text-[12px] font-medium text-fg-muted tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton
            label="Zoom in"
            size="sm"
            disabled={z >= ZOOMS.length - 1}
            onClick={() => onZoom(ZOOMS[z + 1] ?? zoom)}
          >
            <Plus />
          </IconButton>
          <span aria-hidden className="mx-1 h-5 w-px bg-line" />
          <IconButton
            label="Find in document"
            shortcut="⌘F"
            size="sm"
            onClick={() => onFinding(true)}
          >
            <Search />
          </IconButton>
        </>
      )}
    </div>
  )
}
