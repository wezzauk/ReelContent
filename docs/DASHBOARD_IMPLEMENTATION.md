# Dashboard Functionality Implementation Guide

This guide documents the steps to connect the dashboard UI to real data and functionality.

## Current State

The dashboard at `/dashboard` has a complete UI that:
- Displays in-progress jobs
- Shows recent exports
- Shows usage meters for exports and processing minutes
- Has "Create New Reel" and "Continue Draft" buttons

Currently, all API routes return **mock data**:
- `/api/jobs` - returns 5 static job objects
- `/api/exports` - returns 4 static export objects
- `/api/usage` - returns hardcoded usage stats

---

## Step 1: Authentication Setup

**Goal:** Protect API routes and identify the current user.

### Tasks

1. **Choose an auth provider**
   - Options: Clerk, NextAuth.js, Supabase Auth, Custom
   - Recommended: Clerk (fastest to integrate with Next.js)

2. **Install and configure auth**
   ```bash
   # Example for Clerk
   pnpm add @clerk/nextjs
   ```

3. **Create auth middleware**
   - Create `middleware.ts` to protect routes
   - Protect `/api/*` routes
   - Protect `/dashboard`, `/create`, `/review`, `/library`

4. **Add user session to requests**
   - Modify API routes to extract `userId` from session
   - Use `userId` for all database queries

### Deliverables
- [x] Auth provider installed and configured
- [x] Middleware protects all API routes
- [x] All API routes have access to `ctx.userId`

---

## Step 2: Database Connection

**Goal:** Connect API routes to the PostgreSQL database using Drizzle.

### Tasks

1. **Verify database schema**
   - Check `lib/db/schema.ts` for existing tables:
     - `users` - user accounts
     - `subscriptions` - plan info
     - `boosts` - Pro Boost add-on
     - `drafts` - draft content
     - `generations` - generation records
     - `variants` - generated variants
     - `assets` - library items
     - `usage_ledger` - usage tracking

2. **Set up database connection**
   ```bash
   # Create .env with database URL
   echo "DATABASE_URL=your-neon-connection-string" >> .env
   ```

3. **Create repository functions**
   - `lib/db/repos/jobs.ts` - query drafts + generations
   - `lib/db/repos/exports.ts` - query assets table
   - `lib/db/repos/usage.ts` - calculate usage from ledger

### Deliverables
- [x] `DATABASE_URL` set in environment
- [x] `lib/db/repos/jobs.ts` with `getRecentJobs(userId, limit)`
- [x] `lib/db/repos/exports.ts` with `getRecentExports(userId, limit)`
- [x] `lib/db/repos/usage.ts` with `getUserUsage(userId)`

---

## Step 3: Wire Jobs API

**Goal:** Replace mock data with real database queries.

### Tasks

1. **Implement `getRecentJobs` in repo**
   ```typescript
   // lib/db/repos/jobs.ts
   import { db } from "@/lib/db";
   import { drafts, generations } from "@/lib/db/schema";

   export async function getRecentJobs(userId: string, limit: number) {
     return await db.select({
       id: drafts.id,
       title: drafts.title,
       platform: drafts.platform,
       preset: drafts.preset,
       status: generations.status,
       progressPct: generations.progressPct,
       updatedAt: drafts.updatedAt,
     })
     .from(drafts)
     .leftJoin(generations, eq(drafts.id, generations.draftId))
     .where(eq(drafts.ownerId, userId))
     .orderBy(desc(drafts.updatedAt))
     .limit(limit);
   }
   ```

2. **Update `/api/jobs/route.ts`**
   - Remove mock data
   - Add auth check
   - Call `getRecentJobs(ctx.userId, limit)`

### Deliverables
- [x] `lib/db/repos/jobs.ts` implemented
- [x] `/api/jobs` returns real data from database

---

## Step 4: Wire Exports API

**Goal:** Replace mock exports with real library items.

### Tasks

1. **Implement `getRecentExports` in repo**
   ```typescript
   // lib/db/repos/exports.ts
   import { db } from "@/lib/db";
   import { assets } from "@/lib/db/schema";

   export async function getRecentExports(userId: string, limit: number) {
     return await db.select({
       id: assets.id,
       jobId: assets.jobId,
       title: assets.title,
       format: assets.format,
       createdAt: assets.createdAt,
     })
     .from(assets)
     .where(eq(assets.ownerId, userId))
     .orderBy(desc(assets.createdAt))
     .limit(limit);
   }
   ```

2. **Update `/api/exports/route.ts`**
   - Remove mock data
   - Add auth check
   - Call `getRecentExports(ctx.userId, limit)`

### Deliverables
- [x] `lib/db/repos/exports.ts` implemented
- [x] `/api/exports` returns real data from database

---

## Step 5: Wire Usage API

**Goal:** Calculate real usage from ledger and plan limits.

### Tasks

