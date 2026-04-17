from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketDisconnect

from .db import append_run_log, init_db, save_workflow
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
run_tasks: dict[str, asyncio.Task[None]] = {}


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
        await append_run_log(run_id, message.node_id, message.status, message.output or message.chunk)
        await run_queues[run_id].put(message)

    engine = WorkflowEngine(sink)
    run_engines[run_id] = engine

    async def execute() -> None:
        try:
            await engine.run(payload)
        except asyncio.CancelledError:
            await run_queues[run_id].put(EventMessage(node_id='system', status='stopped'))
            raise
        finally:
            await run_queues[run_id].put(EventMessage(node_id='system', status='completed', meta={'progress': 1.0}))

    run_tasks[run_id] = asyncio.create_task(execute())
    return {'run_id': run_id}


@app.post('/api/runs/{run_id}/pause')
async def pause(run_id: str) -> dict[str, str]:
    if run_id not in run_engines:
        raise HTTPException(status_code=404, detail='Run not found')
    run_engines[run_id].pause()
    return {'status': 'paused'}


@app.post('/api/runs/{run_id}/resume')
async def resume(run_id: str) -> dict[str, str]:
    if run_id not in run_engines:
        raise HTTPException(status_code=404, detail='Run not found')
    run_engines[run_id].resume()
    return {'status': 'resumed'}


@app.post('/api/runs/{run_id}/stop')
async def stop(run_id: str) -> dict[str, str]:
    if run_id not in run_engines:
        raise HTTPException(status_code=404, detail='Run not found')
    run_engines[run_id].stop()
    task = run_tasks.get(run_id)
    if task and not task.done():
        task.cancel()
    return {'status': 'stopped'}


@app.websocket('/ws/runs/{run_id}')
async def ws_events(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    queue = run_queues[run_id]
    try:
        while True:
            msg = await queue.get()
            await websocket.send_json(msg.model_dump())
            if msg.node_id == 'system' and msg.status == 'completed':
                break
    except WebSocketDisconnect:
        # client navigated away / new run started
        pass
    finally:
        run_tasks.pop(run_id, None)
        run_engines.pop(run_id, None)
        run_queues.pop(run_id, None)
