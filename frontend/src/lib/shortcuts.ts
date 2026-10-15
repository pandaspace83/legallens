import { modKey } from '@/hooks/useHotkeys'

// Every keyboard shortcut the app has, in one place, for the "?" sheet and Settings (FE-3.7, FE-8.1). A shortcut
// added in code is added here too.
export interface Shortcut {
  keys: string[]
  label: string
}

const mod = modKey.replace('+', '')

export const SHORTCUT_GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Anywhere',
    items: [
      { keys: [mod, 'K'], label: 'Search chats and documents' },
      { keys: [mod, '⇧', 'O'], label: 'New chat' },
      { keys: ['?'], label: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Asking',
    items: [
      { keys: ['↵'], label: 'Send' },
      { keys: ['⇧', '↵'], label: 'New line' },
    ],
  },
  {
    title: 'Reading a document',
    items: [
      { keys: [mod, 'F'], label: 'Find in the document' },
      { keys: ['↵'], label: 'Next match (⇧↵ for the previous one)' },
      { keys: ['Esc'], label: 'Close find, then the document' },
    ],
  },
  {
    title: 'Chat list',
    items: [
      { keys: ['↵'], label: 'Save a new chat name' },
      { keys: ['Esc'], label: 'Cancel renaming' },
    ],
  },
]
