import type { Matter, User } from '@/api/types'
import { ago } from '@/lib/ids'

// Fictional matters for the demo. Smith v. Acme is the rich one; Henderson is closed (read-only).
export const SEED_USER: User = {
  id: 'user-1',
  name: 'Shashank Panda',
  firstName: 'Shashank',
  email: 'shashank@pandalaw.local',
  initials: 'SP',
  licensingStates: ['CA'],
}

export const SEED_MATTERS: Matter[] = [
  {
    id: 'smith',
    name: 'Smith v. Acme Corp',
    clientName: 'Smith Logistics LLC',
    ourSide: 'Customer (potential defendant)',
    opposingParty: 'Acme Corp',
    opposingCounsel: { name: 'Dana Whitfield', firm: 'Whitfield & Crane LLP' },
    court: 'Superior Court of California, San Francisco County',
    practiceArea: 'Commercial contract dispute',
    status: 'open',
    documentCount: 12,
    updatedAt: ago({ minutes: 40 }),
  },
  {
    id: 'rivera',
    name: 'Rivera lease dispute',
    clientName: 'Maria Rivera',
    ourSide: 'Tenant',
    opposingParty: 'Harbor View Properties LLC',
    opposingCounsel: null,
    court: 'Not yet filed',
    practiceArea: 'Residential landlord–tenant',
    status: 'open',
    documentCount: 3,
    updatedAt: ago({ days: 2 }),
  },
  {
    id: 'henderson',
    name: 'Henderson estate',
    clientName: 'Estate of Robert Henderson',
    ourSide: 'Executor',
    opposingParty: 'None',
    opposingCounsel: null,
    court: 'Superior Court of California, Marin County (Probate)',
    practiceArea: 'Probate',
    status: 'closed',
    documentCount: 1,
    updatedAt: ago({ days: 61 }),
  },
]
