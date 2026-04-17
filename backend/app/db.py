from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

import aiosqlite

DB_PATH = Path(__file__).resolve().parent.parent / 'memoraflow.db'
WORKFLOW_DIR = Path(__file__).resolve().parent.parent / 'workflows'
WORKFLOW_DIR.mkdir(exist_ok=True)


def _xor_crypt(value: str) -> str:
    secret = os.environ.get('MEMORAFLOW_SECRET', 'memoraflow-local-key')
    key = hashlib.sha256(secret.encode('utf-8')).digest()
    raw = value.encode('utf-8')
    encrypted = bytes(raw[i] ^ key[i % len(key)] for i in range(len(raw)))
    return base64.b64encode(encrypted).decode('utf-8')


def _atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile('w', dir=path.parent, delete=False, encoding='utf-8') as tmp:
        tmp.write(json.dumps(payload, indent=2))
        temp_name = tmp.name
    Path(temp_name).replace(path)


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
              tags TEXT DEFAULT '',
              encrypted INTEGER DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS run_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id TEXT NOT NULL,
              node_id TEXT NOT NULL,
              status TEXT,
              output TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await db.commit()


async def save_workflow(name: str, mode: str, payload: dict) -> Path:
    target = WORKFLOW_DIR / f"{name.replace(' ', '_').lower()}.memflow"
    _atomic_write(target, payload)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('INSERT INTO workflows(name, mode, payload) VALUES (?, ?, ?)', (name, mode, json.dumps(payload)))
        await db.commit()

    return target


async def save_memory_item(key: str, value: str, tags: str = '') -> None:
    encrypted = 1 if 'password' in key.lower() or 'secret' in key.lower() else 0
    stored_value = _xor_crypt(value) if encrypted else value
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('INSERT INTO memory_items(key, value, tags, encrypted) VALUES (?, ?, ?, ?)', (key, stored_value, tags, encrypted))
        await db.commit()


async def list_memories(query: str = '') -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        if query:
            rows = await db.execute_fetchall(
                'SELECT id, key, value, tags, encrypted, created_at FROM memory_items WHERE key LIKE ? OR tags LIKE ? ORDER BY id DESC',
                (f'%{query}%', f'%{query}%')
            )
        else:
            rows = await db.execute_fetchall(
                'SELECT id, key, value, tags, encrypted, created_at FROM memory_items ORDER BY id DESC LIMIT 500'
            )
    return [
        {
            'id': row[0],
            'key': row[1],
            'value': '[ENCRYPTED_SECRET]' if row[4] else row[2],
            'tags': row[3],
            'encrypted': bool(row[4]),
            'created_at': row[5]
        }
        for row in rows
    ]


async def delete_memory_item(memory_id: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('DELETE FROM memory_items WHERE id = ?', (memory_id,))
        await db.commit()


async def get_memory_context(prompt: str = '') -> dict[str, str]:
    async with aiosqlite.connect(DB_PATH) as db:
        rows = await db.execute_fetchall('SELECT key, value, encrypted FROM memory_items ORDER BY id DESC LIMIT 400')
    context: dict[str, str] = {}
    keywords = {w.lower() for w in prompt.split() if len(w) > 3}
    for key, value, encrypted in rows:
        if key in context:
            continue
        if keywords and not any(k in key.lower() for k in keywords):
            continue
        context[key] = '[ENCRYPTED_SECRET]' if encrypted else value
    if not context:
        for key, value, encrypted in rows[:30]:
            context[key] = '[ENCRYPTED_SECRET]' if encrypted else value
    return context


async def append_run_log(run_id: str, node_id: str, status: str | None = None, output: str | None = None) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            'INSERT INTO run_logs(run_id, node_id, status, output) VALUES (?, ?, ?, ?)',
            (run_id, node_id, status, output)
        )
        await db.commit()


async def list_run_logs(limit: int = 200) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        rows = await db.execute_fetchall(
            'SELECT run_id, node_id, status, output, created_at FROM run_logs ORDER BY id DESC LIMIT ?',
            (limit,)
        )
    return [
        {'run_id': r[0], 'node_id': r[1], 'status': r[2], 'output': r[3], 'created_at': r[4]}
        for r in rows
    ]
