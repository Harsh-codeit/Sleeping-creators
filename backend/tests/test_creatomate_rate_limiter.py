import pytest
import fakeredis
from creatomate_rate_limiter import TokenBucket


def test_acquire_succeeds_when_bucket_full():
    r = fakeredis.FakeRedis(decode_responses=True)
    bucket = TokenBucket(r, key="cm:rl:test", capacity=30, refill_per_sec=3)
    # Bucket starts full; first acquire returns 0 (no wait)
    wait = bucket.try_acquire()
    assert wait == 0


def test_acquire_returns_wait_time_when_empty():
    r = fakeredis.FakeRedis(decode_responses=True)
    bucket = TokenBucket(r, key="cm:rl:test2", capacity=2, refill_per_sec=1)
    assert bucket.try_acquire() == 0  # 2→1
    assert bucket.try_acquire() == 0  # 1→0
    wait = bucket.try_acquire()       # 0 tokens, must wait ~1s
    assert wait > 0
    assert wait <= 1.1
