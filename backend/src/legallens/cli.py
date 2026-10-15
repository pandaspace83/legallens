"""`legallens` command line: serve, worker, dev, db, seed, search, jobs and audit."""

import os
import threading
from pathlib import Path
from typing import Annotated, Any

import typer

from legallens.config import get_settings

app = typer.Typer(help="LegalLens backend.", no_args_is_help=True, add_completion=False)
db_app = typer.Typer(help="Database migrations.", no_args_is_help=True)
jobs_app = typer.Typer(help="Background jobs.", no_args_is_help=True)
audit_app = typer.Typer(help="Audit log.", no_args_is_help=True)
app.add_typer(db_app, name="db")
app.add_typer(jobs_app, name="jobs")
app.add_typer(audit_app, name="audit")


@app.command()
def serve(
    reload: bool = False,
    port: Annotated[int | None, typer.Option()] = None,
    worker: Annotated[bool, typer.Option("--worker", help="Also run the background worker in this process.")] = False,
    https: Annotated[
        bool, typer.Option("--https", help="Serve HTTPS with a certificate made on this computer (`cert trust`).")
    ] = False,
) -> None:
    """Run the API on 127.0.0.1 (DEC-08). With the built frontend present it is the whole app."""
    import uvicorn

    if worker:
        os.environ["LEGALLENS_INPROCESS_WORKER"] = "true"
    if https:
        os.environ["LEGALLENS_COOKIE_SECURE"] = "true"  # the session cookie is then never sent over plain http
    if worker or https:
        get_settings.cache_clear()

    settings = get_settings()
    tls: dict[str, Any] = {}
    if https:
        from legallens.tls import ensure_certificate

        cert, key = ensure_certificate(settings)
        tls = {"ssl_certfile": str(cert), "ssl_keyfile": str(key)}
    uvicorn.run(
        "legallens.main:create_app",
        factory=True,
        host=settings.host,
        port=port or settings.port,
        reload=reload,
        access_log=False,
        log_config=None,
        **tls,
    )


cert_app = typer.Typer(help="The local HTTPS certificate.", no_args_is_help=True)
app.add_typer(cert_app, name="cert")


@cert_app.command("trust")
def cert_trust() -> None:
    """Create the certificate if needed and print the command that makes this computer trust it (once)."""
    from legallens.tls import ensure_certificate

    cert, _ = ensure_certificate(get_settings())
    typer.echo(f"Certificate: {cert}")
    typer.echo("Trust it on macOS (asks for your password):")
    typer.echo(f'  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "{cert}"')
    typer.echo("Then run `legallens serve --https` and open https://127.0.0.1:8000")


@app.command()
def dev(port: Annotated[int | None, typer.Option()] = None) -> None:
    """API with auto-reload and an in-process worker: one command for development."""
    os.environ["LEGALLENS_INPROCESS_WORKER"] = "true"
    get_settings.cache_clear()
    serve(reload=True, port=port)


@app.command()
def worker() -> None:
    """Run the background worker: ingestion, summaries, drafts and exports."""
    import signal

    from legallens.db.engine import Database
    from legallens.jobs.worker import run_worker
    from legallens.logging import configure_logging

    configure_logging()
    settings = get_settings()
    settings.ensure_dirs()
    database = Database(settings.db_path)
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    try:
        run_worker(database, settings, stop)
    finally:
        database.dispose()


@db_app.command("upgrade")
def db_upgrade() -> None:
    """Create or migrate the database to the latest schema."""
    from legallens.db.migrate import upgrade

    settings = get_settings()
    settings.ensure_dirs()
    upgrade(settings.db_path, embed_dim=settings.embed_dim)
    typer.echo(f"Database is up to date: {settings.db_path}")


@db_app.command("reset")
def db_reset(yes: Annotated[bool, typer.Option("--yes", help="Confirm.")] = False) -> None:
    """Dev only: delete the database and all stored files, then recreate the schema."""
    import shutil

    from legallens.db.migrate import upgrade

    settings = get_settings()
    if settings.env == "prod":
        raise typer.BadParameter("Refusing to reset a prod database.")
    if not yes:
        typer.confirm(f"Delete {settings.db_path} and every stored file?", abort=True)
    for suffix in ("", "-wal", "-shm"):
        Path(f"{settings.db_path}{suffix}").unlink(missing_ok=True)
    for folder in (settings.files_dir, settings.quarantine_dir, settings.exports_dir, settings.tmp_dir):
        shutil.rmtree(folder, ignore_errors=True)
    settings.ensure_dirs()
    upgrade(settings.db_path, embed_dim=settings.embed_dim)
    typer.echo("Database reset.")


