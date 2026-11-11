# LegalLens: production-readiness audit

> **Status:** 2026-11-11. The review read commit `f6cb094`; the fixes in section 2 sit on top of `9fed7f7`, which
> added the Capacitor iOS shell (`frontend/ios/`, AS-4.1). That shell was not part of this review.
> **How it was made:** 11 review agents, one per discipline, each read the code for its topics and gave every topic
> its own verdict. Their findings are merged here. The fixes in section 2 were then applied and tested.

## 1. Verdict

LegalLens is sound for what it is today: one lawyer, one machine. Of the 111 topics, 58 are not required at this
scale and should stay absent. The work is in the 39 topics that are required before the hosted backend and the
iPhone app go live; most of those are partly built. The fixes applied here close the small code gaps. What is left
needs either a decision from you or something outside the code (Azure setup, a domain, a backup schedule).

**Target assumed:** one hosted replica on Azure, Claude as the model, real sign-in, a Capacitor iPhone app for
invited TestFlight testers, synthetic documents only (`APPSTORE_TODO.md`, `AZURE_TODO.md`).

| Verdict | Topics |
|---|---|
| Required now (and mostly met) | 14 |
| Required before hosted launch | 39 |
| Not required at this scale | 58 |

## 2. Fixes applied in this change

| # | Fix | Files | Topic |
|---|---|---|---|
| 1 | A `prod` start is refused with dev sign-in, a plain-http cookie, a `*` CORS origin or an unencrypted database; `/docs` and `/openapi.json` are off in `prod`; a warning is logged when dev sign-in listens on a public address | `config.py`, `main.py` | 67, 71, 72 |
| 2 | Resetting a password or authenticator ends every open session of that account | `cli.py`, `services/auth.py` | 70 |
| 3 | Login does the same password hash for an unknown email as for a known one; a locked account answers a wrong password with the ordinary 401 and does not count it, so a stranger can neither learn that the email exists nor keep it locked | `api/v1/auth.py` | 1, 68 |
| 4 | The worker thread survives a failure in its own loop (housekeeping, heartbeat, claim) | `jobs/worker.py` | 15, 21 |
| 5 | `/api/v1/livez` and `/api/v1/readyz` probes that answer by status code and reveal nothing; `/health` is unchanged | `api/v1/health.py` | 56, 57 |
| 6 | Error logs carry file, line and function of the failure, still never its message | `logging.py`, `errors.py` | 59, 66 |
| 7 | A failed or cancelled export removes its half-written zip | `jobs/handlers/export.py` | 18, 35 |
| 8 | A document download no longer breaks on a quote or a non-Latin character in the file name (encrypted storage path) | `api/v1/documents.py` | 79 |
| 9 | Indexes on `chunks.parent_chunk_id` and `defined_terms.definition_chunk_id` (migration `0006`) | `db/models.py`, `migrations/versions/0006_chunk_fk_indexes.py` | 25 |
| 10 | nginx accepts uploads up to the app's 50 MB limit (it refused anything over 1 MB) and sends the same security headers FastAPI sends | `frontend/nginx.conf.template` | 4, 75, 79 |
| 11 | Stream reconnect uses capped, jittered exponential backoff and treats a 5xx as a dropped connection | `frontend/src/api/http/sse.ts` | 12, 13, 24, 95 |
| 12 | Queries no longer retry a 4xx answer | `frontend/src/app/queryClient.ts` | 12 |
| 13 | Dependabot for actions, Python, npm and Docker; read-only token on both workflows | `.github/dependabot.yml`, `.github/workflows/*.yml` | 6, 108 |
| 14 | The Docker env example no longer suggests an Ollama address the backend rejects | `backend/env.docker.example` | 7 |

**How it was checked**

- Backend: `ruff check`, `ruff format --check` and `mypy src` are clean. `pytest` passes except
  `tests/search/test_embeddings.py::test_a_missing_download_says_how_to_fix_it`, which fails the same way before the
  changes because PyTorch could not be installed in the review sandbox. Seven tests were added; two of them replace
  `test_dev_session_is_unavailable_in_prod`, because a `prod` start with dev sign-in is now refused outright.
