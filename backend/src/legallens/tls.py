"""HTTPS on the local address (NFR-03, DEC-08): a self-signed certificate for 127.0.0.1 and localhost.

The server only listens on this computer, so the certificate is made here and never leaves it. The browser will
warn until the certificate is trusted once (`legallens cert trust` prints the command). The key is owner-only.
"""

import datetime as dt
import ipaddress
import os
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from legallens.config import Settings

VALID_DAYS = 397


def paths(settings: Settings) -> tuple[Path, Path]:
    folder = settings.data_dir / "tls"
    return folder / "cert.pem", folder / "key.pem"


def ensure_certificate(settings: Settings) -> tuple[Path, Path]:
    """Creates the certificate on first use and again when it has under 30 days left."""
    cert_path, key_path = paths(settings)
    if cert_path.exists() and key_path.exists():
        cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
        if cert.not_valid_after_utc - dt.datetime.now(dt.UTC) > dt.timedelta(days=30):
            return cert_path, key_path
    cert_path.parent.mkdir(parents=True, exist_ok=True)
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "LegalLens (this computer)")])
    now = dt.datetime.now(dt.UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=VALID_DAYS))
        .add_extension(
            x509.SubjectAlternativeName([x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
            critical=False,
        )
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        )
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return cert_path, key_path
