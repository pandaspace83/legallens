# LegalLens on the App Store: step by step

> **Status:** AS-0 decided 2026-11-01 (DEC-97 to DEC-102); AS-1 done 2026-11-03; next is AS-2 · **You do it, Claude guides.**
> IDs: `AS-<phase>.<n>`. Builds on [PHASE2_TODO.md](PHASE2_TODO.md) (Claude behind a setting) and
> [AZURE_TODO.md](AZURE_TODO.md) (hosting). Decisions that bind it: DEC-08 and DEC-94 (what may leave the machine),
> DEC-73 and DEC-95 (no real client data), DEC-96 ($5 cap), DEC-68 (no document text in logs).

## Why this is more than "wrap the app"

LegalLens today is one computer: the React app, the FastAPI backend, the models (Ollama, bge-m3, the reranker,
Docling) and one SQLite file. An iPhone cannot run that backend, so the iPhone app is a **client of a backend that
runs somewhere else**. Three things change before any Xcode work:

1. **Where the backend runs and which model answers.** Hosting is AZURE_TODO; the model is Claude (PHASE2_TODO),
   because Ollama on a cloud GPU costs far more than the $5 cap allows.
2. **How the app talks to the backend.** The web app assumes one origin: cookie sign-in (`credentials:
   'same-origin'`), answers read over `fetch` (`sse.ts`), and matter events over `EventSource`. Inside an iOS app the
   web code runs from its own origin (`capacitor://localhost`), where the backend's cookie is a third-party cookie
   and `EventSource` cannot send a token. Sign-in and both streams need rework.
3. **Who may use it.** The App Store is public. DEC-94 says Claude in LegalLens is not for use with clients, and
   DEC-95 allows only public or synthetic documents, but anyone who installs it could upload a real client file.

## The parts of an end-to-end iPhone app

| Part | Today | Needed for the App Store |
| --- | --- | --- |
| UI | React app with phone and tablet layouts (screens 22 to 25) | The same UI inside a native shell, plus native touches: file picker, Face ID, safe areas |
| Backend | `legallens serve` on 127.0.0.1 | Hosted, HTTPS, always reachable, one replica (SQLite has one writer) |
| Models | Ollama on this Mac | Claude through `models/llm.py`; embeddings and reranker run inside the backend container (DEC-94 keeps them off third parties) |
| Sign-in | Dev mode by default; real mode built (argon2id, TOTP, lockout) | Real mode only, a token kept in the iOS Keychain, an account for App Review |
| Accounts | One workspace, users made with `legallens user create` | Invite-only or sign-up; sign-up in the app requires delete-my-account in the app |
| Privacy | "Where your data goes" screen, AI consent record (DEC-60) | A public privacy policy URL, App Store privacy labels, a privacy manifest, consent before anything reaches Claude |
| Distribution | GitHub, `localhost` | Apple Developer Program, App Store Connect, TestFlight, App Review |
| Money | $5 cap (DEC-96) | Apple's $99 a year, hosting and Claude calls: the cap needs a new decision |

## How we work

- **One step at a time.** Claude says what to do, why, what it costs and the check that proves it. You do the step
  (Apple, Azure and Anthropic accounts are yours, and so is the money); Claude reviews and runs the checks.
- **Hard steps say "Claude can build".** Ask, and Claude writes it while you review the diff.
- **Each phase names the model that fits it.** You switch it (the app's model picker, or `/model` in a terminal);
  Claude says when to switch and when to switch back.
- **Money first.** Anything billable states the estimate and waits for your yes.
- **No real client data (DEC-73, DEC-95)** holds at every stage, including TestFlight testers.

## AS-0: Decide first (nothing is created or paid) · Opus

- [x] **AS-0.1 What is the App Store goal?** **(a) TestFlight demo:** invited testers only (up to 10,000), a light
      review, builds expire after 90 days; you decide who gets in, so DEC-94 and DEC-95 hold. **(b) Public listing,
      demo only:** anyone can install it and signs in to the synthetic sample matter; upload limited or off.
      **(c) A product for real lawyers:** needs DEF-23's conditions (zero data retention with the model provider,
      client consent), terms of service, a company, and lifting DEC-73; a separate project. Claude recommends (a),
      then (b) once (a) works. *Output:* a new `DEC-nn`.
      *Decided 2026-11-01: (a), a TestFlight demo first (DEC-97).*
