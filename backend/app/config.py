from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    NODE_ENV: str = "development"
    PORT: int = 8002
    DATABASE_URL: str = "postgresql://formwise:formwise@localhost:5433/formwise"
    JWT_SECRET: str = "formwise-dev-jwt-secret-change-me"
    JWT_EXPIRES_IN: str = "7d"
    CORS_ORIGIN: str = "http://localhost:5175"
    AI_PROVIDER: str = "mock"
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"

    @property
    def sqlalchemy_url(self) -> str:
        url = self.DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url.split("?")[0]


@lru_cache
def get_settings() -> Settings:
    return Settings()
