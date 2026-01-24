--[[
  counter_with_limit.lua

  Atomically increments a counter and checks against a limit.

  KEYS[1] = the counter key
  ARGV[1] = increment amount (default 1)
  ARGV[2] = limit (max allowed value)
  ARGV[3] = TTL in seconds (optional, 0 = no expiry)

  Returns:
    If under limit: { true, new_count, remaining }
    If at/over limit: { false, current_count, 0 }
--]]

local key = KEYS[1]
local increment = tonumber(ARGV[1]) or 1
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3]) or 0

-- Get current value (default 0 if key doesn't exist)
local current = tonumber(redis.call('GET', key) or '0')

-- Check if increment would exceed limit
if current + increment > limit then
  return { 0, current, limit - current }
end

-- Set TTL on first increment (if specified)
if current == 0 and ttl > 0 then
  redis.call('EXPIRE', key, ttl)
end

-- Atomically increment
local final_value = redis.call('INCRBY', key, increment)

return { 1, final_value, limit - final_value }
