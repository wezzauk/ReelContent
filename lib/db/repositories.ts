/**
 * Database repositories for data access layer
 */

import { eq, desc, asc, and, gte, lte, like, inArray, sql } from 'drizzle-orm';
import { db, getDb } from './client';
import {
  users,
  subscriptions,
  boosts,
  drafts,
  generations,
  variants,
  assets,
  usageLedger,
  personas,
  type User,
  type NewUser,
  type Subscription,
  type NewSubscription,
  type Boost,
  type NewBoost,
  type Draft,
  type NewDraft,
  type Generation,
  type NewGeneration,
  type Variant,
  type NewVariant,
  type Asset,
  type NewAsset,
  type UsageLedger,
  type NewUsageLedger,
  type Persona,
  type NewPersona,
  GENERATION_STATUS,
  ASSET_STATUS,
  PLAN_TYPE,
  type Platform,
  type GenerationStatus,
  type AssetStatus,
} from './schema';

// Type for pagination cursor
export interface PaginationCursor {
  id: string;
  createdAt: Date;
}

/**
 * User Repository
 */
export class UserRepository {
  private db = getDb();

  async create(data: NewUser): Promise<User> {
    const [user] = await this.db.insert(users).values(data).returning();
    return user;
  }

  async findById(id: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    return user || null;
  }

  async update(id: string, data: Partial<NewUser>): Promise<User | null> {
    const [user] = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

/**
 * Subscription Repository
 */
export class SubscriptionRepository {
  private db = getDb();

  async create(data: NewSubscription): Promise<Subscription> {
    const [subscription] = await this.db
      .insert(subscriptions)
      .values(data)
      .returning();
    return subscription;
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return subscription || null;
  }

  async findByStripeCustomerId(
    stripeCustomerId: string
  ): Promise<Subscription | null> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, stripeCustomerId));
    return subscription || null;
  }

  async update(
    id: string,
    data: Partial<NewSubscription>
  ): Promise<Subscription | null> {
    const [subscription] = await this.db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return subscription || null;
  }

  async getEffectivePlan(
    userId: string
  ): Promise<{ plan: string; isPro: boolean }> {
    // Get base subscription
    const subscription = await this.findByUserId(userId);
    if (!subscription) {
      return { plan: PLAN_TYPE.BASIC, isPro: false };
    }

    // Check for active Pro Boost
    const [boost] = await this.db
      .select()
      .from(boosts)
      .where(
        and(
          eq(boosts.userId, userId),
          eq(boosts.isActive, true),
          gte(boosts.expiresAt, new Date())
        )
      )
      .orderBy(desc(boosts.expiresAt))
      .limit(1);

    const isPro = boost !== undefined || subscription.plan === PLAN_TYPE.PRO;
    return { plan: isPro ? PLAN_TYPE.PRO : subscription.plan, isPro };
  }
}

/**
 * Boost Repository
 */
export class BoostRepository {
  private db = getDb();

  async create(data: NewBoost): Promise<Boost> {
    const [boost] = await this.db.insert(boosts).values(data).returning();
    return boost;
  }

  async findByUserId(userId: string): Promise<Boost[]> {
    return this.db
      .select()
      .from(boosts)
      .where(eq(boosts.userId, userId))
      .orderBy(desc(boosts.createdAt));
  }

  async findActiveByUserId(userId: string): Promise<Boost | null> {
    const [boost] = await this.db
      .select()
      .from(boosts)
      .where(
        and(
          eq(boosts.userId, userId),
          eq(boosts.isActive, true),
          gte(boosts.expiresAt, new Date())
        )
      )
      .orderBy(desc(boosts.expiresAt))
      .limit(1);
    return boost || null;
  }

  async expire(id: string): Promise<Boost | null> {
    const [boost] = await this.db
      .update(boosts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(boosts.id, id))
      .returning();
    return boost || null;
  }

  async getActiveProBoost(userId: string): Promise<Boost | null> {
    return this.findActiveByUserId(userId);
  }
}

/**
 * Draft Repository
 */
