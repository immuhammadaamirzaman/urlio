"""Property-based tests for credential encryption using Hypothesis.

# Feature: storage-credentials
"""

from __future__ import annotations

import base64

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from app.core.credential_crypto import (
    EncryptedPayload,
    encrypt_credential,
    decrypt_credential,
)
from app.core.exceptions import InvalidMasterPasswordError

# --- Strategies ---------------------------------------------------------------

# Master password: 8–128 printable characters (per requirements)
master_password_st = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "S")),
    min_size=8,
    max_size=128,
)

# Credential field strategies
username_st = st.text(min_size=1, max_size=255)
password_field_st = st.text(min_size=1, max_size=1024)
detail_st = st.text(min_size=1, max_size=255)
url_st = st.one_of(st.none(), st.text(min_size=1, max_size=2048))


# --- Property 8: Tamper Detection ---------------------------------------------
# Feature: storage-credentials, Property 8: Tamper Detection


class TestTamperDetection:
    """Modifying any byte of ciphertext, salt, or nonce causes decryption to fail.

    **Validates: Requirements 6.4**
    """

    @given(
        master_password=master_password_st,
        username_or_email=username_st,
        password_field=password_field_st,
        detail=detail_st,
        url=url_st,
        tamper_index_data=st.data(),
    )
    @settings(max_examples=100)
    def test_tamper_ciphertext_causes_failure(
        self,
        master_password: str,
        username_or_email: str,
        password_field: str,
        detail: str,
        url: str | None,
        tamper_index_data,
    ):
        """Flipping any byte in the ciphertext causes decryption to fail.

        # Feature: storage-credentials, Property 8: Tamper Detection
        **Validates: Requirements 6.4**
        """
        # Encrypt credential fields
        encrypted = encrypt_credential(
            master_password=master_password,
            username_or_email=username_or_email,
            password=password_field,
            detail=detail,
            url=url,
        )

        # Decode ciphertext to raw bytes
        ct_bytes = bytearray(base64.b64decode(encrypted.ciphertext_b64))
        assume(len(ct_bytes) > 0)

        # Pick a random index to tamper
        idx = tamper_index_data.draw(st.integers(min_value=0, max_value=len(ct_bytes) - 1))

        # Flip one byte via XOR with 0xFF
        ct_bytes[idx] ^= 0xFF

        # Re-encode to base64
        tampered_ct_b64 = base64.b64encode(bytes(ct_bytes)).decode("ascii")

        # Create tampered payload with original salt and nonce
        tampered_payload = EncryptedPayload(
            ciphertext_b64=tampered_ct_b64,
            salt_b64=encrypted.salt_b64,
            nonce_b64=encrypted.nonce_b64,
        )

        # Decryption must fail
        with pytest.raises(InvalidMasterPasswordError):
            decrypt_credential(master_password, tampered_payload)

    @given(
        master_password=master_password_st,
        username_or_email=username_st,
        password_field=password_field_st,
        detail=detail_st,
        url=url_st,
        tamper_index_data=st.data(),
    )
    @settings(max_examples=100)
    def test_tamper_salt_causes_failure(
        self,
        master_password: str,
        username_or_email: str,
        password_field: str,
        detail: str,
        url: str | None,
        tamper_index_data,
    ):
        """Flipping any byte in the salt causes decryption to fail.

        # Feature: storage-credentials, Property 8: Tamper Detection
        **Validates: Requirements 6.4**
        """
        # Encrypt credential fields
        encrypted = encrypt_credential(
            master_password=master_password,
            username_or_email=username_or_email,
            password=password_field,
            detail=detail,
            url=url,
        )

        # Decode salt to raw bytes
        salt_bytes = bytearray(base64.b64decode(encrypted.salt_b64))
        assume(len(salt_bytes) > 0)

        # Pick a random index to tamper
        idx = tamper_index_data.draw(st.integers(min_value=0, max_value=len(salt_bytes) - 1))

        # Flip one byte via XOR with 0xFF
        salt_bytes[idx] ^= 0xFF

        # Re-encode to base64
        tampered_salt_b64 = base64.b64encode(bytes(salt_bytes)).decode("ascii")

        # Create tampered payload with original ciphertext and nonce
        tampered_payload = EncryptedPayload(
            ciphertext_b64=encrypted.ciphertext_b64,
            salt_b64=tampered_salt_b64,
            nonce_b64=encrypted.nonce_b64,
        )

        # Decryption must fail (salt changes derived key → auth tag mismatch)
        with pytest.raises(InvalidMasterPasswordError):
            decrypt_credential(master_password, tampered_payload)

    @given(
        master_password=master_password_st,
        username_or_email=username_st,
        password_field=password_field_st,
        detail=detail_st,
        url=url_st,
        tamper_index_data=st.data(),
    )
    @settings(max_examples=100)
    def test_tamper_nonce_causes_failure(
        self,
        master_password: str,
        username_or_email: str,
        password_field: str,
        detail: str,
        url: str | None,
        tamper_index_data,
    ):
        """Flipping any byte in the nonce causes decryption to fail.

        # Feature: storage-credentials, Property 8: Tamper Detection
        **Validates: Requirements 6.4**
        """
        # Encrypt credential fields
        encrypted = encrypt_credential(
            master_password=master_password,
            username_or_email=username_or_email,
            password=password_field,
            detail=detail,
            url=url,
        )

        # Decode nonce to raw bytes
        nonce_bytes = bytearray(base64.b64decode(encrypted.nonce_b64))
        assume(len(nonce_bytes) > 0)

        # Pick a random index to tamper
        idx = tamper_index_data.draw(st.integers(min_value=0, max_value=len(nonce_bytes) - 1))

        # Flip one byte via XOR with 0xFF
        nonce_bytes[idx] ^= 0xFF

        # Re-encode to base64
        tampered_nonce_b64 = base64.b64encode(bytes(nonce_bytes)).decode("ascii")

        # Create tampered payload with original ciphertext and salt
        tampered_payload = EncryptedPayload(
            ciphertext_b64=encrypted.ciphertext_b64,
            salt_b64=encrypted.salt_b64,
            nonce_b64=tampered_nonce_b64,
        )

        # Decryption must fail (wrong nonce → auth tag mismatch)
        with pytest.raises(InvalidMasterPasswordError):
            decrypt_credential(master_password, tampered_payload)
