// Helpers for readable mock IDs and dates relative to now, so the sidebar's date groups always look right.

let counter = 1000

export function newId(prefix: string) {
  counter += 1
  return `${prefix}-${counter.toString(36)}`
}

export function ago({
  minutes = 0,
  hours = 0,
  days = 0,
}: {
  minutes?: number
  hours?: number
  days?: number
}) {
  const ms = ((days * 24 + hours) * 60 + minutes) * 60_000
  return new Date(Date.now() - ms).toISOString()
}
