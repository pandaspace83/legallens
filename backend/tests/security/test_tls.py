"""The local certificate (NFR-03): made on this computer, valid for 127.0.0.1, key readable by the owner only."""

import datetime as dt
import ipaddress
from pathlib import Path

from cryptography import x509

from legallens.tls import ensure_certificate
from tests.conftest import make_settings


def test_a_local_certificate_is_made_once_and_the_key_is_private(tmp_path: Path) -> None:
    settings = make_settings(tmp_path / "data")
    cert_path, key_path = ensure_certificate(settings)
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
    san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    assert ipaddress.ip_address("127.0.0.1") in san.get_values_for_type(x509.IPAddress)
    assert "localhost" in san.get_values_for_type(x509.DNSName)
    assert cert.not_valid_after_utc - dt.datetime.now(dt.UTC) > dt.timedelta(days=300)
    assert key_path.stat().st_mode & 0o077 == 0
    again = ensure_certificate(settings)
    assert again == (cert_path, key_path)
    assert x509.load_pem_x509_certificate(cert_path.read_bytes()).serial_number == cert.serial_number
