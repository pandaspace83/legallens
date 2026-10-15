import type { DocumentPage } from '@/api/types'

// Page text for the documents the demo cites. Anchors match the citations in answerScripts.ts.
// All parties, addresses and terms are fictional.
export const SEED_PAGES: DocumentPage[] = [
  {
    documentId: 'doc-msa',
    page: 6,
    blocks: [
      { anchor: '4', kind: 'heading', text: '4. Term and Termination' },
      {
        anchor: '4.1',
        kind: 'paragraph',
        text: '4.1 Term. This Agreement begins on the Effective Date and continues for an initial term of three (3) years, after which it renews automatically for successive one-year terms unless either party gives notice of non-renewal at least ninety (90) days before the end of the then-current term.',
      },
      {
        anchor: '4.2',
        kind: 'paragraph',
        text: '4.2 Termination. This Agreement may be terminated as follows:',
      },
      {
        anchor: '4.2(a)',
        kind: 'paragraph',
        text: '(a) Either party may terminate this Agreement for convenience upon sixty (60) days’ prior written notice to the other party.',
      },
      {
        anchor: '4.2(b)',
        kind: 'paragraph',
        text: '(b) Either party may terminate this Agreement immediately upon written notice if the other party becomes insolvent, makes a general assignment for the benefit of creditors, or becomes the subject of any bankruptcy proceeding.',
      },
      {
        anchor: '4.2(c)',
        kind: 'paragraph',
        text: '(c) Either party may terminate this Agreement upon written notice if the other party materially breaches this Agreement and fails to cure such breach within thirty (30) days after receiving written notice describing the breach in reasonable detail.',
      },
      {
        anchor: '4.3',
        kind: 'paragraph',
        text: '4.3 Effect of Termination. Upon termination, Customer shall pay Provider for all Services performed through the effective date of termination, and each party shall return or destroy the other party’s Confidential Information.',
      },
    ],
  },
  {
    documentId: 'doc-msa',
    page: 9,
    blocks: [
      { anchor: '6', kind: 'heading', text: '6. Fees and Payment' },
      {
        anchor: '6.1',
        kind: 'paragraph',
        text: '6.1 Fees. Customer shall pay the fees set out in Exhibit A (Pricing Schedule) for the Services described in each Statement of Work.',
      },
      {
        anchor: '6.2',
        kind: 'paragraph',
        text: '6.2 Invoices. Provider shall invoice Customer monthly in arrears. Undisputed amounts are due within thirty (30) days of the invoice date.',
      },
      {
        anchor: '6.3',
        kind: 'paragraph',
        text: '6.3 Late Payment. Any undisputed amount not paid when due shall accrue interest at the lesser of one percent (1%) per month or the maximum rate permitted by law, from the due date until paid in full.',
      },
      {
        anchor: '6.4',
        kind: 'paragraph',
        text: '6.4 Disputed Invoices. Customer may withhold payment of any amount it disputes in good faith, provided that Customer notifies Provider in writing within fifteen (15) days of receiving the invoice, stating the amount disputed and the reasons for the dispute. The parties shall negotiate in good faith to resolve the dispute within thirty (30) days.',
      },
    ],
  },
  {
    documentId: 'doc-msa',
    page: 18,
    blocks: [
      { anchor: '9', kind: 'heading', text: '9. Limitation of Liability' },
      {
        anchor: '9.1',
        kind: 'paragraph',
        text: '9.1 Exclusion of Certain Damages. Neither party shall be liable to the other for any lost profits, lost revenue, loss of data, or any indirect, incidental, special, consequential or punitive damages, however caused.',
      },
      {
        anchor: '9.2',
        kind: 'paragraph',
        text: '9.2 Cap on Liability. Each party’s total aggregate liability arising out of or relating to this Agreement shall not exceed the total fees paid or payable by Customer under this Agreement during the twelve (12) months immediately preceding the event giving rise to the claim.',
      },
      {
        anchor: '9.3',
        kind: 'paragraph',
        text: '9.3 Exceptions. The limitations in Sections 9.1 and 9.2 do not apply to (a) Customer’s obligation to pay undisputed fees, (b) a party’s indemnification obligations under Section 10, or (c) a party’s gross negligence or willful misconduct.',
      },
    ],
  },
  {
    documentId: 'doc-msa',
    page: 20,
    blocks: [
      { anchor: '11', kind: 'heading', text: '11. Restrictive Covenants' },
      {
        anchor: '11.1',
        kind: 'paragraph',
        text: '11.1 Non-Solicitation. During the Term and for twelve (12) months thereafter, neither party shall solicit for employment any employee of the other party who was directly involved in the Services.',
      },
      {
        anchor: '11.2',
        kind: 'paragraph',
        text: '11.2 Non-Competition. During the Term and for a period of two (2) years after its expiration or termination, Customer shall not, directly or indirectly, own, operate or provide services to any business that competes with Provider’s freight-routing services within the State of California.',
      },
    ],
  },
  {
    documentId: 'doc-msa',
    page: 28,
    blocks: [
      { anchor: '14', kind: 'heading', text: '14. Notices' },
      {
        anchor: '14.1',
        kind: 'paragraph',
        text: '14.1 Delivery. All notices under this Agreement shall be in writing and delivered by hand, by nationally recognized overnight courier, or by certified mail (return receipt requested) to the address set out in Schedule 2. A copy sent by email is a courtesy only and does not constitute notice.',
      },
      {
        anchor: '14.2',
        kind: 'paragraph',
        text: '14.2 Effectiveness. A notice is effective upon receipt, or upon refusal of delivery, as shown by the courier’s or postal service’s records.',
      },
    ],
  },
  {
    documentId: 'doc-msa',
    page: 31,
    blocks: [
      { anchor: 'sch2', kind: 'heading', text: 'Schedule 2 – Addresses for Notices' },
      {
        anchor: 'sch2-provider',
        kind: 'paragraph',
        text: 'Provider: Acme Corp, Attention: General Counsel, 500 Harbor Boulevard, Oakland, California 94607.',
      },
      {
        anchor: 'sch2-customer',
        kind: 'paragraph',
        text: 'Customer: Smith Logistics LLC, Attention: Chief Executive Officer, 1200 Mission Street, San Francisco, California 94103.',
      },
    ],
  },
  {
    documentId: 'doc-demand',
    page: 1,
    blocks: [
      {
        anchor: 'dl-1-0',
        kind: 'meta',
        text: 'WHITFIELD & CRANE LLP · 88 Kearny Street, Suite 1400 · San Francisco, CA 94108',
      },
      {
        anchor: 'dl-1-date',
        kind: 'meta',
        text: 'September 29, 2026 · By certified mail and email',
      },
      {
        anchor: 'dl-1-1',
        kind: 'paragraph',
        text: 'Re: Master Services Agreement dated March 1, 2024 between Acme Corp and Smith Logistics LLC — Demand for Payment. This firm represents Acme Corp (“Acme”) in connection with the above Agreement.',
      },
      {
        anchor: 'dl-1-2',
        kind: 'paragraph',
        text: 'Acme has performed its obligations under the Agreement in full. Despite repeated requests, Smith Logistics LLC (“Smith”) has failed to pay Invoices INV-2207, INV-2231 and INV-2245.',
      },
      {
        anchor: 'dl-1-3',
        kind: 'paragraph',
        text: 'The unpaid invoices total $48,200.00. Under the Agreement, late payments accrue interest at one and one-half percent (1.5%) per month. As of the date of this letter, accrued interest totals $2,169.00.',
      },
      {
        anchor: 'dl-1-4',
        kind: 'paragraph',
        text: 'Acme demands payment of $50,369.00 within twenty-one (21) days of the date of this letter, that is, on or before October 20, 2026.',
      },
    ],
  },
  {
    documentId: 'doc-demand',
    page: 2,
    blocks: [
      {
        anchor: 'dl-2-1',
        kind: 'paragraph',
        text: 'If payment is not received by that date, Acme intends to file a complaint in the Superior Court of California, County of San Francisco, without further notice, and will seek its attorneys’ fees and costs under Section 15.4 of the Agreement.',
      },
      {
        anchor: 'dl-2-2',
        kind: 'paragraph',
        text: 'Acme further reserves all rights with respect to Smith’s obligations under Section 11.2 of the Agreement, including Smith’s recent engagement of a competing freight-routing vendor.',
      },
      {
        anchor: 'dl-2-3',
        kind: 'paragraph',
        text: 'Nothing in this letter waives any of Acme’s rights or remedies, all of which are expressly reserved. Please direct all communications regarding this matter to the undersigned.',
      },
      {
        anchor: 'dl-2-sig',
        kind: 'meta',
        text: 'Very truly yours, Dana Whitfield · Whitfield & Crane LLP',
      },
    ],
  },
]

SEED_PAGES.push({
  documentId: 'doc-acme-resp',
  page: 1,
  blocks: [
    {
      anchor: 'ar-1-0',
      kind: 'meta',
      text: 'Acme Corp · Response to Notice of Service Level Failures · September 25, 2026',
    },
    {
      anchor: 'ar-1-1',
      kind: 'paragraph',
      text: '1. Acme has reviewed Smith Logistics LLC’s letter of September 12, 2026 regarding service availability for June through August 2026.',
    },
    {
      anchor: 'ar-1-2',
      kind: 'paragraph',
      text: '2. Acme’s records show monthly availability of 99.2% in June, 99.4% in July and 99.1% in August, each above the 99.0% commitment in Schedule 1 of the Agreement.',
    },
    {
      anchor: 'ar-1-3',
      kind: 'paragraph',
      text: '3. Acme therefore does not accept that any service credits are owed for the period, and invoices INV-2207, INV-2231 and INV-2245 remain due in full.',
    },
  ],
})