- `backend/openapi.json` is unchanged (regenerated and compared).
- Frontend: `tsc`, `oxlint`, `prettier --check` clean; 126 unit tests pass (one added).
- nginx: the rendered template passes `nginx -t`. It was not run behind a real upload.
- Not run: the Playwright browser tests, the real-model and golden-set suites, a Docker image build, and the
  migration against an encrypted database.

**Two behaviour changes to know about**

- With `LEGALLENS_ENV=prod` the app now needs `LEGALLENS_AUTH_MODE=real`, `LEGALLENS_COOKIE_SECURE=true` and an
  encrypted database, or it will not start. `AZURE_TODO.md` AZ-5.2 plans a dev-mode demo with `LEGALLENS_ENV=dev`;
  that still starts, with a warning in the log.
- A locked account now shows "locked" (423) only to someone who has the right password.

## 3. Still open, most important first

| # | Gap | Why it is not done here | Topic |
|---|---|---|---|
| 1 | No request rate limit on sign-in or on the routes that spend Claude money | Needs a decision on the client-IP source behind the Azure ingress; a 429 changes `openapi.json` and the frontend | 1, 75 |
| 2 | The Claude spend cap is global and can be overshot: concurrent calls all pass the check, and a stopped stream is never recorded | Needs a per-user quota decision and a reservation in `models/spend.py` | 39, 44, 88 |
| 3 | No cap on concurrent chat runs or on queued jobs | Same 429 contract change | 44 |
| 4 | Backups are not scheduled and stay on the data volume; the entrypoint migrates with no backup first | Needs the hosting target (AZ-0.2) | 32, 84, 55 |
| 5 | Nothing alerts anyone: no uptime check, no log alert, no budget alert | Azure and a monitoring account; add to AZ-6 | 58, 62 |
| 6 | Keys beside the data: `db.key` and `secret.key`; `secret.key` has no environment override | Planned as RL-7; small code change plus Key Vault | 67 |
| 7 | One 300 s timeout for both the phone chat and background jobs; the browser `fetch` has no timeout | Touches model behaviour that the golden set should confirm | 11 |
| 8 | Password hashing runs inside the database write lock, so a login blocks every other write | A restructure of `login`; worth its own change | 91 |
| 9 | Files and rows can drift apart after a crash (orphaned uploads, tmp folders, old export zips); nothing sweeps them | A sweep that deletes files deserves its own review | 35, 21 |
| 10 | Summary, draft and export requests have no idempotency key, so a phone retry can pay twice | Needs a column and a migration | 14 |
| 11 | A used TOTP code can be replayed for about 90 s | Needs a column and a migration | 70, 96 |
| 12 | The embedder and reranker are shared across threads without a lock | Only matters if the bge models run hosted; a lock would make chat wait behind ingestion | 43 |
| 13 | No deploy pipeline, image scan or written rollback procedure; a rollback past a migration will not start | AZ-4 and AZ-6 | 6, 55 |
| 14 | No API compatibility rule for installed iPhone builds; the client sends no version | A policy (AS-8.2) before the first TestFlight build | 102 |
| 15 | No domain you own; the iPhone build bakes in the API address | A purchase and a DNS decision | 97 |
| 16 | `INCIDENT_PLAN.md` covers a lost laptop, not a hosted outage, a leaked API key or a tester uploading a real document | A document for you to approve (RL-9) | 83, 109 |
| 17 | No memory limit and no measured memory figure for the container | Needs one measured Docling ingestion | 47 |
| 18 | The Capacitor shell needs its own `<meta>` content-security policy, and `frontend/ios/` has not been reviewed | The shell landed after this review was read | 79 |

## 4. Every topic

**Required?** is one of: **Now** (needed today), **Launch** (needed before the hosted launch), **No** (not needed
at this scale). **State** is what the repository has after the fixes above.

