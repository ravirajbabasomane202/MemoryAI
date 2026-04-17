from __future__ import annotations

import json
from pathlib import Path
import aiosqlite

DB_PATH = Path(__file__).resolve().parent.parent / 'memoraflow.db'
WORKFLOW_DIR = Path(__file__).resolve().parent.parent / 'workflows'
WORKFLOW_DIR.mkdir(exist_ok=True)


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS workflows (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              mode TEXT NOT NULL,
              payload TEXT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS memory_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              key TEXT NOT NULL,
              value TEXT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await db.commit()


async def save_workflow(name: str, mode: str, payload: dict) -> Path:
    target = WORKFLOW_DIR / f"{name.replace(' ', '_').lower()}.memflow"
    target.write_text(json.dumps(payload, indent=2), encoding='utf-8')

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('INSERT INTO workflows(name, mode, payload) VALUES (?, ?, ?)', (name, mode, json.dumps(payload)))
        await db.commit()

    return target


async def save_memory_item(key: str, value: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('INSERT INTO memory_items(key, value) VALUES (?, ?)', (key, value))
        await db.commit()


async def get_memory_context() -> dict[str, str]:
    async with aiosqlite.connect(DB_PATH) as db:
        rows = await db.execute_fetchall('SELECT key, value FROM memory_items ORDER BY id DESC LIMIT 200')
    context: dict[str, str] = {}
    for key, value in rows:
        if key not in context:
            context[key] = value
    return context
