// Hands a file the server (or the mock) produced to the browser's download.
export function saveFile(file: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(file.blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: file.filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
