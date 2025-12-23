from __future__ import annotations

import json
import os
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional

import requests
from flask import Flask, jsonify, redirect, render_template, request, url_for

DATABASE_PATH = os.environ.get("APP_DB", "app.db")

MENTION_PATTERN = re.compile(r"@([A-Za-z0-9_]+)")

app = Flask(__name__)
init_db()


def utc_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                author_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(author_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                card_id INTEGER NOT NULL,
                author_id INTEGER NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(card_id) REFERENCES cards(id),
                FOREIGN KEY(author_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                card_id INTEGER NOT NULL,
                comment_id INTEGER,
                source TEXT NOT NULL,
                snippet TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                read_at TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(card_id) REFERENCES cards(id),
                FOREIGN KEY(comment_id) REFERENCES comments(id)
            );
            """
        )


@dataclass
class MentionContext:
    card_id: int
    card_title: str
    source: str
    snippet: str
    comment_id: Optional[int] = None


class EmailProvider:
    def send(self, to_email: str, subject: str, html_body: str) -> None:
        raise NotImplementedError


class SendGridProvider(EmailProvider):
    def __init__(self, api_key: str, from_email: str) -> None:
        self.api_key = api_key
        self.from_email = from_email

    def send(self, to_email: str, subject: str, html_body: str) -> None:
        payload = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": self.from_email},
            "subject": subject,
            "content": [{"type": "text/html", "value": html_body}],
        }
        response = requests.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=payload,
            timeout=10,
        )
        response.raise_for_status()


class MailgunProvider(EmailProvider):
    def __init__(self, api_key: str, domain: str, from_email: str) -> None:
        self.api_key = api_key
        self.domain = domain
        self.from_email = from_email

    def send(self, to_email: str, subject: str, html_body: str) -> None:
        response = requests.post(
            f"https://api.mailgun.net/v3/{self.domain}/messages",
            auth=("api", self.api_key),
            data={
                "from": self.from_email,
                "to": [to_email],
                "subject": subject,
                "html": html_body,
            },
            timeout=10,
        )
        response.raise_for_status()


class ConsoleProvider(EmailProvider):
    def send(self, to_email: str, subject: str, html_body: str) -> None:
        app.logger.info("Email to %s: %s\n%s", to_email, subject, html_body)


def get_email_provider() -> EmailProvider:
    sendgrid_key = os.environ.get("SENDGRID_API_KEY")
    mailgun_key = os.environ.get("MAILGUN_API_KEY")
    mailgun_domain = os.environ.get("MAILGUN_DOMAIN")
    from_email = os.environ.get("EMAIL_FROM", "notifications@example.com")
    if sendgrid_key:
        return SendGridProvider(sendgrid_key, from_email)
    if mailgun_key and mailgun_domain:
        return MailgunProvider(mailgun_key, mailgun_domain, from_email)
    return ConsoleProvider()


def parse_mentions(text: str) -> set[str]:
    return {match.group(1) for match in MENTION_PATTERN.finditer(text)}


def build_action_url(card_id: int) -> str:
    base_url = request.url_root.rstrip("/")
    return f"{base_url}{url_for('view_card', card_id=card_id)}"


def notify_mentions(
    mentions: Iterable[str],
    context: MentionContext,
    conn: sqlite3.Connection,
) -> list[dict]:
    if not mentions:
        return []

    placeholders = ",".join("?" for _ in mentions)
    users = conn.execute(
        f"SELECT * FROM users WHERE username IN ({placeholders})",
        list(mentions),
    ).fetchall()
    if not users:
        return []

    action_url = build_action_url(context.card_id)
    provider = get_email_provider()
    created = []
    for user in users:
        payload = {
            "mention": f"@{user['username']}",
            "card_id": context.card_id,
            "card_title": context.card_title,
            "comment_id": context.comment_id,
            "source": context.source,
            "snippet": context.snippet,
            "action_url": action_url,
        }
        conn.execute(
            """
            INSERT INTO notifications (
                user_id, card_id, comment_id, source, snippet, payload, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                context.card_id,
                context.comment_id,
                context.source,
                context.snippet,
                json.dumps(payload),
                utc_now(),
            ),
        )
        subject = f"You were mentioned on “{context.card_title}”"
        html_body = (
            f"<p>You were mentioned in a {context.source}.</p>"
            f"<p><strong>Snippet:</strong> {context.snippet}</p>"
            f'<p><a href="{action_url}">View the card</a></p>'
        )
        provider.send(user["email"], subject, html_body)
        created.append(payload)
    return created


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/cards/<int:card_id>")
def view_card(card_id: int):
    with get_db() as conn:
        card = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        if not card:
            return "Card not found", 404
        comments = conn.execute(
            """
            SELECT comments.*, users.username
            FROM comments
            JOIN users ON users.id = comments.author_id
            WHERE comments.card_id = ?
            ORDER BY comments.created_at DESC
            """,
            (card_id,),
        ).fetchall()
        return render_template("card.html", card=card, comments=comments)


