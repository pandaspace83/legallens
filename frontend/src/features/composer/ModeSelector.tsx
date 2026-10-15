import { Check, ChevronDown, FileText, MessageSquareText, PenLine, Sparkles } from 'lucide-react'
import type { ID, Mode } from '@/api/types'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/DropdownMenu'
import { useComposer, useMatterMode } from '@/stores/composer'

// Auto, Ask, Summarize or Draft. Auto lets the intent router decide (FE-4.4).
const MODES: { id: Mode; label: string; hint: string; Icon: typeof Sparkles }[] = [
  { id: 'auto', label: 'Auto', hint: 'LegalLens picks the right task', Icon: Sparkles },
  {
    id: 'ask',
    label: 'Ask',
    hint: 'Answer from your documents, with citations',
    Icon: MessageSquareText,
  },
  {
    id: 'summarize',
    label: 'Summarize',
    hint: 'A structured summary of one document',
    Icon: FileText,
  },
  { id: 'draft', label: 'Draft', hint: 'A response letter or memo for your review', Icon: PenLine },
]

export function ModeSelector({ matterId }: { matterId: ID }) {
  const mode = useMatterMode(matterId)
  const setMode = useComposer((s) => s.setMode)
  const current = MODES.find((m) => m.id === mode) ?? MODES[0]!

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[12.5px] font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg data-[state=open]:bg-hover"
        >
          <current.Icon className="size-3.5" aria-hidden />
          {current.label}
          <ChevronDown className="size-3.5 text-fg-subtle" aria-hidden />
        </button>
      </MenuTrigger>
      <MenuContent side="top" className="w-[300px]">
        {MODES.map(({ id, label, hint, Icon }) => (
          <MenuItem
            key={id}
            onSelect={() => setMode(matterId, id)}
            icon={<Icon />}
            hint={
              id === mode ? <Check className="size-4 text-primary" aria-label="Selected" /> : null
            }
            className="py-2"
          >
            <span className="block font-medium">{label}</span>
            <span className="block text-xs text-fg-subtle">{hint}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}
