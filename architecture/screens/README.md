# LegalLens screens

Screenshots of every main screen, taken on 2026-10-10 at the end of frontend Phase 9 (FE-9.6) from the mock-data
build. Desktop shots are 1440 × 900; the last four show a phone (390 × 844) and a small laptop (1024 × 768). Toast
notifications are hidden so they don't cover the screens. All content is synthetic (DEC-73).

To take them again, start the mock dev server (`npm run dev` in `frontend/`), then run `npm run screenshots` there
([`frontend/scripts/screenshots.mjs`](../../frontend/scripts/screenshots.mjs) lists every step).

| File | Screen | What it shows |
| --- | --- | --- |
| `01-sign-in.png` | Sign-in | Email and password, with the product promise beside it |
| `02-two-step-code.png` | Two-step code | The six-digit code step (DEC-54) |
| `03-matters.png` | Matters | All matters; each one's documents stay separate |
| `04-new-chat.png` | New chat | Suggested questions and the composer |
| `05-answer-with-citations.png` | Answer | "From your documents", citations and sources |
| `06-cited-passage.png` | Cited passage | The viewer opened at the highlighted clause |
| `07-document-library.png` | Library | Origin tags, status, OCR and hidden-content flags |
| `08-upload-dialog.png` | Upload | Two files checked and tagged before upload |
| `09-coverage-report.png` | Coverage | What was read, and the OCR confidence |
| `10-summary.png` | Summary | The demand letter summarized, with citations |
| `11-draft-letter.png` | Draft | The reply letter with placeholders and flags |
| `12-draft-checks.png` | Draft checks | Export checklist, point by point, citation checklist |
| `13-draft-review.png` | Review | "Review and adopt" refused while items are open |
| `14-command-palette.png` | ⌘K | Search across chats, documents and matters |
| `15-matter-details.png` | Matter details | Client, other side, counsel, court |
| `16-closed-matter.png` | Closed matter | Read-only banner and composer |
| `17-settings.png` | Settings | Profile, licensing states, security |
| `18-where-your-data-goes.png` | Data page | What stays on this computer (DEC-55) |
| `19-engine-offline.png` | System states | Engine offline and storage banners; asking paused |
| `20-lock-screen.png` | Lock | Full sign-in after the idle timeout |
| `21-first-run-guide.png` | First run | The three-step guide in a new matter |
| `22-phone-answer.png` | Phone | An answer at 390 px |
| `23-phone-sidebar.png` | Phone | The sidebar as a drawer |
| `24-phone-cited-passage.png` | Phone | The cited passage, full width |
| `25-tablet-draft.png` | Small laptop | The draft covering the conversation at 1024 px |
