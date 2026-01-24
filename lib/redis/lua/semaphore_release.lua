--[[
  semaphore_release.lua

  Releases a semaphore lease atomically.

  KEYS[1] = semaphore set key
  KEYS[2] = lease metadata key prefix (we append lease_id)

  ARGV[1] = lease_id to release

  Returns:
    If released: { 1, "released" }
    If not found: { 0, "not_found" }
--]]

local semaphoreKey = KEYS[1]
local leaseMetaKeyPrefix = KEYS[2]
local leaseId = ARGV[1]

-- Check if lease exists in semaphore
local exists = redis.call('SISMEMBER', semaphoreKey, leaseId)

if exists == 0 then
  return { 0, 'not_found' }
end

-- Remove from semaphore set
redis.call('SREM', semaphoreKey, leaseId)

-- Delete lease metadata
local metaKey = leaseMetaKeyPrefix .. ':' .. leaseId
redis.call('DEL', metaKey)

return { 1, 'released' }
