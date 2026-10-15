import { ArrowUp, Lock, Paperclip, Square } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useMatter } from '@/api/queries/matters'
import type { ID } from '@/api/types'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ModeSelector } from '@/features/composer/ModeSelector'
import { ScopeSelector } from '@/features/composer/ScopeSelector'
import { ENGINE_PAUSED, useEngineReady } from '@/features/shell/useSystemStatus'
import { useAsk } from '@/features/composer/useAsk'
import { DraftChoicePill } from '@/features/drafts/DraftChoicePill'
import { SummaryChoicePill } from '@/features/summaries/SummaryChoicePill'
import { cn } from '@/lib/cn'
import { COPY } from '@/lib/copy'
import { useMatterMode } from '@/stores/composer'
import { useLiveAnswer, useRuns } from '@/stores/runs'
import { useUploadDialog } from '@/stores/ui'

// The prompt bar: auto-grow input, Enter to send, Shift+Enter for a new line, Stop while answering (FE-4.2).
interface ComposerProps {
  matterId: ID
  conversationId?: ID
  variant?: 'hero' | 'docked'
  autoFocus?: boolean
}

export function Composer({
  matterId,
  conversationId,
  variant = 'docked',
  autoFocus,
}: ComposerProps) {
  const [text, setText] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const { data: matter } = useMatter(matterId)
  const { ask, sending } = useAsk(matterId, conversationId)
  const live = useLiveAnswer(conversationId)
  const stop = useRuns((s) => s.stop)
  const showUpload = useUploadDialog((s) => s.show)
  const mode = useMatterMode(matterId)
  const engineReady = useEngineReady()

  const answering = Boolean(live && !live.finished)
  const closed = matter?.status === 'closed'
  const canSend = text.trim().length > 0 && !answering && !sending && !closed && engineReady

  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [text])

  useEffect(() => {
    if (autoFocus && !closed) input.current?.focus()
  }, [autoFocus, closed, conversationId])

  const submit = () => {
    if (!canSend) return
    ask(text)
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  if (closed) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[20px] border border-line bg-surface/70 px-5 py-4 text-[13.5px] text-fg-muted">
        <Lock className="size-4 text-fg-subtle" aria-hidden />
        This matter is closed. Its chats and documents are read-only.
      </div>
    )
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          showUpload([...e.dataTransfer.files])
        }}
        className={cn(
          'rounded-[22px] border border-line bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-control',
          variant === 'hero'
            ? 'shadow-[0_6px_24px_rgb(31_30_28/0.08),0_1px_3px_rgb(31_30_28/0.05)]'
            : 'shadow-[0_2px_12px_rgb(31_30_28/0.07)]',
        )}
      >
        <label htmlFor={`composer-${conversationId ?? 'new'}`} className="sr-only">
          Ask about {matter?.name ?? 'this matter'}
        </label>
        <textarea
          id={`composer-${conversationId ?? 'new'}`}
          ref={input}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            conversationId
              ? 'Ask a follow-up…'
              : `Ask anything about ${matter?.name ?? 'this matter'}…`
          }
          className={cn(
            'block w-full resize-none bg-transparent px-5 pt-4 pb-1 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle',
            variant === 'hero' && 'min-h-[60px]',
          )}
        />
        <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-3">
          <IconButton label="Attach documents" onClick={() => showUpload()}>
            <Paperclip />
          </IconButton>
          <ScopeSelector matterId={matterId} />
          <ModeSelector matterId={matterId} />
          {mode === 'summarize' ? <SummaryChoicePill matterId={matterId} /> : null}
          {mode === 'draft' ? <DraftChoicePill matterId={matterId} /> : null}
          <div className="flex-1" />
          {answering && conversationId ? (
            <Tooltip label="Stop answering" side="top">
              <button
                type="button"
                onClick={() => stop(conversationId)}
                aria-label="Stop answering"
                className="flex size-9 items-center justify-center rounded-full bg-fg text-white transition-transform hover:scale-105"
              >
                <Square className="size-3 fill-current" />
              </button>
            </Tooltip>
          ) : (
            <Tooltip
              label={engineReady ? 'Send' : ENGINE_PAUSED}
              shortcut={engineReady ? '↵' : undefined}
              side="top"
            >
              <button
                type="submit"
                aria-label="Send"
                disabled={!canSend}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-raised transition-[background-color,transform] hover:bg-primary-hover active:scale-95 disabled:bg-line disabled:text-fg-subtle disabled:shadow-none"
              >
                <ArrowUp className="size-[18px]" strokeWidth={2.25} />
              </button>
            </Tooltip>
          )}
        </div>
      </form>
      {engineReady ? (
        <p className="mt-2.5 text-center text-[11.5px] text-fg-subtle">{COPY.disclaimer}</p>
      ) : (
        <p className="mt-2.5 text-center text-[12px] text-danger" role="status">
          New questions are paused until the local AI engine is back. Your text stays here.
        </p>
      )}
    </div>
  )
}
