/**
 * Lua script loader - loads and registers Lua scripts with the Redis client
 *
 * Scripts are loaded once at startup and called by their registered SHA.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { redis, type RedisClient } from '../client';

/**
 * Script metadata interface
 */
interface ScriptInfo {
  name: string;
  sha: string;
}

/**
 * Registry of loaded Lua scripts
 */
const scriptRegistry = new Map<string, ScriptInfo>();

/**
 * Load a Lua script from file and register with Redis
 *
 * @param client - Redis client to register with
 * @param scriptPath - Path to the .lua file
 * @returns Script name (filename without extension)
 */
async function loadScript(client: RedisClient, scriptPath: string): Promise<string> {
  const scriptContent = await fs.readFile(scriptPath, 'utf-8');
  const name = path.basename(scriptPath, '.lua');
  const sha = await client.scriptLoad(scriptContent);

  scriptRegistry.set(name, { name, sha });

  return name;
}

/**
 * Load all Lua scripts from a directory
 *
 * @param client - Redis client to register with
 * @param dirPath - Path to directory containing .lua files
 * @returns Map of script names to their info
 */
export async function loadAllScripts(client: RedisClient, dirPath: string): Promise<Map<string, ScriptInfo>> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const luaFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.lua'));

  await Promise.all(luaFiles.map((e) => loadScript(client, path.join(dirPath, e.name))));

  return scriptRegistry;
}

/**
 * Get a script by name
 *
 * @param name - Script name (without .lua extension)
 * @returns Script info or undefined if not found
 */
export function getScript(name: string): ScriptInfo | undefined {
  return scriptRegistry.get(name);
}

/**
 * Get all loaded scripts
 *
 * @returns Array of script info
 */
export function getAllScripts(): ScriptInfo[] {
  return Array.from(scriptRegistry.values());
}

/**
 * Evict all scripts from Redis (for testing/cleanup)
 */
export async function flushScripts(): Promise<void> {
  await redis.scriptFlush();
  scriptRegistry.clear();
}

/**
 * Script names enum for type safety
 */
export const LuaScripts = {
  COUNTER_WITH_LIMIT: 'counter_with_limit',
  SEMAPHORE_ACQUIRE: 'semaphore_acquire',
  SEMAPHORE_RELEASE: 'semaphore_release',
  CHECK_AND_SET_COOLDOWN: 'check_and_set_cooldown',
  IDEMPOTENCY_GET_SET: 'idempotency_get_set',
} as const;

export type LuaScriptName = (typeof LuaScripts)[keyof typeof LuaScripts];
