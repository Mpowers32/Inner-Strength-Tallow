from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer

from app.auth import AuthError, create_access_token, decode_access_token, get_session_cookie_name, sign_session, verify_session
from app.config import CSRF_COOKIE_NAME
from app.csrf import CsrfError, create_csrf_token, validate_csrf_token
from app.rate_limit import RateLimitError, get_client_id, rate_limiter

app = FastAPI(title="Inner Strength Tallow API")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    try:
        rate_limiter.check(get_client_id(request))
    except RateLimitError as exc:
        return Response(str(exc), status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    return await call_next(request)


def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    try:
        payload = decode_access_token(token)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    subject = payload.get("sub")
    if not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing subject")
    return subject


def require_session(request: Request, csrf_token: str = Header(default="", alias="X-CSRF-Token")) -> str:
    cookie_name = get_session_cookie_name()
    session_cookie = request.cookies.get(cookie_name)
    if not session_cookie:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session cookie")
    try:
        session = verify_session(session_cookie)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    try:
        validate_csrf_token(request.cookies.get(CSRF_COOKIE_NAME, ""), csrf_token)
    except CsrfError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return session.get("sub", "")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/auth/token")
async def issue_token(username: str):
    token = create_access_token(username)
    return {"access_token": token, "token_type": "bearer"}


@app.post("/auth/session")
async def issue_session(response: Response, username: str):
    session = sign_session({"sub": username})
    csrf_token = create_csrf_token()
    response.set_cookie(get_session_cookie_name(), session, httponly=True, secure=True, samesite="lax")
    response.set_cookie(CSRF_COOKIE_NAME, csrf_token, httponly=False, secure=True, samesite="lax")
    return {"status": "session_created"}


@app.get("/me")
async def read_me(current_user: str = Depends(get_current_user)):
    return {"user": current_user}


@app.post("/me/update")
async def update_me(current_user: str = Depends(require_session)):
    return {"user": current_user, "updated": True}
