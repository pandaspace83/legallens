import { Cpu, HardDrive, ShieldCheck, WifiOff } from 'lucide-react'
import { Link } from 'react-router'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'

// 'Runs locally' status with a short explainer of where data lives (FE-1.3, DEC-08, DEC-55).
export function LocalOnlyBadge() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface pr-3 pl-2.5 text-[13px] font-medium text-fg-muted shadow-raised transition-colors hover:border-line-strong hover:text-fg data-[state=open]:border-line-strong data-[state=open]:text-fg max-sm:px-3"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/40 [animation-duration:2.4s]" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <span className="max-sm:sr-only">Runs locally</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-tint text-success">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold text-fg">Nothing leaves this computer</p>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              Your documents, questions and drafts are processed and stored on this machine only.
            </p>
          </div>
        </div>
        <ul className="space-y-2.5 p-4 text-[13px] text-fg-muted">
          <li className="flex gap-2.5">
            <Cpu className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
            AI model running locally · no outside AI services
          </li>
          <li className="flex gap-2.5">
            <HardDrive className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
            Encrypted database and files on this computer
          </li>
          <li className="flex gap-2.5">
            <WifiOff className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
            No analytics or crash reports with your content
          </li>
        </ul>
        <div className="border-t border-line px-4 py-3">
          <Link to="/settings/data" className="text-[13px] font-medium text-link hover:underline">
            Where your data goes →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
