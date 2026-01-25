/**
 * Usage Rollup Utility
 *
 * Aggregates usage_ledger data into summary tables for faster queries.
 * Run daily via cron or scheduled task.
 */

import { db, getDb } from './client';
import { usageLedger, usageRollups, users } from './schema';
import { and, eq, gte, sql, desc } from 'drizzle-orm';

export type PeriodType = 'daily' | 'monthly';

/**
 * Generate period string for daily or monthly aggregation
 */
function getPeriodString(date: Date, periodType: PeriodType): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  if (periodType === 'monthly') {
    return `${year}-${month}`;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Get the start date for aggregation based on period type
 */
function getStartDate(periodType: PeriodType): Date {
  const now = new Date();

  if (periodType === 'monthly') {
    // Start of current month
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  // Start of yesterday (we aggregate previous day's data)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

/**
 * Rollup result interface
 */
interface RollupResult {
  userId: string;
  period: string;
  periodType: PeriodType;
  generationCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costEstimate: number | null;
}

/**
 * Aggregate daily usage for a specific date
 */
export async function aggregateDailyUsage(targetDate: Date): Promise<number> {
  const db = getDb();
  const period = getPeriodString(targetDate, 'daily');

  // Get start and end of target date
  const startOfDay = new Date(Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate()
  ));
  const endOfDay = new Date(Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate() + 1
  ));

  // Aggregate usage by user for the day
  const aggregated = await db
    .select({
      userId: usageLedger.userId,
      generationCount: sql<number>`COUNT(DISTINCT ${usageLedger.generationId})`,
      promptTokens: sql<number>`COALESCE(SUM(${usageLedger.promptTokens}), 0)`,
      completionTokens: sql<number>`COALESCE(SUM(${usageLedger.completionTokens}), 0)`,
      totalTokens: sql<number>`COALESCE(SUM(${usageLedger.totalTokens}), 0)`,
      costEstimate: sql<number | null>`COALESCE(SUM(${usageLedger.costEstimate}), 0)::decimal`,
    })
    .from(usageLedger)
    .where(
      and(
        gte(usageLedger.createdAt, startOfDay),
        sql`${usageLedger.createdAt} < ${endOfDay}`
      )
    )
    .groupBy(usageLedger.userId);

  let inserted = 0;

  for (const row of aggregated) {
    if (row.generationCount === 0) continue;

    // Upsert the rollup
    const existing = await db
      .select({ id: usageRollups.id })
      .from(usageRollups)
      .where(
        and(
          eq(usageRollups.userId, row.userId!),
          eq(usageRollups.period, period),
          eq(usageRollups.periodType, 'daily')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing rollup
      await db
        .update(usageRollups)
        .set({
          generationCount: row.generationCount,
          promptTokens: row.promptTokens,
          completionTokens: row.completionTokens,
          totalTokens: row.totalTokens,
          costEstimate: row.costEstimate,
          updatedAt: new Date(),
        })
        .where(eq(usageRollups.id, existing[0].id));
    } else {
      // Insert new rollup
      await db.insert(usageRollups).values({
        userId: row.userId!,
        period,
        periodType: 'daily',
        generationCount: row.generationCount,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        costEstimate: row.costEstimate,
      });
    }
    inserted++;
  }

  return inserted;
}

/**
 * Aggregate monthly usage for a specific month
 */
export async function aggregateMonthlyUsage(year: number, month: number): Promise<number> {
  const db = getDb();
  const period = getPeriodString(new Date(year, month - 1), 'monthly');

  // Get start and end of month
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const endOfMonth = new Date(Date.UTC(year, month, 1));

  // Aggregate usage by user for the month
  const aggregated = await db
    .select({
      userId: usageLedger.userId,
      generationCount: sql<number>`COUNT(DISTINCT ${usageLedger.generationId})`,
      promptTokens: sql<number>`COALESCE(SUM(${usageLedger.promptTokens}), 0)`,
      completionTokens: sql<number>`COALESCE(SUM(${usageLedger.completionTokens}), 0)`,
      totalTokens: sql<number>`COALESCE(SUM(${usageLedger.totalTokens}), 0)`,
      costEstimate: sql<number | null>`COALESCE(SUM(${usageLedger.costEstimate}), 0)::decimal`,
    })
    .from(usageLedger)
    .where(
      and(
        gte(usageLedger.createdAt, startOfMonth),
        sql`${usageLedger.createdAt} < ${endOfMonth}`
      )
    )
    .groupBy(usageLedger.userId);

  let inserted = 0;

  for (const row of aggregated) {
    if (row.generationCount === 0) continue;

    // Upsert the rollup
    const existing = await db
      .select({ id: usageRollups.id })
      .from(usageRollups)
      .where(
        and(
          eq(usageRollups.userId, row.userId!),
          eq(usageRollups.period, period),
          eq(usageRollups.periodType, 'monthly')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing rollup
      await db
        .update(usageRollups)
        .set({
          generationCount: row.generationCount,
          promptTokens: row.promptTokens,
          completionTokens: row.completionTokens,
          totalTokens: row.totalTokens,
          costEstimate: row.costEstimate,
          updatedAt: new Date(),
        })
        .where(eq(usageRollups.id, existing[0].id));
    } else {
      // Insert new rollup
      await db.insert(usageRollups).values({
        userId: row.userId!,
        period,
        periodType: 'monthly',
        generationCount: row.generationCount,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        costEstimate: row.costEstimate,
      });
    }
    inserted++;
  }

  return inserted;
}

/**
 * Run daily rollup job
 * Should be scheduled to run once per day (e.g., via Vercel Cron)
 */
export async function runDailyRollup(): Promise<{ date: string; records: number }> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const records = await aggregateDailyUsage(yesterday);

  return {
    date: getPeriodString(yesterday, 'daily'),
    records,
  };
}

/**
 * Run monthly rollup job
 * Should be scheduled to run once per day to keep monthly totals fresh
 */
export async function runMonthlyRollup(): Promise<{ month: string; records: number }> {
  const now = new Date();
  const records = await aggregateMonthlyUsage(now.getUTCFullYear(), now.getUTCMonth());

  return {
    month: getPeriodString(now, 'monthly'),
    records,
  };
}

/**
 * Get usage summary from rollups (faster than querying ledger directly)
 */
export async function getUsageSummary(
  userId: string,
  periodType: PeriodType,
  periods: string[]
): Promise<Array<{
  period: string;
  generationCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costEstimate: number | null;
}>> {
  const db = getDb();

  const results = await db
    .select({
      period: usageRollups.period,
      generationCount: usageRollups.generationCount,
      promptTokens: usageRollups.promptTokens,
      completionTokens: usageRollups.completionTokens,
      totalTokens: usageRollups.totalTokens,
      costEstimate: usageRollups.costEstimate,
    })
    .from(usageRollups)
    .where(
      and(
        eq(usageRollups.userId, userId),
        eq(usageRollups.periodType, periodType),
        sql`${usageRollups.period} IN ${periods}`
      )
    )
    .orderBy(desc(usageRollups.period));

  return results;
}
