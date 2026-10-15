"""All /api/v1 routes, grouped as in the API reference (A–H) plus Ops."""

from fastapi import APIRouter

from legallens.api.v1 import audit, auth, chat, conversations, documents, drafts, health, jobs, matters

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(matters.router)
api_router.include_router(conversations.router)
api_router.include_router(chat.router)
api_router.include_router(documents.router)
api_router.include_router(jobs.router)
api_router.include_router(drafts.matter_router)
api_router.include_router(drafts.router)
api_router.include_router(audit.router)
api_router.include_router(health.router)
