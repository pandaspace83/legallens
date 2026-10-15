import { AlertCircle, CheckCircle2, Loader2, Lock, ShieldAlert, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useParams } from 'react-router'
import { useDocuments, useUploadDocument } from '@/api/queries/documents'
import type { DocumentOrigin, ID } from '@/api/types'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { Segmented } from '@/components/ui/Segmented'
import { IngestionProgress } from '@/features/documents/IngestionProgress'
import { ACCEPT, inspectFile, type FileCheck } from '@/features/documents/validateUpload'
import { useViewer } from '@/features/viewer/useViewer'
import { cn } from '@/lib/cn'
import { formatBytes, plural } from '@/lib/format'
import { errorText } from '@/lib/errors'
import { useUploadDialog } from '@/stores/ui'
import { useSystemStatus } from '@/features/shell/useSystemStatus'

// Upload: drop files, tag who each came from, check them, then watch them process (FE-5.2, FE-5.3, DEC-59).
interface Item {
  key: string
  file: File
  check: FileCheck
  origin?: DocumentOrigin
  documentId?: ID
  uploadError?: string
}

const ORIGINS: { value: DocumentOrigin; label: string }[] = [
  { value: 'client', label: 'Our client' },
  { value: 'other_party', label: 'Other side' },
]

let keySeq = 0
const toItem = (file: File): Item => ({ key: `f${++keySeq}`, file, check: { status: 'checking' } })

export function UploadDialog() {
  const { open, files, close } = useUploadDialog()
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      {open ? <UploadFlow initialFiles={files} onClose={close} /> : null}
    </Dialog>
  )
}

