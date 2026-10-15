// Starts a throw-away backend for the `real` Playwright project (INT-4.1): a fresh data folder, the fast
// converter, the machine's own clamd (or none when it isn't running), no streaming delay, the three demo matters (no documents) and the synthetic
// sample files written to <dir>/samples. Stays in the foreground until Playwright stops it.
import { spawn, spawnSync } from 'node:child_process'
import { connect } from 'node:net'
import { existsSync, mkdirSync, openSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const backend = join(root, 'backend')
const dir = process.env.LEGALLENS_E2E_DIR ?? join(tmpdir(), 'legallens-e2e')
const port = process.env.LEGALLENS_E2E_PORT ?? '8100'

const clamdSocket = process.env.LEGALLENS_CLAMD_SOCKET ?? '/opt/homebrew/var/run/clamav/clamd.sock'
const clamdAlive = await new Promise((done) => {
  const socket = connect(clamdSocket)
  socket.setTimeout(2000, () => socket.destroy() && done(false))
  socket.on('connect', () => socket.write('PING\n'))
  socket.on('data', (data) => done(String(data).startsWith('PONG')) && socket.destroy())
  socket.on('error', () => done(false))
})
if (!clamdAlive)
  console.warn('clamd is not running: starting without a scanner, so uploads show as paused')

// bge-m3 and the reranker when `legallens models download` has been run (they live outside the throw-away
// folder); otherwise the hash embedder and no reranker, so the run still works without the 4.5 GB download.
const modelsDir =
  process.env.LEGALLENS_MODELS_DIR ??
  join(homedir(), 'Library', 'Application Support', 'LegalLens', 'models', 'hf')
const haveModels =
  existsSync(join(modelsDir, 'BAAI--bge-m3')) &&
  existsSync(join(modelsDir, 'BAAI--bge-reranker-v2-m3'))
console.warn(
  haveModels
    ? `models: bge-m3 + reranker from ${modelsDir}`
    : 'models: not downloaded, using the hash embedder',
)

rmSync(dir, { recursive: true, force: true })
mkdirSync(join(dir, 'samples'), { recursive: true })

const env = {
  ...process.env,
  LEGALLENS_DATA_DIR: join(dir, 'data'),
  LEGALLENS_CONVERTER: 'fast',
  LEGALLENS_SCANNER: clamdAlive ? 'clamd' : 'none',
  LEGALLENS_CLAMD_SOCKET: clamdSocket,
  LEGALLENS_STUB_TOKEN_DELAY_MS: '0',
  LEGALLENS_WORKER_POLL_SECONDS: '0.2',
  LEGALLENS_INPROCESS_WORKER: 'true',
  ...(haveModels
    ? { LEGALLENS_MODELS_DIR: modelsDir }
    : { LEGALLENS_EMBEDDER: 'hash', LEGALLENS_RERANKER: 'none' }),
  // The single-app run serves the build from the API's own origin (INT-5.1).
  ...(process.env.E2E_SINGLE === '1'
    ? { LEGALLENS_FRONTEND_DIR: join(root, 'frontend', 'dist') }
    : {}),
}
const uv = (...args) => spawnSync('uv', ['run', ...args], { cwd: backend, env, stdio: 'inherit' })

for (const args of [
  ['legallens', 'db', 'upgrade'],
  ['legallens', 'seed'],
  [
    'python',
    '-c',
    `from pathlib import Path; from legallens.samples.generate import write_all; write_all(Path(${JSON.stringify(join(dir, 'samples'))}))`,
  ],
]) {
  const done = uv(...args)
  if (done.status !== 0) process.exit(done.status ?? 1)
}

// The server's output goes to a file, so it holds no pipe of Playwright's and can't keep it waiting.
const log = openSync(join(dir, 'backend.log'), 'a')
const server = spawn('uv', ['run', 'legallens', 'serve', '--port', port], {
  cwd: backend,
  env,
  stdio: ['ignore', log, log],
  detached: true,
})
// Stop the whole group. The server can sit on open event streams during a graceful stop, and it holds
// Playwright's output pipe, so it is killed outright after a moment rather than waited for.
const signalGroup = (signal) => {
  try {
    process.kill(-server.pid, signal)
  } catch {
    // Already gone.
  }
}
const stop = () => {
  signalGroup('SIGTERM')
  setTimeout(() => {
    signalGroup('SIGKILL')
    process.exit(0)
  }, 1000)
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop)
process.on('exit', () => signalGroup('SIGKILL'))
server.on('exit', (code) => process.exit(code ?? 0))
