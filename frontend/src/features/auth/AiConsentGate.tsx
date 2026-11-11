import { AlertCircle, ShieldCheck } from 'lucide-react'
import { Dialog as Radix } from 'radix-ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAcceptAiConsent, useMe, useSignOut } from '@/api/queries/auth'
import { Logo } from '@/components/common/Logo'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { errorText } from '@/lib/errors'

// Asked once per account, before anything is sent to the AI company (AS-3.5, App Store guideline 5.1.2). It covers
// the whole page, cannot be dismissed, and appears only while Claude is the provider and this lawyer has not agreed.
// Declining signs out: nothing has been sent, and the server refuses the calls that would send text.
const SENT = [
  'The questions you ask, and the passages of your documents that LegalLens picks to answer them.',
  'For a summary or a draft, the text of the document being worked on.',
  'Under its commercial terms, Anthropic does not train its models on this text and deletes it within 30 days. Text its safety systems flag may be kept for up to 2 years.',
]

// Checked against Anthropic's privacy articles and Commercial Terms on 2026-11-07. Change this wording (and bump
// CURRENT_VERSION in services/ai_consent.py) if a zero-data-retention agreement is approved.
const KEPT = [
  'Your uploaded files, the database and the search index stay in LegalLens’s own storage. Files are not uploaded to Anthropic.',
  'LegalLens does not use your text to train any model, and has no analytics, advertising or tracking.',
]

export function AiConsentGate() {
  const navigate = useNavigate()
  const { data: me } = useMe()
  const accept = useAcceptAiConsent()
  const signOut = useSignOut()
  const [agreed, setAgreed] = useState(false)

  return (
    <Radix.Root open modal>
      <Radix.Portal>
        <Radix.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-[60] flex animate-fade-in flex-col overflow-y-auto bg-app pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none"
        >
          <div className="px-6 py-7 sm:px-12">
            <Logo />
          </div>
          <div className="flex flex-1 justify-center px-6 pb-16">
            <div className="w-full max-w-[560px]">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint text-primary">
                <ShieldCheck className="size-5" aria-hidden />
              </span>
              <Radix.Title className="mt-5 font-serif text-[30px] leading-tight tracking-[-0.015em] text-fg">
                Where your data goes
              </Radix.Title>
              <Radix.Description className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">
                LegalLens is set to use Claude, an AI service from Anthropic. Before you continue,
                read what is sent to it and agree.
              </Radix.Description>

              <section className="mt-7">
                <h2 className="text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                  Sent to Anthropic
                </h2>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-fg">
                  {SENT.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>

              <section className="mt-6">
                <h2 className="text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                  What stays with LegalLens
                </h2>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-fg">
                  {KEPT.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>

              {accept.error ? (
                <div
                  role="alert"
                  className="mt-6 flex items-start gap-2.5 rounded-control border border-danger/20 bg-danger-tint px-3.5 py-3 text-[13.5px] text-danger"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {errorText(accept.error)}
                </div>
              ) : null}

              <label className="mt-7 flex cursor-pointer items-start gap-3 text-[14px] text-fg">
                <Checkbox
                  checked={agreed}
                  onCheckedChange={setAgreed}
                  label="I understand and agree"
                  className="mt-0.5"
                />
                <span>
                  I understand that my questions and document text are sent to Anthropic, and I
                  agree.
                </span>
              </label>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!agreed || !me?.aiConsentVersion}
                  loading={accept.isPending}
                  onClick={() => me?.aiConsentVersion && accept.mutate(me.aiConsentVersion)}
                >
                  Agree and continue
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    navigate('/login', { state: { signedOut: 'manual' } })
                    void signOut()
                  }}
                >
                  Sign out
                </Button>
              </div>
              <p className="mt-3 text-[13px] text-fg-subtle">
                If you do not agree, nothing is sent. You can sign out.
              </p>
            </div>
          </div>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}
