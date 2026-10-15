# LegalLens Frontend: Plan and To-Do

> **Status:** Approved 2026-10-06 · Phase 0, design pass, Phases 5 to 9 done · API layer frozen for
> integration since 2026-10-10 (see §10) · **Date:** 2026-10-10
> **Scope:** The UI only. There is no backend, orchestration or AI. All data comes from a mock API
> with realistic seed data, so every screen, state and flow works in the browser.
> **Sources:** the [BRD](https://claude.ai/code/artifact/22d52891-447c-45a0-a145-ab2cd51408e3),
> the [Technical Architecture](architecture/LegalLens_Technical_Architecture_v0.1.md) (frame 2 and the API reference)
> and the decision log in [IDEAS.md](IDEAS.md). DEC, SUG and DEF IDs below refer to IDEAS.md.

**How this file works:** each task has an ID (`FE-3.4`) and a checkbox. Phases run in order, and each phase ends
with a demo you can click through. Nothing is built until this plan is approved. After approval, Phase 0 creates the
full folder and file skeleton, and the phases fill it in. Every change to the plan, and the reason for it, is recorded
in §10, the decision and change log.

> **Design pass (2026-10-06).** After seeing the Phase 0 placeholders, the owner asked for a high-end look right away.
> So the visible core was built ahead of phase order:
> - sign-in and MFA
> - the matters overview
> - the top bar, with the matter switcher, ⌘K palette and "Runs locally" explainer
> - the sidebar, with history grouped by date (rename, pin, delete with undo) and the documents list
> - the new-chat screen with suggestions
> - the streaming chat, with status steps, serif answers, citation chips with hover previews, answer states, the
>   outside-law notice, sources and "What was searched"
> - the document viewer, which highlights the cited passage
> - the "Where your data goes" page and the 404 page
>
> All of it runs on seeded mock data through `ApiClient`. Checks: typecheck and lint clean, 14 unit tests and 2
> Playwright flows pass, axe finds no violations, and first-load JS is 117 KB gzipped. Tasks it finished are ticked;
> tasks it started have a "Partly done" note.

---

## 1. Goals and non-goals

**Goals**

- A complete, production-quality UI for **Ask**, **Summarize** and **Draft** (DEC-05), including every screen,
  state and edge case in the BRD.
- It runs fully on mock data and feels real: answers stream, uploads show progress, jobs finish, drafts get checked.
- The API layer is ready to swap. The UI talks to one `ApiClient` interface whose types match the API reference
  (37 endpoints, 16 SSE events). Connecting the real backend later means replacing one file.
- The quality bar is a top-class consumer product: fast with large data, accessible (WCAG 2.1 AA, SUG-07),
  keyboard-first and consistent.

**Non-goals for now**

- No backend, database, models, OCR or real authentication. The mock simulates all of them.
- No real PDF rendering yet. The viewer renders mock pages as HTML, and PDF.js plugs in later behind the same
  component.
- **Light theme only.** Colours are design tokens, so a dark theme can be added later without touching components.
- English only (DEF-31). Dates and numbers are still formatted with `Intl`.

---

## 2. Design direction

### 2.1 What we take from the best chat products

| Product | What we borrow | What we do differently for lawyers |
| --- | --- | --- |
| **Claude** | Calm, warm off-white canvas; a comfortable reading width (~720 px); a side panel next to the chat for documents and drafts | The side panel is for verifying sources and editing drafts, not just viewing them |
| **ChatGPT** | Sidebar history grouped by date, with hover actions (rename, pin, delete); composer fixed at the bottom; stop and retry; a "jump to latest" button | History is always scoped to one **matter**, and the matter is always visible |
| **Perplexity** | Numbered inline citations, hover preview cards and a sources list | Citations are **pinpoint** (document, page, paragraph), and clicking one opens the passage highlighted (DEC-36) |
| **Harvey / CoCounsel** | Matters as workspaces, a document library, and review workflows | A "not found" answer is a first-class, good answer (DEC-37), and drafts stay watermarked until reviewed (DEC-51) |
| **Linear / Notion** | Keyboard-first use, a ⌘K command palette, crisp density, quiet borders | No playful extras such as avatars, emoji or confetti; this is a professional tool |

**Principles** (each traces to the BRD):

1. **Always show the scope.** The current matter and "Searching: …" are visible on every chat screen
   (DEC-24, DEC-35).
2. **Show the work.** Citations, what was searched and how much of a document was read are always one click away
   (DEC-22, DEC-42).
3. **The lawyer is in charge.** Nothing is sent or filed. Review and export are deliberate steps that leave a
   record (DEC-23, DEC-51).
4. **Calm over clever.** Neutral colours, one brand colour, motion that explains instead of decorating.
5. **Honest states.** Loading, empty, partial, not found, failed and read-only are each designed, never left as an
   afterthought.

### 2.2 Visual language (light theme)

A warm, paper-like neutral base with one deep **ink navy** brand colour, the look of a law firm's letterhead rather
than a tech startup. I measured every text pair against WCAG 2.1 AA (4.5:1 for text, 3:1 for control borders).

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| `bg-app` | `#FBFBFA` | Conversation background | — |
| `bg-sidebar` | `#F4F3F0` | Sidebar | — |
| `bg-surface` | `#FFFFFF` | Cards, composer, panels, dialogs | — |
| `bg-hover` | `#EFEEEA` | Hover and selected rows | — |
| `border` | `#E6E4DF` | Dividers and card edges (decorative) | — |
| `border-control` | `#8F8B84` | Input and checkbox borders | 3.39 : 1 on white |
| `text` | `#1F1E1C` | Body text | 16.1 : 1 |
| `text-secondary` | `#5C5A55` | Labels, metadata | 6.65 : 1 |
| `text-tertiary` | `#6F6C66` | Timestamps, hints | 5.05 : 1 (4.72 on sidebar) |
| `primary` | `#1E3A5F` | Brand, primary buttons, selected state | 11.5 : 1 (white on it) |
| `primary-tint` | `#EBF0F6` | Citation chips, selected chat | 10.0 : 1 (primary on it) |
| `link` | `#2B5C94` | Links | 6.86 : 1 |
| `focus` | `#2F6FB3` | 2 px focus ring, 2 px offset | 5.19 : 1 |
| `highlight` | `#FDF0C4` | Highlighted passage in the viewer | 14.6 : 1 (text on it) |
| `success` | `#1C6B3A` on `#EAF6EE` | "From your documents" | 5.89 : 1 |
| `warning` | `#8A5A00` on `#FDF4E1` | "Partially found", unresolved placeholders | 5.42 : 1 |
| `danger` | `#A8261F` on `#FCEDEC` | UNVERIFIED citations, blocked export, errors | 6.23 : 1 |
| `info` | `#475467` on `#EEF1F5` | "Not found in your documents" (neutral, not an error) | 6.79 : 1 |

- **Type:** Inter for the interface (14 px base, 15 px for chat text, line height 1.6). Source Serif 4 for documents,
  drafts and summaries, so legal text reads like legal paper. Both fonts are **bundled with the app**
  (`@fontsource`), never loaded from Google Fonts, because nothing may call third parties (DEC-56).
- **Shape:** 4 px spacing grid; 8 px corner radius on controls and 12 px on cards and panels; two soft shadow
  levels only.
- **Icons:** Lucide, 16 and 20 px, stroke 1.75.
- **Motion:** 150–200 ms ease-out for panels, menus and toasts; a gentle streaming caret. Everything respects
  `prefers-reduced-motion`.

### 2.3 Layout

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ LegalLens   Smith v. Acme Corp ▾        🔒 Runs locally        ⌘K Search          ?   SP ▾  │ top bar
├────────────────────┬──────────────────────────────────────────┬───────────────────────────────┤
│ + New chat     ⌘⇧O │  Termination notice in the MSA           │ Document │ Draft │ Summary   │
│ 🔍 Search chats    │                                          │ ───────────────────────────── │
│                    │            ┌───────────────────────────┐ │ Smith MSA v3.pdf · our client │
│ PINNED             │            │ What notice do we need to │ │ page 12 of 41      − 100% +   │
│  Key dates review  │            │ terminate the MSA?        │ │ ┌───────────────────────────┐ │
│ TODAY              │            └───────────────────────────┘ │ │ 4.2 Termination           │ │
│ ▸Termination notice│  ✓ From your documents                   │ │ ▓▓(a) Either party may▓▓▓ │ │
│  Demand letter sum │  Either party may terminate with 60      │ │ ▓▓terminate this Agreement│ │
│ YESTERDAY          │  days' written notice [1]. Notice goes   │ │ on sixty (60) days' ...   │ │
│  Reply to counsel  │  by courier or certified mail [2].       │ │                           │ │
│ PREVIOUS 7 DAYS    │  [1] MSA p.12 ¶4.2(a)  [2] MSA p.31 Sch.2│ │ (b) ...                   │ │
│  Exhibit B dates   │  ▸ What was searched · 👍 👎 ⧉ ↻          │ └───────────────────────────┘ │
│                    │                                          │  ◂ citation 1 of 2 ▸          │
│ DOCUMENTS (12)   ⤒ │ ┌──────────────────────────────────────┐ │                               │
│  Smith MSA v3   ✓  │ │ Ask about this matter…               │ │                               │
│  Demand letter  ✓  │ │ [Scope: All documents (12) ▾] [Auto ▾]│ │                               │
│  Exhibit B     45% │ │ Searching: all 12 documents   📎  ➤  │ │                               │
│                    │ └──────────────────────────────────────┘ │                               │
│ ⚙ Matter profile   │  LegalLens can be wrong. Check citations.│                               │
└────────────────────┴──────────────────────────────────────────┴───────────────────────────────┘
   280 px, collapsible     fluid, 720 px reading column               resizable 400–760 px, closable
```

- The **sidebar** collapses to icons (⌘\\). Below 1024 px it becomes a drawer.
- The **context panel** opens when a citation, document, summary or draft is opened, and closes with Esc.
  Below 1280 px it overlays the chat instead of sitting beside it.
- **The URL holds the state.** The open matter, chat, document, page and citation all live in the URL, so the back
  button, refresh and links work as expected.

### 2.4 Voice and microcopy

- Plain and precise, written for a busy lawyer. No "I think", no exclamation marks, no hype.
- Fixed phrases, used everywhere the same way:
  - "From your documents"
  - "Partially found in your documents"
  - "Not found in your documents"
  - "AI draft · not reviewed"
  - "Reviewed and adopted"
  - "Runs locally · nothing leaves this computer"
- Every error says what happened and what to do next ("Exhibit B.docx couldn't be read. Pages 3–5 are image-only.
  Try a clearer scan.").

---

## 3. Information architecture

| Route | Screen |
| --- | --- |
| `/login`, `/login/mfa` | Sign in with password, then a 6-digit code (DEC-54) |
| `/matters` | Choose a matter, or the empty state for a first-time user |
| `/m/:matterId` | New chat in that matter |
| `/m/:matterId/c/:conversationId` | A conversation |
| `…?panel=doc&doc=:id&page=12&cite=:citationId` | Context panel: document viewer at a passage |
| `…?panel=summary&summary=:id` / `…?panel=draft&draft=:id` | Context panel: summary or draft |
| `/m/:matterId/documents` | Document library, full page |
| `/m/:matterId/profile` | Matter profile: parties, counsel, court, AI consent |
| `/settings`, `/settings/data` | Settings, and the "Where your data goes" page (DEC-55) |
| `/dev/ui` (development only) | Gallery of every design-system component and state |
| `*` | Not found page |

---

## 4. Mock API and data

- **One interface, two implementations.** `ApiClient` mirrors the API reference. `MockApiClient` implements it
  in memory now, and `HttpApiClient` (fetch + EventSource) comes when the backend exists. Components never import
  either one directly.
- **Streaming mock.** `streamRun(runId, onEvent, signal)` emits the real SSE event types in the real order:
  `run.started → intent → scope → status… → token… → citation… → answer_state → done`. Tokens arrive every 20–40 ms
  and can be cancelled (the Stop button).
- **Scripted answer engine:**
    - A keyword match returns a scripted answer with real citations into the mock documents.
    - Anything unmatched returns "Not found in your documents", plus what was searched.
    - "Enforceable in California" and similar questions return the outside-law notice (DEC-38).
    - "Summarize…" and "Draft…" questions start a background job with progress events.
- **Seed data:**
    - 3 matters: **Smith v. Acme Corp** (active, rich data), **Rivera lease dispute** (active, small) and
      **Henderson estate** (closed, read-only).
    - 12 documents with page text: an MSA with realistic clause numbering, a scanned demand letter with OCR
      confidence, exhibits, an email with attachments, and one document from the other side with hidden tracked
      changes.
    - About 30 conversations spread across dates (to show the grouping), one finished summary, and one draft in
      progress with placeholders and failed checks.
- **Realism:** random latency of 150–600 ms per call, and seeded IDs and dates so the demo looks the same every time.
- **Persistence:** the mock database is saved to `localStorage` under a versioned key, so a refresh keeps your
  chats. "Reset demo data" restores the seed. (Only mock data is stored; the real app keeps client data in the
  encrypted backend, never in the browser.)
- **Dev panel** (development builds only, toggled with ⌘⇧D):
    - a latency slider
    - "fail the next request"
    - "local AI engine offline"
    - "session expires in 30 s"
    - a large-data mode that loads 2,000 chats and 200 documents to test performance (DEC-14)

---

## 5. Frontend architecture

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite, React 19, TypeScript (strict) | DEC-16; fast dev server |
| Routing | React Router 8 (current stable at install; same API as v7) | URL-driven state; lazy-loaded routes |
| Server state | TanStack Query 5 | Caching, retries, optimistic rename / pin / delete |
| UI state | Zustand | Panel layout, composer drafts, preferences |
| Styling | Tailwind CSS 4 + CSS-variable tokens | One source of truth for the design tokens |
| Primitives | Radix UI (Dialog, Dropdown, Popover, Tooltip, Tabs, Select, Checkbox) | Accessible behaviour without reinventing it |
| Command palette | cmdk | ⌘K for switching matters, opening chats and documents |
| Panels | react-resizable-panels | Draggable divider; widths remembered |
| Long lists | @tanstack/react-virtual | Thousands of chats or messages stay smooth |
| Toasts | Sonner | Undo for delete; job-finished notices |
| Markdown | react-markdown + remark-gfm (sanitised; raw HTML off) | Answers with lists and bold, plus custom citation chips |
| Icons and fonts | lucide-react, @fontsource Inter + Source Serif 4 | No network calls (DEC-56) |
| Tests | Vitest + Testing Library; Playwright + axe for end-to-end and accessibility | Unit, component, flow and a11y checks |
| Lint and format | oxlint (already in the scaffold) + Prettier | Fast, consistent |

**Folder structure** (by feature; Phase 0 creates it):

```
frontend/
├─ index.html · vite.config.ts · tsconfig*.json · package.json · playwright.config.ts
├─ public/                         favicon, logo
├─ e2e/                            Playwright flows
└─ src/
   ├─ main.tsx · App.tsx
   ├─ app/                         providers, router, error boundary, layouts
   ├─ styles/                      tokens.css, globals.css, fonts
   ├─ components/ui/               design system: Button, Input, Dialog, Menu, Tabs, Tooltip, Badge, …
   ├─ components/common/           EmptyState, Skeleton, Kbd, ConfirmDialog, LocalOnlyBadge, …
   ├─ api/
   │  ├─ types.ts                  domain + SSE event types (from the API reference)
   │  ├─ client.ts                 ApiClient interface + provider
   │  └─ mock/                     MockApiClient, seed data, mock documents, answer scripts, latency
   ├─ features/
   │  ├─ auth/                     login, MFA, session timeout, lock screen
   │  ├─ matters/                  switcher, new matter, profile, close / export / delete
   │  ├─ shell/                    top bar, sidebar, context panel host, command palette, dev panel
   │  ├─ history/                  chat list, grouping, search, rename / pin / delete
   │  ├─ chat/                     thread, messages, citations, answer states, feedback, job cards
   │  ├─ composer/                 prompt bar, scope and mode selectors, attachments
   │  ├─ documents/                library, upload, ingestion progress, coverage, hidden content
   │  ├─ viewer/                   page renderer, highlights, search, citation navigation
   │  ├─ summaries/                template picker, summary view
   │  ├─ drafts/                   editor, sections, placeholders, checks, review, export
   │  └─ settings/                 settings, Where your data goes, shortcuts
   ├─ hooks/                       useRunStream, useHotkeys, useMediaQuery, …
   ├─ lib/                         dates, formatting, citations parser, cn()
   └─ test/                        test setup, fixtures
```

**Rules for the code:**

- Components get data only through hooks (`useConversations`, `useRunStream`, …), never from the mock directly.
- Streaming tokens are batched once per animation frame, so long answers stay at 60 fps.
- The chat thread is an ARIA `log`. Status changes are announced politely; individual tokens are not.
- Document text is always rendered as text, never as raw HTML.
- Nothing is printed to the console that could contain client text.

---

## 6. Quality bar ("ready for a million users")

- **Performance:**
    - Initial JS of 250 KB gzipped or less; the viewer, drafts and settings load on demand.
    - First screen in under 1.5 s on a laptop.
    - Lists longer than 100 items are virtualised.
- **Accessibility (WCAG 2.1 AA):**
    - Every action works from the keyboard, with a visible focus ring and a skip link.
    - Every control is labelled, and contrast follows §2.2.
    - Citations read as "Source 1: Smith MSA, page 12, paragraph 4.2(a)".
    - Checked with axe in end-to-end runs.
- **Resilience:**
    - Every query has loading, empty and error states.
    - An error boundary wraps each panel, so one failure never blanks the app.
    - Retries for failed calls.
    - An "AI engine offline" banner instead of a crash.
- **Consistency:** every screen uses the shared components; no one-off colours or spacing.
- **Responsive:** designed for a 1280–1920 px laptop or desktop; works at 1024 px; usable on a phone, with the
  sidebar and panel as drawers.
- **Testing:**
    - Unit tests for logic (citation parsing, date grouping, export gating, the run-event reducer).
    - Component tests for the composer, answer states and upload validation.
    - Playwright for the six main flows.

---

## 7. To-do by phase

Each phase ends with a demo. The BRD slice a phase supports is in brackets.

### Phase 0: Foundation and skeleton

- [x] **FE-0.1** Replace the default Vite scaffold; set up TypeScript strict mode, path alias `@/`, oxlint and Prettier.
- [x] **FE-0.2** Install the libraries in §5 and pin their versions.
- [x] **FE-0.3** Create the full folder and file skeleton from §5, each file a typed stub with a one-line purpose.
- [x] **FE-0.4** Set up Vitest, Testing Library, Playwright and axe, with one passing smoke test each.
- [x] **FE-0.5** Add the `dev`, `build`, `test`, `test:e2e`, `lint` and `typecheck` scripts, and a README on how to run.

**Demo:** `npm run dev` shows an empty shell; `npm test` and `npm run build` pass.

> **Done 2026-10-06.** 170 files under `src/` (148 generated stubs, each naming its task). Checks: typecheck, lint and
> Prettier clean; 3 unit tests and 2 Playwright tests pass, including an axe WCAG 2.1 AA scan with no violations.
> First-load JS is 110 KB gzipped (budget 250 KB). Also added early: the approved design tokens in
> `src/styles/tokens.css` (Tailwind's default palette switched off), bundled fonts, a boot screen, and VS Code
> extension recommendations.

### Phase 1: Design system

- [x] **FE-1.1** Write the design tokens (§2.2) as CSS variables wired into Tailwind; bundle the fonts.
- [x] **FE-1.2** Build the primitives: Button (primary, secondary, ghost, danger; sizes; loading), IconButton,
      Input, Textarea (auto-grow), Select, Checkbox, Switch, Badge, Tooltip, Dialog, DropdownMenu, Popover, Tabs,
      Progress, Skeleton, Kbd, Toast.
      *Partly done: Button, IconButton, Input, Badge, Tooltip, Menu, Popover, Dialog, Checkbox (with a disabled state), Progress, Segmented, Skeleton, Kbd, Toast, Switch and Tabs are built; Select and Textarea are not.*
      *Done 2026-10-14: Select (a styled native select) and Textarea (auto-grow) are built; all primitives exist.*
- [x] **FE-1.3** Build the shared pieces: EmptyState, ConfirmDialog (including typed confirmation), StatusPill,
      LocalOnlyBadge, Avatar (initials), Spinner.
- [x] **FE-1.4** Add the `/dev/ui` gallery showing every component in every state.

**Demo:** the gallery page; keyboard and focus checks pass.

### Phase 2: Mock API and data

      *Done: the `/dev/ui` gallery is in development builds.*
- [x] **FE-2.1** Write `api/types.ts` from the API reference: domain types and the 16 SSE event types.
      *Partly done: types and SSE events for groups A–G (auth to drafts) are written; H (audit) is not.*
- [x] **FE-2.2** Write the `ApiClient` interface and provider, plus TanStack Query hooks for every endpoint group
      (A–H).
      *Partly done: the interface and hooks cover groups A–G; H (audit) is not.*
- [x] **FE-2.3** Write the seed data (§4): 3 matters, 12 documents with page text, about 30 chats, a summary and a
      draft.
- [x] **FE-2.4** Build the scripted answer engine and `streamRun` with cancellation.
- [x] **FE-2.5** Build the background job simulator (ingest, summarize, draft) feeding the matter event stream.
- [x] **FE-2.6** Add `localStorage` persistence, "Reset demo data" and the dev panel.
      *Partly done: the dev panel (⌘⇧D, development builds only) and "Reset demo data" are built (Phase 8). Demo
      data lives in memory, so a reload resets it; saving it in `localStorage` and the panel's event log for this
      phase's demo are not built. Phase 9 added large-data mode (2,000 chats, 200 documents) and "LegalLens not
      responding".*
      *Closed 2026-10-14 as not needed: demo data lives in memory by design, and the real app keeps its data in the backend.*
- [x] **FE-2.7** Write unit tests for the engine, the run reducer and the job simulator.
      *Partly done: tests for the answer engine, the ingest simulator, upload validation, summary scripts, summarize routing, the draft rules (placeholders, citation checklist, export gate, word diff) and the draft server (routing, review and export refusal, versions, refine) are written; the run reducer has none yet.*

**Demo:** in the dev panel, start a run and watch the events arrive in order.

### Phase 3: Shell, sign-in and matters [Slices 0–1]

      *Closed 2026-10-14: 108 unit tests cover the engine, ingest simulator, summaries, drafts and upload rules.*
- [x] **FE-3.1** Login and MFA screens (6-digit input with paste and auto-advance), with error and lockout states.
- [x] **FE-3.2** Session idle timeout: a warning dialog with a countdown, then a lock screen (DEC-54).
- [x] **FE-3.3** Top bar with matter switcher (searchable, recent first, closed matters marked read-only), the
      "Runs locally" badge with an explainer popover, and the user menu.
- [x] **FE-3.4** Sidebar: New chat, search, history grouped as Pinned / Today / Yesterday / Previous 7 days / Older;
      inline rename; pin; delete with undo; keyboard navigation; virtualised list; skeleton and empty states.
      *Corrected 2026-10-10: the virtualised list was built in Phase 9, not with the rest of this task, and keyboard
      navigation is the Tab order (no arrow keys). See §10, Phase 9.*
- [x] **FE-3.5** Sidebar Documents section: count, status pills, Upload button, link to the library.
- [x] **FE-3.6** Context panel host: resizable, remembers its width, Esc closes it, overlay below 1280 px.
      *Partly done: the panel opens and closes, Esc closes it, and below 1280 px it covers the conversation as an
      overlay (Phase 9); resizing it and remembering its width are not built.*
      *Done 2026-10-14: a drag handle and arrow keys resize the panel; the width is remembered (`usePanelWidth`).*
- [x] **FE-3.7** ⌘K command palette (switch matter, new chat, open chat or document, go to settings) and a
      keyboard shortcuts sheet (`?`).
- [x] **FE-3.8** New matter dialog in 3 steps: basics → parties and counsel → court and AI consent (DEC-30,
      DEC-60). Matter profile page.
      *Done 2026-10-11 (integration): new-matter and edit dialog, AI-consent step, matter details page.*
- [x] **FE-3.9** Closed-matter read-only banner. Export matter (job + toast). Delete matter (export prompt, then
      typed confirmation; DEC-34).
      *Done 2026-10-11 (integration): export (job + toast), close, delete with export prompt and typed name.*

**Demo:** sign in, switch matters, see each matter's own history, rename and pin chats, create a matter.

### Phase 4: Ask, the chat [Slice 1]

- [x] **FE-4.1** New-chat empty state: matter name and suggested questions built from the matter's documents.
- [x] **FE-4.2** Composer: auto-grow, Enter to send and Shift+Enter for a new line, Stop while streaming; unsent
      text kept per chat; disabled with a reason when the matter is closed or no document is ready.
- [x] **FE-4.3** Scope selector, "This document ▸ pick one" or "All documents in this matter (n)", with a live
      "Searching: …" line (DEC-35).
- [x] **FE-4.4** Mode selector, Auto / Ask / Summarize / Draft, with template and audience options for Summarize
      and the draft type for Draft.
- [x] **FE-4.5** Assistant message:
    - live status steps (Understanding the question → Searching 12 documents → Checking citations)
    - streaming text with a caret
    - markdown rendering
- [x] **FE-4.6** Citation chips `[1]`:
    - a hover card showing the document, page, paragraph and quoted passage
    - a click opens the viewer at the highlighted passage
    - a verified or unverified mark on each chip
- [x] **FE-4.7** Answer-state badge (found / partial / not found), the outside-law notice (DEC-38), and a
      "What was searched" disclosure (DEC-22).
- [x] **FE-4.8** Message actions: copy (with citations as text), retry, and feedback (Helpful / Wrong citation /
      Missed something / Should be not found, with an optional note; DEC-52).
      *Partly done: copy with sources and helpful / not helpful are built; the feedback form and retry are not.*
      *Done 2026-10-14: Helpful sends feedback, Not helpful opens the form (wrong citation, missed something, should be not found, note), and Ask again re-sends the question.*
- [x] **FE-4.9** Thread behaviour:
      *Partly done: the thread stays at the bottom, has "jump to latest" and gets an auto title; virtualisation is not built.*
    - virtualised
    - stays pinned to the bottom while streaming
    - a "jump to latest" button when you scroll up
    - an error message with retry
    - a new chat gets an automatic title
      *Closed 2026-10-14: not virtualised on purpose; a 50-turn chat is about 100 articles. Revisit if chats grow far past that.*
- [x] **FE-4.10** Job cards in the chat for Summarize and Draft: progress, steps, cancel, and "Open" when done.
      *Partly done: summary and draft job cards are built, with live progress, steps and Open; cancel is not.*

**Demo:** ask, watch the stream, click a citation, verify the passage, get a "not found" and an outside-law answer.

### Phase 5: Documents and viewer [Slices 1, 4, 5]

      *Done 2026-10-14: Cancel on summary and draft cards (`POST /jobs/{id}/cancel`; `job_id` added to `DraftOut`).*
- [x] **FE-5.1** Document library page: sortable table (name, from, pages, status, OCR, uploaded), filters,
      bulk select, empty state.
- [x] **FE-5.2** Upload dialog:
    - drag and drop several files
    - each file needs an origin tag: our client / another party (DEC-59)
    - errors for disallowed types, oversized files (50 MB, 300 pages) and duplicates
- [x] **FE-5.3** Per-file ingestion progress: Checking file → Scanning for malware → Reading pages 34 of 120 →
      OCR → Indexing. Failed and quarantined states with next steps.
- [x] **FE-5.4** Coverage report: pages read and unreadable, low-confidence OCR pages listed, a link to each page
      (DEC-42).
- [x] **FE-5.5** Hidden-content notice for documents from another party: notice only, a deliberate "View hidden
      content" step, and the Rule 4.4(b) reminder (DEC-59).
- [x] **FE-5.6** Viewer:
      *Partly done: pages, the highlighted passage, the header, coverage, page jump, zoom and find are built; previous / next citation is not.*
    - page rendering in a serif font
    - page jump and zoom
    - search inside the document
    - the cited passage highlighted and scrolled into view
    - previous / next citation
    - a header showing the document, origin tag and coverage
      *Done 2026-10-14: "Citation n of m" with previous and next in the cited-passage band.*
- [x] **FE-5.7** Delete document: a dialog listing exactly what will be removed (DEC-58).

**Demo:** upload 3 files, watch them process, open the coverage report, see the hidden-content notice.

> **Done 2026-10-07**, except previous / next citation in the viewer. Uploads are checked in the browser: the file
> type by its first bytes, the 50 MB limit, and duplicates by SHA-256. Ingestion streams job events for check,
> malware scan, reading pages, OCR and indexing. File names drive the demo edge cases: "eicar" is quarantined,
> "scan" goes through OCR, and over 300 pages is refused. Checks: 24 unit tests and 5 Playwright flows pass, and
> axe finds no violations. Building this phase, axe caught three accessibility bugs, now fixed.

### Phase 6: Summarize [Slice 2]

- [x] **FE-6.1** Summarize from the composer or from a document's menu: template and audience picker (DEC-40,
      DEC-41).
- [x] **FE-6.2** Summary view in the context panel:
    - serif type
    - one section per template field
    - citations
    - missing items shown as "Not found in this document"
- [x] **FE-6.3** Coverage banner at the top; regenerate with a different audience; copy; export .docx (simulated).

**Demo:** summarize the demand letter for the client in plain English, then switch to a detailed digest.

> **Done 2026-10-07.** You can summarize from the chat ("Summarize Acme's demand letter"), from Summarize mode in the
> composer, or from "Summarize…" on a document. If the request names no document, the router asks which one. A
> summary is a background job: its card in the chat shows live progress, and the summary opens in the side panel.
> The panel has the coverage banner, a serif section per template field with citations, "Not found in this
> document" for gaps, and an audience switch that regenerates the summary. Copy includes the sources; "Export to
> Word" saves a privileged working copy (a Word-readable .doc, until the backend's python-docx export exists). A
> template that doesn't fit the document is reported instead of filled with guesses. Checks: 29 unit tests and 7
> Playwright flows pass, and axe finds no violations. Also fixed: the library table now adapts to its width when
> the side panel is open.

### Phase 7: Draft [Slices 3, 5]

- [x] **FE-7.1** Start a draft: choose the incoming document and supporting documents, then write instructions in
      chat (DEC-43).
- [x] **FE-7.2** Draft editor in letter layout (serif). An "AI draft · not reviewed" watermark band stays until
      the draft is adopted (DEC-51).
- [x] **FE-7.3** Placeholders highlighted and clickable: `[PLACEHOLDER]`, `[CITE NEEDED]`, `[RULE NEEDED]`,
      `[UNVERIFIED: …]`; each opens a fill-or-resolve popover (DEC-48).
- [x] **FE-7.4** Refine a section: an instruction box, the regenerated text shown as a before/after diff, accept or
      reject (DEC-44).
- [x] **FE-7.5** Checks tab:
    - point-by-point list of the incoming letter's claims, each addressed ✓ or missing ⚠, and jumping to its
      section (DEC-47)
    - the citation checklist, with a status per authority and an acknowledge checkbox (DEC-49)
- [x] **FE-7.6** Safeguards:
    - addressee check (Rule 4.2)
    - reminder when the other party has no lawyer (Rule 4.3)
    - FRE 408 header switch and reservation-of-rights switch, both off by default
- [x] **FE-7.7** Mark "Reviewed and adopted": a confirmation dialog, then the timestamp is recorded and the
      watermark removed.
- [x] **FE-7.8** Export:
    - Clean .docx is blocked until it is safe, with a checklist of reasons
    - Working copy with sources, stamped "Privileged & confidential"
    - DEC-50
- [x] **FE-7.9** Version history with restore. Memo draft type with `[RULE NEEDED]` blocks (DEC-45).

**Demo:** draft a reply to the demand letter, fix the placeholders, acknowledge the citations, adopt it, export it.

> **Done 2026-10-07.** A draft can be started three ways: from the chat ("Draft a reply to Acme's demand letter",
> or Draft mode with the letter or memo pill), or from "Draft a reply…" on any document from the other side, which
> opens a dialog for the type, the documents to draw on and the instructions. Drafting is a background job with a
> live card in the chat; the draft opens in a wider side panel with two tabs.
> - **Letter (or Memo):** the draft as a page in serif type, with date, delivery line, addressee, Re line and
>   signature, or the memo's To / From / Date / Re block. Every section can be edited by hand or refined with an
>   instruction; a refinement is shown as a word-by-word diff and applied only if accepted.
> - **Tokens:** each placeholder and flag opens a popover offering only the allowed fixes. A fact is filled in. A
>   missing citation gets the lawyer's source or loses its flag. An unverified authority is removed with its
>   sentence or vouched for. Nothing is filled in by the AI.
> - **Checks:** the export checklist, then point by point (each claim answered, drafted on request, or deliberately
>   set aside), the citation checklist with one acknowledgement per authority, and the safeguards (Rule 4.2 / 4.3
>   addressee, FRE 408 header and reservation of rights, both off by default).
> - **Review, versions, export:** "Review and adopt" needs the whole-draft confirmation and is refused by the
>   server while anything is open; any later change returns the draft to "not reviewed". Every change is a new
>   version, and restoring one makes another, so nothing is lost. The clean copy stays locked, with the reasons
>   listed, until the checklist is clear; the working copy with sources is always available and stamped privileged.
>
> The same rules (`src/lib/drafts.ts`) drive the screen and the mock server, so they can't disagree. Checks:
> typecheck, lint and Prettier clean; 47 unit tests and 10 Playwright flows pass, and axe finds no violations.
> First-load JS is 153 KB gzipped (budget 250 KB), including the mock server and its seed data.
> The end-to-end flow caught three real bugs, all fixed: a quick second edit could be overwritten by the first
> one's reply; "Remove the sentence" cut text at "1.5%"; and "Make it firmer" brought back a placeholder the lawyer
> had filled in. A last check against the BRD added the memo's request for authority (DEC-45) and one tick per
> checklist row with the later-history note (DEC-49). See §10 for the decisions taken along the way.

### Phase 8: Settings, trust and system states [Slices 4–5]

- [x] **FE-8.1** Settings: profile, licensing states (DEC-29), security (MFA, timeout), shortcuts, about (app,
      model and prompt versions).
      *Partly done: everything except the model and prompt versions, which `GET /health` doesn't report yet
      (`INTEGRATION_TODO.md` §3).*
      *Done: About shows the AI engine's model and prompt version from `GET /health`.*
- [x] **FE-8.2** "Where your data goes" page: a plain-language diagram of what stays on this computer (DEC-55).
- [x] **FE-8.3** System banners: AI engine offline, session expired, read-only matter, storage almost full.
- [x] **FE-8.4** Error pages: not found, and "something broke" with a reload button and no stack trace.
- [x] **FE-8.5** First-run onboarding: three short steps (create a matter, upload, ask), dismissible.

**Demo:** turn the engine "offline" in the dev panel and watch the app degrade gracefully.

> **Done 2026-10-10**, except the model and prompt versions in About. The frozen API layer was not edited: system
> state comes from the existing `getHealth()`, and the dev controls live in the mock (`src/api/mock`).
> - **System banners:** one strip under the top bar with at most two issues, most serious first: LegalLens not
>   responding, the AI engine, the malware scanner, the background worker, storage almost full. Only the first has
>   "Check again", the storage one can be dismissed, and further issues link to Settings › About. A closed matter
>   shows its own read-only note.
> - **Graceful degradation:** with the AI engine down, every AI action pauses with the same explanation: asking
>   (the typed question is kept), suggested questions, summarize, draft, refine, and the AI actions in the library
>   and the viewer. Reading documents, chats, summaries and drafts still works. With the scanner down, uploads
>   pause, and nothing is stored unchecked.
> - **Session lock (DEC-54):** after 30 minutes idle a "Still there?" dialog counts down the last minute, then the
>   lock screen asks for the password and the 6-digit code again. The page underneath can't be reached by keyboard
>   or screen reader, a reload stays locked, and unlocking returns to the same place. "Lock now" is in the user
>   menu, the ⌘K palette and Settings.
> - **Settings:** profile, licensing states (DEC-29), security (two-step sign-in, automatic lock), keyboard
>   shortcuts, and About (app and backend versions, and the state of every local component).
> - **Shortcuts:** a sheet opened with `?` or from the user menu; the ⌘K palette gained a "Go to" group.
> - **First run:** a new matter shows a three-step guide (the matter, its documents, a first question) with its
>   progress, in place of the suggested questions, until the matter has a document and a chat or the lawyer hides
>   it.
> - **Dev panel** (⌘⇧D, development builds only): switches for the engine, worker, scanner and storage, response
>   speed, "Fail the next request", a 30-second idle lock, an empty matter, and "Reset demo data".
>
> Checks: typecheck, lint and Prettier clean; 56 unit tests and 14 Playwright flows pass (4 new flows), and axe
> finds no violations on the new screens. First-load JS is 154 KB gzipped (budget 250 KB), and the dev panel is not
> in the production build. Screenshot review at 1440 and 1024 px caught six faults, all fixed: "1 documents"; a
> countdown that said "1 minute" for 30 seconds; two "Check again" buttons doing the same thing; a lock screen that
> screen readers could see past; a toast naming a document shown over the lock screen; and "(1.2 GB free (2%))" in
> the storage banner. See §10 for the decisions taken along the way.

### Phase 9: Polish and proof

- [x] **FE-9.1** Accessibility audit: axe clean, a keyboard-only pass of every flow, a screen-reader pass on the
      chat.
- [x] **FE-9.2** Performance pass in large-data mode: bundle size, virtualisation, streaming frame rate.
- [x] **FE-9.3** Responsive pass at 1920, 1440, 1280, 1024, 768 and 390 px.
- [x] **FE-9.4** Microcopy review against §2.4; every empty, loading and error state reviewed.
- [x] **FE-9.5** Playwright flows:
    1. sign in
    2. ask and verify a citation
    3. upload and see coverage
    4. summarize
    5. draft, review and export
    6. delete a matter

    *Partly done: flows 1 to 5 run in Playwright; "delete a matter" waits for matter deletion in the API layer
    (INT-3.1) and the dialogs of FE-3.9.*
      *Done: the Playwright suites cover these flows (55 tests; `e2e-real` runs 10 flows against the real backend).*
- [x] **FE-9.6** Screenshots of every main screen for the course write-up and the Technical Architecture doc.

**Demo:** a full walkthrough from sign-in to an exported letter, with every test green.

> **Done 2026-10-10**, except the "delete a matter" flow (FE-9.5), which needs matter deletion in the API layer.
> The frozen API layer was not edited.
> - **Responsive (FE-9.3):** three panes from 1280 px. From 1024 to 1279 px the side panel covers the conversation
>   as a modal sheet; below 1024 px the sidebar becomes a drawer opened from the top bar. On a phone the panel is
>   full width, and the library, the draft header and Settings rearrange. No screen scrolls sideways at 390 px.
> - **Performance (FE-9.2):** large-data mode in the dev panel adds 2,000 chats and 200 documents. The chat list
>   and the library table are virtualised, and ⌘K shows a shortlist. Measured in the development build at 1440 px:
>
>   | Step | Main-thread blocking before | After | DOM nodes before → after |
>   | --- | --- | --- | --- |
>   | Load the data | 1,564 ms | 57 ms | 18,399 → 520 |
>   | Search chats | 2,123 ms | 15 ms | |
>   | ⌘K, type "late fee" | 1,787 ms | 15 ms | |
>   | Open the library (212 documents) | 753 ms | 24 ms | 24,556 → 968 |
>   | Stream an answer | 1,702 ms; 43 fps, worst frame 833 ms | 65 ms; 58 fps, worst frame 83 ms | |
>
>   First screens on the production build, cold, median of three: sign-in 261 ms, matters 216 ms, a new chat
>   915 ms and a chat with an answer 910 ms, including the mock's simulated network delay (target 1.5 s).
>   First-load JS is 154 KB gzipped (budget 250 KB).
> - **Accessibility (FE-9.1):** an axe sweep of 26 screens, menus and dialogs; keyboard-only tests for sign-in, the
>   skip link, asking and opening a citation, ⌘K and the draft tabs; a focus-ring check across four pages; and a
>   review of the chat's accessibility tree and live regions. Every finding was fixed (§10).
> - **States and copy (FE-9.4):** no exclamation marks, filler or planning IDs on screen; fixed phrases come from
>   `copy.ts`. Each panel has its own error boundary. A failed load now says so, with Try again, instead of
>   claiming the item was deleted, and data already on screen stays when a refresh fails.
> - **Flows and screens (FE-9.5, FE-9.6):** flows 1 to 5 run in Playwright, and the upload flow now opens the
>   coverage report. 25 screenshots are in `architecture/screens/`, taken by `npm run screenshots`.
>
> Checks: typecheck, lint and Prettier clean; 59 unit tests and 51 Playwright tests pass, twice in a row, and axe
> finds no violations. See §10 for the decisions and the faults found.

---

## 8. State checklist

Every screen is reviewed against this list before its phase is done.

| State | Example |
| --- | --- |
| Loading | Skeleton rows in the sidebar; the status steps in an answer |
| Empty | No matters yet; no documents yet; a new chat |
| Partial | A partially found answer; some pages unreadable |
| Not found | "Not found in your documents", with what was searched |
| Error | A call failed (retry); a file was rejected (reason + fix) |
| Streaming | Caret, Stop button, the composer locked against a second send |
| Background | Job card progress; ingestion progress |
| Read-only | Closed matter; adopted draft |
| Blocked | Export blocked, with the list of reasons |
| Offline | Local AI engine not running |

---

## 9. Decisions (all approved 2026-10-06)

1. **Light theme only**, with the warm-neutral and ink-navy palette in §2.2. Dark mode stays possible later.
2. **Tailwind + Radix** as the component foundation (instead of Material UI or a paid kit).
3. **Mock pages instead of real PDFs** in the viewer for now; PDF.js is added when the backend serves files.
4. **Desktop-first:** fully designed for 1280 px and up, working at 1024 px, usable on a phone.
5. **Playwright** for end-to-end tests (it adds a browser download of about 100 MB on first install).
6. **Files live in `LegalLens/frontend/`**, which replaces the default scaffold created earlier.

---

## 10. Decision and change log

Every change to this plan after approval, and every decision the plan left open, with the date and the reason.
Newest first. DEC IDs refer to IDEAS.md.

### 2026-10-11 · Integration (INTEGRATION_TODO Phases 3 to 5)

| # | Change | Why |
| --- | --- | --- |
| 1 | FE-2.1 and FE-2.2 are covered by the integration: `types.ts`, `ApiClient` and the query hooks now mirror the real API, with a generated wire schema. | Integration Phases 2 and 3. |
| 2 | FE-3.8 and FE-3.9 are built: new and edit matter dialog (three steps, AI consent), close, export and delete with an export prompt and the typed name. | The matter endpoints exist; the owner asked for them before the end-to-end phase. |
| 3 | The checklist, export gate and Word files come from the server. `lib/drafts.ts` keeps display helpers; the mock's versions moved to `api/mock/draftChecks.ts` and `exportWord.ts`. | Integration decisions 1, 2 and 5. |
| 4 | The token grammar now matches the backend's (`[PLACEHOLDER: …]` too). | The real end-to-end run found tokens the server blocked on that the screen didn't show. |
| 5 | An http build no longer contains the mock: `main.tsx` imports it only in mock mode. | INT-5.1 follow-up from Phases 0 and 8. |
| 6 | Settings saves licensing states on the server. The session timeout follows the server. A "Stand-in answers" badge shows while the engine is the stub. | INT-3.7, INT-3.9, INT-3.10. |

### 2026-10-10 · Phase 9, Polish and proof

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | Layout by width: three panes from 1280 px; from 1024 to 1279 px the side panel covers the conversation; below 1024 px the sidebar is a drawer opened from the top bar. On a phone the panel is full width, the logo, search box and "Runs locally" text give way, the library shows status under each name, and the draft's actions take their own row. | FE-3.6 asks for an overlay below 1280 px and §6 for drawers on a phone. Baseline screenshots at 390 px showed the conversation crushed to a sliver. |
| 2 | The overlay and the drawer are modal dialogs: focus stays inside, and Esc or a click outside closes them. A field that uses Esc itself (find, chat search with text in it, renaming a chat) is marked `data-own-escape` and keeps it. | A non-modal overlay would leave the covered conversation reachable by keyboard behind it. Without the marker, Esc in the find box closed the whole document. |
| 3 | When the side panel closes, focus returns to what opened it, in both layouts. The drawer and the overlay focus themselves on opening, not their first button. | The new tests found focus dropped to the page (WCAG 2.4.3), and screenshots showed the first button's tooltip popping up uninvited. |
| 4 | Beside the conversation the side panel is capped so the conversation keeps at least 440 px. | At 1280 px an open draft left 330 px, too narrow for the composer. |
| 5 | The workspace and Settings grids have an explicit `minmax(0, 1fr)` column. | An automatic column grew to the top bar's content, so the page was wider than a phone and the matter name never shortened. |
| 6 | Large-data mode in the dev panel: 2,000 chats and 200 documents, generated from a fixed seed. Measured in the development build, so real numbers are lower. | §4 and DEC-14 ask for it. The dev panel exists only in development builds. |
| 7 | Lists over 100 items are virtualised: the chat list and the library table (with spacer rows, and `aria-rowcount` and `aria-rowindex` so screen readers still hear "row 57 of 213"). ⌘K shows the 8 latest chats and 6 latest documents, then up to 25 and 15 matches for every word typed. | §6. Before: up to 2.1 s of blocking per action, 24,556 DOM nodes, and streaming at 43 fps. FE-3.4 had been ticked with a virtualised list that wasn't built; this corrects the record. |
| 8 | Scroll areas are held in state, not refs. | A parent's ref is attached after its children's effects run, so the virtualiser found no scroll area at first and the library sat empty for 8.6 s, until an unrelated update. The sidebar had the same fault, hidden by its frequent updates. |
| 9 | The lint warning `react/incompatible-library` is suppressed on the two virtualiser calls, with the reason in the code. | It concerns the React Compiler, which this build doesn't use. |
| 10 | Menus (matter switcher, account, document options) are non-modal. | axe found `aria-hidden-focus`: a modal menu hid the page from screen readers while its controls stayed focusable. Non-modal is the WAI-ARIA menu-button pattern. |
| 11 | Other accessibility fixes: the answer's action row is at full strength (its "What was searched" text fell below 4.5:1 at 70% opacity); the chat search shows the focus ring; the conversation can take focus from the skip link; only the answer text is busy while streaming, so the progress steps are announced; source cards are announced like citation chips ("Source 1: …, page 6, §4.2(a)", from one `citationLabel()`). | Found by the axe sweep, the keyboard tests and the accessibility-tree review. |
| 12 | The screen-reader pass was an automated review of the chat's accessibility tree and live regions, not a session with VoiceOver or NVDA. | Neither can be driven from this environment. A person should do a VoiceOver pass on the chat before release. |
| 13 | The sidebar, the page and the side panel each have an error boundary. A failure stays in its panel, and clears on Try again, on navigating, or when something else is opened. | §6: one failure must never blank the app. Before, any panel failure replaced the whole screen. |
| 14 | "isn't available, may have been deleted" is shown only when the matter's list loaded without the item; any other failure says the item couldn't load, with Try again. Data already on screen stays when a refresh fails, and the banner reports the outage. | The outage test showed a failed load reported as a deleted chat, and loaded documents hidden behind an error. Once the HTTP client reports status codes (INT-3.8), a 404 can decide this directly. |
| 15 | Dev panel switch "LegalLens not responding": every mock request fails, the health check included. | One failed request is retried without the lawyer noticing, so the error states could not otherwise be seen. |
| 16 | A read-only matter details page replaces the placeholder, linked from the matter switcher. Editing waits for INT-3.1. The development-only UI gallery still uses the placeholder (FE-1.4). | The placeholder showed "FE-3.8" on screen. |
| 17 | FE-9.5 flow 6, "delete a matter", is not built. The upload flow now also opens the coverage report. | Deleting a matter needs an API method the frozen layer doesn't have (INT-3.1) and FE-3.9's dialogs. |
| 18 | The screenshot script is kept as `npm run screenshots`, and hides toasts. Throwaway measurement scripts live in the git-ignored `frontend/.scratch/`; their results are recorded above. | The screens can be taken again for the write-up; the demo's background notices would otherwise cover them. |
| 19 | The browser tests share `e2e/helpers.ts` (axe and the dev panel), and new suites cover accessibility, the keyboard, performance and narrow screens. | Three files had their own copies of the same helpers. |

### 2026-10-10 · Phase 8, Settings, trust and system states

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | Tasks pulled into Phase 8: FE-3.2 (session lock), the shortcuts sheet from FE-3.7, the read-only banner from FE-3.9, and the dev panel and reset from FE-2.6. | The phase demo needs the dev panel; Settings' Security and Shortcuts sections need the lock and the sheet; FE-8.3 lists the read-only banner. |
| 2 | Phase 8 did not edit the frozen API layer (entry 3 of the 2026-10-10 decisions). It reads system state through the existing `getHealth()`; the dev controls and the new mock behaviour are in `src/api/mock` only. | Integration owns those files. Checked before sign-off: `events.ts` and `lib/drafts.ts` still match their freeze hashes, and `types.ts`, `client.ts` and `queries/health.ts` last changed in integration Phase 0, before this phase began. |
| 3 | "Session expired" is the lock screen, not a banner. After 30 minutes idle (DEC-54) a dialog counts down the last minute (a third of the timeout when that is shorter), then the lock asks for the password and the 6-digit code again. The lock is kept in `sessionStorage`, so a reload stays locked, and the page underneath is made `inert` and hidden from assistive technology. | A banner would leave privileged documents on screen. Radix's dialog hides the rest of the page from screen readers but keeps live regions such as toasts and banners audible; the review found it, and `inert` closes the gap. The server's own 401 `session_expired` will open the same screen (INT-3.7). |
| 4 | The idle timer runs in the browser with the 30-minute default. | The timeout comes from `/auth/me` in INT-3.7, and the frozen types don't carry it yet. |
| 5 | Licensing states are kept in this browser (`localStorage`). | The backend stores `user.licensing_states` but has no endpoint to change them. Added to `INTEGRATION_TODO.md` §3 as a backend row. |
| 6 | The "storage almost full" banner works in the demo only. | `GET /health` has no storage component yet. Added to `INTEGRATION_TODO.md` §3. |
| 7 | About shows the app and backend versions, not the model and prompt versions FE-8.1 asks for, so FE-8.1 stays open. | `GET /health` doesn't report them; the backend records them on each answer and draft. Added to `INTEGRATION_TODO.md` §3. |
| 8 | With the AI engine down, every AI action is disabled with one explanation, and the composer keeps the typed question; reading stays available. With the scanner down, uploads pause, though files can still be chosen. The Segmented control gained a disabled state for this. | Fail visibly before the lawyer starts, not halfway through. The server refuses a file it can't scan (503), so the dialog says so first. |
| 9 | At most two banners show, most serious first. Only the first has "Check again", the storage banner can be dismissed, and the rest are counted with a link to Settings › About. | Five stacked banners would push the work off screen, and screenshot review found two "Check again" buttons doing the same thing. |
| 10 | The first-run guide appears inside a matter, so its first step, "Create the matter", is always done. It replaces the suggested questions until the matter has a document and a chat, or the lawyer hides it (remembered). | The new-matter dialog (FE-3.8) isn't built, and creating a matter needs INT-3.1. In the demo, the dev panel's "Add an empty matter" shows the guide. |
| 11 | The dev panel is loaded only in development builds (`import.meta.env.DEV`) and opens with ⌘⇧D. Its mock actions are registered per client instance. | React StrictMode creates the client twice in development, and an action registered on the discarded one did nothing. The production build was checked: the panel isn't in it, though the mock client still is until INT-5.1. |
| 12 | Browser tests drive the idle lock with Playwright's clock (`page.clock`), and retry the dev-panel shortcut until the panel opens. | Waiting 30 real minutes is impossible and 30 real seconds is slow and flaky; the shortcut can arrive before the lazily loaded panel. |
| 13 | The app version comes from `package.json` at build time (`__APP_VERSION__`). | About can show it without a request. |
| 14 | Demo data still lives in memory; FE-2.6's `localStorage` persistence is not built. | "Reset demo data" is a reload. No Phase 8 demo needs persistence, and it would need versioning of the seed data. |
| 15 | No toasts show while LegalLens is locked, and any raised then are dropped rather than shown on unlock. | The 1024 px review found "Exhibit B – Statement of Work.docx is ready to search" over the lock screen: toasts name documents. A unit test locks the app and checks no toast shows; it fails without the fix. |

### 2026-10-10 · Integration decisions approved

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | The owner approved all ten decisions in `INTEGRATION_TODO.md` §4, unchanged. | They reconcile the frontend with the built backend before the two are connected. |
| 2 | The citation checklist lists legal authority only: cases, statutes, rules and regulations. Contract clauses and letters the draft quotes keep their source citations in the letter but are no longer rows. This replaces Phase 7 decision 5, and the "later amendments" note for clause rows goes with it. | Integration decision 1: a quoted clause is evidence, not authority, as DEC-49 describes. It also matches the backend's `GET /drafts/{id}/checks`. |
| 3 | The frontend's API layer is frozen: `src/api/types.ts`, `client.ts`, `events.ts`, `src/api/queries/*` and `src/lib/drafts.ts`. The integration work owns these files until its Phase 3 ends; frontend phases 8 and 9 don't edit them. | Integration precondition 1: two sessions must never edit the API layer at once. |
| 4 | Integration Phase 0 changed frontend tooling: `node_modules` lives in `node_modules.nosync` behind a link, with a `postinstall` relink; `test:e2e` runs Playwright through `node` with `--preserve-symlinks`; browser tests use their own mock server on port 5174; `npm run dev:http` and `npm run api:types` were added; the sign-in page shows the data source in development builds. | Logged with reasons in `INTEGRATION_TODO.md` §7; the frontend checks all still pass. |

### 2026-10-07 · Phase 7, Draft

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | The draft rules live in one module, `src/lib/drafts.ts` (token grammar, citation checklist, export gate, word diff, token fixes), used by both the screen and the mock server. | The server must refuse what the screen hides (DEC-50, DEC-51). One module means the two can never disagree, and the backend can port it as is. |
| 2 | Draft edits, review and export for one draft go through a single ordered queue (TanStack Query mutation `scope`). Edits show at once, and only the reply to the last pending change is applied. | The end-to-end flow showed a quick second edit being overwritten by the first edit's reply, and "Adopt" reaching the server before the last edits. |
| 3 | A source the lawyer names, or an authority they vouch for, joins the checklist as "Added by you" and needs its own tick like every other row. Every row says later history wasn't checked ("later amendments" for contract sections). | DEC-49 says export stays blocked until *each* row is acknowledged. A first version ticked the lawyer's own sources automatically and showed the note on some rows only; the BRD cross-check before sign-off caught both. |
| 4 | An "UNVERIFIED" authority can't be ticked in the checklist; it has to be resolved in the letter first (removed or vouched for). | A tick must not hide an authority no document supports (DEC-48). |
| 5 | Facts cited from letters (the incoming demand, emails) are sources, not authorities, so they are not in the citation checklist. Contract sections are. | The checklist is for law and contract terms the lawyer relies on (DEC-49); listing every quoted fact would bury them. **Superseded 2026-10-10:** see the entry of that date. |
| 6 | A claim in the incoming letter can be "set aside": the lawyer deliberately leaves it unanswered, with undo. It clears that item in the export gate. | DEC-47 requires every claim to be dealt with, not necessarily answered; some points are better left alone. |
| 7 | Starting a draft from a document uses a dialog (type, documents to draw on, instructions). The chat route from FE-7.1 also works. | The dialog makes the incoming and supporting documents explicit before the job starts; "Draft a reply…" appears only on documents from the other side. |
| 8 | The draft panel is wider than the document panel (up to 760 px, 52% of the window). | A letter is read and edited there. At 800 px the chat column became too narrow for the composer, so it was reduced. |
| 9 | Section tools (Edit, Refine) sit in the page margin as labelled icon buttons, shown on hover and always reachable by keyboard. | The first version covered the text it was editing. Hidden controls must stay in the tab order (WCAG 2.1.1). |
| 10 | A refinement keeps what the lawyer already filled in or resolved in that section. When no better wording can be produced, the request is refused with a message instead of returning the same text. | Found in the flow test: "Make it firmer" brought back a filled placeholder (DEC-44). |
| 11 | The FRE 408 switch shows "Suggested" when the letter proposes talks, but stays off until the lawyer turns it on. | DEC-46 requires both safeguards to be off by default; the hint helps without deciding for the lawyer. |
| 12 | The reservation-of-rights sentence and the signature line come from one function, with the client's name taken from the matter. | The editor showed "Counsel for …" and the export didn't; one source prevents that. |
| 13 | Exports are Word-readable `.doc` files (HTML with the Word MIME type), as for summaries. | Real `.docx` comes from the backend's python-docx export; the browser alone can't produce it cleanly. |
| 14 | The demo drafts only replies to the Whitfield & Crane demand letter; other documents get a clear message saying so. | Drafts are scripted mock content; a vague failure would look like a bug. |
| 15 | The workspace grid now fixes its row height to the window, and the document viewer's page area is focusable. | Panels were growing past the window, so the whole page could scroll. Fixing that made the viewer scroll on its own, and axe then required it to be reachable by keyboard. |
| 16 | Internal references ("DEC-48", "DEC-42") were removed from on-screen text. Fixed phrases now come from `src/lib/copy.ts`. | Users shouldn't see planning IDs; the code rule in §5 already required shared phrases. |
| 17 | New primitives: Switch and Tabs (FE-1.2). Checkbox gained a disabled state. The start dialog uses a plain styled textarea because the Textarea primitive is still a stub. | Needed by the safeguards, the panel tabs and the checklist. Textarea is listed as open under FE-1.2. |
| 18 | Choosing "Internal memo" shows a notice before drafting: law comes only from uploaded opinions, statutes or regulations, with a link to upload the governing authority first. | DEC-45 asks the lawyer for the authority before a memo is drafted. Showing which issues lack it is left to the drafted memo's [RULE NEEDED] blocks until the backend can analyse the issues. |

### 2026-10-07 · Phases 5 and 6, Documents and Summarize

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | The library table adapts to its own width (CSS container queries), not the window's. | With the side panel open the table is narrow on a wide screen; window breakpoints crushed its columns. |
| 2 | Scrolling to a cited passage moves only the viewer pane. | `scrollIntoView` also scrolled the page around it. |
| 3 | Citations show pinpoint labels: §4.2(a) for contracts, ¶3 for letters, Sch. 2 for schedules. | Raw anchors such as "¶sch2-provider" were showing; lawyers cite by section and paragraph (DEC-36). |
| 4 | A citation chip is bound to the word before it, so it never wraps onto a line by itself. | Found in screenshot review. |
| 5 | A summary request that names no document gets a question back ("Which document?") instead of a guess. | DEC-21 / DEC-37: grounded or not found, never guessed. |
| 6 | A template that doesn't fit the document is reported, not filled with guesses. | Same principle; seen with a court-opinion template on a letter. |
| 7 | Summaries export as a privileged working copy in Word-readable `.doc`. | As decision 13 above. |
| 8 | End-to-end tests run with reduced motion. | axe flagged contrast on text caught mid-fade; the app already honours reduced motion. |

### 2026-10-06 · Phase 0 and the design pass

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | The visible core was built ahead of phase order (see the design pass note at the top). | The owner saw the Phase 0 placeholders and asked for a high-end look straight away. |
| 2 | Tailwind's default colour palette is switched off; only the approved tokens exist. | Enforces "no one-off colours" (§6) at build time. |
| 3 | Answers are rendered by a small parser (paragraphs, lists, bold, `[n]` citations) that outputs text nodes only. `react-markdown` and `remark-gfm` are installed but not used yet. | It controls where citation chips sit, and there is no HTML path at all (§5). Revisit if answers need tables or headings. |
| 4 | `react-resizable-panels` and `@tanstack/react-virtual` are installed but not used yet. | They belong to FE-3.6 (resizable panel) and FE-4.9 / FE-9.2 (virtualised lists), which are still open. |
| 5 | Fonts are bundled with `@fontsource-variable`, and there is no CDN or analytics. | DEC-56: no third-party network calls. |

