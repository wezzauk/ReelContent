/**
 * Database schema definitions using Drizzle ORM
 */

import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  decimal,
  boolean,
  primaryKey,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/**
 * Plan type enum
 */
export const PLAN_TYPE = {
  BASIC: 'basic',
  STANDARD: 'standard',
  PRO: 'pro',
} as const;

export type PlanType = (typeof PLAN_TYPE)[keyof typeof PLAN_TYPE];

/**
 * Generation status enum
 */
export const GENERATION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type GenerationStatus =
  (typeof GENERATION_STATUS)[keyof typeof GENERATION_STATUS];

/**
 * Asset status enum
 */
export const ASSET_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const;

export type AssetStatus = (typeof ASSET_STATUS)[keyof typeof ASSET_STATUS];

/**
 * Platform enum for assets
 */
export const PLATFORM = {
  TIKTOK: 'tiktok',
  YOUTUBE_SHORTS: 'youtube_shorts',
  INSTAGRAM_REELS: 'instagram_reels',
} as const;

export type Platform = (typeof PLATFORM)[keyof typeof PLATFORM];

/**
 * Users table
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_created_at_idx').on(table.createdAt),
  ]
);

/**
 * Subscriptions table - stores billing plan info
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plan: text('plan', { enum: [PLAN_TYPE.BASIC, PLAN_TYPE.STANDARD, PLAN_TYPE.PRO] })
      .notNull()
      .default(PLAN_TYPE.BASIC),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status').notNull().default('active'), // active, canceled, past_due
    currentPeriodStart: timestamp('current_period_start').notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('subscriptions_user_id_idx').on(table.userId),
    index('subscriptions_stripe_customer_idx').on(table.stripeCustomerId),
    index('subscriptions_status_idx').on(table.status),
  ]
);

/**
 * Pro Boost add-on table
 */
export const boosts = pgTable(
  'boosts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stripePurchaseId: text('stripe_purchase_id').unique(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('boosts_user_id_idx').on(table.userId),
    index('boosts_expires_at_idx').on(table.expiresAt),
    index('boosts_active_idx').on(table.isActive, table.expiresAt),
  ]
);

/**
 * Drafts table - content drafts
 */
export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    prompt: text('prompt').notNull(),
    platform: text('platform', {
      enum: [PLATFORM.TIKTOK, PLATFORM.YOUTUBE_SHORTS, PLATFORM.INSTAGRAM_REELS],
    }).notNull(),
    settings: text('settings').default('{}'), // JSON settings
    selectedVariantId: uuid('selected_variant_id'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('drafts_owner_id_idx').on(table.ownerId),
    index('drafts_owner_created_idx').on(table.ownerId, table.createdAt),
    index('drafts_platform_idx').on(table.platform),
    index('drafts_archived_idx').on(table.isArchived),
  ]
);

/**
 * Generations table - generation job records
 */
export const generations = pgTable(
  'generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => drafts.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', {
      enum: [
        GENERATION_STATUS.PENDING,
        GENERATION_STATUS.PROCESSING,
        GENERATION_STATUS.COMPLETED,
        GENERATION_STATUS.FAILED,
      ],
    })
      .notNull()
      .default(GENERATION_STATUS.PENDING),
    errorMessage: text('error_message'),
    idempotencyKey: text('idempotency_key').unique(),
    // Regeneration tracking
    isRegen: boolean('is_regen').notNull().default(false),
    parentGenerationId: uuid('parent_generation_id'),
    regenType: text('regen_type'), // 'targeted' | 'full'
    metadata: text('metadata').default('{}'), // JSON for additional data
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('generations_draft_id_idx').on(table.draftId),
    index('generations_owner_id_idx').on(table.ownerId),
    index('generations_owner_created_idx').on(table.ownerId, table.createdAt),
    index('generations_status_idx').on(table.status),
    index('generations_idempotency_idx').on(table.idempotencyKey),
  ]
);

/**
 * Variants table - generated content variants
 */
export const variants = pgTable(
  'variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    generationId: uuid('generation_id')
      .notNull()
      .references(() => generations.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => drafts.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    variantIndex: integer('variant_index').notNull(),
    content: text('content').notNull(), // The actual generated text/script
    videoUrl: text('video_url'),
    thumbnailUrl: text('thumbnail_url'),
    duration: integer('duration'), // Duration in seconds if applicable
    metadata: text('metadata').default('{}'), // JSON for additional data
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('variants_generation_id_idx').on(table.generationId),
    index('variants_draft_id_idx').on(table.draftId),
    index('variants_owner_id_idx').on(table.ownerId),
    index('variants_owner_created_idx').on(table.ownerId, table.createdAt),
    primaryKey({ columns: [table.generationId, table.variantIndex] }),
  ]
);

