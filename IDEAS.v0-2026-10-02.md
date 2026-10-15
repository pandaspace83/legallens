# LegalLens: Ideas

> **Status:** Brainstorm (pre-BRD) · **Last updated:** 2026-10-02
>
> This file collects the thinking behind LegalLens. **Section 2 records the original ideas and the decisions
> made so far.** Sections 3 onward are **suggested additions** to discuss. Nothing here is final until it goes
> into the BRD.

---

## 1. Vision

LegalLens is an AI assistant for a lawyer. It helps them **ask** questions about their documents,
**summarize** legal documents, and **draft** responses and memos for the lawyer to review before
anything is sent or submitted. Every answer can be traced back to a source document, and the AI runs
entirely on infrastructure the lawyer controls.

---

## 2. Original ideas and decisions

### Who it is for
- Lawyers and attorneys.

### Three core features

| Feature | What the user does |
|---|---|
| **Ask** | Types a question into a search/prompt bar and gets an answer from the documents they uploaded. |
| **Summarize** | Uploads a legal document and gets a summary of it. |
| **Draft** | Asks LegalLens to draft a response or a legal memo. The lawyer reviews the draft before submitting it. |

### Three layers

| Layer | Decisions so far |
|---|---|
| **Frontend** | HTML, CSS and a JavaScript framework (React or Angular, no preference). Takes input from the lawyer: document upload plus a search/prompt bar for asking questions about those documents. |
| **Backend** | Python with **FastAPI**. **uv** for package and dependency management. |
| **AI layer** | A **RAG** (retrieval-augmented generation) application for now. It may be upgraded to **multi-agent** later. |

### Deliberately deferred
- The vector database, embedding model, LLM and RAG variant will be chosen in the
  **Technical Architecture** document, not now. **Constraint:** whatever is chosen must run on
  infrastructure you control (see the decision on outside AI below).

### Next deliverable
- A **BRD** (Business Requirements Document) covering functional specs, non-functional specs and other
  business details.

### Decisions (as of 2026-10-02)

