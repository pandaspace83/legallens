"""Small secrets kept in the database (the TOTP seed), sealed with a key file beside it (DEC-54, DEC-57).

The key lives in `<data dir>/secret.key`, owner-only. Until SQLCipher is in (CL-3.2) this is what keeps a copied
database file from revealing the seeds; it is not a substitute for encrypting the database.
"""

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from legallens.config import Settings


def _key_path(settings: Settings) -> Path:
    return settings.data_dir / "secret.key"


def _box(settings: Settings) -> Fernet:
    path = _key_path(settings)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(Fernet.generate_key())
    return Fernet(path.read_bytes())


def seal(settings: Settings, plain: str) -> bytes:
    return _box(settings).encrypt(plain.encode())


def unseal(settings: Settings, sealed: bytes) -> str | None:
    try:
        return _box(settings).decrypt(sealed).decode()
    except InvalidToken:
        return None
