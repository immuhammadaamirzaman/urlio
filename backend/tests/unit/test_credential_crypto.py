"""Unit tests for the credential encryption module.

Tests cover key derivation, encrypt/decrypt round-trips, wrong password
rejection, tamper detection, and salt/nonce uniqueness guarantees.

Requirements validated: 6.1, 6.4, 6.7
"""

from __future__ import annotations

import base64
import os

import pytest

from app.core.credential_crypto import (
    EncryptedPayload,
    decrypt_credential,
    derive_key,
    encrypt_credential,
)
from app.core.exceptions import InvalidMasterPasswordError


# --- Key derivation tests ----------------------------------------------------


class TestDeriveKey:
    def test_derive_key_produces_32_bytes(self):
        """derive_key should return a 32-byte (256-bit) key."""
        salt = os.urandom(16)
        key = derive_key("password", salt)
        assert len(key) == 32

    def test_derive_key_deterministic(self):
        """Same password + same salt must produce the same key."""
        salt = os.urandom(16)
        key1 = derive_key("my-master-pass", salt)
        key2 = derive_key("my-master-pass", salt)
        assert key1 == key2

    def test_derive_key_different_salt(self):
        """Same password with different salts must produce different keys."""
        salt1 = os.urandom(16)
        salt2 = os.urandom(16)
        key1 = derive_key("same-password", salt1)
        key2 = derive_key("same-password", salt2)
        assert key1 != key2


# --- Encrypt / Decrypt round-trip tests --------------------------------------


class TestEncryptDecryptRoundTrip:
    def test_encrypt_decrypt_roundtrip(self):
        """Encrypting known values and decrypting with same password yields originals."""
        master = "strong-master-pw"
        username = "user@example.com"
        password = "s3cr3t!"
        detail = "My GitHub account"

        encrypted = encrypt_credential(master, username, password, detail)
        decrypted = decrypt_credential(master, encrypted)

        assert decrypted.username_or_email == username
        assert decrypted.password == password
        assert decrypted.detail == detail
        assert decrypted.url is None

    def test_encrypt_decrypt_with_url(self):
        """When url is provided, it round-trips correctly."""
        master = "another-password"
        url = "https://github.com/login"

        encrypted = encrypt_credential(
            master, "admin", "admin123", "GitHub", url=url
        )
        decrypted = decrypt_credential(master, encrypted)

        assert decrypted.url == url

    def test_encrypt_decrypt_without_url(self):
        """When url is None, decrypt returns url=None."""
        master = "pass1234"

        encrypted = encrypt_credential(master, "user", "pw", "detail", url=None)
        decrypted = decrypt_credential(master, encrypted)

        assert decrypted.url is None


# --- Wrong password / tamper tests -------------------------------------------


class TestWrongPasswordAndTamper:
    def test_wrong_password_raises(self):
        """Decrypting with a different password raises InvalidMasterPasswordError."""
        encrypted = encrypt_credential(
            "password1", "user", "secret", "label"
        )

        with pytest.raises(InvalidMasterPasswordError):
            decrypt_credential("password2", encrypted)

    def test_tampered_ciphertext_raises(self):
        """Modifying a byte in ciphertext causes InvalidMasterPasswordError."""
        master = "correct-password"
        encrypted = encrypt_credential(master, "user", "pw", "detail")

        # Decode, flip a byte, re-encode
        raw = bytearray(base64.b64decode(encrypted.ciphertext_b64))
        raw[0] ^= 0xFF  # flip first byte
        tampered = EncryptedPayload(
            ciphertext_b64=base64.b64encode(bytes(raw)).decode("ascii"),
            salt_b64=encrypted.salt_b64,
            nonce_b64=encrypted.nonce_b64,
        )

        with pytest.raises(InvalidMasterPasswordError):
            decrypt_credential(master, tampered)


# --- Salt and Nonce uniqueness tests -----------------------------------------


class TestSaltNonceUniqueness:
    def test_different_encryptions_produce_different_salts(self):
        """Two encrypt calls produce different salt_b64 values."""
        e1 = encrypt_credential("pw", "u", "p", "d")
        e2 = encrypt_credential("pw", "u", "p", "d")
        assert e1.salt_b64 != e2.salt_b64

    def test_different_encryptions_produce_different_nonces(self):
        """Two encrypt calls produce different nonce_b64 values."""
        e1 = encrypt_credential("pw", "u", "p", "d")
        e2 = encrypt_credential("pw", "u", "p", "d")
        assert e1.nonce_b64 != e2.nonce_b64
