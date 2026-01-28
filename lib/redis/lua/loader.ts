/**
 * Lua script loader - loads and registers Lua scripts with the Redis client
 *
 * Scripts are loaded lazily on first use and cached for subsequent calls.
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
 * Scripts directory path
 */
const SCRIPTS_DIR = path.join(process.cwd(), 'lib', 'redis', 'lua');

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
 * Load all Lua scripts from the scripts directory
 */
async function loadAllScriptsInternal(): Promise<void> {
  try {
    const entries = await fs.readdir(SCRIPTS_DIR, { withFileTypes: true });
    const luaFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.lua'));

    await Promise.all(luaFiles.map((e) => loadScript(redis, path.join(SCRIPTS_DIR, e.name))));
  } catch (error) {
    console.error('Failed to load Lua scripts:', error);
  }
}

/**
 * Get a script by name, loading it if necessary
 *
 * @param name - Script name (without .lua extension)
 * @returns Script info or undefined if not found
 */
export async function getScript(name: string): Promise<ScriptInfo | undefined> {
  // Check cache first
  if (scriptRegistry.has(name)) {
    return scriptRegistry.get(name);
  }

  // Load all scripts on first call
  if (scriptRegistry.size === 0) {
    await loadAllScriptsInternal();
  }

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
