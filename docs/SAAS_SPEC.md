# Reel Content — SaaS Specification (v1)

**Status:** LOCKED (v1) |
**Changes:** Only via explicit v2 delta documents |
**Purpose:** Authoritative product + system specification for implementation

---

## 1. Product Overview

**Product Name:** Reel Content

**Description:** Reel Content is a creator-focused AI SaaS that helps users generate high-quality short-form social content for:

- Instagram
- TikTok
- Facebook

The product is optimized for batch creation, content iteration, and consistent quality, without repetitive or generic outputs.

---

## 2. Target Users

### Primary Users

- Solo content creators
- Coaches, consultants, and educators
- Small brands and founders
- Freelancers managing their own social presence

### Secondary Users

- Agencies (lightweight use in v1)
- Power users batching content monthly

---

## 3. Supported Platforms (v1)

- Instagram
- TikTok
- Facebook

> LinkedIn, SEO blogs, Shopify, etc. are explicitly out of scope for v1.

---

## 4. Core Value Proposition

- Generate short-form social content quickly
- Avoid repetition across posts
- Support creator workflows (batching, regenerating, refining)
- Maintain high perceived quality
- Simple UX — no prompt engineering required

---

## 5. Content System

### 5.1 Presets (LOCKED)

Presets define structure, not content.

Each preset defines:

- Hook structure
- Body structure
- CTA structure
- Output length constraints
- Variant behavior

> Presets do not define niche or tone — those come from onboarding calibration.

### 5.2 Template Structure (Canonical)

All social content follows this structure:

1. Hook
2. Benefit / What-if
3. Body
4. CTA

> This structure is enforced at generation time.

### 5.3 Hashtag Suggestions (LOCKED v1)

Each generated content variant includes a set of
**suggested hashtags**, tailored to the selected platform
and the user’s niche.

Hashtags are:
- Generated alongside the main content
- Returned as a separate structured field
- Platform-aware (Instagram, TikTok, Facebook)
- Suggested, not mandatory

Hashtag generation does not count as an additional
generation and does not affect plan limits.


### 5.4 Variants

- Each generation produces N variants (plan-dependent)
- Variants must be meaningfully distinct
- Anti-repetition is enforced at the model + orchestration level

---

## 6. UX Flows (LOCKED)

### 6.1 Onboarding

Users define:

- Content niche
- Audience
- Tone preferences
- Content goals

> Outputs are stored as calibration inputs, not fixed profiles.

### 6.2 Create → Review Flow

1. User selects: Platform, Preset, Topic / prompt inputs
2. User clicks Create
3. Generation runs asynchronously
4. User reviews variants

User may:
- Select a variant
- Targeted regenerate
- Full regenerate (plan-dependent)
- Save to Library

### 6.3 Regeneration Types

| Type | Description | Availability |
|------|-------------|--------------|
| **Targeted Regenerate** | Refines a specific variant. Constrained scope. Always cheaper. | All plans |
| **Full Regenerate** | Replaces the entire variant set. Limited by plan. Higher cost. Rate limited. | Standard, Pro |

---

## 7. AI Architecture (LOCKED)

### 7.1 Model Strategy

Primary content generation is performed using high-quality, cost-efficient LLMs suitable for short-form social content:

- GPT-4.1-mini / GPT-4o-mini–class models
- Claude Haiku–class models

Model routing is determined by:

- **Action type** — Create vs Targeted Regenerate vs Full Regenerate
- **Plan tier** — Basic / Standard / Pro
- **Output requirements** — Variant count and output length

> Additional models (e.g. Minimax M2.1) may be used experimentally or for auxiliary tasks, but are not the primary generation engine in v1.

### 7.2 Anti-Repetition (High-Level)

- Prompt memory across recent generations
- Variant-level dissimilarity constraints
- Regeneration awareness
- No verbatim reuse of hooks or CTAs within short windows

---

## 8. API Contracts (LOCKED v1)

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/create` | Create new content |
| POST | `/v1/regenerate` | Regenerate content |
| POST | `/v1/library/assets` | Save asset to library |
| GET | `/v1/library/assets` | List library assets |
| GET | `/v1/generations/{id}` | Get generation by ID |
| GET | `/v1/drafts/{id}` | Get draft by ID |
| PATCH | `/v1/drafts/{id}` | Update draft |

### Guarantees

- Idempotency on create/regenerate/save
- Async generation via queue
- Polling-based status retrieval (v1)

---

## 9. Infrastructure Architecture (LOCKED)

### Hosting

| Service | Purpose |
|---------|---------|
| Vercel | Frontend + API |
| Cloud Run | Background workers |
| Upstash Redis | Enforcement + rate limits |
| Upstash QStash | Job delivery |
| Postgres | Primary datastore |

### Architecture Principles

- Queue-first background processing
- Stateless workers
- Hard concurrency caps
- Cost predictability over raw speed

---

## 10. Pricing & Plans (LOCKED)

### 10.1 Plans

| Plan | Price | Generations | Variants | Features |
|------|-------|-------------|----------|----------|
| **Basic** | $5.95/mo | 60/mo | 1 | Targeted regen only, Concurrency: 1, Efficient model tier |
| **Standard** | $19.95/mo | 300/mo | Up to 3 | Targeted regen unlimited, Full regen capped, Concurrency: 2, Balanced model tier |
| **Pro** | $39.95/mo | 900/mo | Up to 5 | Full regen allowed, Priority queue, Concurrency: 5, Best model tier |

### 10.2 Add-On: Pro Boost (LOCKED)

**Pro Boost** — $19.95 (30 days)

- Temporarily upgrades any user to Pro
- Expires automatically
- Does not roll over usage
- Implemented as an add-on, not a plan

---

## 11. Enforcement & Guardrails (LOCKED)

### Enforced Limits

- Monthly generation pools
- Hourly burst caps
- Concurrency semaphores
- Regen cooldowns
- Full regen caps (Standard)

### Enforcement Location

- **Redis** (fast path)
- **Postgres** ledger (source of truth)

---

## 12. Security (LOCKED)

- Auth required for all write operations
- Input validation on all endpoints
- Idempotency enforced
- No secrets or raw prompts in logs
- Rate limits + concurrency caps enforced

---

## 13. Scalability Guarantees

Reel Content must operate smoothly at:
- 10 users
- 100 users
- 1,000+ users

Scaling achieved by:
- Worker horizontal scaling
- Concurrency gates
- Queue backpressure
- Cost controls

---

## 14. Change Policy

This document is LOCKED (v1).

Changes require:

1. New document: `SAAS_SPEC_v2.md`
2. Explicit migration notes
