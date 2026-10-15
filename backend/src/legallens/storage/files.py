"""File store for original uploads: one folder per matter.

With database encryption on, every stored file is sealed with AES-256-GCM under a key derived from the database
key (DEC-57). A sealed file starts with a magic header, so plain files from before the switch still read, and
`legallens db encrypt` seals them. Readers use `read()` or `materialize()`; nothing hands out a path to a sealed
file's plaintext except a temporary copy inside a job's own work folder.
"""

import os
import shutil
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from legallens.config import Settings

MAGIC = b"LLENC1\n"
NONCE_BYTES = 12


def seal(key: bytes, data: bytes) -> bytes:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    nonce = os.urandom(NONCE_BYTES)
    return MAGIC + nonce + AESGCM(key).encrypt(nonce, data, MAGIC)


def unseal(key: bytes | None, blob: bytes) -> bytes:
    """Plain bytes come back unchanged; sealed ones need the key."""
    if not blob.startswith(MAGIC):
        return blob
    if key is None:
        raise PermissionError("The file is encrypted and no key is available.")
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    nonce = blob[len(MAGIC) : len(MAGIC) + NONCE_BYTES]
    return AESGCM(key).decrypt(nonce, blob[len(MAGIC) + NONCE_BYTES :], MAGIC)


def files_key(db_path: Path) -> bytes | None:
    """32 bytes derived from the database key, or None when encryption is off."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    from legallens.db.crypto import load_key

    db_key = load_key(db_path, create=False)
    if db_key is None:
        return None
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"legallens-files").derive(bytes.fromhex(db_key))


class FileStore(Protocol):
    def put(self, matter_id: str, document_id: str, ext: str, source: Path) -> str: ...
    def read(self, storage_path: str) -> bytes: ...
    def materialize(self, storage_path: str, folder: Path) -> Path: ...
    def path(self, storage_path: str) -> Path: ...
    def size(self, storage_path: str) -> int: ...
    def delete(self, storage_path: str) -> int: ...
    def delete_matter(self, matter_id: str) -> int: ...


class LocalFileStore:
    def __init__(self, root: Path, key: bytes | None = None) -> None:
        self.root = root.resolve()
        self.key = key
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, matter_id: str, document_id: str, ext: str, source: Path) -> str:
        folder = self.root / matter_id
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f"{document_id}.{ext}"
        if self.key is not None:
            target.write_bytes(seal(self.key, source.read_bytes()))
            source.unlink()
        else:
            shutil.move(str(source), target)
        target.chmod(0o600)
        return str(target.relative_to(self.root))

    def read(self, storage_path: str) -> bytes:
        return unseal(self.key, self.path(storage_path).read_bytes())

    def materialize(self, storage_path: str, folder: Path) -> Path:
        """A plaintext copy inside `folder` (a job's work folder, removed with it), for tools that need a file."""
        source = self.path(storage_path)
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f"source{source.suffix}"
        target.write_bytes(unseal(self.key, source.read_bytes()))
        target.chmod(0o600)
        return target

    def path(self, storage_path: str) -> Path:
        resolved = (self.root / storage_path).resolve()
        if not resolved.is_relative_to(self.root):
            raise ValueError("Storage path escapes the file store.")
        return resolved

    def size(self, storage_path: str) -> int:
        p = self.path(storage_path)
        return p.stat().st_size if p.exists() else 0

    def delete(self, storage_path: str) -> int:
        p = self.path(storage_path)
        if not p.exists():
            return 0
        size = p.stat().st_size
        p.unlink()
        return size

    def delete_matter(self, matter_id: str) -> int:
        folder = self.root / matter_id
        if not folder.exists():
            return 0
        size = sum(f.stat().st_size for f in folder.rglob("*") if f.is_file())
        shutil.rmtree(folder)
        return size


def open_store(settings: "Settings") -> LocalFileStore:
    """The file store for this install: sealed when database encryption is on."""
    return LocalFileStore(settings.files_dir, files_key(settings.db_path))


def seal_existing(root: Path, key: bytes) -> int:
    """Seals every plain file under root in place. Returns how many were sealed."""
    count = 0
    for path in root.rglob("*"):
        if path.is_file():
            data = path.read_bytes()
            if not data.startswith(MAGIC):
                path.write_bytes(seal(key, data))
                count += 1
    return count
