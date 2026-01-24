--[[
  idempotency_get_set.lua

  Atomically checks and sets an idempotency key.

  KEYS[1] = idempotency key
  ARGV[1] = value to store (JSON)
  ARGV[2] = TTL in seconds

  Returns:
    If first call: { 1, "set", value }
    If already set: { 0, "exists", existing_value }
--]]

local key = KEYS[1]
local value = ARGV[1]
local ttl = tonumber(ARGV[2]) or 86400

-- Check if key exists
local existing = redis.call('GET', key)

if existing then
  return { 0, 'exists', existing }
end

-- Set the key
redis.call('SET', key, value, 'EX', ttl)

return { 1, 'set', value }
