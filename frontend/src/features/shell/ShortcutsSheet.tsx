import { useEffect } from 'react'
import { Dialog, DialogBody, DialogContent } from '@/components/ui/Dialog'
import { Kbd } from '@/components/ui/Kbd'
import { SHORTCUT_GROUPS } from '@/lib/shortcuts'
import { useShortcutsSheet } from '@/stores/ui'

// Every keyboard shortcut, opened with "?" anywhere outside a text field (FE-3.7).
function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return Boolean(el?.closest('input, textarea, select, [contenteditable="true"]'))
}

export function ShortcutList() {
  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h3 className="mb-2 text-[11.5px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
            {group.title}
          </h3>
          <dl className="space-y-1.5">
            {group.items.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4 text-[13.5px]"
              >
                <dt className="text-fg-muted">{item.label}</dt>
                <dd className="flex shrink-0 gap-1">
                  {item.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

export function ShortcutsSheet() {
  const open = useShortcutsSheet((s) => s.open)
  const setOpen = useShortcutsSheet((s) => s.setOpen)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="lg"
        title="Keyboard shortcuts"
        description="Work without leaving the keyboard."
      >
        <DialogBody>
          <ShortcutList />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
