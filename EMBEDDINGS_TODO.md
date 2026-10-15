# Embeddings and reranker: plan

Real embedding model and cross-encoder reranker, replacing the hash embedder and the stub's keyword sort. Closes DEF-01 for embeddings.

**Models:** `BAAI/bge-m3` for embeddings (1024 dimensions, up to 8,192 tokens of input) and `BAAI/bge-reranker-v2-m3` as the cross-encoder. Each has about 568M parameters and takes about 2.2 GB on disk.

**Status:** all four phases built 2026-10-13. Open follow-ups are listed at the end.

## What exists today

- `config.py` already defaults `ollama_embed_model` to `bge-m3`, and the vec0 index is already 1024 dimensions. bge-m3 fits the existing index with **no schema change**.
- torch and transformers are already installed through Docling. Ollama is not installed, and it has no rerank endpoint.
- Ingestion embeds `header + text` per child chunk, at most about 500 tokens each, in batches of 32 (`ingestion/pipeline.py`). It calls `get_embedder()` for each document, so a real model needs to be loaded once and cached.
- The live app runs the stub orchestrator (`orchestrator: Literal["stub"]`). Its rerank step is a placeholder sort: "The stub has no cross-encoder".
- Every chunk in the dev DB carries a hash vector. These must be re-embedded, or the dense search returns noise without any error.

## Decisions for you to approve

- **D1. Run in-process with sentence-transformers, not Ollama.** The reranker needs sentence-transformers anyway, so this is one library and no extra server. `HashEmbedder` stays for fast tests, and `OllamaEmbedder` stays as an option.
- **D2. Model files go in `~/Library/Application Support/LegalLens/models/hf`,** outside the iCloud-synced Desktop. They download once (about 4.5 GB for both), then load offline (`HF_HUB_OFFLINE`), which keeps DEC-08 local-only. `legallens models download` fetches them up front.
- **D3. Retrieval sizes, as you asked: 25 per leg (now 40).** RRF fuses up to 50 candidates, the cross-encoder scores all of them, and the top 8 go to the answer model. All three numbers become settings.
- **D4. The reranker is a backend service:** `RunServices.rerank(query, hits, top_n)`. The stub uses it now, and the LangChain ASK uses the same service later in place of its Sonnet reranker.
- **D5. The "Not found" gate stays as it is in this phase.** The reranker score goes into the trace. Moving the gate onto the reranker score needs a small benchmark on your documents first, so that's a later task.
- **D6. Device is chosen automatically:** Apple MPS, then CUDA, then CPU. GPUs run in fp16. Latency gets measured during the build and is not a gate, per your instruction.
- **D7. Index guard.** Record which embedding model built the index. `/health` warns, and search refuses the dense leg, when the index and the current model differ. That makes "forgot to reindex" visible.

## Phase 1: Models

- [x] EMB-1.1 Add `sentence-transformers` and check the lockfile reuses the existing torch.
- [x] EMB-1.2 `BgeM3Embedder` in `models/embedder.py`: kind `bge-m3`, dim 1024, normalised, batched, loaded once and cached.
- [x] EMB-1.3 `models/reranker.py`: a `Reranker` protocol, `BgeReranker` (CrossEncoder with sigmoid scores 0–1, max_length 1024), and `NoopReranker`, which keeps the RRF order for tests.
- [x] EMB-1.4 Settings: `embedder` gains `bge-m3` (the new default; tests stay on `hash`), plus `reranker`, `models_dir`, `k_per_leg`, `k_fused`, `rerank_top_n`, `model_device`.
- [x] EMB-1.5 Add the `legallens models download` CLI command. *Deviation: the command already existed for Docling; it now takes `--what all|embeddings|docling`.*
- [x] EMB-1.6 Load both models once at startup, shared by the API and the in-process worker. `/health` reports the reranker. *Deviation: loaded lazily on first use and cached per process (load takes ~17 s); `/health` checks the files without loading. Also added `httpx2` to the quiet loggers.*

**Demo:** download the models; `/health` shows bge-m3 at 1024 dimensions and the reranker ok.

## Phase 2: Search and ASK

- [x] EMB-2.1 `hybrid_search` takes its k values from settings (25 and 50).
- [x] EMB-2.2 Add `RunServices.rerank`, a `Hit.rerank_score`, and reranker scores in the trace. *Deviation: `expand()` (parent section, neighbours, definitions) now runs after the rerank, so context belongs to the final hits, and `search` no longer expands.*
- [x] EMB-2.3 The stub's rerank step calls `services.rerank`. The gate is unchanged (D5).
- [x] EMB-2.4 Check that drafts (`services/drafts.py`, which uses the embedder) still work.

**Demo:** ask a question in the app and compare the quoted passages before and after.

## Phase 3: Re-index

- [x] EMB-3.1 `legallens reindex [--matter ID]`: re-embeds every chunk in batches and replaces its `chunks_vec` rows. It writes the index-model record from D7, which may need a migration (0003). *Built: migration 0003 `index_meta`, one signature per matter, so `--matter` is well-defined. A missing record with chunks present is read as the legacy hash embedder.*
- [x] EMB-3.2 Run it on the dev DB and time it.

**Demo:** reindex the dev DB, then search the seeded matter.

## Phase 4: Tests and checks

- [x] EMB-4.1 Unit tests with fake models, so no download is needed: reranker ordering, top_n, noop fallback, settings, the index guard, and reindex on a temporary DB.
- [x] EMB-4.2 `pytest -m slow` with the real models: bge-m3 returns 1024-dimension unit vectors, and the reranker ranks a relevant clause above an unrelated one.
- [x] EMB-4.3 Full pytest, ruff and mypy, plus `npm run test:e2e:real`. *Result: 199 passed; the only failures are in the unreviewed Haiku test file. `e2e:real` now uses the real models when downloaded (hash otherwise): 10/10 on the second run; the first run failed flow 8 once (a toast covered the "Fill in" button).*

## Out of scope: needs its own review

The LangChain ASK, SUMMARY and DRAFT code written earlier on 2026-10-13 (`orchestrator/ask|summary|draft/`) isn't wired in, and it has defects that would break it at runtime. Fix it in a separate pass before wiring it in.

## Follow-ups

- Trim the bge-m3 download: the repo ships PyTorch, safetensors and ONNX weights, so it took 4.3 GB instead of about 2.2 GB. Use `allow_patterns` in `hf.download`.
- D5 still open: move the "Not found" gate onto the reranker score after a small benchmark on real documents.
- `ruff --fix` also removed unused imports in the unreviewed Haiku files; the rest of their lint and mypy errors are still there.
- Real-model timings (M-series, MPS/CPU auto): bge-m3 loads in about 17 s, the reranker in about 3 s, 19 chunks reindexed in 2 s.