- [x] **AS-0.2 Money.** Apple Developer Program: $99 a year. Hosting: AZURE_TODO's estimate for the chosen target.
      Claude calls: DEC-96's figures. The $5 cap cannot cover the Apple fee. Pick: **(a)** a new total for this phase,
      or **(b)** the Apple fee sits outside the cap and the $5 still covers Claude and cloud. *Output:* a `DEC-nn`
      that amends DEC-96.
      *Decided 2026-11-01: (b), the Apple fee sits outside the cap (DEC-98).*
      *Amended 2026-11-04: the $5 covers Claude calls only; cloud hosting gets its own budget at AZ-0.1 (DEC-103).*
- [x] **AS-0.3 Native shell.** **(a) Capacitor:** the React app runs inside a native iOS app; nearly all code and tests
      are reused, and native plugins add what a website can't. **(b) SwiftUI:** a native app on `openapi.json`; the
      best feel, but a second UI to build and test. Apple rejects apps that are only a website in a frame (guideline
      4.2), so (a) needs the native touches in AS-4.2. Claude recommends (a). *Output:* a `DEC-nn`.
      *Decided 2026-11-01: (a), Capacitor (DEC-99).*
- [x] **AS-0.4 Developer account type.** **Individual:** your legal name shows as the seller; usually approved within
      a day or two. **Organization:** a company name; needs a legal entity and a D-U-N-S number, and takes longer.
      Apple asks apps in highly regulated fields, or that handle sensitive data, to come from an organization. Legal
      services are not on its named list, but a matter's documents are sensitive; Individual fits goals (a) and (b),
      goal (c) needs Organization. *Output:* your choice.
      *Decided 2026-11-01: Individual (DEC-100).*
- [x] **AS-0.5 iPhone only, or iPad too?** iPad adds a screenshot set, a layout to test and more review surface.
      Claude recommends iPhone only for 1.0. *Output:* your choice.
      *Decided 2026-11-01: iPhone only (DEC-101).*
- [x] **AS-0.6 Accounts.** **Invite-only:** you create each user with `legallens user create`; nothing in the app
      creates an account. **Sign-up in the app:** Apple then requires delete-my-account in the app (AS-3.6). Goal (a)
      needs only invite-only. *Output:* your choice.
      *Decided 2026-11-01: invite-only (DEC-102), so AS-3.6 is not needed.*

## AS-1: Tools on this Mac · Sonnet

- [x] **AS-1.1 Install Xcode** from the Mac App Store. Size: about 3 GB to download and roughly 15 to 20 GB on disk
      once an iOS simulator is added (this Mac has about 100 GB free). Then point the developer tools at it:
      `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` (today they point at the Command Line Tools).
      *Check:* `xcodebuild -version` prints a version.
      *Done 2026-11-03: Xcode 27.2, developer tools point at it.*
- [x] **AS-1.2 Add the iOS platform and a simulator** (Xcode, Settings, Components). *Check:* `xcrun simctl list
      devices available` lists an iPhone.
      *Done 2026-11-03: iPhone simulators listed.*
- [x] **AS-1.3 Sign in to Xcode with your Apple Account** (Settings, Accounts). A free Personal Team can run apps on
      your own iPhone (they stop after 7 days) before you pay anything. *Check:* Xcode's blank iOS app template runs
      on your iPhone.
      *Done 2026-11-03: the blank app showed "Hello, world!" on the iPhone (Developer Mode on, Personal Team).*

## AS-2: A backend a phone can reach · Sonnet, Opus for AS-2.3

- [ ] **AS-2.1 Claude behind the setting:** PHASE2_TODO CN-2.1 to CN-2.5 (key, `ClaudeChat`, cost guard,
      provider-aware outbound test, first real call). *Check:* CN-2.5's check.
- [ ] **AS-2.2 Hosting:** AZURE_TODO AZ-0 to AZ-5, with three changes for a phone: `LEGALLENS_AUTH_MODE=real` (dev
      sign-in accepts any password); a public HTTPS address (an IP allow-list blocks a phone on cellular); and memory
      for the embedding and reranker models, measured before choosing the size. *Check:* `/api/v1/health` returns 200
      from your iPhone's browser on cellular, and a dev-mode sign-in is refused.
- [ ] **AS-2.3 Security review before it faces the internet.** The backend was built for 127.0.0.1. Review sign-in
      rate limits and lockout, upload limits, headers, CORS, TLS, dependency scan, and logs (DEC-68: no document text).
      *Check:* a written review; each finding fixed or accepted with a reason.
- [ ] **AS-2.4 Backups on the hosted copy** (`legallens backup create` to storage outside the container). *Check:* a
      restore drill on a fresh instance.

## AS-3: App changes for a phone client · Opus to design, Sonnet to build

