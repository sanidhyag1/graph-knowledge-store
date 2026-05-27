from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = "ollama"
    llm_chat_model: str = "gemma2:9b-instruct-q4_K_M"
    llm_embedding_model: str = "qwen3-embedding:0.6b"
    llm_embedding_dimensions: int = 1024
    llm_embedding_base_url: str = ""
    llm_embedding_api_key: str = ""

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "graphknowledge"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"

    llm_num_ctx: int = 32000
    llm_quiz_num_ctx: int = 64000

    flashcard_auto_generate: bool = True
    flashcard_auto_count: int = 8
    flashcard_daily_new_limit: int = 10
    flashcard_learning_steps: str = "1,10"
    flashcard_relearning_steps: str = "10"
    flashcard_graduating_interval: int = 1
    flashcard_easy_interval: int = 4
    flashcard_easy_bonus: float = 1.3
    flashcard_maximum_interval: int = 365
    flashcard_minimum_ease: float = 1.3

    obsidian_vault_path: str = ""
    obsidian_sync_interval_minutes: int = 30
    obsidian_attachment_path: str = ""
    upload_dir: str = "uploads"

    @property
    def postgres_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def postgres_sync_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