@db_app.command("encrypt")
def db_encrypt() -> None:
    """Encrypt the existing database with SQLCipher (AES-256). The plain file is replaced; stop the app first."""
    from legallens.db.convert import encrypt_database

    settings = get_settings()
    try:
        counts = encrypt_database(settings.db_path, settings.embed_dim)
    except (ValueError, FileNotFoundError) as exc:
        raise typer.BadParameter(str(exc)) from exc
    from legallens.storage.files import files_key, seal_existing

    key = files_key(settings.db_path)
    sealed = seal_existing(settings.files_dir, key) if key is not None and settings.files_dir.exists() else 0
    typer.echo(f"Encrypted {settings.db_path}: {sum(counts.values())} rows in {len(counts)} tables, {sealed} files.")
    typer.echo(f"The key is in {settings.db_path.parent / 'db.key'} (or set LEGALLENS_DB_KEY). Keep a copy of it:")
    typer.echo("without the key the database cannot be opened.")


@app.command()
def seed(
    with_documents: Annotated[
        bool, typer.Option(help="Also upload and ingest the synthetic sample documents.")
    ] = False,
) -> None:
    """Create the dev user and the three demo matters (synthetic data only, SUG-08)."""
    from legallens.samples.seed import run_seed

    settings = get_settings()
    summary = run_seed(settings, with_documents=with_documents)
    for line in summary:
        typer.echo(line)


@app.command()
def search(
    question: str,
    matter: Annotated[str, typer.Option(help="Matter id.")],
    document: Annotated[list[str] | None, typer.Option(help="Limit to these document ids.")] = None,
) -> None:
    """Run the hybrid search and print both legs and the fused ranking."""
    from legallens.db.engine import Database
    from legallens.db.scope import set_scope
    from legallens.models.embedder import get_embedder
    from legallens.search.hybrid import hybrid_search

    settings = get_settings()
    database = Database(settings.db_path)
    with database.read() as db:
        set_scope(db, matter)
        result = hybrid_search(db, get_embedder(settings), matter_id=matter, query=question, document_ids=document)
    typer.echo(f"FTS query: {result.fts_query}")
    typer.echo(f"keyword hits: {len(result.bm25)}   vector hits: {len(result.vector)}\n")
    for i, hit in enumerate(result.hits[:10], start=1):
        where = f"{hit.document_name} p.{hit.page_start} {hit.para_ref or ''}".strip()
        typer.echo(f"{i:>2}. rrf={hit.rrf:.4f} bm25#{hit.bm25_rank or '-'} vec#{hit.vec_rank or '-'}  {where}")
        typer.echo(f"    {' '.join(hit.text.split())[:160]}")


models_app = typer.Typer(help="Local models.", no_args_is_help=True)
app.add_typer(models_app, name="models")


@models_app.command("download")
def models_download(
    what: Annotated[str, typer.Option(help="all | embeddings | docling")] = "all",
) -> None:
    """Download the local models once (the only time they need the network): bge-m3 and the reranker (about
    4.5 GB) for search, and Docling's layout and table models for ingestion."""
    settings = get_settings()
    if what not in ("all", "embeddings", "docling"):
        raise typer.BadParameter("Choose all, embeddings or docling.")

    if what in ("all", "embeddings"):
        from legallens.models import hf

        names = [settings.embed_model] + ([settings.rerank_model] if settings.reranker == "bge" else [])
        for name in names:
            typer.echo(f"Downloading {name} ...")
            typer.echo(f"  -> {hf.download(settings, name)}")

    if what in ("all", "docling"):
        from docling.utils.model_downloader import download_models

        target = settings.docling_artifacts_path
        target.mkdir(parents=True, exist_ok=True)
        download_models(
            output_dir=target,
            with_layout=True,
            with_tableformer=True,
            with_code_formula=False,
            with_picture_classifier=False,
            with_rapidocr=False,
            progress=True,
        )
        typer.echo(f"Docling models are in {target}")


