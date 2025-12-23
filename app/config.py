import os


def getenv_required(key: str) -> str:
    value = os.getenv(key)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {key}")
    return value


JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "session")
SESSION_SECRET = os.getenv("SESSION_SECRET", "change-me-session")
CSRF_COOKIE_NAME = os.getenv("CSRF_COOKIE_NAME", "csrf")
CSRF_SECRET = os.getenv("CSRF_SECRET", "change-me-csrf")
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")
