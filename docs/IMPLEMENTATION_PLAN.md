# Reel Content — Implementation Plan (v1)

**Status:** ACTIVE IMPLEMENTATION GUIDE |
**Spec:** `/docs/SAAS_SPEC.md` is LOCKED (v1). This plan operationalizes it.

---

## 0) Non-Negotiable Engineering Standards

### Code Quality

- TypeScript everywhere (strict mode)
- Small functions, early returns, minimal nesting
- Pure functions for business logic where possible
- No "god files"; each module owns a single concern
- Strong typing for all API payloads and domain objects

### Documentation

- JSDoc on public functions + tricky logic
- README per major module (api, enforcement, workers)
- Clear "how to run tests" and "how to run locally"

### Tests

| Type | Required For |
|------|--------------|
| Unit | Billing plan logic |
| Unit | Redis enforcement wrappers + Lua behavior |
| Unit | Idempotency |
| Unit | Request validation |
| Integration | Key API flows (Create/Regenerate/Save/Library) |
| Integration | Worker job handler (provider mocked) |

### Security

- Auth required for all write routes
- Input validation on every endpoint
- No secrets in logs
- Prompts and user content redacted in logs by default
- Defense in depth: enforce limits in API **and** worker

### Scalability

- Queue-first processing
- Stateless workers
- Redis semaphores for concurrency (provider + user)
- Observability: structured logs + metrics

---

## 1) Target Architecture (Hybrid)

| Component | Purpose |
|-----------|---------|
| Vercel | Next.js frontend + thin API |
| Cloud Run | Worker service (job handler endpoint) |
| Upstash Redis | Limits, cooldowns, semaphores, idempotency |
| Upstash QStash | Job delivery + retries |
| Postgres | Canonical data store + usage ledger |

---

## 2) Repo Setup (Milestone M0)

### Deliverables

- TypeScript project with linting, formatting, tests, CI
- Secure config loader
- Structured logging

### Checklist

- [ ] Initialize repo + `pnpm` (recommended) or `npm`
- [ ] Add `tsconfig.json` (strict true)
- [ ] Add ESLint + Prettier
- [ ] Add test runner (Vitest recommended) + coverage thresholds
- [ ] Add `dotenv` + typed config loader (`zod` schema)
- [ ] Add structured logger (`pino`) with redaction
- [ ] Add request-id generator utility

### CI (GitHub Actions)

```yaml
- pnpm lint
- pnpm typecheck
- pnpm test --coverage
- pnpm build
```

**Definition of Done**

- CI is green
- Coverage thresholds set for critical modules (enforcement/billing)

---

## 3) Folder Structure (Milestone M0)

Create this structure first to prevent drift:

```
src/
  api/
  billing/
  enforcement/
  redis/
    lua/
  queue/
  workers/
  db/
  ai/
  observability/
  types/
  utils/
docs/
```

### Checklist

- [ ] Create empty module folders
- [ ] Add barrel exports sparingly (avoid circular deps)
- [ ] Create `src/types` for shared domain types only

### DoD

- No business logic in `api/` routes
- Business logic is testable without HTTP

---

## 4) Security Baseline (Milestone M1)

### Deliverables

- Auth middleware
- Validation middleware (Zod)
- Standard error response shape (from spec)
- Secure headers and CORS policy

### Checklist

- [ ] Auth guard for all write endpoints
- [ ] Request validation layer for all endpoints
- [ ] Central error handler (never leak stack traces)
- [ ] CORS allowlist
- [ ] Secure headers
- [ ] Log redaction (tokens, secrets, prompt bodies by default)

### DoD

- All write routes require auth
- Validation errors return consistent error shape

---

## 5) Database Layer (Milestone M1)

### Deliverables

- Migrations
- Repositories (data access)
- Indexes + constraints

### Tables (Minimum)

| Table | Purpose |
|-------|---------|
| `users` | User accounts |
| `subscriptions` | Plan info |
| `boosts` | Pro Boost add-on with `expires_at` |
| `drafts` | Draft content |
| `generations` | Generation records |
| `variants` | Generated variants |
| `assets` | Library items |
| `usage_ledger` | Usage tracking |

### Checklist

- [ ] Pick migration tool (Prisma, Drizzle, Kysely+SQL)
- [ ] Define schema for all tables above
- [ ] Add indexes:
  - `(owner_id, created_at)` on drafts/assets
  - `(draft_id)` on generations/variants
  - `(generation_id)` on variants
  - `(owner_id, month)` on usage_ledger rollups
- [ ] Add FK constraints + cascading rules (soft delete where needed)

### DoD

- Can create a draft + generation + variants in one transaction
- Library pagination queries are indexed

---

## 6) Billing + Plans + Pro Boost (Milestone M2)

### Locked Plan Config (Source of Truth)