// Mounted fresh each time the dialog opens, so every upload starts from a clean slate.
function UploadFlow({ initialFiles, onClose }: { initialFiles: File[]; onClose: () => void }) {
  const { matterId = '' } = useParams()
  const { data: documents = [] } = useDocuments(matterId)
  const upload = useUploadDocument(matterId)
  const { scannerDown } = useSystemStatus()
  const { open: openDocument } = useViewer()
  const [items, setItems] = useState<Item[]>(() => initialFiles.map(toItem))
  const [phase, setPhase] = useState<'select' | 'uploading' | 'progress'>('select')
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const started = useRef(new Set<string>())

  // Check each new file once, against the matter and against the other files already checked.
  useEffect(() => {
    const checked = items.flatMap((i) =>
      i.check.status === 'ok' ? [{ sha256: i.check.sha256 }] : [],
    )
    for (const item of items) {
      if (item.check.status !== 'checking' || started.current.has(item.key)) continue
      started.current.add(item.key)
      void inspectFile(item.file, documents, checked).then((check) =>
        setItems((current) => current.map((i) => (i.key === item.key ? { ...i, check } : i))),
      )
    }
  }, [items, documents])

  const addFiles = (files: File[]) => setItems((current) => [...current, ...files.map(toItem)])

  const valid = items.filter((i) => i.check.status === 'ok')
  const untagged = valid.filter((i) => !i.origin)
  const checking = items.some((i) => i.check.status === 'checking')
  const skipped =
    items.length - valid.length - items.filter((i) => i.check.status === 'checking').length
  const canUpload = valid.length > 0 && !untagged.length && !checking && !scannerDown

  const setOrigin = (key: string, origin: DocumentOrigin) =>
    setItems((current) => current.map((i) => (i.key === key ? { ...i, origin } : i)))

  const start = async () => {
    setPhase('uploading')
    for (const item of valid) {
      if (item.check.status !== 'ok' || !item.origin) continue
      try {
        // The browser's check above is only an early hint: the server hashes, scans and checks the file
        // again, and its answer is final (INT-3.2).
        const { document } = await upload.mutateAsync({ file: item.file, origin: item.origin })
        setItems((current) =>
          current.map((i) => (i.key === item.key ? { ...i, documentId: document.id } : i)),
        )
      } catch (error) {
        setItems((current) =>
          current.map((i) => (i.key === item.key ? { ...i, uploadError: errorText(error) } : i)),
        )
      }
    }
    setPhase('progress')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (phase === 'select') addFiles([...e.dataTransfer.files])
  }

  const uploaded = items.filter((i) => i.documentId)
  const live = uploaded
    .map((i) => documents.find((d) => d.id === i.documentId))
    .filter((d) => d !== undefined)
  const allDone =
    live.length > 0 &&
    live.every((d) => d.status === 'ready' || d.status === 'failed' || d.status === 'quarantined')

  return (
    <DialogContent
      size="lg"
      title={
        phase === 'select'
          ? 'Upload documents'
          : allDone
            ? 'Documents processed'
            : 'Processing documents'
      }
      description={
        phase === 'select'
          ? 'Add documents to this matter. Tag each one with who it came from.'
          : allDone
            ? 'Everything below has been processed. You can close this window.'
            : 'You can close this window; processing continues and you’ll be notified when each file is ready.'
      }
    >
      <DialogBody>
        {phase === 'select' && scannerDown ? (
          <p
            role="alert"
            className="mb-4 flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-tint px-3.5 py-3 text-[13px] text-warning"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            The malware scanner isn’t responding, so files can’t be checked. Uploads are paused
            until it’s back; nothing is stored unchecked.
          </p>
        ) : null}
        {phase === 'select' ? (
          <>
            <input
              ref={picker}
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose files to upload"
              onChange={(e) => {
                addFiles([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex w-full flex-col items-center justify-center rounded-card border-2 border-dashed text-center transition-colors',
                items.length ? 'py-5' : 'py-12',
                dragging
                  ? 'border-primary bg-primary-tint'
                  : 'border-line-strong bg-app hover:border-control hover:bg-hover/50',
              )}
            >
              <UploadCloud
                className={cn('text-fg-subtle', items.length ? 'size-6' : 'size-9')}
                aria-hidden
              />
              <span className="mt-2 text-[14px] font-medium text-fg">
                {dragging
                  ? 'Drop to add'
                  : items.length
                    ? 'Add more files'
                    : 'Drop files here, or browse'}
              </span>
              <span className="mt-1 text-[12.5px] text-fg-subtle">
                PDF, DOCX, EML, MSG or TXT · up to 50 MB and 300 pages each
              </span>
            </button>

            {items.length ? (
              <>
                {valid.length > 1 ? (
                  <div className="mt-4 flex items-center justify-end gap-2 text-[12.5px] text-fg-muted">
                    Mark all as
                    <Segmented
                      size="sm"
                      label="Mark all files as from"
                      value={
                        valid.every((i) => i.origin === valid[0]?.origin)
                          ? valid[0]?.origin
                          : undefined
                      }
                      onChange={(origin) =>
                        setItems((current) => current.map((i) => ({ ...i, origin })))
                      }
                      options={ORIGINS}
                    />
                  </div>
                ) : null}
                <ul className="mt-3 divide-y divide-line rounded-card border border-line">
                  {items.map((item) => (
                    <li key={item.key} className="flex items-center gap-3 px-3.5 py-3">
                      <DocumentIcon
                        kind={item.check.status === 'ok' ? item.check.kind : 'pdf'}
                        className="size-[18px] shrink-0 text-fg-subtle"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-fg">
                          {item.file.name}
                        </p>
                        {item.check.status === 'error' ? (
                          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-danger">
                            <AlertCircle className="size-3.5 shrink-0" aria-hidden />{' '}
                            {item.check.message}
                          </p>
                        ) : item.check.status === 'checking' ? (
                          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-fg-subtle">
                            <Loader2 className="size-3 animate-spin" aria-hidden /> Checking file…
                          </p>
                        ) : (
                          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-fg-subtle">
                            <CheckCircle2 className="size-3.5 text-success" aria-hidden />{' '}
                            {formatBytes(item.file.size)} · checked
                          </p>
                        )}
                      </div>
                      {item.check.status === 'ok' ? (
                        <Segmented
                          label={`${item.file.name} is from`}
                          value={item.origin}
                          onChange={(origin) => setOrigin(item.key, origin)}
                          options={ORIGINS}
                          invalid={!item.origin}
                        />
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() =>
                          setItems((current) => current.filter((i) => i.key !== item.key))
                        }
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[12.5px] leading-relaxed text-fg-subtle">
                  Documents from the other side get extra care: tracked changes, comments and hidden
                  text are kept from the AI, and nothing in them is ever followed as an instruction.
                </p>
              </>
            ) : null}
          </>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => {
              const doc = documents.find((d) => d.id === item.documentId)
              if (doc) {
                return (
                  <li key={item.key}>
                    <IngestionProgress
                      document={doc}
                      onOpen={() => {
                        onClose()
                        openDocument(doc.id)
                      }}
                    />
                  </li>
                )
              }
              if (item.uploadError || item.check.status === 'error') {
                return (
                  <li key={item.key} className="flex gap-3 py-3 text-[13px]">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-fg">{item.file.name}</span>
                      <span className="text-danger">
                        Not uploaded.{' '}
                        {item.uploadError ??
                          (item.check.status === 'error' ? item.check.message : '')}
                      </span>
                    </span>
                  </li>
                )
              }
              return (
                <li
                  key={item.key}
                  className="flex items-center gap-2 py-3 text-[13px] text-fg-muted"
                >
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Uploading{' '}
                  {item.file.name}…
                </li>
              )
            })}
          </ul>
        )}
      </DialogBody>

      <DialogFooter className="justify-between">
        <p className="flex items-center gap-1.5 text-[12.5px] text-fg-subtle">
          <Lock className="size-3.5" aria-hidden /> Files stay on this computer
        </p>
        {phase === 'select' ? (
          <div className="flex items-center gap-2">
            {skipped > 0 && valid.length ? (
              <span className="text-[12.5px] text-fg-subtle">
                {plural(skipped, 'file')} will be skipped
              </span>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!canUpload} onClick={start}>
              {untagged.length && valid.length
                ? `Tag ${plural(untagged.length, 'file')} to continue`
                : `Upload ${valid.length ? plural(valid.length, 'file') : ''}`.trim()}
            </Button>
          </div>
        ) : (
          <Button
            variant={allDone ? 'primary' : 'secondary'}
            onClick={onClose}
            loading={phase === 'uploading'}
          >
            {allDone ? 'Done' : 'Keep working'}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  )
}
