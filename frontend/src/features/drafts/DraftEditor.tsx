import type { Draft } from '@/api/types'
import { DraftSection } from '@/features/drafts/DraftSection'
import { reservationOfRights, type DraftToken, type TokenAction } from '@/lib/drafts'

// The draft as a page, in serif type (FE-7.2): a letter with its FRE 408 header, date, delivery line,
// addressee, Re line and signature; or a memo with its To / From / Date / Re block and headed sections.
// Every section can be edited by hand or refined with an instruction.
interface DraftEditorProps {
  draft: Draft
  signer: string
  clientName: string
  readOnly: boolean
  highlighted?: string
  onSave(sectionId: string, body: string, label: string): void
  onToken(sectionId: string, token: DraftToken, action: TokenAction): void
}

export function DraftEditor({
  draft,
  signer,
  clientName,
  readOnly,
  highlighted,
  onSave,
  onToken,
}: DraftEditorProps) {
  const letter = draft.type === 'response_letter'

  return (
    <div className="@container px-4 py-6 @[560px]:px-6">
      <article
        aria-label={letter ? 'Letter' : 'Memo'}
        className="mx-auto max-w-[700px] rounded-[6px] border border-line bg-surface px-7 py-10 font-serif text-[15px] leading-[1.75] text-fg shadow-[0_1px_2px_rgb(31_30_28/0.05),0_8px_28px_rgb(31_30_28/0.06)] @[600px]:px-14 @[600px]:py-12"
      >
        {letter ? (
          <header className="mb-5">
            {draft.safeguards.fre408 ? (
              <p className="mb-6 animate-fade-in font-sans text-[11.5px] font-bold tracking-[0.06em] text-fg uppercase">
                Confidential settlement communication · FRE 408 / Cal. Evid. Code § 1152
              </p>
            ) : null}
            <p>{draft.dateLine}</p>
            <p className="mt-4 text-[13.5px] text-fg-muted italic">By email and certified mail</p>
            {draft.addressee ? (
              <address className="mt-4 not-italic">
                {[draft.addressee.name, draft.addressee.firm, ...draft.addressee.address]
                  .filter(Boolean)
                  .map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
              </address>
            ) : null}
            <p className="mt-5 font-semibold">Re: {draft.title}</p>
            <p className="mt-5">Dear Counsel:</p>
          </header>
        ) : (
          <header className="mb-7 border-b border-line-strong pb-5">
            <h2 className="mb-4 text-[13px] font-bold tracking-[0.18em] uppercase">Memorandum</h2>
            <dl className="grid grid-cols-[64px_1fr] gap-y-1 text-[14.5px]">
              {[
                ['To', draft.memoHeader?.to],
                ['From', draft.memoHeader?.from],
                ['Date', draft.dateLine],
                ['Re', draft.memoHeader?.re],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-sans text-[12px] leading-[1.9] font-semibold tracking-[0.04em] text-fg-muted uppercase">
                    {k}
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 font-sans text-[11px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
              Privileged &amp; confidential · attorney work product
            </p>
          </header>
        )}

        <div className="space-y-4">
          {draft.sections.map((section) => (
            <DraftSection
              key={section.id}
              draftId={draft.id}
              section={section}
              citations={draft.citations}
              showHeading={!letter}
              readOnly={readOnly}
              highlighted={highlighted === section.id}
              onSave={(body, label) => onSave(section.id, body, label)}
              onToken={(token, action) => onToken(section.id, token, action)}
            />
          ))}
        </div>

        {letter ? (
          <footer className="mt-4">
            {draft.safeguards.reservationOfRights ? (
              <p className="mb-4 animate-fade-in">{reservationOfRights(clientName)}</p>
            ) : null}
            <p className="mt-6">Sincerely,</p>
            <p className="mt-10">{signer}</p>
            <p className="text-[13.5px] text-fg-muted">Counsel for {clientName}</p>
          </footer>
        ) : null}
      </article>
      <p className="mx-auto mt-3 max-w-[700px] text-center font-sans text-[11.5px] text-fg-subtle">
        Hover a section to edit it or refine it · {draft.modelLabel}
      </p>
    </div>
  )
}
