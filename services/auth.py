"""SQLite-backed users and expiring, revocable browser sessions."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from config.settings import DATA_DIR

SESSION_COOKIE = "nexera_session"
SESSION_TTL_SECONDS = 12 * 60 * 60
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$")


def database_path() -> Path:
    return Path(os.environ.get("NEXERA_AUTH_DB", DATA_DIR / "auth.sqlite3"))


def _connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


@contextmanager
def _db():
    db = _connect()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    path = database_path()
    with _db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
                active INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
            CREATE TABLE IF NOT EXISTS login_failures (
                ip TEXT NOT NULL,
                attempted_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS login_failures_time ON login_failures(ip, attempted_at);
        """)
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _password_hash(password: str) -> str:
    if not 12 <= len(password) <= 256:
        raise ValueError("La contraseña debe tener entre 12 y 256 caracteres")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt$16384$8$1${salt.hex()}${digest.hex()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt_hex, digest_hex = encoded.split("$")
        if algorithm != "scrypt":
            return False
        candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex),
                                   n=int(n), r=int(r), p=int(p))
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (ValueError, TypeError, MemoryError):
        return False


def create_user(username: str, password: str, role: str = "user") -> dict:
    username = username.strip()
    if not USERNAME_PATTERN.fullmatch(username):
        raise ValueError("El usuario debe tener 3–40 caracteres: letras, números, punto, guion o guion bajo")
    if role not in {"admin", "user"}:
        raise ValueError("Rol inválido")
    password_hash = _password_hash(password)
    init_db()
    try:
        with _db() as db:
            cursor = db.execute(
                "INSERT INTO users(username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                (username, password_hash, role, int(time.time())),
            )
            row = db.execute("SELECT id, username, role, active, created_at FROM users WHERE id = ?",
                             (cursor.lastrowid,)).fetchone()
            return dict(row)
    except sqlite3.IntegrityError as exc:
        raise ValueError("Ese nombre de usuario ya existe") from exc


def admin_exists() -> bool:
    init_db()
    with _db() as db:
        return db.execute("SELECT 1 FROM users WHERE role = 'admin' AND active = 1 LIMIT 1").fetchone() is not None


def authenticate(username: str, password: str) -> dict | None:
    init_db()
    with _db() as db:
        row = db.execute("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND active = 1",
                         (username.strip(),)).fetchone()
    # Use a dummy hash for unknown usernames to reduce timing-based account discovery.
    if row is None:
        _verify_password(password, _DUMMY_PASSWORD_HASH)
        return None
    if not _verify_password(password, row["password_hash"]):
        return None
    return {"id": row["id"], "username": row["username"], "role": row["role"]}


_DUMMY_PASSWORD_HASH = "scrypt$16384$8$1$" + ("00" * 16) + "$" + ("00" * 64)


def create_session(user_id: int) -> str:
    init_db()
    token = secrets.token_urlsafe(32)
    with _db() as db:
        db.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
        db.execute("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                   (hashlib.sha256(token.encode()).hexdigest(), user_id,
                    int(time.time()) + SESSION_TTL_SECONDS))
    return token


def user_for_session(token: str | None) -> dict | None:
    if not token or len(token) > 128:
        return None
    init_db()
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with _db() as db:
        row = db.execute("""
            SELECT users.id, users.username, users.role
            FROM sessions JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1
        """, (token_hash, int(time.time()))).fetchone()
    return dict(row) if row else None


def revoke_session(token: str | None) -> None:
    if not token or len(token) > 128:
        return
    init_db()
    with _db() as db:
        db.execute("DELETE FROM sessions WHERE token_hash = ?",
                   (hashlib.sha256(token.encode()).hexdigest(),))


def login_is_limited(ip: str) -> bool:
    init_db()
    cutoff = int(time.time()) - 15 * 60
    with _db() as db:
        db.execute("DELETE FROM login_failures WHERE attempted_at <= ?", (cutoff,))
        count = db.execute("SELECT COUNT(*) FROM login_failures WHERE ip = ? AND attempted_at > ?",
                           (ip, cutoff)).fetchone()[0]
    return count >= 10


def record_login_failure(ip: str) -> None:
    init_db()
    with _db() as db:
        db.execute("INSERT INTO login_failures(ip, attempted_at) VALUES (?, ?)", (ip, int(time.time())))


def clear_login_failures(ip: str) -> None:
    init_db()
    with _db() as db:
        db.execute("DELETE FROM login_failures WHERE ip = ?", (ip,))


def list_users() -> list[dict]:
    init_db()
    with _db() as db:
        rows = db.execute("SELECT id, username, role, active, created_at FROM users ORDER BY username COLLATE NOCASE").fetchall()
    return [dict(row) for row in rows]
