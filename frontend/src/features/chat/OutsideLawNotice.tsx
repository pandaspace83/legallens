import { Scale } from 'lucide-react'

// Shown when a question needs law that isn't in the matter's documents (FE-4.7, DEC-38).
export function OutsideLawNotice() {
  return (
    <div className="mt-5 flex gap-3 rounded-card border border-warning/20 bg-warning-tint px-4 py-3.5">
      <Scale className="mt-0.5 size-[18px] shrink-0 text-warning" aria-hidden />
      <div className="text-[13.5px] leading-relaxed">
        <p className="font-semibold text-fg">
          This question needs law that isn’t in your documents
        </p>
        <p className="mt-0.5 text-fg-muted">
          LegalLens answers only from this matter’s documents. Upload the statute or case you want
          it to rely on, and ask again.
        </p>
      </div>
    </div>
  )
}
