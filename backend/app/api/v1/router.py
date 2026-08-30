"""Aggregate router for the versioned (v1) API."""

from fastapi import APIRouter

from app.api.v1.endpoints import admin, analytics, auth, credentials, links, secrets, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(links.router)
# Analytics shares the /links prefix but uses its own tag.
api_router.include_router(analytics.router)
api_router.include_router(users.router)
api_router.include_router(secrets.router)
api_router.include_router(credentials.router)
api_router.include_router(admin.router)
