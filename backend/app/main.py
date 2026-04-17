from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db, save_workflow
from .engine import WorkflowEngine
from .schemas import EventMessage, WorkflowPayload

app = FastAPI(title='MemoraFlow Backend')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

run_queues: dict[str, asyncio.Queue[EventMessage]] = defaultdict(asyncio.Queue)
run_engines: dict[str, WorkflowEngine] = {}


@app.on_event('startup')
async def on_startup() -> None:
    await init_db()


@app.get('/api/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/api/models')
async def models() -> list[str]:
    import httpx

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get('http://127.0.0.1:11434/api/tags')
        response.raise_for_status()
        payload = response.json()
    return [item['name'] for item in payload.get('models', [])]


@app.post('/api/workflows/save')
async def save(payload: WorkflowPayload) -> dict[str, str]:
    target = await save_workflow(payload.name, payload.mode, payload.model_dump())
    return {'path': str(target)}


@app.post('/api/runs')
async def run(payload: WorkflowPayload) -> dict[str, str]:
    run_id = str(uuid.uuid4())

    async def sink(message: EventMessage) -> None:
        await run_queues[run_id].put(message)

    engine = WorkflowEngine(sink)
    run_engines[run_id] = engine

    async def execute() -> None:
        try:
            await engine.run(payload)
        finally:
            await run_queues[run_id].put(EventMessage(node_id='system', status='completed'))

    asyncio.create_task(execute())
    return {'run_id': run_id}


@app.post('/api/runs/{run_id}/pause')
async def pause(run_id: str) -> dict[str, str]:
    run_engines[run_id].pause()
    return {'status': 'paused'}


@app.post('/api/runs/{run_id}/resume')
async def resume(run_id: str) -> dict[str, str]:
    run_engines[run_id].resume()
    return {'status': 'resumed'}


@app.post('/api/runs/{run_id}/stop')
async def stop(run_id: str) -> dict[str, str]:
    run_engines[run_id].stop()
    return {'status': 'stopped'}


@app.websocket('/ws/runs/{run_id}')
async def ws_events(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    queue = run_queues[run_id]
    while True:
        msg = await queue.get()
        await websocket.send_json(msg.model_dump())
        if msg.node_id == 'system' and msg.status == 'completed':
            break
