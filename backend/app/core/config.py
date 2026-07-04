"""Application settings, loaded from environment / `.env`.

A single cached `Settings` instance (`get_settings()` / module-level `settings`) is the
one source of truth for configuration. List-typed values accept comma-separated strings
in the environment (e.g. ``CORS_ORIGINS=https://a.com,https://b.com``).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated
from urllib.parse import quote

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# ``NoDecode`` disables pydantic-settings' implicit JSON decoding of complex types so the
# ``_split_csv`` validator can parse plain comma-separated environment strings.
CSVList = Annotated[list[str], NoDecode]

# Known-insecure placeholder; production refuses to boot with it (see the validator).
_DEFAULT_SECRET_KEY = "CHANGE_ME_DEV_SECRET_NOT_FOR_PROD"


class Settings(BaseSettings):
    """Strongly-typed application configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- App / meta ---
    PROJECT_NAME: str = "ShortlyX"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    BASE_URL: str = "http://localhost:8000"

    # --- Server ---
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LOG_LEVEL: str = "INFO"
    LOG_JSON: bool = True
    # IPs or CIDR ranges of reverse proxies whose X-Forwarded-For may be trusted.
    # When empty (the default), X-Forwarded-For is ignored and the socket peer is used.
    TRUSTED_PROXIES: CSVList = []

    # --- Database ---
    # Provide either DATABASE_URL directly, or the POSTGRES_* parts below and let the
    # validator assemble an async URL from them. An explicit DATABASE_URL always wins
    # (e.g. the test suite sets it to a SQLite URL).
    DATABASE_URL: str = ""
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "shortlyx"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    DB_ECHO: bool = False

    # --- Redis ---
    REDIS_URL: str = "redis://redis:6379/0"
    REDIS_MAX_CONNECTIONS: int = 50
    CACHE_TTL_SECONDS: int = 86400
    NEGATIVE_CACHE_TTL_SECONDS: int = 30
    CLICK_STREAM_KEY: str = "clicks:stream"
    CLICK_STREAM_MAXLEN: int = 1_000_000
    CLICK_CONSUMER_GROUP: str = "clickflush"
    CLICK_FLUSH_BATCH: int = 500
    CLICK_FLUSH_ENABLED: bool = True
    CLICK_FLUSH_INTERVAL_SECONDS: float = 5.0

    # --- Email ---
    # "console" logs outbound mail (dev default); "smtp" sends via the SMTP_* settings.
    EMAIL_BACKEND: str = "console"
    EMAIL_FROM: str = "ShortlyX <no-reply@localhost>"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_STARTTLS: bool = True
    # Public URL of the SPA; used to build links inside emails.
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    RESET_TOKEN_EXPIRE_MINUTES: int = 30
    EMAIL_VERIFY_TOKEN_EXPIRE_HOURS: int = 48
    EMAIL_CHANGE_TOKEN_EXPIRE_MINUTES: int = 60

    # --- Security / JWT ---
    SECRET_KEY: str = _DEFAULT_SECRET_KEY
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    JWT_ISSUER: str = "shortlyx"
    JWT_AUDIENCE: str = "shortlyx-api"
    LINK_PASSWORD_TOKEN_EXPIRE_MINUTES: int = 30

    # --- Password hashing ---
    ARGON2_TIME_COST: int = 3
    ARGON2_MEMORY_COST: int = 65536
    ARGON2_PARALLELISM: int = 4
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_MAX_LENGTH: int = 128

    # --- Shortcode ---
    SHORTCODE_LENGTH: int = 7
    SHORTCODE_MAX_LENGTH: int = 12
    SHORTCODE_ALPHABET: str = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    SHORTCODE_MAX_RETRIES: int = 5
    CUSTOM_ALIAS_MIN_LENGTH: int = 3
    CUSTOM_ALIAS_MAX_LENGTH: int = 64

    # --- URL validation / SSRF ---
    MAX_URL_LENGTH: int = 2048
    ALLOWED_URL_SCHEMES: CSVList = ["http", "https"]
    SSRF_PROTECTION_ENABLED: bool = True
    SSRF_ALLOW_PRIVATE_HOSTS: bool = False
    SSRF_HOST_ALLOWLIST: CSVList = []

    # --- Rate limiting ---
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_ANON_PER_MINUTE: int = 30
    RATE_LIMIT_ANON_WINDOW_SECONDS: int = 60
    RATE_LIMIT_AUTH_PER_MINUTE: int = 120
    RATE_LIMIT_AUTH_WINDOW_SECONDS: int = 60
    RATE_LIMIT_REDIRECT_ANON_PER_MINUTE: int = 300
    RATE_LIMIT_REDIRECT_WINDOW_SECONDS: int = 60

    # --- Redirect ---
    REDIRECT_STATUS_CODE: int = 307
    # Header holding the visitor's ISO 3166-1 alpha-2 country, stamped by a trusted
    # CDN/proxy (e.g. "CF-IPCountry" on Cloudflare). Empty disables country tracking.
    # Only enable behind infrastructure you control that strips client-sent values.
    COUNTRY_HEADER: str = ""

    # --- CORS / headers ---
    CORS_ORIGINS: CSVList = ["*"]
    # The API authenticates with Bearer headers, not cookies, so credentialed CORS is
    # unnecessary; enabling it requires an explicit CORS_ORIGINS list (never "*").
    CORS_ALLOW_CREDENTIALS: bool = False
    CORS_ALLOW_METHODS: CSVList = ["*"]
    CORS_ALLOW_HEADERS: CSVList = ["*"]
    SECURITY_HEADERS_ENABLED: bool = True

    # --- Pagination ---
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

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
        if self.EMAIL_BACKEND not in ("console", "smtp"):
            raise ValueError('EMAIL_BACKEND must be "console" or "smtp".')
        if self.EMAIL_BACKEND == "smtp" and not self.SMTP_HOST:
            raise ValueError("EMAIL_BACKEND=smtp requires SMTP_HOST to be set.")
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


@lru_cache
def get_settings() -> Settings:
    """Return the cached singleton settings instance."""
    return Settings()


settings = get_settings()