| Plan | Price | Gens/Month | Variants | Regen | Concurrency |
|------|-------|------------|----------|-------|-------------|
| Basic | $5.95 | 60 | 1 | Targeted only | 1 |
| Standard | $19.95 | 300 | Up to 3 | Full capped | 2 |
| Pro | $39.95 | 900 | Up to 5 | Full allowed | 5 |

**Add-on:** Pro Boost — $19.95/30 days — effective plan becomes Pro

### Deliverables

- `billing/plans.ts` constants
- Effective plan resolver (base plan + boost)
- DB fetch for user plan/boost

### Checklist

- [ ] Implement Plan types and PlanLimits
- [ ] Implement `resolveEffectivePlan(basePlan, boostExpiresAt)`
- [ ] Implement `getEffectiveLimits(userId)` using DB + cache
- [ ] Add admin-only dev route to grant a Pro Boost (for testing)

### DoD

- One function returns effective limits for any user
- No plan numbers hardcoded outside `billing/plans.ts`

---

## 7) Redis Enforcement Core (Milestone M2) — Highest Leverage

### Redis Key Schema (Canonical Builders)

Create `redis/keys.ts` with pure functions.

| Key Pattern | Purpose |
|-------------|---------|
| `app:usage:{u}:gen_used:{yyyymm}` | Monthly usage |
| `app:burst:{u}:gen_hour:{yyyymmddhh}` | Hourly burst |
| `app:usage:{u}:full_regen_used:{yyyymm}` | Full regen monthly |
| `app:cooldown:{u}:regen:{draft_id}` | Regen cooldown |
| `app:conc:{u}:leases` | User concurrency leases |
| `app:conc:lease:{lease_id}` | Lease tracking |
| `app:conc:provider:{provider}:{model}:{lane}` | Provider concurrency |
| `app:idem:{u}:{scope}:{idem_key}` | Idempotency |
| `app:user:{u}:plan_effective` | Plan cache (TTL ~10m) |
| `app:boost:{u}:pro_until` | Pro boost cache |

### Lua Scripts (Required)

| Script | Purpose |
|--------|---------|
| `counter_with_limit.lua` | Atomic counter with limit check |
| `semaphore_acquire.lua` | Acquire semaphore lease |
| `semaphore_release.lua` | Release semaphore lease |

### Deliverables

- Upstash Redis client
- Lua scripts loaded and callable
- TS wrappers with typed results
- Unit tests for all behaviors

### Checklist

- [ ] Implement `redis/client.ts`
- [ ] Implement key builders in `redis/keys.ts`
- [ ] Implement Lua scripts in `redis/lua/`
- [ ] Implement wrappers:
  - `enforceMonthlyPool(userId, n=1)`
  - `enforceHourlyBurst(userId, n=1)`
  - `acquireUserConcurrency(userId, leaseId)`
  - `acquireProviderConcurrency(provider, model, lane, leaseId)`
  - `releaseConcurrency(leaseId)`
  - `checkAndSetRegenCooldown(userId, draftId)`
  - `fullRegenCap(userId)`
  - `getOrSetIdempotency(scope, key)`
- [ ] Implement TTL helpers:
  - Seconds until month end (UTC)
  - Hour key formatter (UTC)

### Unit Test Checklist

- [ ] Counter increments under limit
- [ ] Counter rejects over limit
- [ ] TTL set on first increment
- [ ] Semaphore respects limit, expires leases
- [ ] Cooldown blocks until expiry
- [ ] Idempotency returns same stored result
- [ ] Effective plan resolution applies Pro Boost

### DoD

- A single `enforceOrThrow()` can be used by API routes and workers
- All enforcement is deterministic and tested

---

## 8) API Implementation (Milestone M3)

### Deliverables

- Implement locked endpoints with validation + idempotency + enforcement
- Consistent error responses
- Polling support for generations

### Endpoint Checklist

| Endpoint | Actions |
|----------|---------|
| `POST /v1/create` | Auth + zod validation, idempotency check, resolve effective limits, enforce: monthly pool + hourly burst, acquire concurrency leases (user + provider), create draft + generation DB records, enqueue job (interactive lane), return 202 with `generation_id` + `draft_id` |
| `POST /v1/regenerate` | Auth + validation, idempotency check, regen cooldown, enforce monthly pool + hourly burst, targeted vs full regen handling, full regen monthly cap for Standard, acquire concurrency leases, enqueue job, return 202 |
| `POST /v1/library/assets` | Auth + validation, idempotency check, save from draft+variant OR raw, return 201 |
| `GET /v1/library/assets` | Cursor pagination + filters (platform, tags, q, status), return 200 with `next_cursor` |
| `GET /v1/generations/:id` | Return generation status + variants when ready |
| `GET /v1/drafts/:id` | Read draft |
| `PATCH /v1/drafts/:id` | Update `selected_variant_id` and fields |

