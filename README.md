# Inner-Strength-Tallow

## Security features
- Rate limiting via in-memory bucket per client IP.
- JWT authentication for API access.
- Session cookies with CSRF protection using double-submit tokens.

## Database migrations
Migrations are managed with Alembic. See `migrations/README`.

## Backups
Run `scripts/backup_db.sh` with `DATABASE_URL` set to your Postgres connection string.

## Local run
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