export class DraftRepository {
  private db = getDb();

  async create(data: NewDraft): Promise<Draft> {
    const [draft] = await this.db.insert(drafts).values(data).returning();
    return draft;
  }

  async findById(id: string): Promise<Draft | null> {
    const [draft] = await this.db.select().from(drafts).where(eq(drafts.id, id));
    return draft || null;
  }

  async findByOwnerId(
    ownerId: string,
    options?: {
      archived?: boolean;
      platform?: Platform;
      limit?: number;
      cursor?: PaginationCursor;
    }
  ): Promise<Draft[]> {
    const conditions = [eq(drafts.ownerId, ownerId)];

    if (options?.archived !== undefined) {
      conditions.push(eq(drafts.isArchived, options.archived));
    }

    if (options?.platform) {
      conditions.push(eq(drafts.platform, options.platform));
    }

    if (options?.cursor) {
      conditions.push(
        sql`(${drafts.createdAt}, ${drafts.id}) < (${options.cursor.createdAt}, ${options.cursor.id})`
      );
    }

    const query = this.db
      .select()
      .from(drafts)
      .where(and(...conditions))
      .orderBy(desc(drafts.createdAt), desc(drafts.id))
      .limit(options?.limit ?? 100);

    return query;
  }

  async update(
    id: string,
    data: Partial<NewDraft>
  ): Promise<Draft | null> {
    const [draft] = await this.db
      .update(drafts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(drafts.id, id))
      .returning();
    return draft || null;
  }

  async selectVariant(draftId: string, variantId: string): Promise<Draft | null> {
    return this.update(draftId, { selectedVariantId: variantId });
  }