### Networking and APIs

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 97 | DNS | Launch | Missing | The iPhone build bakes in the API address; a platform hostname breaks installed apps when hosting moves |
| 98 | TCP vs UDP | No | n/a | Everything is HTTP over TCP, and SSE depends on ordered delivery |
| 99 | HTTP/2 & HTTP/3 | No | n/a | The platform ingress provides it; the app holds two streams per tab |
| 100 | gRPC | No | n/a | One backend, one WebView client, typed from OpenAPI already |
| 101 | Webhooks | No | n/a | Nothing outside calls LegalLens, and it notifies nobody |
| 102 | API Versioning | Launch | Partial | `/api/v1` and a CI contract check exist; nothing protects old iPhone builds from a breaking change |
| 103 | Semantic Versioning | No | Partial | No outside consumers; `0.1.0` is typed in three places and only displayed |
| 22 | WebSockets | No | n/a | Traffic is server to client; Stop is already a POST |
| 23 | Long Polling | No | n/a | SSE covers it |
| 24 | Server-Sent Events | Now | Present | The core transport; replay by `Last-Event-ID`, pings, and now a sturdier reconnect |

### Traffic, edge and caching

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 1 | Rate Limiting | Launch | Partial | Sign-in burns an argon2 hash per request and every chat spends money; only account lockout exists |
| 3 | Load Balancing | No | n/a | SQLite and in-memory runs fix the app at one replica; a second would break it |
| 4 | Reverse Proxies | Launch | Present | nginx gives one origin and passes streams; upload limit and headers fixed here |
| 5 | API Gateways | No | n/a | One service; its checks already live in app middleware |
| 9 | Service Discovery | No | Present | Two fixed services and a static name |
| 48 | CDN | No | n/a | Tens of testers; the iPhone app carries its own assets; third-party origins are forbidden by design |
| 49 | Edge Caching | No | Present | Browser cache headers are right; there is no edge tier |
| 2 | Caching | Now | Present | The model cache and the client query cache are the two the app needs |
| 50 | Cache Invalidation | Now | Present | Keys are nested per matter, events invalidate them, sign-out clears them |

### Databases

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 25 | Database Indexing | Now | Present | Every query filters by `matter_id`; the two missing chunk indexes were added |
| 26 | Query Optimization | No | Present | Queries are already bounded by pagination and limits |
| 27 | N+1 Queries | No | Present | List endpoints batch; two small bounded loops remain (search expansion, the health check) |
| 28 | Connection Pooling | No | Present | SQLite connections are file handles; defaults are enough |
| 29 | Read Replicas | No | n/a | One file; WAL already lets readers run beside the writer |
| 30 | Sharding | No | n/a | Tens of users; `matter_id` is the natural key if it is ever needed |
| 31 | Partitioning | No | n/a | SQLite has none; the one growing table is pruned |
| 32 | Replication | Launch | Partial | As an off-volume backup, not live replication: one file on one volume is a single point of loss |
| 36 | Optimistic Locking | Now | Present | Drafts are edited by the lawyer, by proposals and by jobs; stale writes get a 409 |
| 37 | Pessimistic Locking | Now | Present | `BEGIN IMMEDIATE` makes the job claim and read-then-write paths safe |
| 40 | Deadlocks | No | Present | One write lock taken up front; the failure left is a busy timeout |
| 81 | Database Migrations | Now | Present | Six revisions; the app refuses a stale schema; no backup before migrating |
| 82 | Schema Versioning | Now | Present | Backups and the vector index record the version they match |

### Distributed systems

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 33 | Leader Election | No | n/a | One process hosts the API and the only worker |
| 34 | CAP Theorem | No | n/a | One node; when it is down the app is down |
| 35 | Eventual Consistency | Launch | Partial | The database and the file store have no shared transaction and nothing reconciles them |
| 38 | Distributed Locks | No | Present | SQLite's write lock is the only lock needed, and it is used correctly |
| 18 | Distributed Transactions | No | Partial | Ordering plus cleanup is the right small answer; export cleanup added, a sweep is open |
| 19 | Saga Pattern | No | Present | Job retries and failure handlers already compensate |
| 95 | Network Partitions | Launch | Partial | The only partition is a phone losing signal; resume and idempotency exist, the send retry is thin |
| 96 | Clock Skew | No | Present | One server clock; only TOTP compares with another device |

