"""Credential encryption module.

Provides AES-256-GCM encryption/decryption for stored credentials using keys
derived from a user-supplied master password via PBKDF2-HMAC-SHA256.

All sensitive fields (username_or_email, password, detail, url) are JSON-serialized
into a single plaintext blob before encryption — one encryption operation per record.
"""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

from app.core.exceptions import InvalidMasterPasswordError

# --- Constants ---------------------------------------------------------------
_KDF_ITERATIONS = 100_000
_KEY_LENGTH = 32  # 256 bits
_SALT_LENGTH = 16  # bytes
_NONCE_LENGTH = 12  # bytes


# --- Data classes ------------------------------------------------------------
@dataclass
class EncryptedPayload:
    """Holds the base64-encoded outputs of a single encryption operation."""

    ciphertext_b64: str  # base64-encoded AESGCM ciphertext (includes auth tag)
    salt_b64: str  # base64-encoded 16-byte salt
    nonce_b64: str  # base64-encoded 12-byte nonce


@dataclass
class DecryptedPayload:
    """Holds the plaintext credential fields after successful decryption."""

    username_or_email: str
    password: str
    detail: str
    url: str | None


# --- Key derivation ----------------------------------------------------------
def derive_key(master_password: str, salt: bytes) -> bytes:
    """Derive a 32-byte encryption key from a master password using PBKDF2-HMAC-SHA256.

    Args:
        master_password: The user-supplied master password.
        salt: A 16-byte random salt unique per credential record.

    Returns:
        A 32-byte derived key suitable for AES-256-GCM.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=_KEY_LENGTH,
        salt=salt,
        iterations=_KDF_ITERATIONS,
    )
    return kdf.derive(master_password.encode("utf-8"))


# --- Encryption --------------------------------------------------------------
def encrypt_credential(
    master_password: str,
    username_or_email: str,
    password: str,
    detail: str,
    url: str | None = None,
) -> EncryptedPayload:
    """Encrypt credential fields into a single AESGCM ciphertext blob.

    Generates a random 16-byte salt and 12-byte nonce, derives a key from
    the master password, JSON-serializes the credential fields, and encrypts
    the resulting bytes with AES-256-GCM.

    Args:
        master_password: User-supplied master password for key derivation.
        username_or_email: The credential username or email.
        password: The credential password.
        detail: A human-readable label for the credential.
        url: Optional URL associated with the credential.

    Returns:
        An EncryptedPayload with base64-encoded ciphertext, salt, and nonce.
    """
    # Generate cryptographically secure random salt and nonce
    salt = os.urandom(_SALT_LENGTH)
    nonce = os.urandom(_NONCE_LENGTH)

    # Derive encryption key
    key = derive_key(master_password, salt)

    # Build plaintext JSON blob
    payload: dict[str, str] = {
        "username_or_email": username_or_email,
        "password": password,
        "detail": detail,
    }
    if url is not None:
        payload["url"] = url

    plaintext = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    # Encrypt with AES-256-GCM
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    # Base64-encode for string storage
    return EncryptedPayload(
        ciphertext_b64=base64.b64encode(ciphertext).decode("ascii"),
        salt_b64=base64.b64encode(salt).decode("ascii"),
        nonce_b64=base64.b64encode(nonce).decode("ascii"),
    )


# --- Decryption --------------------------------------------------------------
def decrypt_credential(
    master_password: str,
    encrypted: EncryptedPayload,
) -> DecryptedPayload:
    """Decrypt an encrypted credential payload using the master password.

    Derives the key from the stored salt and decrypts the ciphertext. If the
    master password is incorrect, the AESGCM authentication tag check will
    fail and an InvalidMasterPasswordError is raised.

    Args:
        master_password: User-supplied master password for key derivation.
        encrypted: The EncryptedPayload containing ciphertext, salt, and nonce.

    Returns:
        A DecryptedPayload with the plaintext credential fields.

    Raises:
        InvalidMasterPasswordError: If decryption fails due to auth tag mismatch
            (wrong password or tampered ciphertext).
    """
    # Decode base64 values
    ciphertext = base64.b64decode(encrypted.ciphertext_b64)
    salt = base64.b64decode(encrypted.salt_b64)
    nonce = base64.b64decode(encrypted.nonce_b64)

    # Derive key from stored salt
    key = derive_key(master_password, salt)

    # Decrypt with AES-256-GCM
    aesgcm = AESGCM(key)
    try:
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    except InvalidTag:
        raise InvalidMasterPasswordError()

    # Parse JSON blob back into fields
    data = json.loads(plaintext.decode("utf-8"))

    return DecryptedPayload(
        username_or_email=data["username_or_email"],
        password=data["password"],
        detail=data["detail"],
        url=data.get("url"),
    )
