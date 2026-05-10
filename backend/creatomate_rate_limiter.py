import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Atomic refill + decrement. Returns wait_seconds (0 if a token was taken).
_LUA = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'updated_ms')
local tokens = tonumber(data[1])
local updated_ms = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  updated_ms = now_ms
end

local elapsed_ms = math.max(0, now_ms - updated_ms)
tokens = math.min(capacity, tokens + (elapsed_ms / 1000.0) * refill)

if tokens >= 1 then
  tokens = tokens - 1
  redis.call('HSET', key, 'tokens', tokens, 'updated_ms', now_ms)
  redis.call('EXPIRE', key, 60)
  return '0'
end

local needed = 1 - tokens
local wait_sec = needed / refill
redis.call('HSET', key, 'tokens', tokens, 'updated_ms', now_ms)
redis.call('EXPIRE', key, 60)
return tostring(wait_sec)
"""


class TokenBucket:
    def __init__(self, redis_client, key: str, capacity: int, refill_per_sec: float):
        self.redis = redis_client
        self.key = key
        self.capacity = capacity
        self.refill = refill_per_sec
        self._script = self.redis.register_script(_LUA)

    def try_acquire(self) -> float:
        """Returns 0 if a token was taken, or seconds to wait before retrying."""
        now_ms = int(time.time() * 1000)
        result = self._script(keys=[self.key], args=[self.capacity, self.refill, now_ms])
        return float(result)

    def acquire(self, max_wait_sec: float = 30.0) -> bool:
        """Block (sleep) until a token is acquired or max_wait_sec elapsed. Returns True on acquire."""
        deadline = time.time() + max_wait_sec
        while time.time() < deadline:
            wait = self.try_acquire()
            if wait == 0:
                return True
            time.sleep(min(wait, deadline - time.time()))
        return False


import os
import redis as _redis

_DEFAULT_BUCKET: Optional[TokenBucket] = None


def get_default_bucket() -> TokenBucket:
    global _DEFAULT_BUCKET
    if _DEFAULT_BUCKET is None:
        url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        client = _redis.from_url(url, decode_responses=True)
        capacity = int(os.environ.get("CREATOMATE_RATE_LIMIT_PER_10S", "30"))
        refill = capacity / 10.0
        _DEFAULT_BUCKET = TokenBucket(client, "cm:rate_bucket", capacity, refill)
    return _DEFAULT_BUCKET
