import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useCreateMatter, useUpdateMatter } from '@/api/queries/matters'
import type { AiConsent, Matter, MatterInput } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { errorText } from '@/lib/errors'

// Three steps: the basics, the other side and its counsel, then the court and the client's AI-consent record
// (DEC-30, DEC-60). The same dialog edits an existing matter when `matter` is given.
interface Form {
  name: string
  clientName: string
  ourSide: string
  practiceArea: string
  opposingParty: string
  counselName: string
  counselFirm: string
  court: string
  consent: AiConsent
}

const NO_CONSENT: AiConsent = {
  status: 'not_recorded',
  toldTool: false,
  toldData: false,
  toldRisks: false,
}

const fromMatter = (m?: Matter): Form => ({
  name: m?.name ?? '',
  clientName: m?.clientName ?? '',
  ourSide: m?.ourSide ?? '',
  practiceArea: m?.practiceArea ?? '',
  opposingParty: m?.opposingParty ?? '',
  counselName: m?.opposingCounsel?.name ?? '',
  counselFirm: m?.opposingCounsel?.firm ?? '',
  court: m?.court ?? '',
  consent: m?.aiConsent ?? NO_CONSENT,
})

const toInput = (f: Form): MatterInput => ({
  name: f.name.trim(),
  clientName: f.clientName.trim(),
  ourSide: f.ourSide.trim(),
  practiceArea: f.practiceArea.trim(),
  opposingParty: f.opposingParty.trim(),
  opposingCounsel: f.counselName.trim()
    ? { name: f.counselName.trim(), firm: f.counselFirm.trim() }
    : null,
  court: f.court.trim(),
  aiConsent: f.consent,
})

const STEPS = ['The matter', 'The other side', 'Court and AI consent'] as const

export function NewMatterDialog({
  open,
  onOpenChange,
  matter,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  matter?: Matter
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <Flow matter={matter} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  )
}

// Mounted fresh each time the dialog opens, so it always starts from the matter's current details.
function Flow({ matter, onClose }: { matter?: Matter; onClose(): void }) {
  const navigate = useNavigate()
  const create = useCreateMatter()
  const update = useUpdateMatter(matter?.id ?? '')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => fromMatter(matter))
  const [touched, setTouched] = useState(false)
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const setConsent = (patch: Partial<AiConsent>) => set('consent', { ...form.consent, ...patch })

  const basicsOk = Boolean(form.name.trim() && form.clientName.trim() && form.ourSide.trim())
  const last = step === STEPS.length - 1
  const saving = create.isPending || update.isPending
  const error = create.error ?? update.error

  const save = () => {
    const input = toInput(form)
    if (matter) {
      update.mutate(input, {
        onSuccess: () => {
          toast.success('Matter details saved')
          onClose()
        },
      })
    } else {
      create.mutate(input, {
        onSuccess: (created) => {
          toast.success(`${created.name} was created`)
          onClose()
          navigate(`/m/${created.id}`)
        },
      })
    }
  }

  const next = () => {
    if (step === 0 && !basicsOk) return setTouched(true)
    if (last) return save()
    setStep(step + 1)
  }
  const missing = (value: string) => (touched && !value.trim() ? 'Required' : undefined)

  return (
    <DialogContent
      size="md"
      title={matter ? 'Edit matter details' : 'New matter'}
      description={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
    >
      <DialogBody className="space-y-4">
        {step === 0 ? (
          <>
            <Input
              label="Matter name"
              placeholder="Smith v. Acme Corp"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              error={missing(form.name)}
              autoFocus
            />
            <Input
              label="Our client"
              value={form.clientName}
              onChange={(e) => set('clientName', e.target.value)}
              error={missing(form.clientName)}
            />
            <Input
              label="Our side"
              placeholder="Defendant, plaintiff, buyer…"
              value={form.ourSide}
              onChange={(e) => set('ourSide', e.target.value)}
              error={missing(form.ourSide)}
            />
            <Input
              label="Practice area"
              placeholder="Commercial contract dispute"
              value={form.practiceArea}
              onChange={(e) => set('practiceArea', e.target.value)}
            />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Input
              label="Other side"
              hint="The opposing party."
              value={form.opposingParty}
              onChange={(e) => set('opposingParty', e.target.value)}
              autoFocus
            />
            <Input
              label="Their counsel"
              hint="Leave empty if they aren’t represented."
              value={form.counselName}
              onChange={(e) => set('counselName', e.target.value)}
            />
            <Input
              label="Their firm"
              value={form.counselFirm}
              onChange={(e) => set('counselFirm', e.target.value)}
              disabled={!form.counselName.trim()}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Input
              label="Court"
              placeholder="N.D. Cal., San Francisco Division"
              value={form.court}
              onChange={(e) => set('court', e.target.value)}
              autoFocus
            />
            <fieldset className="space-y-3 rounded-card border border-line bg-app p-4">
              <legend className="px-1 text-[12px] font-semibold tracking-[0.04em] text-fg-subtle uppercase">
                Client’s AI consent
              </legend>
              <p className="text-[12.5px] text-fg-muted">
                Record whether the client agreed to AI use on their matter, and what they were told.
                A boilerplate engagement-letter clause isn’t informed consent.
              </p>
              <Segmented
                label="Consent status"
                value={form.consent.status}
                onChange={(status) => setConsent({ status })}
                options={[
                  { value: 'not_recorded', label: 'Not recorded' },
                  { value: 'given', label: 'Given' },
                  { value: 'declined', label: 'Declined' },
                ]}
              />
              {(
                [
                  ['toldTool', 'Told which tool is used'],
                  ['toldData', 'Told what data it sees'],
                  ['toldRisks', 'Told the risks'],
                ] as const
              ).map(([key, text]) => (
                <label key={key} className="flex cursor-pointer items-center gap-3 text-[13.5px]">
                  <Checkbox
                    checked={form.consent[key]}
                    onCheckedChange={(on) => setConsent({ [key]: on })}
                    label={text}
                  />
                  <span aria-hidden>{text}</span>
                </label>
              ))}
            </fieldset>
          </>
        ) : null}

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {errorText(error)}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        {step === 0 ? (
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
        ) : (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        <Button variant="primary" loading={saving} onClick={next}>
          {last ? (matter ? 'Save details' : 'Create matter') : 'Next'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
