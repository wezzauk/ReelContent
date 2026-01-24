--[[
  semaphore_acquire.lua

  Acquires a semaphore lease atomically.

  KEYS[1] = semaphore set key (stores lease members)
  KEYS[2] = lease metadata key (stores lease details as JSON)
  ARGV[1] = lease_id (unique identifier for this lease)
  ARGV[2] = lease_metadata (JSON string with lease details)
  ARGV[3] = max_leases (maximum concurrent leases allowed)
  ARGV[4] = lease_ttl (seconds until lease expires)

  Returns:
    If acquired: { 1, lease_id, "acquired" }
    If denied: { 0, nil, "max_concurrency" }
--]]

local semaphoreKey = KEYS[1]
local leaseMetaKey = KEYS[2]
local leaseId = ARGV[1]
local leaseMetadata = ARGV[2]
local maxLeases = tonumber(ARGV[3])
local leaseTtl = tonumber(ARGV[4]) or 1800

-- Check current lease count
local currentCount = redis.call('SCARD', semaphoreKey)

if currentCount >= maxLeases then
  -- Get oldest lease to suggest retry-after
  local oldest = redis.call('SRANDMEMBER', semaphoreKey, 1)
  local oldestTtl = 0
  if oldest and #oldest > 0 then
    oldestTtl = redis.call('TTL', leaseMetaKey .. ':' .. oldest[1])
  end
  return { 0, nil, 'max_concurrency', oldestTtl or 60 }
end

-- Add lease to semaphore set
redis.call('SADD', semaphoreKey, leaseId)

-- Store lease metadata with TTL
redis.call('SET', leaseMetaKey .. ':' .. leaseId, leaseMetadata, 'EX', leaseTtl)

-- Set TTL on the semaphore key itself (refreshed on each operation)
redis.call('EXPIRE', semaphoreKey, leaseTtl * 2)

return { 1, leaseId, 'acquired' }
