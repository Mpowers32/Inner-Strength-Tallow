import hmac
import secrets
from hashlib import sha256

from app.config import CSRF_SECRET


class CsrfError(Exception):
    pass


def _sign(value: str) -> str:
    signature = hmac.new(CSRF_SECRET.encode(), msg=value.encode(), digestmod=sha256).hexdigest()
    return f"{value}.{signature}"


def _unsign(signed_value: str) -> str:
    try:
        value, signature = signed_value.rsplit(".", 1)
    except ValueError as exc:
        raise CsrfError("Invalid CSRF token format") from exc
    expected = hmac.new(CSRF_SECRET.encode(), msg=value.encode(), digestmod=sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise CsrfError("Invalid CSRF signature")
    return value


def create_csrf_token() -> str:
    raw = secrets.token_urlsafe(32)
    return _sign(raw)


def validate_csrf_token(cookie_token: str, header_token: str) -> None:
    if not cookie_token or not header_token:
        raise CsrfError("Missing CSRF token")
    cookie_raw = _unsign(cookie_token)
    header_raw = _unsign(header_token)
    if not hmac.compare_digest(cookie_raw, header_raw):
        raise CsrfError("CSRF token mismatch")
