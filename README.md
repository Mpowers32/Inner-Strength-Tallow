# Inner-Strength-Tallow

## Requested features
- Labels/tags on cards with color support.
- Full-text search for cards and comments.
- Activity log per board and card.
- Optional: due dates, checklists, attachments.
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
