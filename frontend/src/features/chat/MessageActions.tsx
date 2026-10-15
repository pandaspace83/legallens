import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSendFeedback } from '@/api/queries/chat'
import type { Citation, ID } from '@/api/types'
import { IconButton } from '@/components/ui/IconButton'
import { FeedbackDialog } from '@/features/chat/FeedbackDialog'
import { answerToPlainText } from '@/lib/citations'
import { cn } from '@/lib/cn'
import { errorText } from '@/lib/errors'

// Copy with citations, helpful / not helpful with a short form, and retry (FE-4.8, DEC-52).
interface MessageActionsProps {
  text: string
  citations: Citation[]
  messageId?: ID
  /** Asks the same question again; absent when the question isn't known. */
  onRetry?: () => void
}

export function MessageActions({ text, citations, messageId, onRetry }: MessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  const [form, setForm] = useState(false)
  const feedback = useSendFeedback()

  const copy = async () => {
    await navigator.clipboard.writeText(answerToPlainText(text, citations))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const helpful = () => {
    if (vote === 'up' || !messageId) return
    setVote('up')
    feedback.mutate(
      { messageId, kind: 'helpful' },
      {
        onSuccess: () =>
          toast('Marked as helpful', { description: 'Recorded in this matter’s audit trail.' }),
        onError: (e) => {
          setVote(null)
          toast.error(errorText(e))
        },
      },
    )
  }

  return (
    <div className="flex items-center gap-0.5">
      <IconButton label={copied ? 'Copied' : 'Copy with sources'} size="sm" onClick={copy}>
        {copied ? <Check className="text-success" /> : <Copy />}
      </IconButton>
      <IconButton
        label="Helpful"
        size="sm"
        onClick={helpful}
        disabled={!messageId}
        aria-pressed={vote === 'up'}
        className={cn(vote === 'up' && 'text-success')}
      >
        <ThumbsUp className={cn(vote === 'up' && 'fill-current')} />
      </IconButton>
      <IconButton
        label="Not helpful"
        size="sm"
        onClick={() => setForm(true)}
        disabled={!messageId}
        aria-pressed={vote === 'down'}
        className={cn(vote === 'down' && 'text-danger')}
      >
        <ThumbsDown className={cn(vote === 'down' && 'fill-current')} />
      </IconButton>
      {onRetry ? (
        <IconButton label="Ask again" size="sm" onClick={onRetry}>
          <RotateCcw />
        </IconButton>
      ) : null}
      {messageId ? (
        <FeedbackDialog messageId={messageId} open={form} onOpenChange={setForm} />
      ) : null}
    </div>
  )
}
