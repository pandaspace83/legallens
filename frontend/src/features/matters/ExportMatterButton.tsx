import { FileArchive } from 'lucide-react'
import { toast } from 'sonner'
import { useExportMatter } from '@/api/queries/matters'
import type { ID } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { saveFile } from '@/lib/download'
import { errorText } from '@/lib/errors'

// Builds the matter's whole file (documents, summaries, drafts, chats) and hands it over (DEC-33). The server
// builds it as a job; a toast says when it is ready.
export function ExportMatterButton({
  matterId,
  variant = 'secondary',
  label = 'Export the matter’s file',
}: {
  matterId: ID
  variant?: 'secondary' | 'primary' | 'ghost'
  label?: string
}) {
  const exporter = useExportMatter(matterId)
  return (
    <Button
      size="sm"
      variant={variant}
      loading={exporter.isPending}
      onClick={() =>
        exporter.mutate(undefined, {
          onSuccess: (file) => {
            saveFile(file)
            toast.success('Matter file exported', {
              description: 'Documents, summaries, drafts and chats, as one archive.',
            })
          },
          onError: (e) => toast.error(errorText(e)),
        })
      }
    >
      <FileArchive /> {exporter.isPending ? 'Preparing the file…' : label}
    </Button>
  )
}
