import type { SummaryAudience, SummaryTemplate } from '@/api/types'

// Summary templates and audiences, as the BRD names them (DEC-40, DEC-41).

export const TEMPLATE_LABELS: Record<SummaryTemplate, string> = {
  letter_demand: 'Letter or demand received',
  pleading: 'Complaint or pleading',
  opinion: 'Court opinion (case brief)',
}

export const TEMPLATE_SHORT: Record<SummaryTemplate, string> = {
  letter_demand: 'Letter or demand',
  pleading: 'Pleading',
  opinion: 'Court opinion',
}

export const TEMPLATE_HINTS: Record<SummaryTemplate, string> = {
  letter_demand: 'Who is asking for what, by when, each claim, and any threats or deadlines',
  pleading: 'Parties, causes of action, key allegations and the relief sought',
  opinion: 'Facts, procedural posture, issue, holding, reasoning and disposition',
}

export const TEMPLATE_FIELDS: Record<SummaryTemplate, { key: string; title: string }[]> = {
  letter_demand: [
    { key: 'who', title: 'Who is asking' },
    { key: 'what', title: 'What they want' },
    { key: 'deadline', title: 'By when' },
    { key: 'claims', title: 'Claims made' },
    { key: 'threats', title: 'Threats' },
    { key: 'other', title: 'Also raised' },
  ],
  pleading: [
    { key: 'parties', title: 'Parties' },
    { key: 'causes', title: 'Causes of action' },
    { key: 'allegations', title: 'Key allegations' },
    { key: 'relief', title: 'Relief sought' },
  ],
  opinion: [
    { key: 'facts', title: 'Facts' },
    { key: 'posture', title: 'Procedural posture' },
    { key: 'issue', title: 'Issue' },
    { key: 'holding', title: 'Holding' },
    { key: 'reasoning', title: 'Reasoning' },
    { key: 'disposition', title: 'Disposition' },
  ],
}

export const AUDIENCE_LABELS: Record<SummaryAudience, string> = {
  one_paragraph: 'One paragraph',
  detailed: 'Detailed digest',
  plain_english: 'Plain English for the client',
}

export const AUDIENCE_SHORT: Record<SummaryAudience, string> = {
  one_paragraph: 'One paragraph',
  detailed: 'Detailed',
  plain_english: 'Plain English',
}
