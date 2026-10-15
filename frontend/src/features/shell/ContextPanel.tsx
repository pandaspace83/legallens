import { Dialog as Radix } from 'radix-ui'
import { useEffect, useRef } from 'react'
import { useParams } from 'react-router'
import { PanelBoundary } from '@/components/common/PanelBoundary'
import { cn } from '@/lib/cn'
import { DraftPanel } from '@/features/drafts/DraftPanel'
import { SummaryPanel } from '@/features/summaries/SummaryPanel'
import { DocumentViewer } from '@/features/viewer/DocumentViewer'
import { useViewer } from '@/features/viewer/useViewer'
import { usePanelInline } from '@/hooks/useMediaQuery'
import { keepEscape } from '@/features/shell/keepEscape'
import { usePanelWidth } from '@/features/shell/usePanelWidth'

// Right-hand panel: a document (from a citation, the sidebar or the library), a summary, or a draft.
// A draft gets more room, because a letter is read and edited there. Closed when nothing is open (FE-3.6).
// From 1280 px it sits beside the conversation; below that it covers it as a modal sheet, full width on a
// phone, and Esc or a click outside closes it (FE-3.6, FE-9.3).
export function ContextPanel() {
  const { matterId = '' } = useParams()
  const { docId, summaryId, draftId, close, closeDraft, closeSummary } = useViewer()
  const inline = usePanelInline()
  const panel = usePanelWidth()
  // The panel opens from a citation, a sidebar item or a menu, not from a dialog trigger, so it remembers what had
  // focus and returns there when it closes (WCAG 2.4.3).
  const returnFocus = useRef<HTMLElement | null>(null)
  const isOpen = Boolean(docId || summaryId || draftId)

  // Beside the conversation the panel doesn't take focus when it opens, so what opened it still has focus here.
  // If focus is lost when the panel closes (it was inside it), it goes back there.
  useEffect(() => {
    if (!isOpen || !inline) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      requestAnimationFrame(() => {
        if (document.activeElement === document.body && opener?.isConnected) opener.focus()
      })
    }
  }, [isOpen, inline])

  if (!isOpen) return null
  const showing = docId ? 'doc' : draftId ? 'draft' : 'summary'
  const label = showing === 'doc' ? 'Document viewer' : showing === 'draft' ? 'Draft' : 'Summary'

  // A failure in what the panel shows stays in the panel, and clears when something else is opened in it.
  const content = (
    <PanelBoundary
      name={
        showing === 'doc' ? 'this document' : showing === 'draft' ? 'this draft' : 'this summary'
      }
      resetKey={docId ?? draftId ?? summaryId}
    >
      {showing === 'doc' ? (
        <DocumentViewer matterId={matterId} />
      ) : showing === 'draft' ? (
        <DraftPanel matterId={matterId} />
      ) : (
        <SummaryPanel matterId={matterId} />
      )}
    </PanelBoundary>
  )

  if (inline) {
    const drag = (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const start =
        panel.width ?? e.currentTarget.parentElement?.getBoundingClientRect().width ?? 600
      const move = (m: PointerEvent) => panel.set(start + (startX - m.clientX))
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    const nudge = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const now = panel.width ?? e.currentTarget.parentElement?.getBoundingClientRect().width ?? 600
      if (e.key === 'ArrowLeft') panel.set(now + 40)
      if (e.key === 'ArrowRight') panel.set(now - 40)
    }
    return (
      <aside
        aria-label={label}
        style={panel.width ? { width: panel.width } : undefined}
        className={cn(
          'relative flex min-h-0 min-w-[420px] animate-fade-in flex-col overflow-hidden border-l border-line bg-sidebar',
          // The conversation beside it always keeps at least 440 px.
          !panel.width &&
            (showing === 'draft'
              ? 'w-[min(760px,52vw,calc(100vw_-_var(--width-sidebar)_-_440px))]'
              : 'w-[min(600px,46vw,calc(100vw_-_var(--width-sidebar)_-_440px))]'),
        )}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          aria-valuemin={panel.min}
          aria-valuemax={panel.max()}
          aria-valuenow={panel.width ?? 600}
          tabIndex={0}
          onPointerDown={drag}
          onKeyDown={nudge}
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize outline-none hover:bg-primary/20 focus-visible:bg-primary/30"
        />
        {content}
      </aside>
    )
  }

  // A document opened from a summary or a draft closes back to it, as the panel's own close button does.
  const closeTop = showing === 'doc' ? close : showing === 'draft' ? closeDraft : closeSummary
  return (
    <Radix.Root open onOpenChange={(open) => !open && closeTop()}>
      <Radix.Portal>
        <Radix.Overlay className="fixed inset-0 z-40 animate-fade-in bg-fg/30" />
        <Radix.Content
          aria-describedby={undefined}
          onEscapeKeyDown={keepEscape}
          onOpenAutoFocus={(event) => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null
            // The panel itself takes focus rather than its first button (see SidebarDrawer).
            event.preventDefault()
            ;(event.target as HTMLElement | null)?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (returnFocus.current?.isConnected) returnFocus.current.focus()
          }}
          className={cn(
            'fixed inset-y-0 right-0 z-40 flex animate-slide-in-right flex-col overflow-hidden border-l border-line bg-sidebar shadow-overlay outline-none',
            showing === 'draft' ? 'w-[min(760px,100vw)]' : 'w-[min(600px,100vw)]',
          )}
        >
          <Radix.Title className="sr-only">{label}</Radix.Title>
          {content}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}
