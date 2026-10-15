import { Command } from 'cmdk'
import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useMe, useUpdateLicensingStates } from '@/api/queries/auth'
import { Button } from '@/components/ui/Button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { errorText } from '@/lib/errors'
import { US_STATES } from '@/lib/usStates'
import { useSettings } from '@/stores/settings'

// The states the lawyer is licensed in (DEC-29). Ethics rules on AI use, client consent and reviewing metadata
// differ by state, so LegalLens uses this for reminders and defaults.
const name = (code: string) => US_STATES.find((s) => s.code === code)?.name ?? code

export function LicensingStates() {
  const { data: me } = useMe()
  const save = useUpdateLicensingStates()
  const legacy = useSettings((s) => s.licensingStates)
  const clearLegacy = useSettings((s) => s.clearLegacyLicensingStates)
  const selected = me?.licensingStates ?? []
  const [open, setOpen] = useState(false)

  // States an older version kept in this browser move to the server once, when it has none of its own.
  useEffect(() => {
    if (!me) return
    if (legacy.length && !me.licensingStates.length) save.mutate(legacy)
    if (legacy.length) clearLegacy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  const toggle = (code: string) =>
    save.mutate(
      selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code],
      { onError: (e) => toast.error(errorText(e)) },
    )

  return (
    <div>
      <ul className="flex flex-wrap gap-2" aria-label="Your licensing states">
        {selected.map((code) => (
          <li
            key={code}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface pr-1 pl-3 text-[13px] font-medium text-fg shadow-raised"
          >
            {name(code)}
            <button
              type="button"
              aria-label={`Remove ${name(code)}`}
              onClick={() => toggle(code)}
              className="flex size-6 items-center justify-center rounded-full text-fg-subtle hover:bg-hover hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        <li>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary" className="rounded-full">
                <Plus /> Add a state
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[280px] p-0">
              <Command label="Licensing states">
                <Command.Input
                  autoFocus
                  placeholder="Search states"
                  className="h-10 w-full border-b border-line bg-transparent px-3 text-[13.5px] text-fg outline-none placeholder:text-fg-subtle"
                />
                <Command.List className="max-h-[260px] overflow-y-auto p-1">
                  <Command.Empty className="px-3 py-4 text-center text-[13px] text-fg-subtle">
                    No state by that name
                  </Command.Empty>
                  {US_STATES.map((s) => (
                    <Command.Item
                      key={s.code}
                      value={`${s.name} ${s.code}`}
                      onSelect={() => toggle(s.code)}
                      className="flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 text-[13.5px] text-fg data-[selected=true]:bg-hover"
                    >
                      <span className="flex size-4 items-center justify-center text-primary">
                        {selected.includes(s.code) ? (
                          <Check className="size-3.5" aria-hidden />
                        ) : null}
                      </span>
                      {s.name}
                      <span className="ml-auto text-[11.5px] text-fg-subtle">{s.code}</span>
                    </Command.Item>
                  ))}
                </Command.List>
              </Command>
            </PopoverContent>
          </Popover>
        </li>
      </ul>
      {selected.length === 0 ? (
        <p className="mt-3 text-[13px] text-warning">
          Add at least one state, so reminders about AI use and client consent follow your state’s
          rules.
        </p>
      ) : null}
    </div>
  )
}
