from __future__ import annotations

import asyncio
import contextlib
import json
import os
import resource
import sys
import tempfile
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import httpx

from .db import get_memory_context, save_memory_item
from .schemas import EventMessage, FlowEdge, FlowNode, WorkflowPayload

EventSink = Callable[[EventMessage], asyncio.Future]


@dataclass
class RunState:
    paused: bool = False
    stopped: bool = False
    pause_signal: asyncio.Event = field(default_factory=asyncio.Event)

    def __post_init__(self) -> None:
        self.pause_signal.set()


class WorkflowEngine:
    def __init__(self, sink: EventSink):
        self.sink = sink
        self.state = RunState()
        self.results: dict[str, Any] = {}

    async def emit(self, node_id: str, **kwargs: Any) -> None:
        await self.sink(EventMessage(node_id=node_id, **kwargs))

    def pause(self) -> None:
        self.state.paused = True
        self.state.pause_signal.clear()

    def resume(self) -> None:
        self.state.paused = False
        self.state.pause_signal.set()

    def stop(self) -> None:
        self.state.stopped = True
        self.state.pause_signal.set()

    async def _await_if_paused(self) -> None:
        await self.state.pause_signal.wait()
        if self.state.stopped:
            raise asyncio.CancelledError('Run stopped')

    async def run(self, payload: WorkflowPayload) -> None:
        nodes = {n.id: n for n in payload.nodes}
        parents, children, indegree = self._graph(payload.nodes, payload.edges)

        queue = deque([n_id for n_id, deg in indegree.items() if deg == 0])

        while queue:
            level = list(queue)
            queue.clear()
            tasks = [asyncio.create_task(self.execute_node(nodes[n_id], parents[n_id])) for n_id in level]
            await asyncio.gather(*tasks)

            for n_id in level:
                for child in children[n_id]:
                    indegree[child] -= 1
                    if indegree[child] == 0:
                        queue.append(child)

    def _graph(self, nodes: list[FlowNode], edges: list[FlowEdge]):
        parents = defaultdict(list)
        children = defaultdict(list)
        indegree = {n.id: 0 for n in nodes}

        for e in edges:
            parents[e.target].append(e.source)
            children[e.source].append(e.target)
            indegree[e.target] += 1

        return parents, children, indegree

    async def execute_node(self, node: FlowNode, parent_ids: list[str]) -> None:
        await self._await_if_paused()
        await self.emit(node.id, status='running')

        input_values = [self.results.get(pid) for pid in parent_ids]

        try:
            if node.data.type == 'ai':
                output = await self._run_ai_node(node, input_values)
            elif node.data.type == 'python':
                output = await self._run_python_node(node, input_values)
            elif node.data.type == 'condition':
                output = await self._run_condition(node, input_values)
            elif node.data.type == 'memory':
                output = await self._run_memory_node(node)
            elif node.data.type == 'combine':
                output = self._run_combine(node, input_values)
            else:
                output = ''

            self.results[node.id] = output
            await self.emit(node.id, status='success', output=str(output))
        except Exception as exc:  # noqa: BLE001
            self.results[node.id] = None
            await self.emit(node.id, status='error', output=str(exc))

    async def _run_ai_node(self, node: FlowNode, input_values: list[Any]) -> str:
        prompt = node.data.prompt or ''
        memory = await get_memory_context()
        for key, value in memory.items():
            prompt = prompt.replace(f'{{{{memory.{key}}}}}', value)

        prompt += '\n\nUpstream:\n' + '\n'.join(str(v) for v in input_values if v is not None)
        model = node.data.model or 'llama3.2'
        collected: list[str] = []

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                'POST',
                'http://127.0.0.1:11434/api/generate',
                json={'model': model, 'prompt': prompt, 'stream': True}
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    payload = json.loads(line)
                    chunk = payload.get('response', '')
                    if chunk:
                        collected.append(chunk)
                        await self.emit(node.id, chunk=chunk)

        return ''.join(collected)

    async def _run_python_node(self, node: FlowNode, input_values: list[Any]) -> str:
        code = node.data.code or 'print("No code provided")'
        wrapped = f"INPUTS = {repr(input_values)}\n{code}\n"

        with tempfile.NamedTemporaryFile('w', suffix='.py', delete=False) as f:
            temp_path = Path(f.name)
            f.write(wrapped)

        def limit_resources() -> None:
            if os.name != 'nt':
                resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
                resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable,
                '-I',
                str(temp_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                preexec_fn=limit_resources if os.name != 'nt' else None
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
            out = stdout.decode() + stderr.decode()
            await self.emit(node.id, chunk=out)
            return out
        finally:
            with contextlib.suppress(FileNotFoundError):
                temp_path.unlink()

    async def _run_condition(self, node: FlowNode, input_values: list[Any]) -> str:
        expr = node.data.condition or 'True'
        context = {'inputs': input_values, 'success': all(v is not None for v in input_values)}
        result = bool(eval(expr, {'__builtins__': {}}, context))  # controlled expression only
        return 'true' if result else 'false'

    async def _run_memory_node(self, node: FlowNode) -> str:
        key = node.data.memoryKey or 'default'
        value = node.data.memoryValue or ''
        await save_memory_item(key, value)
        return f'saved:{key}'

    def _run_combine(self, node: FlowNode, input_values: list[Any]) -> Any:
        mode = node.data.combineMode or 'text'
        if mode == 'array':
            return input_values
        return '\n'.join(str(v) for v in input_values if v is not None)
