// Keeps node_modules out of iCloud (INT-0.2, integration decision 9). This folder sits on the Desktop, which
// syncs to iCloud Drive; iCloud skips anything named *.nosync. The packages live in node_modules.nosync and
// node_modules is a link to it. npm replaces that link with a real folder on every install, so this runs after
// each install (postinstall) and moves the fresh folder back behind the link. It changes nothing when the link
// is already in place, and it does nothing outside macOS.
import { existsSync, lstatSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { platform } from 'node:process'

const LINK = 'node_modules'
const TARGET = 'node_modules.nosync'

if (platform === 'darwin' && existsSync(LINK) && !lstatSync(LINK).isSymbolicLink()) {
  if (existsSync(TARGET)) rmSync(TARGET, { recursive: true, force: true })
  renameSync(LINK, TARGET)
  symlinkSync(TARGET, LINK, 'dir')
  console.log(
    `[link-node-modules] moved packages to ${TARGET}, linked as ${LINK} (kept out of iCloud)`,
  )
}
