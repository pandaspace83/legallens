import { Toaster } from 'sonner'

// Sonner toaster styled to the tokens; toasts can carry an Undo action (FE-1.2).
export function Toast() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            '!rounded-card !border !border-line !bg-fg !text-white !shadow-overlay !font-sans !text-sm !gap-3 !px-4 !py-3',
          actionButton: '!bg-white/15 !text-white !font-medium hover:!bg-white/25',
          description: '!text-white/70',
        },
      }}
    />
  )
}
