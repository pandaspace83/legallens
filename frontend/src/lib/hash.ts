// SHA-256 of a file's bytes, for the early duplicate hint in the browser (the server hashes again, INT-3.2).
export async function sha256(buffer: ArrayBuffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Fallback for environments without Web Crypto: FNV-1a, good enough to spot duplicates.
  let h = 0x811c9dc5
  for (const b of new Uint8Array(buffer)) h = Math.imul(h ^ b, 0x01000193)
  return (h >>> 0).toString(16)
}