- [x] **AS-3.1 A configurable API address.** The client's `BASE` comes from the build (for example
      `VITE_API_BASE`), not from the page's origin. *Check:* the web build still works same-origin; an iOS build calls
      the hosted address.
      *Done 2026-11-06: `VITE_API_BASE` sets the address at build time; unset, nothing changes. A hosted address also
      needs AS-3.2 (token sign-in) and AS-3.4 (CORS) before a phone can use it.*
- [x] **AS-3.2 Sign-in without same-origin cookies.** *Claude can build.* Designed 2026-11-06 as DEC-104: login
      with `session_transport: "bearer"` returns the token in the body and sets no cookie; the app sends it as
      `Authorization`, which, when present, is the only credential read; the cookie path is unchanged; the CSRF header
      stays on every write; no token in any URL. The Keychain plugin is wired at AS-4.1. *Check:* backend tests for
      both paths (header wins with no cookie fallback, no token before MFA, sign-out ends a bearer session, `?token=`
      ignored, CSRF still required) and frontend tests that the header is sent. At AS-4: the app stays signed in after
      quitting within the 30-minute idle limit, and sign-out clears the Keychain.
      *Built 2026-11-06: backend and frontend, with 9 backend and 6 frontend tests. The Keychain store and the
      "stays signed in" check wait for AS-4.1. Matter events used `EventSource` until AS-3.3.*
- [x] **AS-3.3 Streams with the token.** Answers already stream over `fetch` in `sse.ts`; move matter events off
      `EventSource` onto the same reader, keeping resume with `Last-Event-ID` (decision 7). *Check:* an Ask streams on
      an iPhone on cellular, and a dropped connection resumes.
      *Built 2026-11-07: `subscribeMatterEvents` reads over `readSse` (Authorization header, `Last-Event-ID` resume,
      retries without limit while the page listens, stops on unsubscribe). Tests cover the bearer header, the resume
      and the stop. The cellular check waits for AS-4.*
- [x] **AS-3.4 CORS for the app's origin only** (`capacitor://localhost`). *Check:* a request from any other origin
      is refused.
      *Built 2026-11-07: setting `LEGALLENS_CORS_ORIGINS` (default `["capacitor://localhost"]`); outermost middleware;
      allows Authorization, Content-Type, X-LegalLens-Request, Idempotency-Key and Last-Event-ID; never credentials or
      `*`; exposes Content-Disposition and X-Request-ID. Other origins get no CORS headers and a 400 on preflight.*
- [x] **AS-3.5 Consent before anything reaches Claude.** Apple asks apps to say which third-party AI receives
      personal data and to get permission first (guideline 5.1.2). Show "Where your data goes" before the first upload
      or question and store the answer in the AI consent record. *Check:* a new account cannot send anything to
      Claude before agreeing.
      *Built 2026-11-07 as DEC-105: a full-screen "Where your data goes" agreement (tick box, Agree, or Sign out) shown
      while Claude is the provider and the account has not agreed; stored on the user with a wording version; the
      server answers 403 `ai_consent_required` on send, summarize, regenerate and both proposals until then. Also
      fixed: the UI's Sign out now ends the session on the server (it only navigated before). The wording is a
      draft for the lawyer to approve.*
- [x] **AS-3.6 Delete my account** (only if AS-0.6 chose sign-up): removes the user, their matters, documents and
      embeddings, and says what happens to backups. *Check:* a test proves the rows and files are gone.
      *Not needed 2026-11-01: accounts are invite-only (DEC-102).*
- [ ] **AS-3.7 A way in for App Review.** A review account on the synthetic sample matter, in real mode, with TOTP
      off for that account only. *Check:* a fresh simulator signs in using only what goes in the review notes.
- [ ] **AS-3.8 "Not legal advice."** The first-run guide and each answer and draft say a lawyer must review them.
      *Check:* both visible on a phone.

## AS-4: The iOS shell (Capacitor) · Sonnet

