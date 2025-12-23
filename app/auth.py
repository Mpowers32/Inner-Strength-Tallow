import json
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from jose import jwt

from app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ALGORITHM,
    JWT_SECRET,
    SESSION_COOKIE_NAME,
    SESSION_SECRET,
)


class AuthError(Exception):
    pass


def create_access_token(subject: str, additional_claims: Optional[Dict[str, Any]] = None) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": expire}
    if additional_claims:
        payload.update(additional_claims)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception as exc:
        raise AuthError("Invalid token") from exc


def sign_session(payload: Dict[str, Any]) -> str:
    issued_at = int(time.time())
    payload_with_iat = {**payload, "iat": issued_at}
    body = json.dumps(payload_with_iat, separators=(",", ":"), sort_keys=True)
    signature = jwt.encode({"data": body}, SESSION_SECRET, algorithm=JWT_ALGORITHM)
    return f"{body}.{signature}"


def verify_session(token: str) -> Dict[str, Any]:
    try:
        body, signature = token.rsplit(".", 1)
        decoded = jwt.decode(signature, SESSION_SECRET, algorithms=[JWT_ALGORITHM])
        if decoded.get("data") != body:
            raise AuthError("Session signature mismatch")
        return json.loads(body)
    except (ValueError, json.JSONDecodeError) as exc:
        raise AuthError("Malformed session") from exc
    except Exception as exc:
        raise AuthError("Invalid session") from exc


def get_session_cookie_name() -> str:
    return SESSION_COOKIE_NAME
