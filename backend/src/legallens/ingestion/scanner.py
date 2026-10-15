"""Local malware scan (DEC-59). ClamAV's clamd over its Unix socket, using the INSTREAM command.

The socket is local-only (no TCP listener), so file bytes never leave the machine (DEC-08).
"""

import socket
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from legallens.config import Settings

CHUNK = 64 * 1024


class ScannerUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class ScanResult:
    status: str  # clean | infected | skipped
    signature: str | None = None


class Scanner(Protocol):
    kind: str

    def scan(self, path: Path) -> ScanResult: ...
    def ping(self) -> bool: ...


class NoopScanner:
    """Dev only (LEGALLENS_SCANNER=none). Documents are marked scan_status=skipped and /health says degraded."""

    kind = "none"

    def scan(self, path: Path) -> ScanResult:
        return ScanResult("skipped")

    def ping(self) -> bool:
        return False


class ClamdScanner:
    kind = "clamd"

    def __init__(self, socket_path: Path, timeout: float = 60.0) -> None:
        self.socket_path = socket_path
        self.timeout = timeout

    def _connect(self) -> socket.socket:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        try:
            sock.connect(str(self.socket_path))
        except OSError as exc:
            sock.close()
            raise ScannerUnavailable("clamd is not reachable") from exc
        return sock

    @staticmethod
    def _read_reply(sock: socket.socket) -> str:
        data = b""
        while not data.endswith(b"\0"):
            part = sock.recv(4096)
            if not part:
                break
            data += part
        return data.rstrip(b"\0").decode("utf-8", "replace").strip()

    def ping(self) -> bool:
        try:
            with self._connect() as sock:
                sock.sendall(b"zPING\0")
                return self._read_reply(sock) == "PONG"
        except (ScannerUnavailable, OSError):
            return False

    def scan(self, path: Path) -> ScanResult:
        try:
            with self._connect() as sock, path.open("rb") as fh:
                sock.sendall(b"zINSTREAM\0")
                while chunk := fh.read(CHUNK):
                    sock.sendall(struct.pack("!L", len(chunk)) + chunk)
                sock.sendall(struct.pack("!L", 0))
                reply = self._read_reply(sock)
        except OSError as exc:
            raise ScannerUnavailable("clamd scan failed") from exc
        # "stream: OK" | "stream: Eicar-Signature FOUND" | "INSTREAM size limit exceeded. ERROR"
        if reply.endswith("OK"):
            return ScanResult("clean")
        if reply.endswith("FOUND"):
            signature = reply.removeprefix("stream:").removesuffix("FOUND").strip()
            return ScanResult("infected", signature=signature)
        raise ScannerUnavailable(f"clamd returned an error ({reply[:60]})")


def get_scanner(settings: Settings) -> Scanner:
    if settings.scanner == "clamd":
        return ClamdScanner(settings.clamd_socket)
    return NoopScanner()
