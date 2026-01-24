--[[
  check_and_set_cooldown.lua

  Checks and sets a cooldown on an operation (e.g., regeneration).

  KEYS[1] = cooldown key
  ARGV[1] = cooldown_duration_seconds
  ARGV[2] = operation_identifier (for logging/error messages)

  Returns:
    If cooldown not active: { 1, "cooldown_set", ttl_remaining }
    If cooldown active: { 0, "cooldown_active", ttl_remaining }
--]]

local key = KEYS[1]
local cooldownSeconds = tonumber(ARGV[1])
local operationId = ARGV[2]

-- Check if cooldown key exists
local exists = redis.call('EXISTS', key)

if exists == 1 then
  -- Cooldown is active, return TTL remaining
  local ttl = redis.call('TTL', key)
  return { 0, 'cooldown_active', ttl }
end

-- Set the cooldown
redis.call('SET', key, operationId, 'EX', cooldownSeconds)

return { 1, 'cooldown_set', cooldownSeconds }
