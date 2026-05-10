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


import time as _time

def test_tokens_refill_over_time(monkeypatch):
    r = fakeredis.FakeRedis(decode_responses=True)
    bucket = TokenBucket(r, key="cm:rl:refill", capacity=2, refill_per_sec=10)  # 1 token / 100ms
    bucket.try_acquire()  # 2→1
    bucket.try_acquire()  # 1→0
    assert bucket.try_acquire() > 0  # empty
    _time.sleep(0.15)
    assert bucket.try_acquire() == 0  # one token refilled
