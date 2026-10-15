"""Dev seed: the dev user and the three matters from the frontend mock, with synthetic documents only (SUG-08)."""

from typing import Any

from sqlalchemy import select

from legallens.config import Settings
from legallens.db.engine import Database
from legallens.db.models import Document, Matter, User
from legallens.db.scope import set_scope
from legallens.ids import new_id
from legallens.schemas.matters import AiConsent, MatterCreate, MatterProfile
from legallens.services import audit
from legallens.services import matters as matter_service
from legallens.services.auth import Principal
from legallens.timeutil import utcnow

MATTERS: list[dict[str, Any]] = [
    {
        "name": "Smith v. Acme Corp",
        "client_name": "Smith Logistics LLC",
        "our_side": "defendant",
        "court": "Superior Court of California, County of San Francisco",
        "jurisdiction": "California",
        "practice_area": "Commercial litigation",
        "profile": {
            "parties": [
                {"name": "Smith Logistics LLC", "role": "client", "represented": True},
                {
                    "name": "Acme Corp",
                    "role": "opposing",
                    "represented": True,
                    "counsel": {
                        "name": "Dana Whitfield",
                        "firm": "Whitfield & Grant LLP",
                        "address": "100 Market Street, Suite 400, San Francisco, CA 94105",
                        "email": "dwhitfield@example.com",
                    },
                },
            ],
            "court_level": "state",
        },
        "ai_consent": {"status": "given", "told_tool": True, "told_data": True, "told_risks": True},
        "status": "open",
        "documents": [
            "smith_msa_v3.pdf",
            "acme_demand_letter_scanned.pdf",
            "exhibit_b_invoices.pdf",
            "acme_redline_other_side.docx",
            "email_from_acme_counsel.eml",
        ],
    },
    {
        "name": "Rivera lease dispute",
        "client_name": "Maria Rivera",
        "our_side": "tenant",
        "jurisdiction": "New York",
        "practice_area": "Real estate",
        "profile": {"parties": [{"name": "Northgate Properties", "role": "opposing", "represented": False}]},
        "status": "open",
        "documents": ["rivera_lease.txt"],
    },
    {
        "name": "Henderson estate",
        "client_name": "Henderson family",
        "our_side": "executor",
        "jurisdiction": "Texas",
        "practice_area": "Probate",
        "status": "closed",
        "documents": [],
    },
]


def ensure_user(database: Database, settings: Settings) -> User:
    with database.write() as db:
        user = db.execute(select(User).where(User.email == settings.dev_user_email)).scalar_one_or_none()
        if user is None:
            user = User(
                id=new_id("user"),
                email=settings.dev_user_email,
                name=settings.dev_user_name,
                licensing_states=["CA", "NY"],
            )
            db.add(user)
    return user


def run_seed(settings: Settings, *, with_documents: bool = False) -> list[str]:
    settings.ensure_dirs()
    database = Database(settings.db_path)
    lines: list[str] = []
    try:
        user = ensure_user(database, settings)
        me = Principal(user=user, session_id="seed", expires_at=utcnow(), mfa_verified=True)
        lines.append(f"User: {user.email}")
        for spec in MATTERS:
            with database.write() as db:
                matter = db.execute(
                    select(Matter).where(Matter.owner_user_id == user.id, Matter.name == spec["name"])
                ).scalar_one_or_none()
                if matter is None:
                    body = MatterCreate(
                        name=spec["name"],
                        client_name=spec["client_name"],
                        our_side=spec["our_side"],
                        court=spec.get("court"),
                        jurisdiction=spec.get("jurisdiction"),
                        practice_area=spec.get("practice_area"),
                        profile=MatterProfile.model_validate(spec.get("profile", {})),
                        ai_consent=AiConsent.model_validate(spec.get("ai_consent", {})),
                    )
                    matter = matter_service.create(db, me, body)
                    lines.append(f"Matter created: {matter.name} ({matter.id})")
                else:
                    set_scope(db, matter.id)
                    lines.append(f"Matter exists: {matter.name} ({matter.id})")
                matter_id = matter.id
            if with_documents and spec["documents"]:
                lines.extend(_seed_documents(database, settings, user.id, matter_id, spec["documents"]))
            if spec["status"] == "closed":
                with database.write() as db:
                    matter = db.get(Matter, matter_id)
                    if matter is not None and matter.status != "closed":
                        set_scope(db, matter_id)
                        matter_service.close(db, me, matter)
        if with_documents:
            from legallens.jobs.worker import run_pending

            count = run_pending(database, settings)
            lines.append(f"Ingested: ran {count} job(s).")
    finally:
        database.dispose()
    return lines


def _seed_documents(
    database: Database, settings: Settings, user_id: str, matter_id: str, names: list[str]
) -> list[str]:
    import hashlib
    import shutil
    import uuid

    from legallens.ingestion.scanner import get_scanner
    from legallens.samples.generate import ORIGINS, write_sample
    from legallens.services.documents import accept_file

    lines = []
    scanner = get_scanner(settings)
    for name in names:
        source = write_sample(name, settings.tmp_dir)
        temp = settings.tmp_dir / f"seed-{uuid.uuid4().hex}"
        shutil.copy(source, temp)
        data = temp.read_bytes()
        with database.write() as db:
            set_scope(db, matter_id)
            sha = hashlib.sha256(data).hexdigest()
            if db.execute(select(Document.id).where(Document.matter_id == matter_id, Document.sha256 == sha)).first():
                temp.unlink(missing_ok=True)
                lines.append(f"  document exists: {name}")
                continue
            accepted = accept_file(
                db,
                settings,
                scanner,
                matter_id=matter_id,
                user_id=user_id,
                temp_path=temp,
                sha256=sha,
                size=len(data),
                filename=name,
                origin=ORIGINS.get(name, "client"),
            )
            lines.append(f"  document queued: {name} ({accepted.document.id})")
        source.unlink(missing_ok=True)
    return lines


__all__ = ["audit", "run_seed"]
