# LegalLens frontend

The LegalLens user interface: React 19, TypeScript and Vite, styled with Tailwind CSS 4 and Radix UI. It runs on
**mock data** in the browser by default, or against the FastAPI backend in `../backend` (being connected now; see
[`../INTEGRATION_TODO.md`](../INTEGRATION_TODO.md)).

The build plan, with every task and its status, is in [`../FRONTEND_TODO.md`](../FRONTEND_TODO.md).

## Run it

You need Node 20 or newer.

```bash
npm install
npm run dev          # mock data, http://localhost:5173
```

Against the real backend (set up as in [`../backend/README.md`](../backend/README.md)), start both from the
`LegalLens` folder with `./scripts/dev.sh`, or run `uv run legallens dev` in `backend/` and `npm run dev:http`
here. Vite passes `/api` to the backend on `127.0.0.1:8000`, so the browser sees one origin. In development
builds the sign-in page says which data source is in use and whether the backend is healthy. Signing in against
the backend comes with integration Phase 2.

**node_modules and iCloud.** This folder is on the Desktop, which syncs to iCloud. The packages live in
`node_modules.nosync` (iCloud skips `*.nosync`), and `node_modules` is a link to it. A bare `npm install`
restores the link by itself (`scripts/link-node-modules.mjs`). After `npm install <package>`, run a bare
`npm install` once, because npm skips the project's postinstall step then.

Useful addresses while the app is being built:

| Address                                  | What you see                                         |
| ---------------------------------------- | ---------------------------------------------------- |
| `/login`                                 | Sign-in (the root `/` sends you here)                |
| `/matters`                               | All matters                                          |
| `/m/smith`                               | The three-pane workspace for a matter, on a new chat |
| `/m/smith/documents`                     | The document library, with upload                    |
| `/m/smith/profile`                       | Matter details (read-only)                           |
| `/m/smith/c/c-reply?draft=draft-reply`   | A chat with the seeded response-letter draft open    |
| `/m/smith/c/c-demand?summary=sum-demand` | A chat with the seeded summary open                  |
| `/settings`                              | Settings: profile, licensing states, security, About |
| `/settings/data`                         | "Where your data goes"                               |
| `/dev/ui`                                | Design-system gallery (development builds only)      |

The side panel lives in the URL (`?doc=…&page=…&cite=…`, `?summary=…`, `?draft=…`), so a refresh, a link or the
Back button brings back what was open.

## What works now

Everything runs on seeded mock data. The data isn't saved between page loads yet (FE-2.6); your settings and a
hidden first-run guide are.

- **Ask:** streamed answers with status steps, citation chips that open the cited passage highlighted in the
  viewer, "not found" and outside-law answers, and "What was searched".
- **Documents:** upload with checks in the browser (type by first bytes, 50 MB limit, duplicates), live ingestion
  progress, coverage reports, the hidden-content notice, and deletion that lists exactly what goes. File names
  drive the edge cases: "eicar" is quarantined, "scan" goes through OCR, and over 300 pages is refused.
- **Summarize:** from the chat, Summarize mode or a document's menu; a background job; the summary in the side
  panel with coverage, citations, "Not found in this document" and an audience switch.
- **Draft:** from the chat, Draft mode or "Draft a reply…" on a document from the other side. The letter or memo
  opens in the side panel: fill placeholders, resolve flagged citations, refine a section with a reviewable diff,
  answer or set aside each claim, tick each authority, set the FRE 408 and reservation-of-rights options, review
  and adopt, and export. The clean copy stays locked, with the reasons, until all of that is done.
- **System states:** banners under the top bar when the AI engine, the malware scanner, the background worker or
  storage has a problem. While the engine is down, every AI action pauses with the reason (a typed question is
  kept); while the scanner is down, uploads pause. A closed matter is read-only.
- **Session lock:** after 30 minutes idle a "Still there?" countdown, then a lock screen that needs the password
  and the 6-digit code again. "Lock now" is in the user menu, ⌘K and Settings.
- **Settings:** profile, licensing states, security, keyboard shortcuts, and About with the state of every local
  component. Press `?` anywhere outside a text field for the shortcuts, and ⌘K for the command palette.
- **First run:** a matter with no documents or chats shows a three-step guide instead of suggested questions.
- **Any screen size:** three panes from 1280 px; below that the side panel covers the conversation, and below
  1024 px the sidebar is a drawer (the button at the top left). Phones work too.