  async archive(id: string): Promise<Draft | null> {
    return this.update(id, { isArchived: true });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(drafts).where(eq(drafts.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

/**
 * Generation Repository
 */
export class GenerationRepository {
  private db = getDb();

  async create(data: NewGeneration): Promise<Generation> {
    const [generation] = await this.db.insert(generations).values(data).returning();
    return generation;
  }

  async findById(id: string): Promise<Generation | null> {
    const [generation] = await this.db
      .select()
      .from(generations)
      .where(eq(generations.id, id));
    return generation || null;
  }

  async findByIdemKey(idempotencyKey: string): Promise<Generation | null> {
    const [generation] = await this.db
      .select()
      .from(generations)
      .where(eq(generations.idempotencyKey, idempotencyKey));
    return generation || null;
  }

  async findByDraftId(draftId: string): Promise<Generation[]> {
    return this.db
      .select()
      .from(generations)
      .where(eq(generations.draftId, draftId))
      .orderBy(desc(generations.createdAt));
  }

  async findByOwnerId(
    ownerId: string,
    options?: {
      status?: GenerationStatus;
      limit?: number;
      cursor?: PaginationCursor;
    }
  ): Promise<Generation[]> {
    const conditions = [eq(generations.ownerId, ownerId)];

    if (options?.status) {
      conditions.push(eq(generations.status, options.status));
    }

    if (options?.cursor) {
      conditions.push(
        sql`(${generations.createdAt}, ${generations.id}) < (${options.cursor.createdAt}, ${options.cursor.id})`
      );
    }

    const query = this.db
      .select()
      .from(generations)
      .where(and(...conditions))
      .orderBy(desc(generations.createdAt), desc(generations.id))
      .limit(options?.limit ?? 100);

    return query;
  }

  async updateStatus(
    id: string,
    status: (typeof GENERATION_STATUS)[keyof typeof GENERATION_STATUS],
    additionalData?: Partial<Generation>
  ): Promise<Generation | null> {
    const data: Partial<Generation> = {
      ...additionalData,
      status,
      updatedAt: new Date(),
    };

    if (status === GENERATION_STATUS.COMPLETED) {
      data.completedAt = new Date();
    }

    const [generation] = await this.db
      .update(generations)
      .set(data)
      .where(eq(generations.id, id))
      .returning();
    return generation || null;
  }

  async markFailed(id: string, errorMessage: string): Promise<Generation | null> {
    return this.updateStatus(id, GENERATION_STATUS.FAILED, { errorMessage });
  }
}

/**
 * Variant Repository
 */
export class VariantRepository {
  private db = getDb();

  async create(data: NewVariant): Promise<Variant> {
    const [variant] = await this.db.insert(variants).values(data).returning();
    return variant;
  }

  async createMany(data: NewVariant[]): Promise<Variant[]> {
    const result = await this.db.insert(variants).values(data).returning();
    return result;
  }

  async findById(id: string): Promise<Variant | null> {
    const [variant] = await this.db.select().from(variants).where(eq(variants.id, id));
    return variant || null;
  }

  async findByGenerationId(generationId: string): Promise<Variant[]> {
    return this.db
      .select()
      .from(variants)
      .where(eq(variants.generationId, generationId))
      .orderBy(asc(variants.variantIndex));
  }

  async findByDraftId(draftId: string): Promise<Variant[]> {
    return this.db
      .select()
      .from(variants)
      .where(eq(variants.draftId, draftId))
      .orderBy(desc(variants.createdAt));
  }

  async deleteByGenerationId(generationId: string): Promise<boolean> {
    const result = await this.db
      .delete(variants)
      .where(eq(variants.generationId, generationId));
    return (result.rowCount ?? 0) > 0;
  }
}

/**
 * Asset Repository
 */
export class AssetRepository {
  private db = getDb();

  async create(data: NewAsset): Promise<Asset> {
    const [asset] = await this.db.insert(assets).values(data).returning();
    return asset;
  }

  async findById(id: string): Promise<Asset | null> {
    const [asset] = await this.db.select().from(assets).where(eq(assets.id, id));
    return asset || null;
  }

  async findByOwnerId(
    ownerId: string,
    options?: {
      status?: AssetStatus;
      platform?: Platform;
      tags?: string[];
      search?: string;
      limit?: number;
      cursor?: PaginationCursor;
    }
  ): Promise<Asset[]> {
    const conditions = [eq(assets.ownerId, ownerId)];

    if (options?.status) {
      conditions.push(eq(assets.status, options.status));
    }

    if (options?.platform) {
      conditions.push(eq(assets.platform, options.platform));
    }

    if (options?.tags && options.tags.length > 0) {
      conditions.push(sql`${assets.tags} && ${options.tags}`);
    }

    if (options?.search) {
      conditions.push(
        sql`(${assets.title} ILIKE ${`%${options.search}%`} OR ${assets.content} ILIKE ${`%${options.search}%`})`
      );
    }

    if (options?.cursor) {
      conditions.push(
        sql`(${assets.createdAt}, ${assets.id}) < (${options.cursor.createdAt}, ${options.cursor.id})`
      );
    }

    const query = this.db
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(desc(assets.createdAt), desc(assets.id))
      .limit(options?.limit ?? 100);

    return query;
  }

  async update(
    id: string,
    data: Partial<NewAsset>
  ): Promise<Asset | null> {
    const [asset] = await this.db
      .update(assets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(assets.id, id))
      .returning();
    return asset || null;
  }

  async updateStatus(
    id: string,
    status: (typeof ASSET_STATUS)[keyof typeof ASSET_STATUS]
  ): Promise<Asset | null> {
    return this.update(id, { status });
  }

  async archive(id: string): Promise<Asset | null> {
    return this.updateStatus(id, ASSET_STATUS.ARCHIVED);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(assets).where(eq(assets.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

/**
 * Usage Ledger Repository
 */
export class UsageLedgerRepository {
  private db = getDb();

  async create(data: NewUsageLedger): Promise<UsageLedger> {
    const [record] = await this.db.insert(usageLedger).values(data).returning();
    return record;
  }

  async findByUserAndMonth(userId: string, month: string): Promise<UsageLedger[]> {
    return this.db
      .select()
      .from(usageLedger)
      .where(
        and(eq(usageLedger.userId, userId), eq(usageLedger.month, month))
      )
      .orderBy(desc(usageLedger.createdAt));
  }

  async getMonthlyTotals(
    userId: string,
    month: string
  ): Promise<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costEstimate: number;
    generationCount: number;
  }> {
    const result = await this.db
      .select({
        promptTokens: sql<number>`COALESCE(SUM(${usageLedger.promptTokens}), 0)`,
        completionTokens: sql<number>`COALESCE(SUM(${usageLedger.completionTokens}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${usageLedger.totalTokens}), 0)`,
        costEstimate: sql<number>`COALESCE(SUM(${usageLedger.costEstimate}), 0)`,
        generationCount: sql<number>`COUNT(DISTINCT ${usageLedger.generationId})`,
      })
      .from(usageLedger)
      .where(
        and(eq(usageLedger.userId, userId), eq(usageLedger.month, month))
      );

    return result[0] || {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costEstimate: 0,
      generationCount: 0,
    };
  }

  async getGenerationCountByUserAndMonth(userId: string, month: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`COUNT(DISTINCT ${usageLedger.generationId})` })
      .from(usageLedger)
      .where(
        and(eq(usageLedger.userId, userId), eq(usageLedger.month, month))
      );

    return result[0]?.count || 0;
  }
}

/**
 * Persona Repository
 */
export class PersonaRepository {
  private db = getDb();

  async create(data: NewPersona): Promise<Persona> {
    const [persona] = await this.db.insert(personas).values(data).returning();
    return persona;
  }

  async findById(id: string): Promise<Persona | null> {
    const [persona] = await this.db.select().from(personas).where(eq(personas.id, id));
    return persona || null;
  }

  async findByUserId(userId: string): Promise<Persona | null> {
    const [persona] = await this.db
      .select()
      .from(personas)
      .where(eq(personas.userId, userId))
      .orderBy(desc(personas.isDefault), desc(personas.createdAt))
      .limit(1);
    return persona || null;
  }

  async findAllByUserId(userId: string): Promise<Persona[]> {
    return this.db
      .select()
      .from(personas)
      .where(eq(personas.userId, userId))
      .orderBy(desc(personas.isDefault), desc(personas.createdAt));
  }

  async findDefault(userId: string): Promise<Persona | null> {
    const [persona] = await this.db
      .select()
      .from(personas)
      .where(and(eq(personas.userId, userId), eq(personas.isDefault, true)))
      .limit(1);
    return persona || null;
  }

  async update(id: string, data: Partial<NewPersona>): Promise<Persona | null> {
    const [persona] = await this.db
      .update(personas)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(personas.id, id))
      .returning();
    return persona || null;
  }

  async setDefault(userId: string, personaId: string): Promise<void> {
    await this.db
      .update(personas)
      .set({ isDefault: false })
      .where(and(eq(personas.userId, userId), eq(personas.isDefault, true)));

    await this.db
      .update(personas)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(personas.id, personaId));
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(personas).where(eq(personas.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

// Export singleton instances for convenience
export const userRepo = new UserRepository();
export const subscriptionRepo = new SubscriptionRepository();
export const boostRepo = new BoostRepository();
export const draftRepo = new DraftRepository();
export const generationRepo = new GenerationRepository();
export const variantRepo = new VariantRepository();
export const assetRepo = new AssetRepository();
export const usageLedgerRepo = new UsageLedgerRepository();
export const personaRepo = new PersonaRepository();

// ============================================================================
// Dashboard-specific query functions
// ============================================================================

import { type Job, type JobStatus, type ExportItem, type Usage } from '@/lib/types';

/**
 * Map generation status to dashboard job status
 */
function mapGenerationStatusToJobStatus(
  status: string | null,
  progressPct: number | null
): JobStatus {
  if (status === 'failed') return 'failed';
  if (status === 'processing' || status === 'pending') return 'processing';
  if (status === 'completed') {
    if (progressPct !== null && progressPct < 100) return 'processing';
    return 'ready';
  }
  return 'processing';
}

/**
 * Get recent jobs for the dashboard
 * Combines draft info with the latest generation status
 */
export async function getRecentJobs(userId: string, limit: number = 10): Promise<Job[]> {
  const db = getDb();

  // Get drafts with their latest generation
  const results = await db
    .select({
      draftId: drafts.id,
      title: drafts.title,
      platform: drafts.platform,
      preset: drafts.settings,
      genStatus: generations.status,
      genId: generations.id,
      updatedAt: drafts.updatedAt,
    })
    .from(drafts)
    .leftJoin(
      generations,
      and(
        eq(drafts.id, generations.draftId),
        // Subquery to get only the latest generation per draft
        sql`${generations.id} = (
          SELECT id FROM ${generations} g2
          WHERE g2.draft_id = ${drafts.id}
          ORDER BY g2.created_at DESC
          LIMIT 1
        )`
      )
    )
    .where(eq(drafts.ownerId, userId))
    .orderBy(desc(drafts.updatedAt))
    .limit(limit);

  return results.map((row) => ({
    id: row.draftId,
    title: row.title ?? 'Untitled Draft',
    platform: mapDbPlatformToFrontend(row.platform),
    preset: row.preset ?? 'Default',
    status: mapGenerationStatusToJobStatus(row.genStatus, row.genId ? 50 : 0), // Approximate progress
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  }));
}

/**
 * Get recent exports (assets) for the dashboard
 */
export async function getRecentExports(
  userId: string,
  limit: number = 10
): Promise<ExportItem[]> {
  const db = getDb();

  const results = await db
    .select({
      id: assets.id,
      draftId: assets.draftId,
      title: assets.title,
      createdAt: assets.createdAt,
    })
    .from(assets)
    .where(
      and(
        eq(assets.ownerId, userId),
        eq(assets.status, ASSET_STATUS.ACTIVE)
      )
    )
    .orderBy(desc(assets.createdAt))
    .limit(limit);

  return results.map((row) => ({
    id: row.id,
    jobId: row.draftId ?? 'unknown',
    title: row.title ?? 'Untitled Export',
    format: 'mp4' as const, // Default format
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  }));
}

/**
 * Get user usage statistics for the dashboard
 */
export async function getUserUsage(userId: string): Promise<Usage> {
  const db = getDb();

  // Get current month key
  const currentMonth = formatMonthKey(new Date());

  // Get usage from ledger
  const usageResult = await db
    .select({
      generationCount: sql<number>`COALESCE(COUNT(DISTINCT ${usageLedger.generationId}), 0)`,
    })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.userId, userId),
        eq(usageLedger.month, currentMonth)
      )
    );

  const exportsUsed = usageResult[0]?.generationCount ?? 0;

  // Get subscription
  const subscription = await subscriptionRepo.findByUserId(userId);

  // Get active boost
  const boost = await boostRepo.findActiveByUserId(userId);

  // Resolve effective plan and limits
  const effectivePlan = resolveEffectivePlan(
    (subscription?.plan as PlanType) ?? PLAN_TYPE.BASIC,
    boost?.expiresAt?.toISOString() ?? null
  );
  const limits = PLANS[effectivePlan];

  // Calculate reset date (first of next month)
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    plan: effectivePlan as 'free' | 'starter' | 'pro',
    exportsUsed,
    exportsLimit: limits.gensPerMonth,
    minutesUsed: 0, // Not tracking minutes directly, using generations count
    minutesLimit: limits.gensPerMonth, // Using gensPerMonth as proxy for minutes
    resetsAt: nextMonth.toISOString(),
  };
}

// ============================================================================
// Helper functions
// ============================================================================

import { type PlanType } from '../db/schema';
import { PLANS, resolveEffectivePlan } from '../billing/plans';
import { formatMonthKey } from '../billing/plans';

/**
 * Map database platform to frontend platform
 */
function mapDbPlatformToFrontend(dbPlatform: string | null): 'tiktok' | 'reels' | 'shorts' {
  switch (dbPlatform) {
    case 'tiktok':
      return 'tiktok';
    case 'instagram_reels':
      return 'reels';
    case 'youtube_shorts':
      return 'shorts';
    default:
      return 'reels';
  }
}
