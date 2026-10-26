from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)


def load_env_file():
    """
    Standard library .env parser.
    Reads .env files without requiring third-party libraries and updates os.environ.
    Stores keys in uppercase, lowercase, and exact case for cross-platform compatibility.
    Preserves container internal service hosts (e.g., DATABASE_URL, AWS_MCP_URL) when in Docker.
    """
    is_docker = os.path.exists("/.dockerenv") or os.path.exists("/app") or ("postgres" in os.environ.get("DATABASE_URL", ""))
    candidate_paths = [
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
        os.path.join(os.getcwd(), ".env"),
        "/app/.env",
        ".env",
    ]
    for p in candidate_paths:
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        # Inside Docker, do not overwrite internal container URLs with localhost
                        if is_docker and k.upper() in ("DATABASE_URL", "AWS_MCP_URL") and os.environ.get(k.upper()):
                            continue
                        os.environ[k] = v
                        os.environ[k.upper()] = v
                        os.environ[k.lower()] = v
            except Exception as e:
                logger.warning(f"Failed to load env file {p}: {e}")


# Run initial load
load_env_file()

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict

    class Settings(BaseSettings):
        model_config = SettingsConfigDict(
            env_file=(".env", "../.env", "/app/.env"),
            env_file_encoding="utf-8",
            case_sensitive=False,
            extra="ignore",
        )

        DATABASE_URL: str = "postgresql+asyncpg://cloudcost:cloudcost_dev@localhost:5432/cloudcost_db"
        SECRET_KEY: str = "development_secret_key_must_be_at_least_32_characters_long_for_security"
        ALGORITHM: str = "HS256"
        ACCESS_TOKEN_EXPIRE_HOURS: int = 24
        ANTHROPIC_API_KEY: Optional[str] = None
        ANTHROPIC_BASE_URL: str = "https://api.ai.kodekloud.com/v1"
        ANTHROPIC_MODEL: str = "claude-haiku-5-5"
        LLM_MAX_TOKENS: int = 4096
        LLM_TIMEOUT_SECONDS: int = 120
        LLM_MAX_RETRIES: int = 3
        DEMO_EMAIL: str = "demo@cloudcost.ai"
        DEMO_PASSWORD: str = "Cq9!2J#xQUAWU*9ZI1W9"
        CORS_ORIGINS: str = "http://localhost:3000"
        ARTIFACTS_DIR: str = os.path.join(os.path.dirname(__file__), "..", "..", "artifacts")
        ARTIFACT_MAX_AGE_DAYS: int = 30
        AWS_MCP_URL: str = "http://localhost:8000"
        AWS_MCP_TIMEOUT_SECONDS: int = 60
        LOG_LEVEL: str = "INFO"
        PLAYWRIGHT_HEADLESS: bool = True
        AZURE_RETAIL_PRICES_URL: str = "https://prices.azure.com/api/retail/prices"
        AZURE_RETAIL_PRICES_API_VERSION: str = "2023-01-01-preview"
        LOGIN_ENABLED: bool = False
        GOOGLE_CLIENT_ID: Optional[str] = None
        GOOGLE_CLIENT_SECRET: Optional[str] = None
        MICROSOFT_CLIENT_ID: Optional[str] = None
        MICROSOFT_CLIENT_SECRET: Optional[str] = None
        FRONTEND_URL: str = "http://localhost:3000"

except ImportError:
    from pydantic import BaseModel

    class Settings(BaseModel):
        DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://cloudcost:cloudcost_dev@localhost:5432/cloudcost_db")
        SECRET_KEY: str = os.getenv("SECRET_KEY", "development_secret_key_must_be_at_least_32_characters_long_for_security")
        ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
        ACCESS_TOKEN_EXPIRE_HOURS: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))
        ANTHROPIC_API_KEY: Optional[str] = os.getenv("ANTHROPIC_API_KEY", None)
        ANTHROPIC_BASE_URL: str = os.getenv("ANTHROPIC_BASE_URL", "https://api.ai.kodekloud.com/v1")
        ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-haiku-5-5")
        LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "4096"))
        LLM_TIMEOUT_SECONDS: int = int(os.getenv("LLM_TIMEOUT_SECONDS", "120"))
        LLM_MAX_RETRIES: int = int(os.getenv("LLM_MAX_RETRIES", "3"))
        DEMO_EMAIL: str = os.getenv("DEMO_EMAIL", "demo@cloudcost.ai")
        DEMO_PASSWORD: str = os.getenv("DEMO_PASSWORD", "Cq9!2J#xQUAWU*9ZI1W9")
        CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:3000")
        ARTIFACTS_DIR: str = os.getenv("ARTIFACTS_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "artifacts"))
        ARTIFACT_MAX_AGE_DAYS: int = int(os.getenv("ARTIFACT_MAX_AGE_DAYS", "30"))
        AWS_MCP_URL: str = os.getenv("AWS_MCP_URL", "http://localhost:8000")
        AWS_MCP_TIMEOUT_SECONDS: int = int(os.getenv("AWS_MCP_TIMEOUT_SECONDS", "60"))
        LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
        PLAYWRIGHT_HEADLESS: bool = True
        AZURE_RETAIL_PRICES_URL: str = "https://prices.azure.com/api/retail/prices"
        AZURE_RETAIL_PRICES_API_VERSION: str = "2023-01-01-preview"
        LOGIN_ENABLED: bool = False
        GOOGLE_CLIENT_ID: Optional[str] = None
        GOOGLE_CLIENT_SECRET: Optional[str] = None
        MICROSOFT_CLIENT_ID: Optional[str] = None
        MICROSOFT_CLIENT_SECRET: Optional[str] = None
        FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")


def get_settings() -> Settings:
    load_env_file()
    s = Settings()
    # Ensure Docker container connects to postgres service if localhost was configured in host .env
    is_docker = os.path.exists("/.dockerenv") or os.path.exists("/app")
    if is_docker and ("localhost" in s.DATABASE_URL or "127.0.0.1" in s.DATABASE_URL):
        s.DATABASE_URL = s.DATABASE_URL.replace("localhost", "postgres").replace("127.0.0.1", "postgres").replace(":5433", ":5432")

    # Explicit dynamic binding from os.environ (case-insensitive)
    raw_login = (
        os.getenv("LOGIN_ENABLED")
        or os.getenv("login_enabled")
        or os.getenv("NEXT_PUBLIC_LOGIN_ENABLED")
        or "false"
    ).strip().lower()
    s.LOGIN_ENABLED = raw_login in ("true", "1", "yes")

    google_id = (os.getenv("GOOGLE_CLIENT_ID") or os.getenv("google_client_id") or "").strip()
    google_secret = (os.getenv("GOOGLE_CLIENT_SECRET") or os.getenv("google_client_secret") or "").strip()
    ms_id = (os.getenv("MICROSOFT_CLIENT_ID") or os.getenv("microsoft_client_id") or "").strip()
    ms_secret = (os.getenv("MICROSOFT_CLIENT_SECRET") or os.getenv("microsoft_client_secret") or "").strip()

    s.GOOGLE_CLIENT_ID = google_id or None
    s.GOOGLE_CLIENT_SECRET = google_secret or None
    s.MICROSOFT_CLIENT_ID = ms_id or None
    s.MICROSOFT_CLIENT_SECRET = ms_secret or None
    s.FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
    return s


settings = get_settings()
