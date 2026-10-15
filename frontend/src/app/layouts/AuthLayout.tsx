import { Lock } from 'lucide-react'
import { Outlet } from 'react-router'
import { Logo } from '@/components/common/Logo'
import { BrandPanel } from '@/features/auth/BrandPanel'
import { ApiStatus } from '@/features/dev/ApiStatus'
import { COPY } from '@/lib/copy'

// Split layout for sign-in and MFA: the form on the left, the product promise on the right (FE-3.1).
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh bg-app lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <main className="flex flex-col px-6 py-7 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[380px] animate-rise-in">
            <Outlet />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-[12.5px] text-fg-subtle">
            <Lock className="size-3.5" aria-hidden /> {COPY.localOnly}
          </p>
          {import.meta.env.DEV ? <ApiStatus /> : null}
        </div>
      </main>
      <BrandPanel />
    </div>
  )
}
