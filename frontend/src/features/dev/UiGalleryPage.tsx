import { Download, Plus, Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Kbd } from '@/components/ui/Kbd'
import { Progress } from '@/components/ui/Progress'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { Textarea } from '@/components/ui/Textarea'
import { Tooltip } from '@/components/ui/Tooltip'

// Every design-system component in every state, for development only (FE-1.4). Open /dev/ui.
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="mb-4 text-[12px] font-semibold tracking-[0.05em] text-fg-subtle uppercase">
        {title}
      </h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  )
}

export function UiGalleryPage() {
  const [checked, setChecked] = useState(true)
  const [on, setOn] = useState(true)
  const [seg, setSeg] = useState<'client' | 'other_party'>('client')
  const [text, setText] = useState('')
  const [pick, setPick] = useState('detailed')

  return (
    <div className="mx-auto max-w-[920px] space-y-5 p-6">
      <header>
        <h1 className="font-serif text-[26px] text-fg">UI components</h1>
        <p className="text-[13.5px] text-fg-muted">
          Development only. Each component in each state.
        </p>
      </header>

      <Group title="Button: variants">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </Group>
      <Group title="Button: sizes, icon, loading, disabled">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
        <Button>
          <Plus /> With icon
        </Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
      </Group>
      <Group title="Icon button and tooltip">
        <IconButton label="Search" shortcut="⌘K">
          <Search />
        </IconButton>
        <IconButton label="Download" size="sm">
          <Download />
        </IconButton>
        <IconButton label="Disabled" disabled>
          <Plus />
        </IconButton>
        <Tooltip label="A tooltip" shortcut="⌘F">
          <Button variant="secondary">Hover me</Button>
        </Tooltip>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </Group>
      <Group title="Badge: tones and sizes">
        {(['neutral', 'primary', 'success', 'warning', 'danger', 'info'] as const).map((t) => (
          <Badge key={t} tone={t}>
            {t}
          </Badge>
        ))}
        <Badge size="sm">small</Badge>
      </Group>
      <Group title="Input, textarea, select">
        <div className="w-[260px]">
          <Input label="Normal" placeholder="Matter name" />
        </div>
        <div className="w-[260px]">
          <Input label="With hint" hint="Shown to you only" />
        </div>
        <div className="w-[260px]">
          <Input label="With error" error="Enter a name" />
        </div>
        <div className="w-[260px]">
          <Textarea
            aria-label="Grows with its text"
            placeholder="Type several lines…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="w-[260px]">
          <Select
            label="Audience"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            options={[
              { value: 'one_paragraph', label: 'One paragraph' },
              { value: 'detailed', label: 'Detailed' },
              { value: 'plain_english', label: 'Plain English' },
            ]}
          />
        </div>
      </Group>
      <Group title="Checkbox, switch, segmented">
        <Checkbox checked={checked} onCheckedChange={setChecked} label="Checked" />
        <Checkbox checked={false} onCheckedChange={() => {}} label="Unchecked" />
        <Checkbox checked="indeterminate" onCheckedChange={() => {}} label="Some" />
        <Checkbox checked disabled onCheckedChange={() => {}} label="Disabled" />
        <Switch checked={on} onCheckedChange={setOn} label="On" />
        <Switch checked={false} disabled onCheckedChange={() => {}} label="Disabled" />
        <Segmented
          label="Who it came from"
          value={seg}
          onChange={(v) => setSeg(v === 'other_party' ? 'other_party' : 'client')}
          options={[
            { value: 'client', label: 'Client' },
            { value: 'other_party', label: 'Other side' },
          ]}
        />
      </Group>
      <Group title="Progress and skeleton">
        <div className="w-[260px] space-y-3">
          <Progress value={35} label="Primary" />
          <Progress value={100} label="Success" tone="success" />
          <Progress value={60} label="Danger" tone="danger" />
        </div>
        <div className="w-[260px] space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Group>
      <Group title="Toast">
        <Button
          variant="secondary"
          onClick={() => toast('Saved', { description: 'A short message.' })}
        >
          Show a toast
        </Button>
        <Button variant="secondary" onClick={() => toast.error('Something went wrong')}>
          Show an error
        </Button>
      </Group>
    </div>
  )
}
