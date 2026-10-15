"""Job handler: ingest one document (TA frame 6)."""

from legallens.ingestion.pipeline import ingest, on_failure
from legallens.jobs.handlers import Handler

HANDLER = Handler(run=ingest, on_failure=on_failure)