### Tests

- [ ] Validation failures return correct error
- [ ] Idempotency prevents duplicates
- [ ] Limits enforced consistently

### DoD

- API is thin; all logic lives in modules with tests

---

## 9) Queue + Worker Service (Milestone M4)

### Queue Choice

Upstash QStash job delivery to a worker endpoint

### Deliverables

- Queue payload schemas
- Worker endpoint verifies signatures
- Worker re-enforces limits (defense in depth)
- Worker persists outputs and writes usage ledger
- Concurrency leases are always released

### Checklist

- [ ] Define job payload types in `jobs.ts`
- [ ] Implement `queue/enqueue.ts` with retries/backoff
- [ ] Worker endpoint `POST /worker/generate`:
  - Verify QStash signature
  - Load generation + draft context
  - Re-check semaphores / budgets (quick)
  - Call Minimax pipeline
  - Persist variants
  - Update generation status
  - Write usage ledger
  - Release leases in `finally`
- [ ] Implement retry policy:
  - Retry transient errors (429, 5xx) with jitter
  - Fail fast on validation/permanent errors

### Tests

- [ ] Worker happy path with provider mocked
- [ ] Worker releases leases on error
- [ ] Retries do not duplicate side effects (idempotent updates)

### DoD

- End-to-end Create → Review works using async jobs

---

## 10) AI Provider Integration (Milestone M4)

### Deliverables

Minimax client wrapper with:

- Timeouts
- Retries
- Token usage capture
- Redaction strategy in logs
- Output token caps

### Checklist

- [ ] Implement `ai/minimax-client.ts`
- [ ] Implement `ai/generation.ts`
- [ ] Implement `ai/guardrails.ts` (max tokens, output length bounds)
- [ ] Capture token usage and store in `usage_ledger`
- [ ] Ensure provider keys never logged

### DoD

- All provider calls go through one client
- Token usage consistently captured

---

## 11) Usage Ledger + Cost Controls (Milestone M5)

### Deliverables

- Usage ledger writes post-generation
- Optional rollups
- Spend anomaly hooks (later)

### Checklist

- [ ] Write usage ledger on completion:
  - prompt tokens, completion tokens, model, cost estimate
- [ ] Implement hard caps:
  - Max output tokens
  - Max runtime per job
  - Max retries
- [ ] Optional: daily rollup cron

### DoD

- You can compute cost by user, plan, month

---

## 12) Observability (Milestone M5)

### Deliverables

- Structured logs with `request_id` and `generation_id`
- Basic metrics and alert plan

### Checklist

- [ ] Add `request_id` middleware for API and worker
- [ ] Log key lifecycle events (queued/started/completed/failed)
- [ ] Track limit rejections (monthly/hourly/concurrency)
- [ ] Track provider 429 rate
- [ ] Track job latency (enqueue → start → complete)

### DoD

- You can trace a generation through the system

---

## 13) Deployment (Milestone M6)

### Deliverables

- Vercel deploy for web/API
- Cloud Run deploy for workers
- Env vars and secrets set correctly
- Smoke tests

### Checklist

- [ ] Vercel env vars configured (server-only secrets)
- [ ] Cloud Run service deployed with least-privilege credentials
- [ ] Upstash Redis/QStash configured
- [ ] Health endpoints added
- [ ] Smoke tests (create + poll + save)

### DoD

- Deploy is repeatable and rollbackable

---

## 14) Recommended Implementation Order (Milestones)

| Milestone | Focus |
|-----------|-------|
| **M0** | Foundations: Repo setup + CI + module skeleton |
| **M1** | Security + DB baseline: Auth, validation, error shape, DB schema + migrations + repositories |
| **M2** | Billing + Redis enforcement: Plans + Pro Boost resolution, Redis keys + Lua + wrappers + unit tests |
| **M3** | API endpoints: Create/Regenerate/Save/Library + polling |
| **M4** | Queue + Worker + Provider: QStash enqueue + worker handler, Minimax integration (mocked tests) |
| **M5** | Ledger + Observability + Hardening: Usage ledger, guardrails, metrics |
| **M6** | Deploy + smoke test: Vercel + Cloud Run + Upstash |

---

## 15) Release Checklist (v1)

- [ ] Monthly pools enforced (Basic/Standard/Pro)
- [ ] Pro Boost add-on enforced (effective plan override)
- [ ] Hourly burst caps + concurrency semaphores active
- [ ] Idempotency works for create/regen/save
- [ ] Worker retries bounded and safe
- [ ] No secrets or raw prompts in logs
- [ ] Unit tests for enforcement + billing + validation
- [ ] Basic tracing: `request_id` → `generation_id`
- [ ] Deployed to Vercel + Cloud Run with smoke tests passing
