import { PenLine, Sparkles } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { Citation, DraftSection as Section, ID } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { DraftBody } from '@/features/drafts/DraftBody'
import { RefineSection } from '@/features/drafts/RefineSection'
import type { DraftToken, TokenAction } from '@/lib/drafts'
import { cn } from '@/lib/cn'
import { useEngineReady } from '@/features/shell/useSystemStatus'

// One section of the draft: read, edit by hand, or refine with an instruction (FE-7.2, FE-7.4).
// The section's name appears in the tooltips and as a heading in memos; letters export without it.
interface DraftSectionProps {
  draftId: ID
  section: Section
  citations: Citation[]
  showHeading: boolean
  readOnly: boolean
  highlighted: boolean
  onSave(body: string, label: string): void
  onToken(token: DraftToken, action: TokenAction): void
}

export function DraftSection({
  draftId,
  section,
  citations,
  showHeading,
  readOnly,
  highlighted,
  onSave,
  onToken,
}: DraftSectionProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'refine'>('view')
  const [text, setText] = useState(section.body)
  const area = useRef<HTMLTextAreaElement>(null)
  const engineReady = useEngineReady()

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text, mode])

  return (
    <section
      id={`section-${section.id}`}
      aria-label={section.label}
      className={cn(
        'group/section relative -mx-4 rounded-md border-l-2 px-4 py-1 transition-colors',
        highlighted
          ? 'animate-flash border-primary bg-primary-tint/40'
          : mode !== 'view'
            ? 'border-primary/50'
            : 'border-transparent hover:border-line-strong',
      )}
    >
      {showHeading ? (
        <h3 className="mb-1.5 font-sans text-[12px] font-semibold tracking-[0.05em] text-fg-muted uppercase">
          {section.label}
        </h3>
      ) : null}

      {mode === 'edit' ? (
        <div className="font-sans">
          <textarea
            ref={area}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={`Edit ${section.label}`}
            className="block w-full resize-none rounded-control border border-control bg-surface px-3 py-2 font-serif text-[15px] leading-[1.75] text-fg outline-none focus:border-primary"
          />
          <p className="mt-1.5 text-[11.5px] text-fg-subtle">
            Keep tokens such as [CITE NEEDED: …] until you resolve them; [n] marks a source
            citation.
          </p>
          <div className="mt-2 flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(section.body)
                setMode('view')
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={text.trim() === section.body.trim()}
              onClick={() => {
                onSave(text.trim(), `You edited “${section.label}”`)
                setMode('view')
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <DraftBody
          body={section.body}
          citations={citations}
          onToken={onToken}
          readOnly={readOnly}
        />
      )}

      {mode === 'refine' ? (
        <RefineSection
          draftId={draftId}
          section={section}
          onCancel={() => setMode('view')}
          onAccept={(body, instruction) => {
            onSave(body, `Refined “${section.label}”: ${instruction}`)
            setMode('view')
          }}
        />
      ) : null}

      {!readOnly && mode === 'view' ? (
        <div className="absolute -top-3 right-2 z-10 flex gap-0.5 rounded-control border border-line bg-surface p-0.5 font-sans opacity-0 shadow-raised transition-opacity group-hover/section:opacity-100 focus-within:opacity-100 @[600px]:top-0 @[600px]:-right-12 @[600px]:flex-col">
          <IconButton
            size="sm"
            label={`Edit “${section.label}”`}
            tooltipSide="right"
            onClick={() => {
              setText(section.body)
              setMode('edit')
            }}
          >
            <PenLine />
          </IconButton>
          <IconButton
            size="sm"
            label={`Refine “${section.label}”`}
            tooltipSide="right"
            className="text-primary"
            disabled={!engineReady}
            onClick={() => setMode('refine')}
          >
            <Sparkles />
          </IconButton>
        </div>
      ) : null}
    </section>
  )
}
