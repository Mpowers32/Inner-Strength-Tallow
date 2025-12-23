import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import Request

from app.config import RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS


class RateLimitError(Exception):
    pass


class RateLimiter:
    def __init__(self, max_requests: int = RATE_LIMIT_REQUESTS, window_seconds: int = RATE_LIMIT_WINDOW_SECONDS) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._buckets: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, client_id: str) -> None:
        now = time.time()
        window_start = now - self.window_seconds
        bucket = self._buckets[client_id]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= self.max_requests:
            raise RateLimitError("Rate limit exceeded")
        bucket.append(now)


rate_limiter = RateLimiter()


def get_client_id(request: Request) -> str:
    if request.client:
        return request.client.host
    return "unknown"
