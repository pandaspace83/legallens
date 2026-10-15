import { AlertCircle, Lock } from 'lucide-react'
import { Dialog as Radix } from 'radix-ui'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useMe, useSignIn, useVerifyMfa } from '@/api/queries/auth'
import { Logo } from '@/components/common/Logo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { OtpInput } from '@/features/auth/OtpInput'
import { formatDuration, useSession } from '@/stores/session'
import { errorText } from '@/lib/errors'

// The lock screen (FE-3.2, DEC-54). It covers the whole page, so nothing from the matter stays visible, and asks
// for a full sign-in, password and then the code, because the backend's session has ended too. Signing in again
// returns the lawyer to exactly where they were.
export function LockScreen() {
  const navigate = useNavigate()
  const { data: me } = useMe()
  const reason = useSession((s) => s.reason)
  const timeout = useSession((s) => s.idleTimeoutMs)
  const unlock = useSession((s) => s.unlock)
  const signIn = useSignIn()
  const verify = useVerifyMfa()
  const [step, setStep] = useState<'password' | 'code'>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')

  const submitPassword = (e: FormEvent) => {
    e.preventDefault()
    if (!me) return
    signIn.mutate({ email: me.email, password }, { onSuccess: () => setStep('code') })
  }

  const submitCode = (value: string) => {
    setCode(value)
    if (value.length !== 6 || verify.isPending) return
    verify.mutate(value, { onSuccess: unlock, onError: () => setCode('') })
  }

  const error = step === 'password' ? signIn.error : verify.error

  return (
    <Radix.Root open modal>
      <Radix.Portal>
        <Radix.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-[70] flex animate-fade-in flex-col bg-app outline-none"
        >
          <div className="px-6 py-7 sm:px-12">
            <Logo />
          </div>
          <div className="flex flex-1 items-center justify-center px-6 pb-24">
            <div className="w-full max-w-[380px]">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint text-primary">
                <Lock className="size-5" aria-hidden />
              </span>
              <Radix.Title className="mt-5 font-serif text-[30px] leading-tight tracking-[-0.015em] text-fg">
                LegalLens is locked
              </Radix.Title>
              <Radix.Description className="mt-2 text-[14.5px] text-fg-muted">
                {reason === 'manual'
                  ? 'You locked it. Sign in again to continue where you left off.'
                  : `It locked after ${formatDuration(timeout)} without activity. Sign in again to continue where you left off.`}
              </Radix.Description>

              {error ? (
                <div
                  role="alert"
                  className="mt-6 flex items-start gap-2.5 rounded-control border border-danger/20 bg-danger-tint px-3.5 py-3 text-[13.5px] text-danger"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {errorText(error)}
                </div>
              ) : null}

              {step === 'password' ? (
                <form onSubmit={submitPassword} className="mt-7 space-y-5" noValidate>
                  <Input label="Email" type="email" value={me?.email ?? ''} readOnly />
                  <Input
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    loading={signIn.isPending}
                  >
                    Continue
                  </Button>
                </form>
              ) : (
                <div className="mt-7 space-y-5">
                  <p className="text-[13.5px] text-fg-muted">
                    Enter the 6-digit code from your authenticator app.
                  </p>
                  <OtpInput
                    value={code}
                    onChange={submitCode}
                    invalid={Boolean(verify.error)}
                    disabled={verify.isPending}
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    loading={verify.isPending}
                    disabled={code.length !== 6}
                    onClick={() => submitCode(code)}
                  >
                    Unlock
                  </Button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  unlock()
                  navigate('/login', { state: { signedOut: reason ?? 'manual' } })
                }}
                className="mt-6 text-[13px] font-medium text-link hover:underline"
              >
                Sign out instead
              </button>
            </div>
          </div>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}
