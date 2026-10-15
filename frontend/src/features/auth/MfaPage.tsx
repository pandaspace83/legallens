import { AlertCircle, ArrowLeft, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApi } from '@/api/ApiProvider'
import { useVerifyMfa } from '@/api/queries/auth'
import { Button } from '@/components/ui/Button'
import { OtpInput } from '@/features/auth/OtpInput'
import { errorText } from '@/lib/errors'

// Enter the 6-digit code from the authenticator app; submits on the sixth digit (FE-3.1, DEC-54).
export function MfaPage() {
  const navigate = useNavigate()
  const api = useApi()
  const verify = useVerifyMfa()
  const [code, setCode] = useState('')

  const submit = (value = code) => {
    if (value.length !== 6 || verify.isPending) return
    verify.mutate(value, {
      onSuccess: () => navigate(api.kind === 'http' ? '/matters' : '/m/smith'),
      onError: () => setCode(''),
    })
  }

  const onChange = (value: string) => {
    setCode(value)
    if (value.length === 6) submit(value)
  }

  return (
    <>
      <span className="flex size-11 items-center justify-center rounded-full bg-primary-tint text-primary">
        <Smartphone className="size-5" aria-hidden />
      </span>
      <h1 className="mt-5 font-serif text-[30px] leading-tight tracking-[-0.015em] text-fg">
        Check your authenticator
      </h1>
      <p className="mt-2 text-[14.5px] text-fg-muted">
        Enter the 6-digit code for LegalLens from your authenticator app.
      </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {verify.error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-control border border-danger/20 bg-danger-tint px-3.5 py-3 text-[13.5px] text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {errorText(verify.error)}
          </div>
        ) : null}
        <OtpInput
          value={code}
          onChange={onChange}
          invalid={Boolean(verify.error)}
          disabled={verify.isPending}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={verify.isPending}
          disabled={code.length !== 6}
        >
          Verify and continue
        </Button>
      </form>

      <Link
        to="/login"
        className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Use a different account
      </Link>
    </>
  )
}
