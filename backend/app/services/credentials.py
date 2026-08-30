"""Credential vault service — CRUD operations for encrypted stored credentials."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.credential_crypto import (
    DecryptedPayload,
    EncryptedPayload,
    decrypt_credential as crypto_decrypt,
    encrypt_credential as crypto_encrypt,
)
from app.core.exceptions import CredentialNotFoundError, InvalidMasterPasswordError
from app.models.stored_credential import StoredCredential


@dataclass
class BulkDecryptSuccess:
    """A single successfully decrypted credential."""

    id: uuid.UUID
    username_or_email: str
    password: str
    detail: str
    url: str | None


@dataclass
class BulkDecryptFailure:
    """A single credential that could not be decrypted."""

    id: uuid.UUID
    error: str


@dataclass
class BulkDecryptResult:
    """Aggregated result of a bulk decrypt operation."""

    successes: list[BulkDecryptSuccess]
    failures: list[BulkDecryptFailure]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_user_credential(
    session: AsyncSession,
    user_id: uuid.UUID,
    credential_id: uuid.UUID,
) -> StoredCredential:
    """Load a credential that belongs to the given user or raise not-found."""
    stmt = select(StoredCredential).where(
        StoredCredential.id == credential_id,
        StoredCredential.user_id == user_id,
    )
    credential = await session.scalar(stmt)
    if credential is None:
        raise CredentialNotFoundError()
    return credential


def _to_encrypted_payload(credential: StoredCredential) -> EncryptedPayload:
    """Build an EncryptedPayload from a StoredCredential model instance."""
    return EncryptedPayload(
        ciphertext_b64=credential.ciphertext,
        salt_b64=credential.salt,
        nonce_b64=credential.nonce,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def create_credential(
    session: AsyncSession,
    user_id: uuid.UUID,
    master_password: str,
    username_or_email: str,
    password: str,
    detail: str,
    url: str | None = None,
) -> StoredCredential:
    """Encrypt credential fields and persist a new record.

    Returns the newly created StoredCredential model instance.
    """
    encrypted = crypto_encrypt(
        master_password=master_password,
        username_or_email=username_or_email,
        password=password,
        detail=detail,
        url=url,
    )

    credential = StoredCredential(
        user_id=user_id,
        detail=detail,
        ciphertext=encrypted.ciphertext_b64,
        salt=encrypted.salt_b64,
        nonce=encrypted.nonce_b64,
    )
    session.add(credential)
    await session.commit()
    await session.refresh(credential)
    return credential


async def list_credentials(
    session: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[StoredCredential], int]:
    """Return credential metadata (no decryption) sorted by updated_at descending.

    Returns a tuple of (list of models, total count).
    """
    # Total count
    count_stmt = select(func.count()).select_from(StoredCredential).where(
        StoredCredential.user_id == user_id,
    )
    total = await session.scalar(count_stmt) or 0

    # Paginated items
    items_stmt = (
        select(StoredCredential)
        .where(StoredCredential.user_id == user_id)
        .order_by(StoredCredential.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.scalars(items_stmt)
    items = list(result.all())

    return items, total


async def decrypt_credential(
    session: AsyncSession,
    user_id: uuid.UUID,
    credential_id: uuid.UUID,
    master_password: str,
) -> DecryptedPayload:
    """Verify ownership, decrypt, and return credential plaintext fields.

    Raises:
        CredentialNotFoundError: If the credential does not exist or is not owned.
        InvalidMasterPasswordError: If the master password is incorrect.
    """
    credential = await _get_user_credential(session, user_id, credential_id)
    encrypted = _to_encrypted_payload(credential)
    # crypto_decrypt raises InvalidMasterPasswordError on wrong password
    return crypto_decrypt(master_password, encrypted)


async def update_credential(
    session: AsyncSession,
    user_id: uuid.UUID,
    credential_id: uuid.UUID,
    master_password: str,
    username_or_email: str | None = None,
    password: str | None = None,
    detail: str | None = None,
    url: str | None = None,
) -> StoredCredential:
    """Decrypt existing credential, merge updated fields, and re-encrypt with new salt/nonce.

    Raises:
        CredentialNotFoundError: If the credential does not exist or is not owned.
        InvalidMasterPasswordError: If the master password is incorrect.
    """
    credential = await _get_user_credential(session, user_id, credential_id)
    encrypted = _to_encrypted_payload(credential)

    # Decrypt existing values (raises InvalidMasterPasswordError on wrong password)
    decrypted = crypto_decrypt(master_password, encrypted)

    # Merge: use provided values or fall back to existing decrypted values
    new_username = username_or_email if username_or_email is not None else decrypted.username_or_email
    new_password = password if password is not None else decrypted.password
    new_detail = detail if detail is not None else decrypted.detail
    new_url = url if url is not None else decrypted.url

    # Re-encrypt with new salt and nonce
    new_encrypted = crypto_encrypt(
        master_password=master_password,
        username_or_email=new_username,
        password=new_password,
        detail=new_detail,
        url=new_url,
    )

    # Update the model
    credential.ciphertext = new_encrypted.ciphertext_b64
    credential.salt = new_encrypted.salt_b64
    credential.nonce = new_encrypted.nonce_b64
    credential.detail = new_detail

    await session.commit()
    await session.refresh(credential)
    return credential


async def delete_credential(
    session: AsyncSession,
    user_id: uuid.UUID,
    credential_id: uuid.UUID,
) -> None:
    """Verify ownership and permanently delete the credential.

    Raises:
        CredentialNotFoundError: If the credential does not exist or is not owned.
    """
    credential = await _get_user_credential(session, user_id, credential_id)
    await session.delete(credential)
    await session.commit()


async def change_master_password(
    session: AsyncSession,
    user_id: uuid.UUID,
    credential_id: uuid.UUID,
    current_password: str,
    new_password: str,
) -> StoredCredential:
    """Decrypt with current password and re-encrypt with a new password.

    Raises:
        CredentialNotFoundError: If the credential does not exist or is not owned.
        InvalidMasterPasswordError: If the current master password is incorrect.
    """
    credential = await _get_user_credential(session, user_id, credential_id)
    encrypted = _to_encrypted_payload(credential)

    # Decrypt with current password (raises InvalidMasterPasswordError on wrong password)
    decrypted = crypto_decrypt(current_password, encrypted)

    # Re-encrypt with the new password (generates new salt and nonce)
    new_encrypted = crypto_encrypt(
        master_password=new_password,
        username_or_email=decrypted.username_or_email,
        password=decrypted.password,
        detail=decrypted.detail,
        url=decrypted.url,
    )

    # Update the model
    credential.ciphertext = new_encrypted.ciphertext_b64
    credential.salt = new_encrypted.salt_b64
    credential.nonce = new_encrypted.nonce_b64

    await session.commit()
    await session.refresh(credential)
    return credential


async def bulk_decrypt_credentials(
    session: AsyncSession,
    user_id: uuid.UUID,
    master_password: str,
    credential_ids: list[uuid.UUID] | None = None,
) -> BulkDecryptResult:
    """Decrypt multiple credentials, partitioning results into successes and failures.

    If credential_ids is None, fetch all user credentials (up to 100).
    Credentials not found or not owned are reported as failures.
    """
    if credential_ids is not None:
        # Fetch specific credentials owned by user
        stmt = select(StoredCredential).where(
            StoredCredential.user_id == user_id,
            StoredCredential.id.in_(credential_ids),
        )
        result = await session.scalars(stmt)
        credentials = list(result.all())

        # Build a lookup to detect requested IDs that weren't found
        found_ids = {c.id for c in credentials}
        not_found_ids = [cid for cid in credential_ids if cid not in found_ids]
    else:
        # Fetch all user credentials up to 100
        stmt = (
            select(StoredCredential)
            .where(StoredCredential.user_id == user_id)
            .limit(100)
        )
        result = await session.scalars(stmt)
        credentials = list(result.all())
        not_found_ids = []

    successes: list[BulkDecryptSuccess] = []
    failures: list[BulkDecryptFailure] = []

    # Report not-found IDs as failures
    for cid in not_found_ids:
        failures.append(BulkDecryptFailure(id=cid, error="Credential not found."))

    # Attempt decryption for each found credential
    for credential in credentials:
        encrypted = _to_encrypted_payload(credential)
        try:
            decrypted = crypto_decrypt(master_password, encrypted)
            successes.append(
                BulkDecryptSuccess(
                    id=credential.id,
                    username_or_email=decrypted.username_or_email,
                    password=decrypted.password,
                    detail=decrypted.detail,
                    url=decrypted.url,
                )
            )
        except InvalidMasterPasswordError:
            failures.append(
                BulkDecryptFailure(id=credential.id, error="Decryption failed.")
            )

    return BulkDecryptResult(successes=successes, failures=failures)
