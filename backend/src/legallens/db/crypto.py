"""Encryption of the database file (DEC-57, CL-3.2): SQLCipher 4, AES-256, a random 256-bit key.

Which file is encrypted is decided by the folder it sits in, so every place that opens the database agrees:
- `LEGALLENS_DB_ENCRYPTION=on` forces it (a new database is created encrypted), `off` forces plain files;
- otherwise (auto) it is on when `db.key` exists beside the database. `legallens db encrypt` creates that key and
  converts an existing database.
The key is `LEGALLENS_DB_KEY` (64 hex characters, for a key held in the OS keychain) or the owner-only `db.key`.
A key file beside the database protects a copied .db file and a lost backup; it does not protect against someone
who can read the whole data folder, which is why the key may come from the environment instead.
"""

import os
import secrets
from pathlib import Path


def key_file(db_path: Path) -> Path:
    return db_path.parent / "db.key"


def encryption_enabled(db_path: Path) -> bool:
    mode = os.environ.get("LEGALLENS_DB_ENCRYPTION", "auto").lower()
    if mode == "on":
        return True
    if mode == "off":
        return False
    return key_file(db_path).exists() or "LEGALLENS_DB_KEY" in os.environ


def load_key(db_path: Path, *, create: bool = True) -> str | None:
    """The key as 64 hex characters, or None when encryption is off."""
    if not encryption_enabled(db_path):
        return None
    from_env = os.environ.get("LEGALLENS_DB_KEY")
    if from_env:
        if len(from_env) != 64 or any(c not in "0123456789abcdefABCDEF" for c in from_env):
            raise ValueError("LEGALLENS_DB_KEY must be 64 hex characters.")
        return from_env.lower()
    path = key_file(db_path)
    if path.exists():
        return path.read_text().strip()
    if not create:
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    key = secrets.token_hex(32)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write(key)
    return key


def pragma_key(key: str) -> str:
    return f"PRAGMA key = \"x'{key}'\""
