"""Credential vault endpoints — store, retrieve, update, and delete encrypted credentials."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.credential import (
    BulkDecryptFailure,
    BulkDecryptRequest,
    BulkDecryptResponse,
    ChangePasswordRequest,
    ChangePasswordResponse,
    CredentialCreate,
    CredentialCreateResponse,
    CredentialDecryptRequest,
    CredentialDecryptResponse,
    CredentialListItem,
    CredentialListResponse,
    CredentialUpdate,
    CredentialUpdateResponse,
)
from app.services.credentials import (
    bulk_decrypt_credentials,
    change_master_password,
    create_credential,
    decrypt_credential,
    delete_credential,
    list_credentials,
    update_credential,
)

router = APIRouter(prefix="/credentials", tags=["credentials"])


@router.post(
    "",
    response_model=CredentialCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    data: CredentialCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CredentialCreateResponse:
    credential = await create_credential(
        session,
        user.id,
        data.master_password,
        data.username_or_email,
        data.password,
        data.detail,
        data.url,
    )
    return CredentialCreateResponse(
        id=credential.id,
        detail=credential.detail,
        created_at=credential.created_at,
    )


@router.get("", response_model=CredentialListResponse)
async def list_my_credentials(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> CredentialListResponse:
    items, total = await list_credentials(session, user.id, limit, offset)
    return CredentialListResponse(
        items=[
            CredentialListItem(
                id=c.id,
                detail=c.detail,
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
            for c in items
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


# NOTE: bulk-decrypt is defined BEFORE the {credential_id} routes to avoid path conflicts.
@router.post("/bulk-decrypt", response_model=BulkDecryptResponse)
async def bulk_decrypt(
    data: BulkDecryptRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> BulkDecryptResponse:
    result = await bulk_decrypt_credentials(
        session, user.id, data.master_password, data.credential_ids
    )
    return BulkDecryptResponse(
        successes=[
            CredentialDecryptResponse(
                id=s.id,
                username_or_email=s.username_or_email,
                password=s.password,
                detail=s.detail,
                url=s.url,
            )
            for s in result.successes
        ],
        failures=[
            BulkDecryptFailure(id=f.id, error=f.error) for f in result.failures
        ],
        success_count=len(result.successes),
        failure_count=len(result.failures),
    )


@router.post("/{credential_id}/decrypt", response_model=CredentialDecryptResponse)
async def decrypt_one(
    credential_id: uuid.UUID,
    data: CredentialDecryptRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CredentialDecryptResponse:
    decrypted = await decrypt_credential(
        session, user.id, credential_id, data.master_password
    )
    return CredentialDecryptResponse(
        id=credential_id,
        username_or_email=decrypted.username_or_email,
        password=decrypted.password,
        detail=decrypted.detail,
        url=decrypted.url,
    )


@router.patch("/{credential_id}", response_model=CredentialUpdateResponse)
async def update_one(
    credential_id: uuid.UUID,
    data: CredentialUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CredentialUpdateResponse:
    credential = await update_credential(
        session,
        user.id,
        credential_id,
        data.master_password,
        data.username_or_email,
        data.password,
        data.detail,
        data.url,
    )
    return CredentialUpdateResponse(
        id=credential.id,
        detail=credential.detail,
        updated_at=credential.updated_at,
    )


@router.delete("/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_one(
    credential_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Response:
    await delete_credential(session, user.id, credential_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{credential_id}/change-password", response_model=ChangePasswordResponse)
async def change_password(
    credential_id: uuid.UUID,
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ChangePasswordResponse:
    credential = await change_master_password(
        session, user.id, credential_id, data.current_password, data.new_password
    )
    return ChangePasswordResponse(
        id=credential.id,
        updated_at=credential.updated_at,
    )
