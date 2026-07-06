"""Application settings, loaded from environment / `.env`.

A single cached `Settings` instance (`get_settings()` / module-level `settings`) is the one
source of truth for configuration. Every field is **required** and is supplied exclusively
from the environment (or the `.env` file) — there are no in-code default values, so no
configuration is silently hardcoded and a missing variable fails fast at startup with a
clear error. List-typed values accept comma-separated strings in the environment (e.g.
``CORS_ORIGINS=https://a.com,https://b.com``).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated
from urllib.parse import quote

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# ``NoDecode`` disables pydantic-settings' implicit JSON decoding of complex types so the
# ``_split_csv`` validator can parse plain comma-separated environment strings.
CSVList = Annotated[list[str], NoDecode]

# The backend package root (…/backend), used to locate the `.env` file regardless of the
# process's current working directory (whether uvicorn is launched from the repo root or
# from backend/). Without this, a wrong CWD would leave every required field unset.
_BACKEND_DIR = Path(__file__).resolve().parents[2]

# Known-insecure placeholder shipped in `.env.example`; production refuses to boot with it
# (see the validator).
_DEFAULT_SECRET_KEY = "CHANGE_ME_DEV_SECRET_NOT_FOR_PROD"


class Settings(BaseSettings):
    """Strongly-typed application configuration.

    All fields are required: values come from the environment / `.env`, never from in-code
    defaults. Set a list-valued field to an empty string (e.g. ``TRUSTED_PROXIES=``) for an
    empty list.
    """

    model_config = SettingsConfigDict(
        env_file=_BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- App / meta ---
    PROJECT_NAME: str
    ENVIRONMENT: str
    DEBUG: bool
    API_V1_PREFIX: str
    BASE_URL: str

    # --- Server ---
    HOST: str
    PORT: int
    LOG_LEVEL: str
    LOG_JSON: bool
    # IPs or CIDR ranges of reverse proxies whose X-Forwarded-For may be trusted.
    # Empty (``TRUSTED_PROXIES=``) ignores X-Forwarded-For and uses the socket peer.
    TRUSTED_PROXIES: CSVList

    # --- Database ---
    # Set DATABASE_URL directly, or leave it empty (``DATABASE_URL=``) to have it assembled
    # from the POSTGRES_* parts below. An explicit DATABASE_URL always wins (e.g. the test
    # suite sets it to a SQLite URL).
    DATABASE_URL: str
    POSTGRES_HOST: str
    POSTGRES_PORT: int
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    DB_POOL_SIZE: int
    DB_MAX_OVERFLOW: int
    DB_POOL_TIMEOUT: int
    DB_POOL_RECYCLE: int
    DB_ECHO: bool

    # --- Redis ---
    REDIS_URL: str
    REDIS_MAX_CONNECTIONS: int
    CACHE_TTL_SECONDS: int
    NEGATIVE_CACHE_TTL_SECONDS: int
    CLICK_STREAM_KEY: str
    CLICK_STREAM_MAXLEN: int
    CLICK_CONSUMER_GROUP: str
    CLICK_FLUSH_BATCH: int
    CLICK_FLUSH_ENABLED: bool
    CLICK_FLUSH_INTERVAL_SECONDS: float

    # --- Security / JWT ---
    SECRET_KEY: str
    JWT_ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_DAYS: int
    JWT_ISSUER: str
    JWT_AUDIENCE: str
    LINK_PASSWORD_TOKEN_EXPIRE_MINUTES: int
    # Single-use action tokens (email verification, password reset, email change).
    EMAIL_VERIFY_TOKEN_EXPIRE_HOURS: int
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int
    EMAIL_CHANGE_TOKEN_EXPIRE_HOURS: int

    # --- Email / SMTP ---
    # Public base URL of the frontend; used to build links in transactional emails.
    FRONTEND_URL: str
    EMAIL_FROM: str
    EMAIL_FROM_NAME: str
    # SMTP transport. When SMTP_HOST is empty, email sending is disabled: the message is
    # logged instead of sent, so registration/reset flows still work without a mail server.
    SMTP_HOST: str
    SMTP_PORT: int
    SMTP_USERNAME: str
    SMTP_PASSWORD: str
    SMTP_USE_TLS: bool  # STARTTLS on a plaintext port (e.g. 587)
    SMTP_USE_SSL: bool  # implicit TLS (e.g. 465)
    SMTP_TIMEOUT_SECONDS: int

    # --- Password hashing ---
    ARGON2_TIME_COST: int
    ARGON2_MEMORY_COST: int
    ARGON2_PARALLELISM: int
    PASSWORD_MIN_LENGTH: int
    PASSWORD_MAX_LENGTH: int

    # --- Shortcode ---
    SHORTCODE_LENGTH: int
    SHORTCODE_MAX_LENGTH: int
    SHORTCODE_ALPHABET: str
    SHORTCODE_MAX_RETRIES: int
    CUSTOM_ALIAS_MIN_LENGTH: int
    CUSTOM_ALIAS_MAX_LENGTH: int

    # --- URL validation / SSRF ---
    MAX_URL_LENGTH: int
    ALLOWED_URL_SCHEMES: CSVList
    SSRF_PROTECTION_ENABLED: bool
    SSRF_ALLOW_PRIVATE_HOSTS: bool
    SSRF_HOST_ALLOWLIST: CSVList

    # --- Rate limiting ---
    RATE_LIMIT_ENABLED: bool
    RATE_LIMIT_ANON_PER_MINUTE: int
    RATE_LIMIT_ANON_WINDOW_SECONDS: int
    RATE_LIMIT_AUTH_PER_MINUTE: int
    RATE_LIMIT_AUTH_WINDOW_SECONDS: int
    RATE_LIMIT_REDIRECT_ANON_PER_MINUTE: int
    RATE_LIMIT_REDIRECT_WINDOW_SECONDS: int

    # --- Redirect ---
    REDIRECT_STATUS_CODE: int
    # Request header carrying the visitor's ISO 3166-1 alpha-2 country code, set by a CDN or
    # reverse proxy (e.g. Cloudflare's "CF-IPCountry"). Empty (``COUNTRY_HEADER=``) disables
    # country capture; only enable it when a trusted upstream sets the header.
    COUNTRY_HEADER: str

    # --- CORS / headers ---
    CORS_ORIGINS: CSVList
    # The API authenticates with Bearer headers, not cookies, so credentialed CORS is
    # unnecessary; enabling it requires an explicit CORS_ORIGINS list (never "*").
    CORS_ALLOW_CREDENTIALS: bool
    CORS_ALLOW_METHODS: CSVList
    CORS_ALLOW_HEADERS: CSVList
    SECURITY_HEADERS_ENABLED: bool

    # --- Pagination ---
    DEFAULT_PAGE_SIZE: int
    MAX_PAGE_SIZE: int

    @field_validator(
        "ALLOWED_URL_SCHEMES",
        "SSRF_HOST_ALLOWLIST",
        "CORS_ORIGINS",
        "CORS_ALLOW_METHODS",
        "CORS_ALLOW_HEADERS",
        "TRUSTED_PROXIES",
        mode="before",
    )
    @classmethod
    def _split_csv(cls, value: object) -> object:
        """Allow list settings to be provided as comma-separated env strings."""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _enforce_secure_configuration(self) -> Settings:
        """Refuse to boot with credentials-forging or credential-leaking config."""
        if self.is_production and (
            self.SECRET_KEY == _DEFAULT_SECRET_KEY or len(self.SECRET_KEY) < 32
        ):
            raise ValueError(
                "SECRET_KEY must be set to a unique value of at least 32 characters "
                'in production. Generate one with: python -c "import secrets; '
                'print(secrets.token_urlsafe(64))"'
            )
        if self.CORS_ALLOW_CREDENTIALS and "*" in self.CORS_ORIGINS:
            raise ValueError(
                "CORS_ALLOW_CREDENTIALS=true requires an explicit CORS_ORIGINS list; "
                'a wildcard ("*") origin would grant any website credentialed access.'
            )
        return self

    @model_validator(mode="after")
    def _assemble_database_url(self) -> Settings:
        """Build DATABASE_URL from the POSTGRES_* parts unless one was given explicitly."""
        if not self.DATABASE_URL:
            user = quote(self.POSTGRES_USER, safe="")
            password = quote(self.POSTGRES_PASSWORD, safe="")
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{user}:{password}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def access_token_expire_seconds(self) -> int:
        return self.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    @property
    def refresh_token_expire_seconds(self) -> int:
        return self.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600

    @property
    def email_enabled(self) -> bool:
        """Whether a real SMTP transport is configured (else email is logged only)."""
        return bool(self.SMTP_HOST)


@lru_cache
def get_settings() -> Settings:
    """Return the cached singleton settings instance."""
    return Settings()


settings = get_settings()
