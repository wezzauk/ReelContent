/**
 * Database client and connection management
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL || '');

/**
 * Database client instance
 */
export const db = drizzle(sql, { schema });

/**
 * Get database client for use in API routes and workers
 */
export function getDb() {
  return db;
}

/**
 * Check database connectivity
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
