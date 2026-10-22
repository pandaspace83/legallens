# LegalLens: Human Test Checklist

> Written 2026-10-22 from section 11 of [the end-to-end map](../architecture/LegalLens_EndToEnd_Map.md) and the steps in `results.json`.
> The automated run passed 27 of 27. This list is for what a person has to judge: is the answer right, is the wording clear, does it feel safe.
> Tick a box when it passes. If it fails, leave it empty and write what you saw under **Notes** at the bottom.

**Before you start**

- [ ] Ollama is running with `qwen2.5:7b-instruct`, `qwen2.5:14b-instruct` and `llama3.2:3b` pulled
- [ ] ClamAV (`clamd`) is running
- [ ] `scripts/dev.sh` is running; the app is at http://localhost:5173
- [ ] Sign in as `lawyer@legallens.local`, any password, any 6 digits
- [ ] The sample matters exist: **Smith v. Acme Corp** and **Rivera** (seed them if not)
- [ ] You have Microsoft Word (or Pages) to open the exported files

Order matters: A, B and then C need the documents from B. D and E need them too. Run G (isolation) and the delete test last.

---

## A · Access

- [ ] **TC-01 Sign in.** Enter the email and any password, then any 6 digits.
  Check: the two steps are clear, there is no dead end, and the matters list opens.
- [ ] **TC-02 Open a matter.** Click *Smith v. Acme Corp*.
  Check: the workspace opens quickly with the new-chat prompt.

## B · Documents

- [ ] **TC-03 Upload three documents.** Documents → Upload. Add the MSA, the demand letter and the invoices. Tag each *our client* or *other side*. Wait for "Documents processed".
  Check: all three show Ready with page counts. The progress wording makes sense. The coverage report (open one) matches the pages you can see.

## C · Ask and conversations

- [ ] **TC-04 Ask.** New chat, ask *"What notice is required to terminate the agreement?"*
  Check: the answer says 60 days, every source chip supports the sentence beside it, and nothing is invented.
- [ ] **TC-05 Open a citation.** Click source 1.
  Check: the viewer opens on the right page and the highlight is on the actual supporting sentence.
- [ ] **TC-06 Follow-up.** Ask *"And how must it be delivered?"*, then open "What was searched".
  Check: it mentions courier or certified mail, and the searched query reads as a standalone question.
- [ ] **TC-07 Not found.** New chat, ask *"What is the weather forecast for Tokyo tomorrow?"*
  Check: "Not found in your documents", no citations, no made-up answer. The message is clear and helpful.
- [ ] **TC-08 Outside law.** New chat, ask *"Is the late fee clause enforceable under California law?"*
  Check: the notice that this needs law not in your documents is clear and does not pretend to answer it.
- [ ] **TC-09 Rename.** Sidebar menu → Rename, type a title, press Enter, reload the page.
  Check: the title is still there.
- [ ] **TC-10 Pin and search.** Menu → Pin to top, then type "weather" in Search chats.
  Check: the chat sits under Pinned, and search narrows the list.
- [ ] **TC-11 Feedback.** Open the renamed chat, *Not helpful* → *Missed something* + a note → Send.
  Check: a "Feedback saved" toast appears.
- [ ] **TC-12 Ask again.** Click *Ask again* under the first answer.
  Check: a new answer is added to the same chat.
- [ ] **TC-13 Delete.** Menu → Delete → Confirm.
  Check: the chat disappears.
- [ ] **TC-13b Delete then Undo.** Delete another chat, click Undo within five seconds.
  Check: the chat comes back with all its messages.

## D · Summarize

- [ ] **TC-14 Existing document.** New chat, Scope → *acme_demand_letter_scanned*, ask *"Summarize this document"*, open the summary.
  Check: sender, recipient, demands, deadlines, claims, threats and amounts are all correct against the letter. The coverage report matches the pages.
- [ ] **TC-15 Export to Word.** Click *Export to Word* on the summary and open the file in Word.
  Check: the formatting looks professional, and File → Info shows no author, comments or tracked changes.
- [ ] **TC-16 New document from chat.** New chat, Attach → upload `email_from_acme_counsel.eml`, wait, ask *"Summarize email_from_acme_counsel"*.
  Check: it ingests and the summary is faithful to the email.

## E · Draft

- [ ] **TC-17 Memo.** New chat, Mode → Draft, choose *Internal memo*, ask for a memo about the demand letter, open the draft.
  Check: the sections are Question Presented, Brief Answer, Statement of Facts (quoted and cited), Discussion with `[RULE NEEDED]`. It is marked "AI draft · not reviewed".
- [ ] **TC-17b Auto mode memo.** New chat in Auto mode, ask *"Write a memo on the demand in acme_demand_letter_scanned"*.
  Check: you get a memo, not a letter.
- [ ] **TC-18 Response letter.** New chat, ask *"Draft a reply to acme_demand_letter_scanned"*, open the draft.
  Check: each paragraph answers the right claim, cites the MSA where it should, and flags authority it can't support as `[UNVERIFIED]`. The placeholders are sensible.
- [ ] **TC-19 Review gate.** Try the clean export first, then fill or remove each placeholder, acknowledge each citation row, adopt, and export.
  Check: export is locked and says why until every item is done. The final .docx opens in Word with no metadata, comments or leftover brackets.

## F · System and layers

- [ ] **TC-20 About.** Settings → About.
  Check: every layer is OK, and the AI engine names the model and prompt version.
- [ ] **TC-21 Where your data goes.** Open the page.
  Check: it is plain language and true: nothing leaves the computer.
- [ ] **TC-22 Command palette.** Press ⌘K, type "invoices".
  Check: the invoices document is listed. Try a chat title too.
- [ ] **TC-25 Phone width.** Resize the window to about 390 × 844, open the matter.
  Check: no horizontal scroll, the prompt bar is reachable, and the document list is usable.

## G · Security and clean-up (do these last)

- [ ] **TC-23 Matter isolation.** Open the *Rivera* matter, list documents, ask the termination-notice question.
  Check: no Smith documents anywhere, and the answer is "Not found" with no Smith citation.
- [ ] **TC-24 Delete a document.** Documents → delete `email_from_acme_counsel` → Confirm, then ask something only that email could answer.
  Check: it's gone from the list, and the question no longer finds it.

---

## H · Not covered by a numbered case

- [ ] **Lock screen.** Leave the app idle until the warning appears (30 min idle timeout; shorten it in settings if you can), then unlock.
  Check: the warning is visible, the lock hides the content, and you return to where you were.
- [ ] **Closed matter.** Close a matter (matter details), then try to upload, ask and draft.
  Check: each is blocked with a clear message, and you can still read everything.
- [ ] **Stop mid-answer.** Ask a long question and click Stop while it streams.
  Check: it stops cleanly and you can ask again.
- [ ] **Scanner down.** Stop `clamd`, try an upload, then restart it.
  Check: the upload is refused with a clear message and nothing is stored. It works again after restart.
- [ ] **Scanned PDF.** Upload a scanned (image-only) PDF.
  Check: OCR finishes, the coverage report is honest about unreadable pages, and a question about it is answered with citations.
- [ ] **Known miss.** On a real court opinion (Mata v. Avianca), ask *"Who is the judge in this case?"*
  Check: note what it says. This is a known weak spot, so a wrong or "Not found" answer is expected; an invented name is not.

---

## Result

| | Count |
|---|---|
| Passed | __ / 33 |
| Failed | __ |
| Blocked | __ |

Tester: __________ Date: __________ Build / commit: __________

## Notes

| Case | What I saw | Severity (blocker / annoying / cosmetic) |
|---|---|---|
| | | |