1. **Implement `getUserUsage` in repo**
   ```typescript
   // lib/db/repos/usage.ts
   import { db } from "@/lib/db";
   import { usageLedger, subscriptions, boosts } from "@/lib/db/schema";
   import { resolveEffectivePlan } from "@/billing/plans";

   export async function getUserUsage(userId: string) {
     const currentMonth = formatYYYYMM(new Date());

     // Sum usage from ledger
     const usage = await db.select({
       exportsCount: sql<number>`count(*)`,
       minutesUsed: sql<number>`coalesce(sum(minutes_used), 0)`,
     })
     .from(usageLedger)
     .where(and(
       eq(usageLedger.userId, userId),
       eq(usageLedger.month, currentMonth)
     ));

     // Get plan limits
     const subscription = await db.query.subscriptions.findFirst({
       where: eq(subscriptions.userId, userId),
     });

     const boost = await db.query.boosts.findFirst({
       where: and(
         eq(boosts.userId, userId),
         gt(boosts.expiresAt, new Date())
       ),
     });

     const limits = resolveEffectivePlan(subscription?.plan, boost?.expiresAt);

     return {
       plan: subscription?.plan ?? "free",
       exportsUsed: usage.exportsCount ?? 0,
       exportsLimit: limits.maxExportsPerMonth,
       minutesUsed: usage.minutesUsed ?? 0,
       minutesLimit: limits.maxProcessingMinutes,
       resetsAt: getMonthResetDate(),
     };
   }
   ```

2. **Update `/api/usage/route.ts`**
   - Remove mock data
   - Add auth check
   - Call `getUserUsage(ctx.userId)`

### Deliverables
- [x] `lib/db/repos/usage.ts` implemented
- [x] `/api/usage` returns real usage data

---

## Step 6: Implement Create Flow

**Goal:** Make the "Create New Reel" button functional.

### Tasks

1. **Create `/create/page.tsx`**
   - Form with:
     - Content topic/description
     - Platform selection (TikTok, Reels, Shorts)
     - Preset selection
   - Submit calls `POST /v1/create`

2. **Implement `POST /v1/create`**
   - Validate input with Zod
   - Check idempotency key
   - Enforce limits (monthly pool, hourly burst)
   - Acquire concurrency leases
   - Create draft + generation records
   - Enqueue job to QStash
   - Return 202 with `generation_id`, `draft_id`

3. **Redirect to `/review/[id]` after creation**

### Deliverables
- [x] `/create` page with form UI
- [x] `POST /v1/create` endpoint fully implemented
- [x] User redirected to review page after creation

---

## Step 7: Implement Review Flow

**Goal:** Allow users to review and export generated content.

### Tasks

1. **Create `/review/page.tsx`**
   - List drafts with their variants
   - Show generation status/progress
   - Allow regeneration (if within limits)
   - Allow saving to library

2. **Implement `GET /v1/generations/:id`**
   - Return generation status + variants
   - Include variant URLs when ready

3. **Implement `POST /v1/regenerate`**
   - Validate request
   - Check regen cooldown
   - Enforce monthly pool
   - Enqueue regen job
   - Return 202

4. **Implement `POST /v1/library/assets`**
   - Save variant to library
   - Create asset record

### Deliverables
- [x] `/review` page showing all drafts
- [x] `GET /v1/generations/:id` implemented
- [x] `POST /v1/regenerate` implemented
- [x] `POST /v1/library/assets` implemented

---

## Step 8: Implement Library Page

**Goal:** Show saved exports and allow management.

### Tasks

1. **Create `/library/page.tsx`**
   - List all saved assets
   - Filters: platform, tags, search
   - Pagination
   - Export/download options

2. **Implement `GET /v1/library/assets`**
   - Cursor pagination
   - Filters support
   - Return assets + `next_cursor`

### Deliverables
- [ ] `/library` page with full functionality
- [ ] `GET /v1/library/assets` implemented with pagination

---

## Step 9: Testing

**Goal:** Verify all flows work end-to-end.

### Tasks

1. **Unit tests**
   - Repository functions
   - Plan resolution logic
   - Usage calculation

2. **Integration tests**
   - Create → Poll → Review flow
   - Regenerate flow
   - Save to library flow

3. **Manual testing**
   - Create new reel from dashboard
   - Poll until generation complete
   - Review variants
   - Export/save to library
   - Verify usage meter updates

### Deliverables
- [ ] All repos have unit tests (>80% coverage)
- [ ] Key API flows have integration tests
- [ ] Manual testing checklist passed

---

## Quick Reference: File Changes Summary

| File | Change |
|------|--------|
| `middleware.ts` | Add auth protection |
| `lib/db/repositories.ts` | Add `getRecentJobs`, `getRecentExports`, `getUserUsage` functions |
| `app/api/jobs/route.ts` | Wire to repository |
| `app/api/exports/route.ts` | Wire to repository |
| `app/api/usage/route.ts` | Wire to repository |
| `app/api/v1/create/route.ts` | Implement create flow |
| `app/api/v1/regenerate/route.ts` | Implement regen flow |
| `app/api/v1/library/assets/route.ts` | Implement save to library |
| `app/api/v1/generations/[id]/route.ts` | Implement polling |
| `app/create/page.tsx` | Create form UI |
| `app/review/page.tsx` | Review UI |
| `app/library/page.tsx` | Library UI |

---

## Next Steps

Start with **Step 1: Authentication** - this is a prerequisite for all other steps. Once auth is in place, you can incrementally wire each API route to the database.
