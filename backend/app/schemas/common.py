"""Shared schema building blocks: pagination, generic page, and error envelopes."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMBase(BaseModel):
    """Base for read models populated directly from ORM instances."""

    model_config = ConfigDict(from_attributes=True)


class PaginationParams(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    cursor: str | None = None


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int | None = None
    limit: int
    offset: int
    next_cursor: str | None = None


class ErrorDetail(BaseModel):
    code: str
    message: str
    field: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
    request_id: str | None = None
