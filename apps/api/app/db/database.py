from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _default_database_url() -> str:
    default_path = Path(__file__).resolve().parents[2] / "saryna_mrv.sqlite3"
    return f"sqlite+pysqlite:///{default_path.as_posix()}"


def _build_engine(database_url: str) -> Engine:
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(
        database_url,
        future=True,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


DATABASE_URL = os.getenv("DATABASE_URL", _default_database_url())
engine = _build_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def configure_database(database_url: str | None = None) -> Engine:
    global DATABASE_URL, engine, SessionLocal

    DATABASE_URL = database_url or os.getenv("DATABASE_URL", _default_database_url())
    engine.dispose()
    engine = _build_engine(DATABASE_URL)
    SessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    return engine


def get_engine() -> Engine:
    return engine


def ensure_postgis_extensions(current_engine: Engine | None = None) -> None:
    target_engine = current_engine or engine
    if target_engine.dialect.name != "postgresql":
        return

    with target_engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))


def init_database() -> None:
    import app.db.tables  # noqa: F401

    ensure_postgis_extensions(engine)

    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(bind=engine)


def reset_database() -> None:
    import app.db.tables  # noqa: F401

    Base.metadata.drop_all(bind=engine)
    init_database()