@app.route("/users", methods=["POST"])
def create_user():
    data = request.get_json(force=True)
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO users (username, email) VALUES (?, ?)",
            (data["username"], data["email"]),
        )
        conn.commit()
        return jsonify({"id": cursor.lastrowid}), 201


@app.route("/cards", methods=["POST"])
def create_card():
    data = request.get_json(force=True)
    with get_db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO cards (title, description, author_id, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (data["title"], data["description"], data["author_id"], utc_now()),
        )
        card_id = cursor.lastrowid
        mentions = parse_mentions(data["description"])
        context = MentionContext(
            card_id=card_id,
            card_title=data["title"],
            source="description",
            snippet=data["description"][:180],
        )
        notify_mentions(mentions, context, conn)
        conn.commit()
        return jsonify({"id": card_id}), 201


@app.route("/cards/<int:card_id>/description", methods=["PUT"])
def update_description(card_id: int):
    data = request.get_json(force=True)
    with get_db() as conn:
        card = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        if not card:
            return jsonify({"error": "Card not found"}), 404
        conn.execute(
            "UPDATE cards SET description = ? WHERE id = ?",
            (data["description"], card_id),
        )
        mentions = parse_mentions(data["description"])
        context = MentionContext(
            card_id=card_id,
            card_title=card["title"],
            source="description",
            snippet=data["description"][:180],
        )
        notify_mentions(mentions, context, conn)
        conn.commit()
        return jsonify({"status": "updated"})


@app.route("/cards/<int:card_id>/comments", methods=["POST"])
def add_comment(card_id: int):
    data = request.get_json(force=True)
    with get_db() as conn:
        card = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        if not card:
            return jsonify({"error": "Card not found"}), 404
        cursor = conn.execute(
            """
            INSERT INTO comments (card_id, author_id, body, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (card_id, data["author_id"], data["body"], utc_now()),
        )
        comment_id = cursor.lastrowid
        mentions = parse_mentions(data["body"])
        context = MentionContext(
            card_id=card_id,
            card_title=card["title"],
            source="comment",
            snippet=data["body"][:180],
            comment_id=comment_id,
        )
        notify_mentions(mentions, context, conn)
        conn.commit()
        return jsonify({"id": comment_id}), 201


@app.route("/notifications")
def get_notifications():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()
        notifications = []
        for row in rows:
            payload = json.loads(row["payload"])
            notifications.append(
                {
                    "id": row["id"],
                    "card_id": row["card_id"],
                    "comment_id": row["comment_id"],
                    "source": row["source"],
                    "snippet": row["snippet"],
                    "created_at": row["created_at"],
                    "read_at": row["read_at"],
                    "payload": payload,
                }
            )
        return jsonify({"notifications": notifications})


@app.route("/notifications/<int:notification_id>/read", methods=["POST"])
def mark_notification_read(notification_id: int):
    with get_db() as conn:
        conn.execute(
            "UPDATE notifications SET read_at = ? WHERE id = ?",
            (utc_now(), notification_id),
        )
        conn.commit()
        return jsonify({"status": "ok"})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
