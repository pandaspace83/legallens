# LegalLens Orchestrator Workflows Implementation Plan

**Status:** PLANNING  
**Created:** 2026-10-13  
**Target Phase:** Phase 6 (Orchestrator Workflows)

---

## Overview

This document outlines the implementation plan for three core orchestrator workflows:
1. **ASK Workflow** — Answer legal questions with RAG
2. **SUMMARY Workflow** — Summarize documents
3. **DRAFT Workflow** — Generate document drafts

Each workflow follows a consistent pipeline: Pre-retrieval → Retrieval → Reranking → Augmentation → Generation.

---

## Architecture Decisions

### Storage & Retrieval
- **Vector DB:** SQLite + sqlite-vec (already chosen)
- **Search Strategy:** Hybrid (vector + BM25)
- **Top K (retrieval):** 20-25 vectors, 25 BM25 results
- **Top K (reranking):** 5-10 final chunks
- **Reranker:** LLM-based (Sonnet, single-pass scoring)

### Model Choices (CRITICAL)
- **ASK Workflow:** Sonnet (for generation)
- **DRAFT Workflow:** Opus (for quality)
- **SUMMARY Workflow:** Opus or Sonnet (user decides)
- **Question Rewriting:** Haiku (fast, cheap, pre-retrieval only)

### Orchestrator Stack
- **Framework:** LangChain (LCEL)
- **Patterns:** Runnables for composable pipelines
- **State:** Message history, chat context, matter scope

---

## §1 — ASK Workflow

### 1.1 Pre-Retrieval: Question Rewriting

**Goal:** Reformulate the user's question using chat history for context, with nuanced guardrails.

**LLM:** Claude Haiku (fast, cheap, constrained)

**System Prompt (guardrails):**
```
You rewrite legal questions for retrieval. Follow these rules:
1. If chat history is EMPTY: return the question unchanged.
2. If chat history exists but is INDEPENDENT of the question:
   - (e.g., "Tell me about damages" after discussing unrelated topics)
   - Return the question unchanged.
3. If chat history DIRECTLY RELATES:
   - Weave in pronouns, case names, prior facts (e.g., "acme_v_corp")
   - Make implicit references explicit.
4. If the question contradicts prior context: flag it and ask for clarification.
5. Keep output under 200 tokens. Output ONLY the rewritten question.
```

**Input:** `{ question, chat_history }`  
**Output:** `rewritten_question: str`

**Pseudo-code:**
```python
def rewrite_question(question: str, chat_history: List[Message]) -> str:
    if not chat_history:
        return question
    
    response = haiku.invoke(
        system=REWRITE_SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": f"Question: {question}"}
        ],
        context=format_chat_history(chat_history)
    )
    return response.strip()
```

**Tests:**
- Empty history → return question as-is
- Unrelated history → return question as-is
- Related history → rewrite with context
- Contradictory history → flag it

---

### 1.2 Retrieval: Hybrid Search

**Goal:** Get 25-30 candidates from both vector and keyword search.

**Execution:**
1. **Vector Search:** sqlite-vec, top 20-25 results, similarity-based ranking
2. **BM25 Search:** sqlite FTS5, top 25 results, keyword-based ranking
3. **Merge:** Union the two sets (keep duplicates for ranking signal)

**Pseudo-code:**
```python
def hybrid_search(question: str, matter_id: str, top_k: int = 25) -> List[Chunk]:
    # Vector search
    vector_results = sqlite_vec_query(
        embedding=embed(question),  # Hash embedder for now
        matter_id=matter_id,
        top_k=top_k
    )
    
    # BM25 search
    bm25_results = fts5_query(
        query=question,
        matter_id=matter_id,
        top_k=top_k
    )
    
    # Merge (union + dedup, keep score)
    all_chunks = merge_and_rank(vector_results, bm25_results)
    return all_chunks[:top_k * 2]  # Return ~50 for reranking
```

**Chunk Schema (from backend):**
```json
{
  "id": "chunk_uuid",
  "matter_id": "uuid",
  "document_id": "uuid",
  "text": "extracted chunk text",
  "document_name": "contract_2024.pdf",
  "page_num": 5,
  "embedding": [0.1, 0.2, ...],
  "metadata": {
    "section": "§3.1 Definitions",
    "doc_type": "contract"
  }
}
```

**Tests:**
- Query with duplicates across vector/BM25 → dedup correctly
- Empty matter → return empty
- Low-similarity query → return at least K results

---

### 1.3 Reranking: LLM-Based Scoring

**Goal:** Narrow ~50 candidates to top 5-10 most relevant chunks.

**LLM:** Claude Sonnet (fast, good at ranking)

**Approach:**
- Single-pass LLM call, score all chunks in one batch
- Return top N by score

**System Prompt:**
```
You are a legal document relevance scorer. Score each chunk 1–10 based on:
1. Direct relevance to the question
2. Specificity (§3.1 > general intro)
3. Authority (court order > email)

Output JSON array: [{"chunk_id": "...", "score": 9, "reason": "..."}]
```

**Input:**
```json
{
  "question": "rewritten_question",
  "chunks": [
    { "id": "...", "text": "...", "document_name": "..." },
    ...
  ]
}
```

**Output:**
```json
[
  { "chunk_id": "uuid_1", "score": 9, "reason": "Defines 'liability' directly" },
  { "chunk_id": "uuid_2", "score": 7, "reason": "Mentions liability in context" },
  ...
]
```