@app.command()
def reindex(
    matter: Annotated[str | None, typer.Option(help="Only this matter id (default: every matter).")] = None,
) -> None:
    """Re-embed every chunk with the current embedding model. Run it after changing LEGALLENS_EMBEDDER."""
    import time

    from legallens.db.engine import Database
    from legallens.models.embedder import get_embedder
    from legallens.services.reindex import reindex as run_reindex

    settings = get_settings()
    database = Database(settings.db_path)
    embedder = get_embedder(settings)
    started = time.monotonic()
    last: dict[str, int] = {}

    def show(matter_id: str, done: int, total: int) -> None:
        if done == total or done - last.get(matter_id, 0) >= 256:
            last[matter_id] = done
            typer.echo(f"  {matter_id}: {done}/{total}")

    try:
        result = run_reindex(database, embedder, matter_id=matter, progress=show)
    finally:
        database.dispose()
    total = sum(result.values())
    seconds = time.monotonic() - started
    typer.echo(f"Re-embedded {total} chunks in {len(result)} matter(s) with {embedder.kind} in {seconds:.0f}s.")


@app.command()
def openapi(output: Annotated[Path, typer.Option(help="Where to write the spec.")] = Path("openapi.json")) -> None:
    """Write the OpenAPI spec (the API contract the frontend's HttpApiClient is built from)."""
    import json

    from legallens.main import create_app

    spec = create_app(get_settings()).openapi()
    output.write_text(json.dumps(spec, indent=2, sort_keys=True) + "\n")
    paths = sum(len(v) for v in spec["paths"].values())
    typer.echo(f"Wrote {output} ({paths} operations)")


@jobs_app.command("run")
def jobs_run() -> None:
    """Run every queued job now, then exit."""
    from legallens.db.engine import Database
    from legallens.jobs.worker import run_pending

    settings = get_settings()
    count = run_pending(Database(settings.db_path), settings)
    typer.echo(f"Ran {count} job(s).")


@audit_app.command("verify")
def audit_verify() -> None:
    """Check the audit log's hash chain."""
    from legallens.db.engine import Database
    from legallens.services.audit import verify_chain

    database = Database(get_settings().db_path)
    with database.read() as db:
        valid, broken = verify_chain(db)
    if valid:
        typer.echo("Audit chain is intact.")
    else:
        typer.echo(f"Audit chain is BROKEN at entry {broken}.")
        raise typer.Exit(1)


user_app = typer.Typer(help="Sign-in accounts (real auth mode).", no_args_is_help=True)
app.add_typer(user_app, name="user")


def _users_database() -> tuple[Any, Any]:
    from legallens.db.engine import Database

    settings = get_settings()
    settings.ensure_dirs()
    return settings, Database(settings.db_path)


@user_app.command("create")
def user_create(
    email: Annotated[str, typer.Option(help="Sign-in email.")],
    name: Annotated[str, typer.Option(help="Display name.")] = "",
    password: Annotated[str, typer.Option(prompt=True, hide_input=True, confirmation_prompt=True)] = "",
) -> None:
    """Create a lawyer's account: a password and an authenticator-app code (shown once)."""
    from legallens.db.models import User
    from legallens.ids import new_id
    from legallens.services import auth as auth_service

    if len(password) < 12:
        raise typer.BadParameter("Use at least 12 characters.")
    settings, database = _users_database()
    sealed, seed_text, uri = auth_service.new_totp(settings, email)
    with database.write() as db:
        if auth_service.find_user(db, email) is not None:
            raise typer.BadParameter("That email already has an account.")
        db.add(
            User(
                id=new_id("user"),
                email=email.strip().lower(),
                name=name or email.split("@")[0],
                password_hash=auth_service.hash_password(password),
                totp_secret=sealed,
                licensing_states=[],
            )
        )
    typer.echo(f"Account created for {email}.")
    typer.echo("Add this to an authenticator app (shown once):")
    typer.echo(f"  Secret: {seed_text}")
    typer.echo(f"  URI:    {uri}")


@user_app.command("reset-password")
def user_reset_password(
    email: str,
    password: Annotated[str, typer.Option(prompt=True, hide_input=True, confirmation_prompt=True)] = "",
) -> None:
    """Set a new password and unlock the account."""
    from legallens.services import auth as auth_service

    if len(password) < 12:
        raise typer.BadParameter("Use at least 12 characters.")
    _, database = _users_database()
    with database.write() as db:
        user = auth_service.find_user(db, email)
        if user is None:
            raise typer.BadParameter("No such account.")
        user.password_hash = auth_service.hash_password(password)
        auth_service.register_success(user)
    typer.echo("Password changed.")


