import { AlertCircle, Eye, EyeOff, KeyRound, LogOut } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useSignIn } from '@/api/queries/auth'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { errorText } from '@/lib/errors'

// Sign in with email and password; MFA follows (FE-3.1, DEC-54).
export function LoginPage() {
  const navigate = useNavigate()
  const signedOut = (useLocation().state as { signedOut?: 'idle' | 'manual' } | null)?.signedOut
  const signIn = useSignIn()
  const [email, setEmail] = useState('shashank@pandalaw.local')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    signIn.mutate({ email, password }, { onSuccess: () => navigate('/login/mfa') })
  }

  return (
    <>
      <h1 className="font-serif text-[30px] leading-tight tracking-[-0.015em] text-fg">Sign in</h1>
      <p className="mt-2 text-[14.5px] text-fg-muted">
        Welcome back. Your matters are waiting on this computer.
      </p>

      {signedOut ? (
        <p
          role="status"
          className="mt-6 flex items-start gap-2.5 rounded-control border border-line bg-surface px-3.5 py-3 text-[13.5px] text-fg-muted"
        >
          <LogOut className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          {signedOut === 'idle'
            ? 'You were signed out after a period without activity. Your work is saved.'
            : 'You signed out. Your work is saved on this computer.'}
        </p>
      ) : null}
      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        {signIn.error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-control border border-danger/20 bg-danger-tint px-3.5 py-3 text-[13.5px] text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {errorText(signIn.error)}
          </div>
        ) : null}
        <Input
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={
            <IconButton
              label={show ? 'Hide password' : 'Show password'}
              onClick={() => setShow((s) => !s)}
            >
              {show ? <EyeOff /> : <Eye />}
            </IconButton>
          }
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

      <p className="mt-6 flex items-center gap-2 text-[12.5px] text-fg-subtle">
        <KeyRound className="size-3.5" aria-hidden /> Two-step verification protects every sign-in.
      </p>
      {import.meta.env.DEV ? (
        <p className="mt-8 rounded-control border border-dashed border-line-strong px-3 py-2 text-[12px] text-fg-subtle">
          Demo build: any password works; the verification code is{' '}
          <span className="font-semibold text-fg-muted">123456</span>.
        </p>
      ) : null}
    </>
  )
}
