import { AlertOctagon, BookOpen, PenLine, Quote, UploadCloud } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import type { DraftToken, TokenAction } from '@/lib/drafts'
import { cn } from '@/lib/cn'
import { useUploadDialog } from '@/stores/ui'

// A highlighted [PLACEHOLDER], [CITE NEEDED], [RULE NEEDED] or [UNVERIFIED: …] token. Clicking it offers only
// the ways that kind may be resolved (FE-7.3, DEC-48): a fact is filled in, a missing authority is supplied
// by the lawyer, an untraceable authority is removed or vouched for. Nothing is filled in by the AI.
const STYLE: Record<DraftToken['kind'], string> = {
  placeholder: 'border-warning/40 bg-warning-tint text-warning',
  cite_needed: 'border-danger/30 bg-danger-tint text-danger',
  rule_needed: 'border-danger/30 bg-danger-tint text-danger',
  unverified: 'border-danger/40 bg-danger-tint text-danger line-through decoration-danger/60',
}

const TITLE: Record<DraftToken['kind'], string> = {
  placeholder: 'Missing fact',
  cite_needed: 'Citation needed',
  rule_needed: 'Rule needed',
  unverified: 'Unverified authority',
}

export function PlaceholderToken({
  token,
  onResolve,
  readOnly,
}: {
  token: DraftToken
  onResolve(action: TokenAction): void
  readOnly?: boolean
}) {
  const [value, setValue] = useState('')
  const showUpload = useUploadDialog((s) => s.show)
  const label =
    token.kind === 'placeholder'
      ? token.text
      : `${token.kind === 'unverified' ? 'UNVERIFIED' : token.kind === 'rule_needed' ? 'RULE NEEDED' : 'CITE NEEDED'}: ${token.text}`

  const submit = (e: FormEvent, type: 'fill' | 'source') => {
    e.preventDefault()
    if (value.trim()) onResolve({ type, value: value.trim() })
  }

  return (
    <Popover>
      <PopoverTrigger asChild disabled={readOnly}>
        <button
          type="button"
          aria-label={`${TITLE[token.kind]}: ${token.text}. Resolve`}
          className={cn(
            'mx-0.5 inline rounded-[4px] border px-1 py-px font-sans text-[0.78em] font-semibold tracking-[0.01em] transition-shadow hover:shadow-[0_0_0_3px_rgb(168_38_31/0.12)]',
            STYLE[token.kind],
          )}
        >
          [{label}]
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] font-sans" align="start">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          {token.kind === 'placeholder' ? (
            <PenLine className="size-4 text-warning" aria-hidden />
          ) : token.kind === 'unverified' ? (
            <AlertOctagon className="size-4 text-danger" aria-hidden />
          ) : token.kind === 'rule_needed' ? (
            <BookOpen className="size-4 text-danger" aria-hidden />
          ) : (
            <Quote className="size-4 text-danger" aria-hidden />
          )}
          {TITLE[token.kind]}
        </p>

        {token.kind === 'placeholder' ? (
          <form onSubmit={(e) => submit(e, 'fill')} className="mt-2">
            <p className="text-[12.5px] text-fg-muted">
              The documents don’t contain this fact. Fill it in from your own records.
            </p>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={token.text}
              placeholder={token.text.charAt(0) + token.text.slice(1).toLowerCase()}
              className="mt-3 h-9 w-full rounded-control border border-control px-3 text-[13.5px] text-fg outline-none focus:border-primary"
            />
            <div className="mt-3 flex justify-end">
              <Button type="submit" size="sm" variant="primary" disabled={!value.trim()}>
                Fill in
              </Button>
            </div>
          </form>
        ) : null}

        {token.kind === 'cite_needed' || token.kind === 'rule_needed' ? (
          <form onSubmit={(e) => submit(e, 'source')} className="mt-2">
            <p className="text-[12.5px] text-fg-muted">
              {token.kind === 'rule_needed'
                ? 'No uploaded authority states this rule, so LegalLens won’t state it. Upload the authority, or name the one you rely on.'
                : 'No passage in your documents supports this. Name the source you rely on; it is added to the citation checklist as yours.'}{' '}
              <span className="text-fg">{token.text}</span>
            </p>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Source you rely on"
              placeholder="e.g. SLA report, Aug 2026, p. 4"
              className="mt-3 h-9 w-full rounded-control border border-control px-3 text-[13.5px] text-fg outline-none focus:border-primary"
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              {token.kind === 'rule_needed' ? (
                <PopoverClose asChild>
                  <Button size="sm" variant="ghost" onClick={() => showUpload()}>
                    <UploadCloud /> Upload authority
                  </Button>
                </PopoverClose>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => onResolve({ type: 'drop_flag' })}>
                  Remove the flag
                </Button>
              )}
              <Button type="submit" size="sm" variant="primary" disabled={!value.trim()}>
                Add source
              </Button>
            </div>
          </form>
        ) : null}

        {token.kind === 'unverified' ? (
          <div className="mt-2">
            <p className="text-[12.5px] text-fg-muted">
              <span className="font-medium text-fg">{token.text}</span> doesn’t trace to any
              document in this matter. The model may have added it from memory, which LegalLens
              never allows.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={() => onResolve({ type: 'remove_sentence' })}
              >
                Remove the sentence that relies on it
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onResolve({ type: 'vouch' })}>
                I’ve verified it myself; keep it as my citation
              </Button>
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