- [ ] **AS-4.1 Add Capacitor** to `frontend/` (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`), run `npx cap
      init` with the app name and a bundle ID such as `com.<you>.legallens` (it can't change after the first upload),
      then `npx cap add ios`, which creates `frontend/ios/`. *Check:* `npx cap run ios` shows the sign-in screen in the
      simulator.
- [ ] **AS-4.2 Native touches.** The iOS document picker for PDF and DOCX, "Open in LegalLens" from Files and Mail,
      Face ID for the lock screen (screen 20), safe areas, and the keyboard not covering the composer. *Check:* upload
      a synthetic PDF from Files on your iPhone.
- [ ] **AS-4.3 Icon and launch screen.** A 1024 × 1024 icon with no transparency. *Check:* the home screen shows it.
- [ ] **AS-4.4 Info.plist.** Display name, `NSFaceIDUsageDescription`, and `ITSAppUsesNonExemptEncryption = NO`
      (true while the app itself uses only HTTPS; confirm in this step). *Check:* Xcode builds with no warnings about
      them.
- [ ] **AS-4.5 Privacy manifest** (`PrivacyInfo.xcprivacy`): the data the app collects and any required-reason APIs
      the app or its plugins use. *Check:* Xcode's privacy report for an archive shows no gaps.
- [ ] **AS-4.6 Test on a real iPhone.** Vitest and the Playwright flows at phone size, then
      [HUMAN_TEST_CHECKLIST.md](test-evidence/HUMAN_TEST_CHECKLIST.md) on your iPhone over cellular. *Check:* results
      recorded in `test-evidence/`.

## AS-5: Apple accounts · Sonnet (you do the clicking)

- [ ] **AS-5.1 Enroll in the Apple Developer Program** (developer.apple.com/programs/enroll), two-factor sign-in on
      your Apple Account, $99 a year (only after AS-0.2). *Check:* the Membership page shows it active and your Team ID.
- [ ] **AS-5.2 Agreements.** Accept any pending agreements in App Store Connect (Business). A free app needs no tax or
      banking details. *Check:* nothing pending.
- [ ] **AS-5.3 Signing.** Xcode's automatic signing with your team registers the bundle ID. *Check:* Signing &
      Capabilities shows no errors.
- [ ] **AS-5.4 The app record** in App Store Connect: name (unique across the store, so have two spares), language,
      bundle ID, SKU. *Check:* it shows in My Apps.
- [ ] **AS-5.5 Privacy policy and support pages.** Public pages (GitHub Pages from this repo is free) that say what
      is collected, that text goes to Anthropic when Claude is on, how long it is kept, how to delete it, and how to
      reach you. *Check:* both open on a phone without signing in.

## AS-6: TestFlight · Sonnet

- [ ] **AS-6.1 Version and build numbers:** 1.0.0, build 1; the build number goes up with every upload.
- [ ] **AS-6.2 Archive and upload:** Xcode, Product, Archive, then Distribute App to App Store Connect. Answer the
      export compliance question. *Check:* the build shows under TestFlight once processed.
- [ ] **AS-6.3 Internal testing:** you and up to 100 people on your team, no review. *Check:* the uploaded build runs
      on your iPhone from the TestFlight app.
- [ ] **AS-6.4 External testing:** testers by email or public link; the first build of each version goes through Beta
      App Review. Needs a beta description, a feedback email and the review account (AS-3.7). *Check:* an outside
      tester signs in and works through the checklist.
- [ ] **AS-6.5 Fix what testers find**, one new build per fix. **Goal (a) ends here.**

## AS-7: App Store submission · Sonnet, Opus for AS-7.6

- [ ] **AS-7.1 The listing:** subtitle, description, keywords, category (Business or Productivity), support and
      privacy URLs. It must not promise legal advice, and for goal (b) it says the documents are a synthetic demo.
- [ ] **AS-7.2 Screenshots:** the 6.9-inch iPhone set from the simulator (and the iPad set only if AS-0.5 said iPad).
      `npm run screenshots` can be adapted.
- [ ] **AS-7.3 App Privacy labels:** each data type (email, documents and chats as user content, diagnostics if
      any), linked to the user, not used for tracking. They must match the policy and the manifest.
- [ ] **AS-7.4 Age rating** questionnaire.
- [ ] **AS-7.5 App Review notes:** the review account, what LegalLens does, that it uses Claude, that documents are
      synthetic, where the sample matter is, and how to reach you.
- [ ] **AS-7.6 Final privacy and security review** before publishing: policy, labels, manifest and the app's real
      traffic agree; no secrets in the app bundle; DEC-95 holds. *Check:* a written sign-off.
- [ ] **AS-7.7 Submit for review** with manual release, so you pick the day. *Check:* "Ready for Distribution".
- [ ] **AS-7.8 If rejected:** Claude maps the Resolution Center message to its guideline and proposes a fix or a reply;
      you resubmit.

## AS-8: After launch · Sonnet

- [ ] **AS-8.1 Watch:** crashes in Xcode's Organizer, TestFlight feedback, backend health, Claude spend against the
      cap, hosting cost.
- [ ] **AS-8.2 Updates:** bump the version, archive, upload, submit. Backend changes stay compatible with the version
      in the store, because people update slowly.
- [ ] **AS-8.3 iOS builds in CI** (optional): Xcode Cloud or GitHub Actions on macOS, with signing kept in secrets.
- [ ] **AS-8.4 Renew the membership yearly;** the app leaves the store if it lapses.
- [ ] **AS-8.5 Write down the real cost** next to the estimates, add a line to BUILD_HISTORY.md, and tag the release.

## Phase B: before real attorneys (DEC-106) · Opus to decide, Sonnet to build

Nothing here blocks the TestFlight demo (Phase A). All of it comes before the App Store listing or any real client
document. From the review of 2026-11-07; Apple guideline numbers are from the 2026-10-16 guidelines and Anthropic's
terms were read on 2026-11-07. A licensed attorney finalizes every legal document.

- [ ] **RL-1 A legal entity and insurance.** Publish as a company, not an individual: Apple 5.1.1(ix) asks apps that
      need sensitive information to come from a legal entity, and a company keeps claims away from personal assets.
      Tech errors-and-omissions and cyber insurance. Replaces DEC-100 (an Organization developer account, D-U-N-S).
      *You do it.*
- [ ] **RL-2 Zero data retention with Anthropic.** By default API inputs are deleted within 30 days (up to 2 years if
      flagged by safety systems); no training on API data by contract. ZDR is by approval through Anthropic sales.
      Until approved, DEC-95 holds. Then update the agreement wording and bump its version. *You apply; Claude checks
      the console setting.*
- [ ] **RL-3 Terms of service, privacy policy, data processing addendum, security summary.** Terms: license
      attestation, not legal advice, warranties, limitation of liability, indemnity, the attorney's duty to get client
      consent (Anthropic Commercial Terms K.2, L.1; ABA Formal Opinion 512). Privacy policy per Apple 5.1.1(i): what is
      collected and why, Anthropic named with equal protection, retention and deletion, how to revoke consent.
      *Claude drafts; a licensed attorney finalizes.*
- [ ] **RL-4 A bar-license check before each invite** (DEF-26): the state bar's public directory, name, bar number
      and state; a firm email preferred; date recorded; re-checked yearly. *You do it; Claude can add the record.*
- [ ] **RL-5 Honest copy for a hosted app.** 18 frontend files say "on this computer" or similar, which is untrue
      once the backend is hosted and Claude answers. Rewrite for the hosted, Claude-on build; keep the local wording
      for the local build. *Claude can build. Do this before external TestFlight testers too.*
- [ ] **RL-6 "Not legal advice; check the output"** on first run, answers, summaries and drafts (AS-3.8; Anthropic
      Commercial Terms D.3 requires telling users to verify outputs). *Claude can build.*
- [ ] **RL-7 Keys out of the data folder.** The database and file keys come from Azure Key Vault (or the
      environment), never a file beside the data; no admin tool that browses content; access to the server logged.
      *Claude can build at AS-2.2.*
- [ ] **RL-8 Delete my data.** `legallens user delete` removes the account, its matters, files, chunks, index entries
      and sessions, keeps a content-free audit line, and the backup schedule says when backups roll off. *Claude can
      build.*
- [ ] **RL-9 Breach notice and distribution.** INCIDENT_PLAN.md promises to tell affected attorneys quickly (their own
      duties under ABA Formal Opinion 483 depend on it). Request Unlisted App Distribution at submission, so only
      people with the link find the app. *Claude drafts; you approve and request.*

## Order

AS-0 first. Then AS-1 (Xcode download) alongside AS-2. The long pole is AS-2 and AS-3: a hosted backend with real
sign-in, and the app's sign-in and streams reworked. AS-4 can start on the simulator against a local backend once
AS-3.1 lands. Pay for AS-5.1 only when AS-4.6 passes on your own iPhone with the free Personal Team, so the $99 buys
a working app.

## Which model for which step

| Model | Steps | Why |
| --- | --- | --- |
| Opus | AS-0, AS-2.3, AS-3 design (3.2, 3.3, 3.5), AS-5.5 policy review, AS-7.6 | Decisions, security and privacy before anything is public |
| Sonnet | AS-1, AS-2.1, AS-2.2, AS-2.4, AS-3 build, AS-4, AS-5, AS-6, AS-7, AS-8 | Following a decided plan, edits, checks, Xcode and console steps |
| Haiku | Reading Apple's docs or a rejection message and summarizing it | Search and summary |

## Open questions

- Is the name "LegalLens" free on the App Store? Checked at AS-5.4; two spares ready.
- Do the embedding and reranker models fit the smallest Azure size? Measured at AS-2.2.
