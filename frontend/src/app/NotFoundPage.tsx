import { Link } from 'react-router'
import { Logo } from '@/components/common/Logo'
import { buttonVariants } from '@/components/ui/buttonVariants'

// The 404 page: what happened and a way back to your matters (FE-8.4).
export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-app px-6 py-7 sm:px-12">
      <Logo />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
          Error 404
        </p>
        <h1 className="mt-3 font-serif text-[34px] leading-tight text-fg">
          This page doesn’t exist
        </h1>
        <p className="mt-2 max-w-[420px] text-fg-muted">
          The link may be old, or the matter or chat may have been deleted.
        </p>
        <Link
          to="/matters"
          className={buttonVariants({ variant: 'primary', size: 'lg', className: 'mt-8' })}
        >
          Back to your matters
        </Link>
      </div>
    </main>
  )
}