**Dev panel (development builds only).** Press ⌘⇧D to switch the AI engine, worker, malware scanner or storage
"off", change the response speed (instant, realistic, slow), make the next request fail, lock after 30 seconds idle,
add an empty matter to see the first-run guide, load 2,000 chats and 200 documents to test performance, make
every request fail ("LegalLens not responding") to see the error states, or reset the demo data. With
`npm run dev:http` the switches don't apply, and the panel says so.

The full list, with what is still open, is in [`../FRONTEND_TODO.md`](../FRONTEND_TODO.md) §7. Every change to the
plan and its reason is in §10 of that file.

## Scripts

| Command                           | What it does                                                            |
| --------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                     | Start the dev server with hot reload                                    |
| `npm run build`                   | Type-check and build for production into `dist/`                        |
| `npm run preview`                 | Serve the production build                                              |
| `npm run typecheck`               | TypeScript only (strict mode)                                           |
| `npm run lint`                    | oxlint over `src` and `e2e`                                             |
| `npm run format` / `format:check` | Prettier (with Tailwind class sorting)                                  |
| `npm test` / `test:watch`         | Unit and component tests (Vitest + Testing Library)                     |
| `npm run test:e2e`                | Browser flows and accessibility checks (Playwright + axe)               |
| `npm run dev:http`                | The dev server against the backend (`VITE_API=http`)                    |
| `npm run api:types`               | Regenerate `src/api/http/schema.d.ts` from the backend's `openapi.json` |
| `npm run screenshots`             | Retake `../architecture/screens/` (needs `npm run dev` running)         |

The first run of `test:e2e` needs the test browser: `npx playwright install chromium`. The browser tests start
their own mock-data server on port 5174, so a dev server on 5173 doesn't affect them. If the backend's API changes,
a unit test fails until you run `npm run api:types`.

## Where things live

```
src/
├─ app/            providers, router, layouts, error and boot screens
├─ styles/         design tokens (tokens.css), global styles, bundled fonts
├─ components/ui/  design-system primitives (Button, Dialog, Tabs, …)
├─ components/common/  shared pieces (EmptyState, ConfirmDialog, StatusPill, …)
├─ api/            ApiClient interface, query hooks, and the mock implementation in api/mock
├─ features/       one folder per area: auth, matters, shell, history, chat, composer,
│                  documents, viewer, summaries, drafts, settings, onboarding, dev
├─ hooks/  stores/  lib/  test/   (lib/drafts.ts holds the draft rules the mock server also uses)
e2e/               Playwright specs
```

Every file not yet built is a stub whose first comment says what it is for and which task builds it (`Built in FE-4.6`).
To find what's left in a phase, search for its ID: `grep -rn "FE-4" src`.

## Conventions

- **Colours come only from the design tokens** in `src/styles/tokens.css` (`bg-surface`, `text-fg-muted`,
  `border-line`, …). Tailwind's default palette is switched off, so a stray `bg-blue-500` won't compile into anything.
- **Components never call the mock directly.** They use hooks from `src/api/queries`, which go through `ApiClient`.
  Connecting the real backend means adding `HttpApiClient` and changing one line in `src/app/providers.tsx`.
- **Fixed phrases** ("Not found in your documents", "AI draft · not reviewed", …) live in `src/lib/copy.ts`.
- **No third-party network calls.** Fonts are bundled, and there is no analytics or CDN (DEC-56).
- **Accessible by default.** Radix primitives, a visible focus ring, labelled controls, and axe checks in every e2e run.
- **One set of rules for screen and server.** Anything the server must enforce (the draft export gate, the
  citation checklist, the placeholder grammar) lives in a pure module in `src/lib` that both use, so they can't
  disagree.
- **Edits to one draft are queued.** Changes show at once and are saved in order; review and export wait behind
  them, so the server always judges the draft as it is shown.
- **No planning IDs on screen.** DEC and FE IDs belong in code comments and docs, never in what the user reads.

## Checks before a phase is called done

`npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e` all
pass, and every new screen is screenshot-reviewed at 1440 px and at least one narrower width. As of 2026-10-10 (Phase 9): 59 unit tests and 51 Playwright
tests, with no axe violations. The browser tests include an accessibility sweep of every screen, keyboard-only
flows, narrow screens and large-data mode.
