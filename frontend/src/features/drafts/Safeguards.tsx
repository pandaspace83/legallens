import { Scale, UserCheck, UserX } from 'lucide-react'
import type { Draft } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { Switch } from '@/components/ui/Switch'

// Professional-conduct safeguards for a letter (FE-7.6): who it is addressed to (ABA Model Rules 4.2 and 4.3),
// whether it is marked as a settlement communication (FRE 408), and a reservation of rights.
interface SafeguardsProps {
  draft: Draft
  readOnly: boolean
  onChange(safeguards: Partial<Draft['safeguards']>): void
}

const PROPOSES_TALKS = /\b(negotiat|resolve|settle|call)\w*/i

function Row({
  title,
  detail,
  control,
  icon,
}: {
  title: React.ReactNode
  detail: React.ReactNode
  control?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-fg">
          {title}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{detail}</p>
      </div>
      {control}
    </div>
  )
}

export function Safeguards({ draft, readOnly, onChange }: SafeguardsProps) {
  if (draft.type === 'memo') {
    return (
      <p className="rounded-card border border-line bg-surface px-4 py-3.5 text-[12.5px] text-fg-muted">
        An internal memo isn’t sent to the other side, so the addressee check, the FRE 408 header
        and the reservation of rights don’t apply. Its clean copy is still marked privileged.
      </p>
    )
  }

  const addressee = draft.addressee
  const suggested = draft.sections.some((s) => PROPOSES_TALKS.test(s.body))

  return (
    <div className="divide-y divide-line rounded-card border border-line bg-surface">
      {addressee?.represented ? (
        <Row
          icon={<UserCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />}
          title={
            <>
              Addressed to opposing counsel{' '}
              <Badge size="sm" tone="success">
                Rule 4.2
              </Badge>
            </>
          }
          detail={
            <>
              {addressee.name}
              {addressee.firm ? `, ${addressee.firm}` : ''}. The other side has a lawyer, so the
              letter goes to them and not to the party directly.
            </>
          }
        />
      ) : (
        <Row
          icon={<UserX className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
          title={
            <>
              No lawyer on record for the other side{' '}
              <Badge size="sm" tone="warning">
                Rule 4.3
              </Badge>
            </>
          }
          detail="Say whom you represent, don’t imply you’re disinterested, and don’t give them legal advice beyond suggesting they get a lawyer."
        />
      )}
      <Row
        icon={<Scale className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />}
        title={
          <>
            Mark as a settlement communication
            {suggested && !draft.safeguards.fre408 ? (
              <Badge size="sm" tone="info">
                Suggested
              </Badge>
            ) : null}
          </>
        }
        detail={
          suggested
            ? 'The letter proposes talks to resolve the dispute. The header asks that it not be used as evidence of liability (FRE 408, Cal. Evid. Code § 1152). You decide; it isn’t added for you.'
            : 'Adds a header asking that the letter not be used as evidence of liability (FRE 408, Cal. Evid. Code § 1152).'
        }
        control={
          <Switch
            label="FRE 408 header"
            checked={draft.safeguards.fre408}
            disabled={readOnly}
            onCheckedChange={(fre408) => onChange({ fre408 })}
            className="mt-0.5"
          />
        }
      />
      <Row
        title="Reserve your client’s rights"
        detail="Adds a closing sentence that nothing in the letter waives any right or remedy."
        icon={<span className="size-4 shrink-0" aria-hidden />}
        control={
          <Switch
            label="Reservation of rights"
            checked={draft.safeguards.reservationOfRights}
            disabled={readOnly}
            onCheckedChange={(reservationOfRights) => onChange({ reservationOfRights })}
            className="mt-0.5"
          />
        }
      />
    </div>
  )
}