/**
 * Assets table - library items
 */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id').references(() => drafts.id, { onDelete: 'set null' }),
    variantId: uuid('variant_id').references(() => variants.id, { onDelete: 'set null' }),
    title: text('title'),
    content: text('content'),
    platform: text('platform', {
      enum: [PLATFORM.TIKTOK, PLATFORM.YOUTUBE_SHORTS, PLATFORM.INSTAGRAM_REELS],
    }),
    tags: text('tags').array().default([]),
    status: text('status', {
      enum: [ASSET_STATUS.DRAFT, ASSET_STATUS.ACTIVE, ASSET_STATUS.ARCHIVED],
    })
      .notNull()
      .default(ASSET_STATUS.DRAFT),
    metadata: text('metadata').default('{}'), // JSON for additional data
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('assets_owner_id_idx').on(table.ownerId),
    index('assets_owner_created_idx').on(table.ownerId, table.createdAt),
    index('assets_status_idx').on(table.status),
    index('assets_platform_idx').on(table.platform),
    index('assets_tags_idx').on(table.tags), // Array GIN index handled by dialect
    index('assets_draft_id_idx').on(table.draftId),
    index('assets_variant_id_idx').on(table.variantId),
  ]
);

/**
 * Usage ledger table - usage tracking
 */
export const usageLedger = pgTable(
  'usage_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    generationId: uuid('generation_id').references(() => generations.id, {
      onDelete: 'set null',
    }),
    month: text('month').notNull(), // Format: YYYY-MM
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    costEstimate: decimal('cost_estimate', { precision: 10, scale: 6 }),
    model: text('model').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('usage_ledger_user_id_idx').on(table.userId),
    index('usage_ledger_month_idx').on(table.month),
    index('usage_ledger_user_month_idx').on(table.userId, table.month),
    index('usage_ledger_generation_idx').on(table.generationId),
    check('usage_ledger_tokens_check', sql`${table.totalTokens} = ${table.promptTokens} + ${table.completionTokens}`),
  ]
);

/**
 * Define relationships for the schema
 */
export const usersRelations = relations(users, ({ one, many }) => ({
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
  boosts: many(boosts),
  drafts: many(drafts),
  generations: many(generations),
  assets: many(assets),
  usageLedger: many(usageLedger),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const boostsRelations = relations(boosts, ({ one }) => ({
  user: one(users, {
    fields: [boosts.userId],
    references: [users.id],
  }),
}));

export const draftsRelations = relations(drafts, ({ one, many }) => ({
  owner: one(users, {
    fields: [drafts.ownerId],
    references: [users.id],
  }),
  generations: many(generations),
  variants: many(variants),
  assets: many(assets),
}));

export const generationsRelations = relations(generations, ({ one, many }) => ({
  draft: one(drafts, {
    fields: [generations.draftId],
    references: [drafts.id],
  }),
  owner: one(users, {
    fields: [generations.ownerId],
    references: [users.id],
  }),
  parent: one(generations, {
    fields: [generations.parentGenerationId],
    references: [generations.id],
  }),
  variants: many(variants),
  usageLedger: many(usageLedger),
}));

export const variantsRelations = relations(variants, ({ one }) => ({
  generation: one(generations, {
    fields: [variants.generationId],
    references: [generations.id],
  }),
  draft: one(drafts, {
    fields: [variants.draftId],
    references: [drafts.id],
  }),
  owner: one(users, {
    fields: [variants.ownerId],
    references: [users.id],
  }),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  owner: one(users, {
    fields: [assets.ownerId],
    references: [users.id],
  }),
  draft: one(drafts, {
    fields: [assets.draftId],
    references: [drafts.id],
  }),
  variant: one(variants, {
    fields: [assets.variantId],
    references: [variants.id],
  }),
}));

export const usageLedgerRelations = relations(usageLedger, ({ one }) => ({
  user: one(users, {
    fields: [usageLedger.userId],
    references: [users.id],
  }),
  generation: one(generations, {
    fields: [usageLedger.generationId],
    references: [generations.id],
  }),
}));

// Type exports for convenience
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Boost = typeof boosts.$inferSelect;
export type NewBoost = typeof boosts.$inferInsert;
export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;
export type Generation = typeof generations.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;
export type Variant = typeof variants.$inferSelect;
export type NewVariant = typeof variants.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type UsageLedger = typeof usageLedger.$inferSelect;
export type NewUsageLedger = typeof usageLedger.$inferInsert;
