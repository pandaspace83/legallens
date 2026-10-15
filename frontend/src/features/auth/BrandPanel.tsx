import { Quote, ShieldCheck, UserCheck } from 'lucide-react'
import { COPY } from '@/lib/copy'

// The right half of the sign-in screens: the promise, shown with a real-looking cited answer.
export function BrandPanel() {
  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden bg-primary-deep text-white lg:flex lg:flex-col lg:justify-between lg:p-14"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(900px 520px at 85% -10%, rgb(47 111 179 / 0.45), transparent 60%), radial-gradient(700px 500px at -10% 110%, rgb(30 58 95 / 0.9), transparent 60%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse at 60% 40%, black 30%, transparent 75%)',
        }}
      />

      <div className="relative max-w-[480px]">
        <p className="text-[13px] font-medium tracking-[0.08em] text-white/60 uppercase">
          For lawyers who check their sources
        </p>
        <h2 className="mt-4 font-serif text-[40px] leading-[1.12] tracking-[-0.02em]">
          Answers you can verify.
          <br />
          Drafts you control.
        </h2>
        <p className="mt-4 max-w-[420px] text-[15px] leading-relaxed text-white/70">
          LegalLens reads your matter’s documents and cites every answer to the page and paragraph,
          on your own computer.
        </p>
      </div>

      <div className="relative mx-auto my-10 w-full max-w-[460px]">
        <div className="absolute inset-x-6 -bottom-3 h-full rounded-2xl bg-white/10" />
        <div className="relative rounded-2xl bg-surface p-5 text-fg shadow-[0_24px_60px_rgb(0_0_0/0.35)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-subtle">Smith v. Acme Corp</span>
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-tint px-2 text-[11px] font-medium text-success">
              <ShieldCheck className="size-3" /> {COPY.answerFound}
            </span>
          </div>
          <p className="mt-3 ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-hover px-3.5 py-2 text-[13.5px]">
            What notice do we need to terminate the MSA?
          </p>
          <p className="mt-4 font-serif text-[15px] leading-relaxed">
            Either party may end the Agreement for convenience on{' '}
            <strong className="font-semibold">sixty (60) days’ written notice</strong>
            <span className="mx-1 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-[5px] bg-primary px-1 align-middle font-sans text-[11px] font-semibold text-white">
              1
            </span>
            delivered by courier or certified mail.
          </p>
          <div className="mt-4 rounded-lg border border-line bg-app p-3">
            <p className="text-[11px] font-medium text-fg-subtle">
              Master Services Agreement v3 · p. 6 · ¶4.2(a)
            </p>
            <p className="mt-1.5 rounded-[3px] bg-highlight px-1.5 py-1 font-serif text-[13px] leading-relaxed">
              (a) Either party may terminate this Agreement for convenience upon sixty (60) days’
              prior written notice to the other party.
            </p>
          </div>
        </div>
      </div>

      <ul className="relative grid grid-cols-3 gap-6 text-[13px] text-white/75">
        <li className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-white" /> Runs locally. Nothing leaves
          this computer.
        </li>
        <li className="flex items-start gap-2.5">
          <Quote className="mt-0.5 size-4 shrink-0 text-white" /> Every answer cited to the page and
          paragraph.
        </li>
        <li className="flex items-start gap-2.5">
          <UserCheck className="mt-0.5 size-4 shrink-0 text-white" /> You review before anything is
          sent.
        </li>
      </ul>
    </aside>
  )
}