@user_app.command("reset-mfa")
def user_reset_mfa(email: str) -> None:
    """Issue a new authenticator secret (shown once)."""
    from legallens.services import auth as auth_service

    settings, database = _users_database()
    sealed, seed_text, uri = auth_service.new_totp(settings, email)
    with database.write() as db:
        user = auth_service.find_user(db, email)
        if user is None:
            raise typer.BadParameter("No such account.")
        user.totp_secret = sealed
    typer.echo(f"  Secret: {seed_text}")
    typer.echo(f"  URI:    {uri}")


@user_app.command("unlock")
def user_unlock(email: str) -> None:
    """Clear a lockout."""
    from legallens.services import auth as auth_service

    _, database = _users_database()
    with database.write() as db:
        user = auth_service.find_user(db, email)
        if user is None:
            raise typer.BadParameter("No such account.")
        auth_service.register_success(user)
    typer.echo("Unlocked.")


backup_app = typer.Typer(help="Encrypted backups and restore tests (DEC-61).", no_args_is_help=True)
app.add_typer(backup_app, name="backup")


@backup_app.command("create")
def backup_create(
    to: Annotated[Path, typer.Option(help="A file, or a folder (a dated file name is chosen).")],
) -> None:
    """One file with the encrypted database and files. The key is NOT inside: keep it apart (`key show`)."""
    from legallens.backup import backup_name, create_backup

    settings = get_settings()
    if to.is_dir() or to.suffix != ".llbackup":
        to = to / backup_name()
    try:
        manifest = create_backup(settings, to)
    except ValueError as exc:
        raise typer.BadParameter(str(exc)) from exc
    typer.echo(f"Backup written to {to}: {manifest['files']} files, {manifest['bytes']} bytes.")


@backup_app.command("prune")
def backup_prune(
    folder: Annotated[Path, typer.Option(help="The folder holding *.llbackup files.")],
    days: Annotated[int, typer.Option(help="Delete backups older than this (FR-MAT-02: 35).")] = 35,
) -> None:
    """Delete backups past the retention period, keeping the newest one."""
    from legallens.backup import prune_backups

    removed = prune_backups(folder, days=days)
    typer.echo(f"Removed {len(removed)} backup(s) older than {days} days.")
    for path in removed:
        typer.echo(f"  {path.name}")


@backup_app.command("verify")
def backup_verify(
    path: Path,
    key: Annotated[str | None, typer.Option(help="The key (64 hex characters); default: this install's key.")] = None,
) -> None:
    """Restore into a temporary folder and check it: hashes, schema, row counts, and a search."""
    from legallens.backup import verify_backup

    report = verify_backup(path, key=key)
    for line in report:
        typer.echo(line)


@backup_app.command("restore")
def backup_restore(
    path: Path,
    to: Annotated[Path, typer.Option(help="An empty data folder to restore into.")],
    key: Annotated[str | None, typer.Option(help="The key (64 hex characters).")] = None,
) -> None:
    """Unpack a backup into an empty folder and check it opens with the key."""
    from legallens.backup import restore_backup

    for line in restore_backup(path, to, key=key):
        typer.echo(line)


key_app = typer.Typer(help="The database key.", no_args_is_help=True)
app.add_typer(key_app, name="key")


@key_app.command("show")
def key_show() -> None:
    """Print the key (64 hex characters). Store a copy somewhere other than this computer."""
    from legallens.db.crypto import load_key

    settings = get_settings()
    value = load_key(settings.db_path, create=False)
    if value is None:
        raise typer.BadParameter("Encryption is off. Run `legallens db encrypt` first.")
    typer.echo(value)


feedback_app = typer.Typer(help="Lawyer feedback on answers.", no_args_is_help=True)
app.add_typer(feedback_app, name="feedback")


@feedback_app.command("export")
def feedback_export(
    to: Annotated[Path, typer.Option(help="JSON-lines file to write (owner-only).")] = Path("feedback_cases.jsonl"),
) -> None:
    """Write every piece of feedback as a candidate golden-set case, for a person to review and add."""
    from legallens.db.engine import Database
    from legallens.feedback_export import export_feedback

    count = export_feedback(Database(get_settings().db_path), to)
    typer.echo(f"Wrote {count} cases to {to}. Review each one: it quotes client documents.")


if __name__ == "__main__":
    app()