**Tests:**
- Highly relevant chunk scores high
- Irrelevant chunk scores low
- Consistent ordering across runs

---

### 1.4 Augmentation: Context Assembly

**Goal:** Build the RAG context: question + top chunks + metadata.

**Assembly:**
```
QUESTION: {rewritten_question}

RELEVANT DOCUMENTS:
{chunk_1_document_name} (page {page_num}):
{chunk_1_text}

---

{chunk_2_document_name} (page {page_num}):
{chunk_2_text}

...

MATTER SCOPE: {matter_name}
```

---

### 1.5 Generation: LLM Response

**Goal:** Generate a comprehensive answer to the question.

**LLM:** Claude Sonnet

**System Prompt:**
```
You are a legal advisor. Answer the user's question based on the provided documents.
- Cite document names and page numbers.
- If the documents don't address the question, say so.
- Be concise but complete.
```

**Input:**
- System: [above]
- User: [augmented context]

**Output:** Answer text with citations

---

## §2 — SUMMARY Workflow

### 2.1 Scope

**Goal:** Summarize one or more documents in a matter.

**Variants:**
- Single document → detailed summary
- Multiple documents → comparative summary
- Full matter → executive summary

### 2.2 Pipeline

**Input:** `{ documents: List[Document], summary_type: "detailed" | "comparative" | "executive" }`

**Steps:**
1. Chunk documents (with overlap for context)
2. Extract summaries per chunk (fast)
3. Hierarchical merge to final summary
4. Augment with metadata (dates, parties, tags)

### 2.3 Model Choice

**Decision:** Opus or Sonnet based on:
- `summary_type == "detailed"` → Opus (quality)
- `summary_type == "comparative"` → Opus (nuanced)
- `summary_type == "executive"` → Sonnet (speed)

**User can override** in request.

### 2.4 System Prompt

```
You are a legal summarization expert. Summarize the document(s) as follows:
- Extract key facts, obligations, dates, and parties.
- Organize by sections/themes.
- Flag risks or unusual clauses.
- Use bullet points for readability.
```

---

## §3 — DRAFT Workflow

### 3.1 Scope

**Goal:** Generate new document drafts or rewrite sections.

**Variants:**
- Draft from scratch (e.g., "Write a demand letter")
- Rewrite existing section (proposal)
- Fill template (e.g., signature block)

### 3.2 Pipeline

**Input:** `{ instruction: str, context?: str, existing_doc?: str, template?: str }`

**Steps:**
1. Understand intent (parse the drafting instruction)
2. Retrieve context (if not provided; same hybrid search as ASK)
3. Assemble prompt (instruction + context + any existing text)
4. Generate draft (LLM)
5. Post-process (format, citations, metadata)

### 3.3 Model

**LLM:** Claude Opus (always, for quality)

### 3.4 System Prompt

```
You are a legal drafter. Generate the requested document or section.
- Follow the provided template (if any).
- Reference cited documents.
- Use professional legal language.
- Flag uncertain assumptions.
- Return clean, formatted text.
```

---

## §4 — Implementation Phases

### Phase 6.1: ASK Workflow (Week 1)

**Tasks:**
- [ ] Implement question rewriting (Haiku)
- [ ] Implement hybrid search (vector + BM25)
- [ ] Implement reranking (Sonnet)
- [ ] Implement augmentation
- [ ] Implement generation (Sonnet)
- [ ] Unit tests for each step
- [ ] Integration test (end-to-end ASK)
- [ ] Update API endpoint `/orchestrate/ask`

---

### Phase 6.2: SUMMARY Workflow (Week 2)

**Tasks:**
- [ ] Implement chunking strategy
- [ ] Implement per-chunk summary extraction
- [ ] Implement hierarchical merge
- [ ] Implement model-choice logic (Opus vs Sonnet)
- [ ] Unit tests
- [ ] Integration test
- [ ] Update API endpoint `/orchestrate/summary`

---

### Phase 6.3: DRAFT Workflow (Week 3)

**Tasks:**
- [ ] Implement intent parsing
- [ ] Implement context retrieval (if needed)
- [ ] Implement prompt assembly
- [ ] Implement generation (Opus)
- [ ] Implement post-processing
- [ ] Unit tests
- [ ] Integration test
- [ ] Update API endpoint `/orchestrate/draft`

---

### Phase 6.4: Integration & Polish (Week 4)

**Tasks:**
- [ ] Wire all three workflows into orchestrator stub
- [ ] Add streaming support (for long responses)
- [ ] Add error handling & retries
- [ ] Add logging & observability
- [ ] Performance profiling
- [ ] E2E tests (Playwright)
- [ ] Documentation (TA doc update)

---

## §5 — Success Criteria

**Phase 6 is done when:**
1. ✅ All three workflows (ASK, SUMMARY, DRAFT) are implemented
2. ✅ Unit & integration tests pass
3. ✅ E2E tests pass against real backend
4. ✅ Latency < 5s for typical queries (P50), < 15s (P95)
5. ✅ Token usage reasonable (monitored, logged)
6. ✅ Error handling graceful (no crashes)
7. ✅ Documentation complete (TA doc updated)

---

## §6 — Open Questions for User

1. **Model choices okay?** (Sonnet for ASK/RERANK, Opus for DRAFT, Haiku for rewrite)
2. **Timeline realistic?** (4 weeks for all three workflows)
3. **Any guardrails or compliance checks needed?**
4. **Streaming support critical for MVP?**

---

**Status:** 🟡 AWAITING YOUR APPROVAL & FEEDBACK