### Async work and messaging

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 15 | Message Queues | No | Present | The `jobs` table is already a durable queue; a broker would add infrastructure for one worker |
| 16 | Pub/Sub | No | Present | An outbox table polled per stream; nothing to publish across with one replica |
| 17 | Event-Driven Architecture | No | Present | The useful part, a transactional outbox with replay, is in place |
| 20 | Dead Letter Queues | Launch | Partial | A failed job is its own dead letter, but hosted nobody can list or re-run failures |
| 21 | Cron Jobs | Launch | Partial | Only 60 s housekeeping; backups, export expiry and tmp cleanup are unscheduled |
| 44 | Backpressure | Launch | Partial | Nothing bounds admitted work; with paid model calls that is a cost risk |

### Resilience

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 10 | Circuit Breakers | No | Partial | One paid dependency, and every caller already falls back to quoted passages |
| 11 | Timeouts | Launch | Partial | One 300 s value serves chat and jobs; browser requests have none |
| 12 | Retries | Now | Present | The Anthropic SDK retries with backoff; jobs retry crashes; clients no longer retry a 4xx |
| 13 | Exponential Backoff | No | Present | The SDK supplies it for Claude; the stream reconnect now uses it |
| 14 | Idempotency | Launch | Partial | Chat is keyed; summaries, drafts and exports are not |
| 56 | Health Checks | Launch | Present | `/health` stays a status page; probes with real status codes were added |
| 57 | Liveness & Readiness Probes | Launch | Present | `/livez` and `/readyz` exist; the hosting config still has to point at them |
| 85 | Failover | No | n/a | One replica by design; the fallback that matters is quoted passages |
| 83 | Disaster Recovery | Launch | Partial | The plan covers a lost laptop, not a lost volume or a leaked key |
| 84 | Backups | Launch | Partial | Good tooling with a tested restore; manual and on the same host |
| 86 | Multi-Region Deployment | No | n/a | One region; SQLite cannot span regions |
| 87 | Chaos Engineering | No | n/a | Fault-injection tests cover the useful cases; one manual kill drill before launch |

### Concurrency and runtime

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 39 | Race Conditions | Launch | Partial | The write lock closes most; the spend guard's check-then-call is open |
| 43 | Thread Safety | Launch | Partial | Model loading is locked, model use is not; matters only if the bge models run hosted |
| 41 | Memory Leaks | No | Present | Run buffers are swept; listeners are removed |
| 42 | Garbage Collection | No | Present | Nothing to tune in CPython here |

### Performance and capacity

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 91 | Latency | Launch | Partial | Password hashing under the write lock and ingestion in the API process both stall other requests |
| 92 | Throughput | No | Present | One job at a time is enough for tens of testers |
| 93 | P99 Latency | No | Partial | With tens of users a percentile is noise; durations are in the logs |
| 94 | Tail Latency | No | Partial | The tail is Claude and the lock stalls above |
| 45 | Autoscaling | No | n/a | Must be prevented: pin the hosted replica count to one |
| 46 | Horizontal Scaling | No | n/a | Same; a second replica breaks streams and risks the database |
| 47 | Vertical Scaling | Launch | Missing | Instance size is the only lever; no memory figure has been measured |
| 89 | Cold Starts | Launch | Partial | Scale-to-zero would stop the worker mid-job and drop live answers |
| 90 | Serverless Limits | Launch | Partial | A decision for AZ-0.2; SQLite needs a real disk, not a network share |
| 88 | Cost Optimization | Now | Partial | The $5 cap is a project rule, and the guard under-counts |

