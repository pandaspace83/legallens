import { ChevronDown, Library, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useDocuments } from '@/api/queries/documents'
import { useMatter } from '@/api/queries/matters'
import type { ID } from '@/api/types'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { StatusPill } from '@/components/common/StatusPill'
import { IconButton } from '@/components/ui/IconButton'
import { useViewer } from '@/features/viewer/useViewer'
import { cn } from '@/lib/cn'
import { useUploadDialog } from '@/stores/ui'

// Documents section of the sidebar: count, status at a glance, upload, and the library (FE-3.5).
const VISIBLE = 5

export function SidebarDocuments({ matterId }: { matterId: ID }) {
  const { data: documents = [] } = useDocuments(matterId)
  const { data: matter } = useMatter(matterId)
  const { docId, open } = useViewer()
  const showUpload = useUploadDialog((s) => s.show)
  const [expanded, setExpanded] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const shown = showAll ? documents : documents.slice(0, VISIBLE)
  const inLibrary = useLocation().pathname.endsWith('/documents')

  return (
    <section aria-label="Documents" className="border-t border-line px-2 pt-2 pb-3">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-control px-2.5 text-left transition-colors hover:bg-hover"
        >
          <span className="text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
            Documents
          </span>
          <span className="rounded-full bg-hover px-1.5 text-[11px] font-medium text-fg-muted">
            {documents.length}
          </span>
          <ChevronDown
            className={cn(
              'ml-auto size-4 shrink-0 text-fg-subtle transition-transform',
              !expanded && '-rotate-90',
            )}
            aria-hidden
          />
        </button>
        <Link
          to={`/m/${matterId}/documents`}
          aria-label="Open the document library"
          title="Document library"
          className={cn(
            'flex size-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg',
            inLibrary && 'bg-surface text-fg shadow-raised',
          )}
        >
          <Library className="size-3.5" />
        </Link>
        {matter?.status !== 'closed' ? (
          <IconButton label="Upload documents" size="sm" onClick={() => showUpload()}>
            <Plus />
          </IconButton>
        ) : null}
      </div>

      {expanded ? (
        <ul className="mt-1 space-y-px">
          {shown.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => open(d.id)}
                title={d.origin === 'other_party' ? `${d.name} · from the other side` : d.name}
                className={cn(
                  'flex h-8 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] transition-colors',
                  d.id === docId
                    ? 'bg-surface text-fg shadow-raised'
                    : 'text-fg-muted hover:bg-hover hover:text-fg',
                )}
              >
                <DocumentIcon
                  kind={d.kind}
                  className={cn(
                    'size-4 shrink-0',
                    d.origin === 'other_party' ? 'text-warning' : 'text-fg-subtle',
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {d.name.replace(/\.(pdf|docx|eml|msg|txt)$/i, '')}
                </span>
                <StatusPill document={d} />
              </button>
            </li>
          ))}
          {documents.length > VISIBLE ? (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((s) => !s)}
                className="h-7 w-full rounded-control px-2.5 text-left text-[12.5px] font-medium text-fg-subtle hover:bg-hover hover:text-fg-muted"
              >
                {showAll ? 'Show fewer' : `Show all ${documents.length}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  )
}