| Question | Decision | What it means for LegalLens |
|---|---|---|
| **Main user** | A single lawyer with one workspace. | The primary persona is a solo lawyer. The MVP has no team features, roles or firm admin. *Recommended, pending [§13 Q3](#13-open-questions-answer-before-writing-the-brd):* inside the one workspace, documents are organized into **matters**, one per client case (see [§5.1](#51-workspace-and-matters)). |
| **Jurisdiction** | US federal and state. | English language and US legal conventions. Ask answers only from uploaded documents, so LegalLens needs no built-in knowledge of any state's law. MVP drafts (letters and memos) don't depend on court rules. From V1.x, court procedure and formatting rules come from curated, versioned rule templates or rule documents the lawyer uploads, never from the AI model's own knowledge. |
| **What Ask answers from** | Only the documents the user uploads. | No general legal research and no case-law database. If a question needs law that isn't in the documents, the lawyer is told so clearly. A lawyer can upload court opinions or statutes they've found elsewhere, and Ask will answer from those. |
| **What Draft produces** | A draft response, for the lawyer to review before submitting. | Draft means "draft a response." The lawyer uploads the document they need to respond to, explains in a chat what the response should say, and gets a draft to review, edit and export. Legal memos stay in scope. **LegalLens never sends or submits anything.** Whether "submitting" means filing in court or sending a letter is still open ([§13 Q4](#13-open-questions-answer-before-writing-the-brd)). |
| **Real or learning project** | A real project for real legal documents. Testing may use non-legal or public documents. | Confidentiality and AI-ethics requirements are part of the MVP, not deferred. No real client documents go in until the security slice is finished (see [§9](#9-suggested-build-plan-thin-vertical-slices)). |
| **Outside AI services** | No data is sent to outside AI services, for now. | All AI work runs on infrastructure you control: answering, summarizing, drafting, and the behind-the-scenes steps such as indexing documents for search (embeddings) and OCR. The same goes for anything else that touches documents, including malware scanning, error reporting and analytics. The model is still chosen later, in the architecture doc, but it must be one that can run self-hosted. The AI layer stays swappable in case this decision changes. |
| **Name** | **LegalLens** | |

---

## 3. Recommendations on the stated decisions

- **Frontend framework: React with TypeScript.** Both frameworks would work. React has a larger ecosystem
  for what this app needs: in-browser PDF viewing with highlighted passages, a chat panel next to a
  document editor, and streaming answers. It also has more learning resources and is easier to learn
  than Angular. TypeScript catches mistakes in the data the frontend receives from the API.
- **Build in thin slices, not one layer at a time.** Keep frontend, backend and AI as the three *layers*
  of the design, but build them *together* in thin end-to-end slices (see [§9](#9-suggested-build-plan-thin-vertical-slices)).
  If you build the whole frontend, then the whole backend, then the AI layer, nothing works until the
  very end, and problems connecting the layers show up late.
- **Design the AI layer as separate steps now.** For example: ingest → retrieve → answer with citations
  → check citations → summarize → draft. Give each step a clear input and output. Later, the multi-agent
  upgrade becomes "coordinate these steps differently" instead of a rewrite.
- **Keep the AI model behind one interface.** The rest of the app should never depend on a particular
  model. That lets you swap in a better local model, or later an approved outside provider if the
  no-outside-AI decision changes, and re-run the test questions to compare.

---

## 4. Guiding principles (suggested)

1. **Grounded or silent.** Answers come only from the lawyer's uploaded documents. Every claim points to
   a passage. If the documents don't support an answer, LegalLens says "not found in your documents"
   instead of guessing. In drafts, a statement may also rest on two other sources: the lawyer's own
   instructions in the chat, cited as *Per your instructions* with the date and time, or the matter
   profile, cited as *Matter profile*. Both are recorded in the audit trail. Nothing else counts as
   support.
2. **Show your work.** Citations, what was searched, and how much of a document was read are always visible.
3. **The lawyer is in charge.** LegalLens drafts, and the lawyer reviews and submits. LegalLens never
   files, sends or decides anything on its own.
4. **Each client's documents stay separate.** One client's documents can never appear in an answer or
   draft for another client.
5. **Documents are data, not instructions.** Text inside an uploaded document, especially one written by
   the other side, can never change how the AI behaves.
6. **Measure before you ship.** A set of test questions reviewed by a lawyer must pass before every release.
7. **Client documents never leave infrastructure you control.** No outside AI services, and client data
   is never used to train models.

---

## 5. Additional feature ideas

Tags: `MVP` = needed for a credible first version · `V1.x` = soon after · `Future` = later (multi-agent, or if LegalLens grows beyond one lawyer)

### 5.1 Workspace and matters
- **One private workspace per lawyer** `MVP`: The lawyer signs in to a single workspace. If LegalLens is
  ever offered to many lawyers, each workspace must be fully isolated from every other one.
- **Workspace settings** `MVP`: The lawyer's licensing state(s). Ethics rules on AI use, client consent
  and reviewing metadata differ by state, so LegalLens uses this setting for reminders and defaults.
- **Matters inside the workspace** `MVP` (recommended, pending §13 Q3): Every document, question, summary
  and draft belongs to a *matter* (a client case or deal). Even a solo lawyer has many clients. Keeping
  each client's documents in its own matter stops one client's confidential information from showing
  up in another client's answer or draft. It also gives the AI the right context.
- **Matter profile** `MVP`: Records:
  - the client and our side (plaintiff, defendant, buyer…)
  - the opposing parties, whether each is represented, and opposing counsel (name, firm, address, email)
  - the court (federal or state, and which one), jurisdiction and practice area
  - the client's AI-consent record (see §5.6)

  Ask, Summarize and Draft use the profile automatically, so the lawyer never has to retype "we
  represent the defendant in a California employment case."
- **Chat history per matter** `MVP`: Questions, answers and drafting conversations are saved in the matter,
  so follow-up questions keep their context.
- **Close a matter** `MVP`: Closing makes the matter read-only and keeps it.
- **Export a matter's full file** `MVP`: Download all documents, summaries, drafts and chat history for a
  matter, so the lawyer can return or keep the client's file.
- **Delete a matter** `MVP`: Permanently deletes the matter and everything made from its documents (see
  *Real deletion* in §5.6). It is offered only after an export prompt and a typed confirmation.

### 5.2 Ask
- **Answers from your documents only** `MVP`: Ask answers only from documents uploaded to the matter. It
  does not use the AI model's general legal knowledge to fill gaps.
- **Scope selector** `MVP`: The lawyer chooses *This document* or *All documents in this matter*, so
  ordinary questions across all of a matter's documents are part of the MVP. The screen always shows
  what is being searched (e.g. *Searching: Smith MSA v3 + Exhibits A–B*).
- **Pinpoint citations, click to verify** `MVP`: Every statement links to document + page + paragraph.
  Contracts use section numbers and depositions use page:line. Clicking a citation opens the document
  with the passage highlighted.
- **Clear answer states** `MVP`: Each answer is either *From your documents* (with citations) or *Not found
  in your documents*. A partial answer says which parts were found and which weren't.
- **Questions that need outside law** `MVP`: Take "Is this non-compete enforceable in California?" The
  documents show what the clause says, but not whether California law enforces it. LegalLens says this
  plainly, shows what the documents do say, and suggests uploading the relevant statute or case if the
  lawyer has it.
- **Bring your own authority** `MVP`: The lawyer can upload court opinions, statutes or regulations they
  found in their own research. Ask treats these like any other document and cites them. **LegalLens does
  not check whether uploaded authority is still good law.** The lawyer confirms that in their own
  citator.
- **Evidence strength instead of fake confidence scores** `V1.x`: Shows how many passages support the
  answer and flags conflicts, such as two termination clauses that disagree.
- **Per-document comparison table** `V1.x`: For example, "Which of these 5 leases allow assignment without
  consent?" The answer is a table with one cited row per document. Documents with nothing relevant are
  listed as "no relevant provision found."

### 5.3 Summarize
- **Summary templates by document type** `MVP`: Start with 2–3 types. *Letter or demand received* is
  always included because Draft depends on it, and the others are chosen by practice area:
  - *Letter or demand received:* who is asking for what, by when, each claim made, and any threats or deadlines. This feeds straight into Draft.
  - *Contract:* parties, term, payment, termination, indemnity, limitation of liability, assignment and change of control, governing law, and which checklist clauses were *not* found. In V1.x, it can also show clauses that differ from the lawyer's own uploaded template.
  - *Court opinion (case brief):* facts, procedural posture, issue, holding, reasoning, disposition.
  - *Deposition:* digest by topic, key admissions and objections, with page:line cites.
  - *Complaint or other pleading:* parties, causes of action, key allegations, relief sought.
- **Audience and length presets** `MVP`: For example *One paragraph*, *Detailed digest* or *Plain English for the client*.
- **Coverage report** `MVP`: Every upload and summary says what was actually read, e.g.
  "212 of 214 pages processed; pages 37 and 88 unreadable", plus OCR confidence for scanned pages.
  Summaries cover the whole document and never silently skip part of it.
- **Chronologies** `V1.x`: An editable timeline of facts built from all the matter's documents
  (date, event, people, source, disputed?).
- **Key dates and obligations table** `V1.x`: Renewal windows, notice periods, payment dates and response
  deadlines, each linked to its source. These are suggestions for the lawyer to check and are never
  written straight into a calendar.
- **Clause extraction and comparison** `V1.x`: Pull the same clause from many contracts into one table,
  or compare v2 and v3 of an agreement.

### 5.4 Draft: responses for the lawyer to review
- **Draft a response from the matter's documents** `MVP`: The lawyer picks the document they are
  responding to, such as a demand letter or a letter from opposing counsel. They add supporting
  documents and explain in a chat what the response should say. LegalLens writes a draft in an editor
  next to the chat.
- **Refine the draft through chat** `MVP`: The lawyer can type instructions like "Make paragraph 3 firmer"
  or "Add our position on the late-payment claim." Changes apply to the draft, and one section can be
  regenerated without redrafting the whole document.
- **First draft types** `MVP` (recommended, pending §13 Q4):
  1. *Response letter (build first):* a reply to a demand letter or to opposing counsel. This is the
     safer type to start with because it rests mainly on facts in the matter's documents and the
     lawyer's instructions.
  2. *Internal legal memo:* To/From/Date/Re → Question Presented → Brief Answer → Statement of Facts →
     Discussion (one IRAC/CREAC block per issue) → Conclusion. A memo depends on legal authority, so it
     is the riskier type. See the next item.
- **Memos follow the documents-only rule** `MVP`: Each Rule and Explanation step may state law only from
  opinions, statutes or regulations the lawyer uploaded to the matter, with pinpoint cites. Before
  drafting, LegalLens asks the lawyer to upload the governing authority and shows which issues have
  none. Where an issue has no authority, the block shows `[RULE NEEDED: upload or insert authority for X]`,
  and the Brief Answer says the question can't be answered from the matter's documents. A statement of
  law with no supporting passage is flagged the same way as an untraceable citation.
- **Response letter safeguards** `MVP`:
  - If the other party has a lawyer, the letter is addressed to that lawyer, as Model Rule 4.2 requires.
  - If the other party has no lawyer, a Model Rule 4.3 reminder appears: don't give that person legal advice.
  - Optional header *Confidential settlement communication: FRE 408 / [state equivalent]*. Off by default; the lawyer chooses.
  - Optional reservation-of-rights closing. Off by default; the lawyer chooses.
- **Point-by-point response check** `MVP`: LegalLens lists every claim or demand in the incoming document
  and shows whether the draft addresses it. If a demand letter makes five claims and the draft answers
  four, the missing one is flagged.
- **No invented facts or authority** `MVP`: The drafter must never add a case, statute, rule or legal
  statement from the AI model's own knowledge. Where authority is needed, it inserts
  `[CITE NEEDED: authority for X]`, and missing facts become placeholders such as `[EFFECTIVE DATE]`.
  The citation check may still find an authority that doesn't trace to an uploaded document, either
  because the model slipped or because the lawyer typed it. In that case the text is replaced with
  `[UNVERIFIED: <citation as written>]`. It never stays looking like a normal citation.
- **Citation checklist before export** `MVP`: Lists every authority in the draft with one of these statuses:
  - **Full text uploaded:** the cited passage supports the sentence.
  - **Only mentioned:** cited inside another uploaded document, such as opposing counsel's letter, but its
    full text isn't uploaded. Shown as UNVERIFIED. The other side's citations can be wrong or made up.
  - **Not in any uploaded document:** UNVERIFIED.
  - **Added by the lawyer.**

  Every row also notes: *Later history not checked. Confirm it is still good law in your citator.* Export
  stays blocked until each row is acknowledged.
- **Clean export to Word (.docx)** `MVP`: The exported file is what goes to the other side, so it must be
  clean:
  - Internal source citations, comments, AI notes and the review watermark are removed.
  - Document properties (author, title, template, custom fields) are cleared.
  - Export is blocked while any `[PLACEHOLDER]`, `[CITE NEEDED]` or `[RULE NEEDED]` remains.

  A separate *working copy with sources* is stamped *PRIVILEGED & CONFIDENTIAL / ATTORNEY WORK PRODUCT /
  DO NOT SEND*. The lawyer signs and sends from Word. LegalLens never sends or files anything.
- **Court response types** `V1.x` (recommended, pending §13 Q4): An answer to a complaint, responses to
  discovery requests (one response per numbered interrogatory or request), and an opposition to a
  motion. These must follow the Federal Rules of Civil Procedure or state rules, with strict deadlines
  and court formatting. Those rules come from curated, versioned rule templates, never from the model's
  own knowledge.
- **Your own templates and past work** `V1.x`: The lawyer uploads their own letters and memos so drafts
  match their style and preferred wording.
- **Tracked changes** `V1.x`: AI edits appear as Word tracked changes, so the lawyer sees exactly what changed.

### 5.5 Review before submitting
- **"AI draft: not reviewed" watermark** `MVP`: Stays on every draft until the lawyer marks it *Reviewed and
  adopted*. The app records when. This makes the review an explicit step that leaves a record.
- **Feedback buttons** `MVP`: *Wrong citation*, *Missed something*, *Should have said not found* and
  *Helpful*. Feedback is stored in the matter's audit trail. When it reveals a new kind of failure, a
  de-identified or synthetic version is written and added to the test question set. **Real client text
  never goes into the test set.**
- **AI-use disclosure helper** `V1.x`: Some federal and state judges require lawyers to certify how they
  used AI in a filing. This feature generates that text from the audit log.
- **Multi-person review workflow** `Future`: Paralegal → associate → partner review, needed only if
  LegalLens adds team accounts.

### 5.6 Confidentiality, security and compliance
Because this is a real project for real client documents, these are in the MVP.
- **Matter-scoped retrieval** `MVP`: The backend applies a matter filter to *every* search and cache
  lookup, so results are never just hidden in the UI. Automated tests prove that no answer or draft can
  use another matter's documents. This is very hard to add later, so it's built in from Slice 1.
- **Secure sign-in** `MVP`: Multi-factor login for the lawyer, plus a session timeout.
- **No outside AI services** `MVP`: Every model call, including answering, summarizing, drafting,
  embeddings and OCR, runs on infrastructure you control. No client data is used to train any model.
  A plain-language *Where your data goes* page explains this to the lawyer and their clients.
- **No document content leaves the system** `MVP`: Error reporting, analytics and crash logs must not send
  client content to third-party services. An automated test checks that the AI layer makes no outbound
  network calls carrying document data.
- **Encryption** `MVP`: Data is encrypted in transit and at rest, including backups and logs.
- **Real deletion** `MVP`: Deleting a document also deletes everything made from it: extracted text,
  chunks, search-index entries, cached answers and backups (on a stated schedule). In a RAG system, a
  "deleted" file can otherwise live on in the index.
- **Treat uploads as untrusted** `MVP`:
  - A file-type allowlist.
  - A malware scan that runs on infrastructure you control.
  - Each document is tagged at upload as *from our client* or *from another party*.
  - Hidden content (white-on-white text, metadata, tracked changes, comments) is always detected and
    neutralized for the AI, and never followed as instructions.

  For documents from another party, the lawyer sees only a notice such as "contains tracked changes,
  comments or metadata" and must choose to open it. Some states restrict lawyers from reviewing an
  opponent's metadata, although ABA Formal Opinion 06-442 allows it. Model Rule 4.4(b) also requires
  promptly notifying the sender about material sent by mistake.
- **Client AI-consent record** `MVP`: Records whether the client gave informed consent to AI use, when,
  what they were told (which tool, what data, the risks), and a link to the signed consent. Running the
  AI locally reduces the risk, but ABA Formal Opinion 512 still discusses when clients must be told or
  asked, and says a boilerplate engagement-letter clause is not informed consent. State bars differ
  (e.g. Florida Bar Opinion 24-1), so the reminders follow the lawyer's licensing state.
- **Backups and tested restore** `MVP`: Encrypted backups, plus a restore that has actually been tested.
  Losing a client's file is real harm.
- **Incident response plan** `MVP`: A written plan for what happens if client data is exposed, matching
  lawyers' duties after a data breach (ABA Formal Opinion 483).
- **Sensitive-data detection and redaction check** `V1.x`: Finds Social Security and taxpayer-ID numbers,
  financial-account numbers, birth dates and minors' names. Checks drafts against the redaction rule for
  the matter's court:
  - Fed. R. Civ. P. 5.2 for federal civil cases
  - Fed. R. Crim. P. 49.1 for federal criminal cases
  - Fed. R. Bankr. P. 9037 for bankruptcy
  - the state's own rule for state courts
- **Retention schedules and legal hold** `V1.x`: Closing a matter starts a retention clock. A legal hold
  stops deletion for that matter.
- **Team accounts, roles and ethical walls** `Future`: Only if LegalLens grows beyond one lawyer.
- **Enterprise baseline** `Future`: Single sign-on, SOC 2 Type II, choice of data region, customer-managed
  keys. Only if LegalLens is sold to firms.
- **Optional outside AI provider** `Future`: Only if the no-outside-AI decision changes, and only with
  contractual no-training and zero-retention terms, the client's informed consent, and a per-matter setting.
- **Privilege detection in documents received from the other side** `Future`.

### 5.7 AI quality and evaluation
- **Test question set ("golden set") from day one** `MVP`: 30–50 questions over *public or synthetic*
  documents, each with the expected answer and the passage that supports it, reviewed by a practicing
  lawyer. Cover these categories:
  - single-document facts
  - defined-term lookups
  - tables and exhibits
  - questions across several documents
  - questions whose correct answer is "not found"
  - questions that need outside law, which should be declined clearly
  - memo requests where no authority is uploaded
  - poor scans
  - documents with hidden injected instructions
  - follow-up questions
  - response drafts that must address every point
  - draft prompts that tempt the model to cite case law
  - exports that must come out clean
- **Release gate** `MVP`: Run the test set again after every change to prompts, models or retrieval.
  If scores drop, don't ship.
- **Choose the local model by test score** `MVP`: In the architecture phase, run the candidate
  self-hosted models through a first version of the test set on the target hardware. Pick by citation
  accuracy, correct "not found" answers and speed, not by reputation. Local models are usually smaller
  than the biggest hosted ones, so measuring matters even more here.
- **Citation check as a separate step** `MVP`: After an answer or draft is generated, check that each
  cited passage exists and supports its sentence. Remove or flag any that fail.
- **Ingestion that understands legal structure** `MVP`: Handles clause numbers (4.2(b)(iii)), defined
  terms, footnotes, exhibits, Bates numbers and tables.
  - MVP formats: text-based PDF and DOCX, plus OCR for clean typed scans with per-page confidence.
    Many demand letters arrive as scans.
  - Letters that arrived by email: pasted text or .eml/.msg files.
  - OCR of poor scans and handwriting comes in V1.x.
- **Document versions** `V1.x`: Recognizes a new version of a document, ties each citation to the exact
  version, and answers "what changed between v2 and v3?"

### 5.8 Operations
- **Audit trail** `MVP`: Records what was uploaded, asked, generated, reviewed and exported, which passages
  were retrieved, and which model and prompt version were used. The trail is append-only, exportable per
  matter, and protected like client content. Client content stays out of ordinary application logs.
- **Replayable tracing** `MVP`: Any answer can be explained later, when someone asks "why did it say that?"
- **Speed targets per feature** `MVP`: Ask streams its answer, with the first words appearing
  within a few seconds on the target hardware. Long summaries and drafts run as background jobs with a
  progress bar and a notification when done. Set the actual numbers after testing on that hardware.
- **Hardware planning** `MVP`: The models run locally, so planning happens in two steps:
  - The **BRD** states the hardware budget and constraints (see §13 Q1 and Q10) and the target document sizes.
  - The **Technical Architecture** doc, written after the model is chosen, states the minimum and
    recommended hardware and the page limits.

  Compute time is tracked per question and per matter.
- **Usage report per matter** `V1.x`: Supports honest billing. ABA Formal Opinion 512 says lawyers who
  bill by the hour can charge only for time actually spent.

### 5.9 Multi-agent upgrade path `Future`
Possible agents once the RAG version is stable:
- **Drafting agent:** drafts section by section from the lawyer's templates.
- **Response-mapping agent:** pairs each point in an incoming document with the reply that answers it.
- **Citation-checker agent:** independently confirms each citation against its source.
- **Reviewer agent:** checks drafts against the matter's facts and documents.
- **Bulk review agent:** runs a checklist across hundreds of documents and returns a grid with a citation in every cell.
- **Research agent:** only if Ask later goes beyond uploaded documents. That needs a licensed case-law source.

---

## 6. Users and personas

| Persona | Main needs |
|---|---|
| **Solo lawyer (primary, decided)** | The only user of LegalLens: one sign-in and no shared logins. Needs to understand documents quickly, respond to letters and opposing counsel, and draft memos. Every answer must be easy to check. Cost and Word export matter. |
| *Later, if LegalLens grows:* assistant or paralegal, associate, partner, in-house counsel, firm admin | Team review, shared matters, roles, firm-wide templates. This is the `Future` team-accounts feature, not the MVP. |
| **Not a user (anti-persona)** | Members of the public looking for legal advice. Excluding them avoids unauthorized-practice-of-law risk. |

---

## 7. Key user journeys

1. **Ask:** Open or create a matter → upload documents → ask a question → click a citation → check the passage → save the answer.
2. **Summarize:** Open or create a matter → upload a document → pick the template and audience → read the structured
   summary and coverage report → export.
3. **Draft a response:** Open the matter → upload the letter you need to answer → LegalLens summarizes each claim →
   explain in the chat what the response should say → review the draft, the point-by-point check and the
   citation checklist → resolve placeholders and flags → mark it reviewed → export the clean .docx → sign and
   send it yourself.

---

## 8. Scope: MVP vs later

**MVP in one sentence:** one lawyer's private workspace with matters, Ask over uploaded documents with
pinpoint citations, Summarize for 2–3 document types, and Draft for response letters and memos with a
clean Word export. All AI runs on infrastructure you control, with matter isolation, multi-factor login,
encryption, an audit log, real deletion, backups and a test question set.

**Out of scope (decided):**
- General legal research and case-law databases. Ask answers only from uploaded documents.
- Team features for multiple users.
- Sending client data to outside AI services, for now.
- Sending, filing or submitting anything. The lawyer always does that.

**Scope traps** sound small but are huge in legal work. Keep them out of the MVP:
- Court-specific formatting across federal courts and 50 states (local rules, pleading paper).
- Court response types (answers to complaints, discovery responses, oppositions). Recommended for V1.x, pending §13 Q4.
- Checking whether a case is still good law. That needs a licensed citator.
- Bluebook citation formatting.
- Word tracked changes.
- OCR of poor scans and handwriting. Basic OCR of clean typed scans is in the MVP.
- Integrations: email, document management systems, billing, e-filing.
- Conflict checking.

---

## 9. Suggested build plan: thin vertical slices

Each slice touches all three layers and ends with something you can demo. **MVP = Slices 0–5 complete.**

| Slice | What works at the end of the slice |
|---|---|
| **0** | Upload one PDF → extract its text → ask a question → see an answer from a **locally running model** (no retrieval yet). Any convenient local model works here as a placeholder. The real model is chosen in the architecture phase by running candidates through the test set (§5.7). |
| **1** | Retrieval over the document, page citations, click-to-source viewer, first test questions. **From here on, every document belongs to a matter. The backend applies the matter filter to every search and cache lookup, and automated cross-matter leak tests run.** |
| **2** | Summarize with the *Letter or demand received* template, plus the coverage report. |
| **3** | Draft a response letter, with chat refinement, the point-by-point check, placeholders, the citation-check step, the citation checklist, the review watermark and *Reviewed and adopted* sign-off, and the clean .docx export. |
| **4** | Security: multi-factor login and session timeout, encryption, audit log, real deletion, backups with a tested restore, untrusted-upload handling (allowlist, local malware scan, hidden-content detection, document origin tags) with injection traps in the test set, the client AI-consent record, a written incident response plan, cross-matter leak tests extended to every feature, and a test that proves no document data leaves the system. |
| **5** | MVP completion: the memo draft type, the remaining summary templates and audience presets, the *All documents in this matter* scope, the full matter profile and chat history, close/export/delete matter, OCR for clean typed scans, feedback buttons, and the release gate wired to the test set. |

> **Rule:** No real client documents go into LegalLens until Slice 4 is finished.

**Development data:** use public or synthetic documents only, for example published court opinions,
contracts filed publicly with the SEC (EDGAR exhibits), the CUAD contract dataset (contracts labeled by
clause type), and made-up demand letters.

---

## 10. Top risks

| Risk | Mitigation |
|---|---|
| Invented or misquoted citations end up in a submitted document, leading to sanctions (*Mata v. Avianca*, 2023; *Wadsworth v. Walmart*, 2025). | The drafter never adds authority from the model's own knowledge. Untraceable citations are replaced with `[UNVERIFIED: …]`, and a citation checklist and review sign-off come before export. Target on the test set: **zero** model-introduced authority, flagged or not. |
| A draft repeats a wrong, made-up or overruled authority from the other side's letter or from an uploaded opinion. | The checklist marks "only mentioned" authority as UNVERIFIED, and every row says later history wasn't checked and the lawyer should confirm it in their citator. |
| The exported draft leaks privileged material or metadata to the other side. | Clean export: no internal source references, comments, AI notes or document properties, and blocked while placeholders remain. An automated test checks every export. |
| One client's content appears in another client's answer or draft. | Backend-enforced matter filter on every search and cache from Slice 1; automated leak tests. |
| LegalLens answers a question that needs outside law as if the documents covered it, including through a memo's Rule section. | Documents-only behavior, a clear "not in your documents" answer, `[RULE NEEDED]` in memos, and test questions for exactly these cases. |
| The lawyer trusts a polished draft and submits it without reading it closely. | Review watermark and sign-off, point-by-point check, citation checklist, one-click source verification. |
| Prompt injection hidden in a document from the other side, which is exactly the kind of document a response is drafted from. | Treat document text as data, detect and neutralize hidden content, include injection traps in the test set. |
| Showing the opponent's hidden metadata leads the lawyer into a state-ethics problem. | Notice only, and the lawyer chooses whether to open it; a reminder about state rules and Model Rule 4.4(b). |
| A summary silently misses pages or a key clause, and the lawyer relies on it. | Process the whole document, show a coverage report with OCR confidence, and use a key-clause checklist that says "not found" when a clause is missing. |
| A court draft uses the wrong court's rules or format. | Court response types recommended for V1.x (pending §13 Q4), with rules from curated, versioned templates. Court and jurisdiction in the matter profile. |
| Privilege and confidentiality concerns around AI use. The law is unsettled. *United States v. Heppner* (S.D.N.Y. 2026) held that a defendant's own chats with a consumer AI tool were not privileged or work product, while *Warner v. Gilbarco* (E.D. Mich. 2026) protected a pro se litigant's ChatGPT materials as work product. | AI runs only on infrastructure you control, so no outside AI service sees client content. If a rented server is used (§13 Q1), the hosting provider is a third party: encrypt data under keys you hold and list the provider on the *Where your data goes* page. LegalLens is used by or at the direction of the lawyer. Privilege legends on working copies are notice only, because labels don't create protection. |
| AI logs become an unprotected copy of privileged data. | Give logs the same encryption, access control and retention rules as the documents. |
| Client files are lost. | Encrypted backups with a tested restore; export before delete. |
| Local models are less capable than the largest hosted models, so answers or drafts are weaker. | Choose the model by test-set score; keep the MVP scope narrow (documents-only answers, response letters first); keep the model swappable. |
| The hardware is too slow for long documents, or too expensive. | Benchmark in Slice 0; set a hardware budget in the BRD and minimum hardware and page limits in the architecture doc; run long jobs in the background. |
| A model's license doesn't allow commercial use, or a self-hosted model stops getting security updates. | Check license terms before choosing a model; plan model updates as routine maintenance, each followed by the test set. |
| Quality silently drops when a model or prompt changes. | Pin and log versions; the test set gates every release. |
| Response time blows up on long documents. | Per-feature targets, background jobs, page limits in the MVP, compute tracking per matter. |
| Unauthorized practice of law if non-lawyers use it. | MVP: a single account for the licensed lawyer who owns the workspace, plus in-app disclaimers. If LegalLens is ever offered to other lawyers: a bar-license check at sign-up and terms of service. |
| Assuming RAG prevents hallucination. Research found commercial legal AI tools marketed as RAG-based still hallucinated on roughly 17–33% of queries. | Never claim "hallucination-free". Measure accuracy and report it honestly. |

---

## 11. Success metrics (KPIs)

**Quality**
- Citation accuracy: % of citations that exist and support the claim (e.g. ≥ 95% on the test set).
- Model-introduced authority in drafts, meaning authority that came from neither an uploaded document nor the lawyer: target **0**, whether flagged or not.
- Correct "not found" rate: unanswerable questions, including outside-law questions, correctly declined, without declining answerable ones.
- Response coverage: % of points in an incoming document that the draft addresses or flags.
- Summary coverage: % of key clause types captured correctly.
- Exported files containing internal source references, comments or identifying metadata: target **0**.
- Leaks between matters in automated tests: target **0**.

**Value**
- Time saved compared with doing the task by hand (e.g. summarizing a 50-page contract, or drafting a reply to a demand letter).
- Draft retention: the share of generated text the lawyer keeps.
- Time to first answer after upload.

**Usage**
- Tasks per week, matters active per week, export rate.

---

## 12. Non-functional requirement areas (for the BRD)

Accuracy and verifiability · Confidentiality and data use · Matter isolation and access control ·
Security · Privacy, retention and deletion · Backup and recovery · Auditability · Performance (response
time per feature) · Hardware budget and compute · Availability · Data location (infrastructure you
control; no outside AI) · Accessibility (WCAG 2.1 AA) · Transparency (model and version shown for each
output) · Maintainability (vendor-neutral AI layer, swappable models)

---

## 13. Open questions (answer before writing the BRD)

1. **Where LegalLens runs (now the biggest open question).** The AI must run on infrastructure you
   control (decided). Will that be the lawyer's own computer, a server in their office, or a private cloud
   server they rent and control? Is a rented cloud server acceptable, or must everything stay on hardware
   the lawyer owns? This decides how big an AI model you can run and how fast it will be.
2. **Practice area and licensing.** What kind of law does the first user practice, e.g. litigation,
   employment, real estate, contracts, family law? Which state(s) are they licensed in? This decides
   which summary templates and response types to build first, and which state ethics rules apply.
3. **Matters inside the workspace.** The recommendation is one workspace with a matter for each client
   case inside it. Agree?
4. **What "submitting" means.** You said lawyers review drafts "before submitting the response." Does
   submitting mean filing with a court (answers, discovery responses, motion oppositions), or sending to
   the other side (letters)? The recommendation is response letters and memos in the MVP, and court
   responses in V1.x. Agree?
5. **Documents.** Which types, typical sizes and volumes? How common are scanned documents and emailed letters?
6. **Outputs.** .docx only, or PDF too? Bluebook formatting is out of the MVP (§8). Should it come in V1.x,
   and do your state's courts require their own citation style?
7. **Retention.** How long are documents, chats, drafts and logs kept after a matter closes?
8. **Lawyer advisor.** Is there a practicing lawyer who can write and review the test question set?
9. **Speed.** What response time is acceptable for Ask, Summarize and Draft?
10. **Hardware budget.** What can be spent on the hardware that runs the models?
11. **Later scope.** Languages other than English? Integrations with email or document management? Team accounts?

---

## 14. Draft BRD outline (preview)

1. Executive summary and problem statement
2. Objectives and KPIs
3. Scope (MVP, V1.x, out of scope) and decisions made
4. Stakeholders and personas
5. User journeys and use cases (Ask, Summarize, Draft)
6. Functional requirements (workspace and matters, documents, Ask, Summarize, Draft, export, review, feedback)
7. AI behavior requirements (documents-only answers, citations, "not found" answers, disclaimers, human review)
8. Non-functional requirements (see §12)
9. Legal and ethical considerations
10. Data requirements (formats, limits, retention)
11. Assumptions, constraints and dependencies
12. Risks and mitigations
13. Release phasing
14. Acceptance criteria
15. Glossary
16. Open questions

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Matter** | A client case or deal. The unit lawyers use to organize and bill work. |
| **RAG** | Retrieval-augmented generation: find the relevant passages first, then have the AI answer using only them. |
| **Grounded answer** | An answer where every claim is supported by a retrieved source passage. |
| **Self-hosted (local) model** | An AI model that runs on infrastructure you control, so data sent to it never leaves that infrastructure. |
| **Embeddings** | Numeric representations of text used to find relevant passages. Creating them is also an AI step, so it must run locally too. |
| **Pinpoint citation** | A reference to the exact page, paragraph or line, not just the document. |
| **Citator** | A service such as KeyCite or Shepard's that shows whether a case has been reversed, overruled or questioned, i.e. whether it is still "good law". |
| **Demand letter** | A letter, often from the other side's lawyer, demanding payment or action and usually setting a deadline. |
| **Discovery** | The pre-trial process where each side requests documents and answers from the other. |
| **Metadata** | Hidden information inside a file, such as author, edit history, tracked changes and comments. |
| **IRAC / CREAC** | Ways to structure legal analysis: Issue-Rule-Application-Conclusion / Conclusion-Rule-Explanation-Application-Conclusion. |
| **Ethical wall** | A block that stops specific people in a firm from seeing specific matters, usually because of a conflict of interest. |
| **Work product** | Documents prepared in anticipation of litigation or for trial, by or for a party or its representative (including its lawyer). Protection is qualified and can be overcome by substantial need, but a lawyer's mental impressions and legal theories are strongly protected (Fed. R. Civ. P. 26(b)(3); states have their own versions). |
| **Golden set** | A fixed set of test questions with known correct answers, used to measure quality after every change. |
| **Prompt injection** | Hidden instructions inside content (e.g. an uploaded document) that try to hijack the AI. |

---

## 16. Background reading

- [ABA Formal Opinion 512: Generative Artificial Intelligence Tools (July 2024)](https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/aba-formal-opinion-512.pdf): how lawyers' duties of competence, confidentiality, communication, meritorious claims and candor toward the court, supervision, and fees apply to AI.
- [Florida Bar Ethics Opinion 24-1 (Jan 2024)](https://www.lawnext.com/wp-content/uploads/2024/01/FL-Bar-Ethics-Op-24-1.pdf): an example of state-level AI guidance, including informed consent before sharing confidential information with third-party AI.
- [ABA Formal Opinion 06-442](https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/06-442.pdf): reviewing and using metadata in documents received from the other side. Several states take a stricter view.
- *Mata v. Avianca* (S.D.N.Y. 2023): lawyers were sanctioned $5,000 for filing case citations made up by ChatGPT.
- [*Wadsworth v. Walmart* (D. Wyo. 2025)](https://news.bloomberglaw.com/litigation/morgan-morgan-lawyers-fined-for-hallucinated-ai-citations): 8 of 9 cited cases did not exist. They came from the firm's own in-house AI tool.
- [*United States v. Heppner* (S.D.N.Y. 2026)](https://harvardlawreview.org/blog/2026/03/united-states-v-heppner/) and [*Warner v. Gilbarco* (E.D. Mich. 2026)](https://perkinscoie.com/insights/update/heppner-and-gilbarco-courts-apply-privilege-and-work-product-protection-generative): two decisions issued on the same day that reached different results on AI and privilege/work product.
- [Magesh et al., "Hallucination-Free? Assessing the Reliability of Leading AI Legal Research Tools" (Stanford RegLab/HAI, 2024)](https://arxiv.org/abs/2405.20362).
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/): prompt injection is risk #1.