### Delivery and infrastructure

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 6 | CI/CD | Now / Launch | Partial | CI is the only gate on a public repository; there is no deploy path yet |
| 107 | Build Caching | No | Partial | Dependency caches are on; the Docker build has no layer cache, which costs minutes |
| 108 | Dependency Hell | Now | Present | Lockfiles keep the Mac, CI and the image aligned; Dependabot now proposes updates |
| 7 | Docker | Launch | Present | The images are the deployment unit; CI builds them but never starts one |
| 8 | Kubernetes | No | n/a | One replica; a cluster would cost more than the rest of the hosting |
| 106 | Helm Charts | No | n/a | No Kubernetes |
| 104 | Infrastructure as Code | Launch | Missing | The plan creates and tears down the environment repeatedly; a committed script is enough |
| 105 | Terraform | No | n/a | One resource group; a state file is overhead with no gain |
| 51 | Feature Flags | No | Partial | Environment settings are the switches that matter; there is no cohort to target |
| 52 | Blue-Green Deployment | No | n/a | Two copies would share one SQLite file |
| 53 | Canary Releases | No | n/a | Too few users for a split; TestFlight groups stage the app |
| 54 | Rolling Deployments | No | n/a | With one replica it is stop then start; deploy as a single revision |
| 55 | Rollbacks | Launch | Partial | The previous image will not start after a migration; no written procedure |

### Observability and operations

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 58 | Monitoring | Launch | Partial | Hosted, nobody sees a dead worker or a full disk |
| 59 | Logging | Now | Present | The only diagnostic signal, and a confidentiality control; now says where an error happened |
| 60 | Distributed Tracing | No | n/a | One process; request, job and run ids already correlate everything |
| 61 | Metrics | No | Partial | Log queries give error rate and latency for free at this size |
| 62 | Alerts | Launch | Missing | One person and no dashboard: site down, errors and spend each need a push |
| 63 | SLOs | No | Partial | A synthetic-data demo makes no availability promise |
| 64 | SLIs | Launch | Partial | Quality is measured and gated; hosted speed with Claude is not |
| 65 | Error Budgets | No | n/a | No SLO to budget against |
| 66 | Observability | Launch | Partial | The privacy-first logs were too thin to debug remotely; stack locations added |
| 109 | Production Incidents | Launch | Partial | The plan is written for a laptop |
| 110 | On-Call | No | n/a | One owner; alerts to that person are the whole rota |
| 111 | Postmortems | No | Present | A light habit exists and is enough |

### Security: identity and cryptography

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 67 | Secrets Management | Launch | Partial | Three secrets matter; two sit on the data volume |
| 68 | IAM | Launch | Partial | Per-owner matter checks are the tenant boundary and are solid; cloud identity does not exist yet |
| 69 | OAuth | No | n/a | First-party email, password and TOTP for invited testers |
| 70 | JWT Rotation | No (equivalent: Launch) | Partial | Tokens are opaque and revocable; resets now end sessions; TOTP replay is open |
| 71 | TLS | Launch | Partial | Tokens and documents will cross the internet; terminate at the Azure ingress |
| 72 | Encryption at Rest | Launch | Present | Built and now mandatory in `prod` |
| 73 | Encryption in Transit | Launch | Partial | Same as TLS; the secure cookie is now mandatory in `prod` |

### Security: application and perimeter

| # | Topic | Required? | State | Why, for this project |
|---|---|---|---|---|
| 74 | WAF | No | n/a | Costs more than the hosting; the classes it filters are handled in code |
| 75 | DDoS Protection | Launch | Partial | Azure absorbs volume; the exposure is cheap abuse of sign-in and uploads |
| 76 | CORS | Launch | Present | Only the app's own origin, no credentials, tested |
| 77 | CSRF | Launch | Present | A required header plus a strict cookie, in real sign-in mode |
| 78 | SQL Injection | Now | Present | User text reaches raw full-text SQL and is reduced to quoted tokens first |
| 79 | XSS | Launch | Partial | Model output renders as text; headers now cover nginx; the iPhone shell needs its own policy |
| 80 | SSRF | No | Present | No endpoint takes a URL from a user |

## 5. The reusable agent

`.claude/agents/non-negotiables.md` holds this audit as an agent: the 111 topics by discipline, the tier table, the
non-negotiable list and the rules for an honest verdict. Copy it to `~/.claude/agents/` to have it in every project.
