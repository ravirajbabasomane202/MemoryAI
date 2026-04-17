from __future__ import annotations

import asyncio
import contextlib
import json
import os
import subprocess
try:
    import resource  # Unix-only
except ModuleNotFoundError:  # Windows
    resource = None

import sys
import tempfile
import traceback
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx

from .db import get_memory_context, save_memory_item
from .schemas import EventMessage, FlowEdge, FlowNode, WorkflowPayload

EventSink = Callable[[EventMessage], Awaitable[None]]


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
        parents, outgoing_edges, indegree = self._graph(payload.nodes, payload.edges)
        total = len(nodes)
        completed = 0

        roots = [n_id for n_id, deg in indegree.items() if deg == 0]
        queue = deque(roots)
        activated_inputs: dict[str, int] = defaultdict(int)
        visited: set[str] = set()

        while queue:
            level = list(queue)
            queue.clear()
            tasks = [asyncio.create_task(self.execute_node(nodes[n_id], parents[n_id])) for n_id in level]
            await asyncio.gather(*tasks, return_exceptions=True)

            for n_id in level:
                visited.add(n_id)
                completed += 1
                await self.emit('system', meta={'progress': completed / max(total, 1)})

                parent_node = nodes[n_id]
                parent_result = str(self.results.get(n_id, ''))

                for edge in outgoing_edges[n_id]:
                    child = edge.target
                    active = True
                    if parent_node.data.type == 'condition':
                        edge_route = edge.sourceHandle or 'true'
                        active = parent_result == edge_route

                    if active:
                        activated_inputs[child] += 1

                    indegree[child] -= 1
                    if indegree[child] == 0:
                        if child in roots or activated_inputs[child] > 0:
                            queue.append(child)
                        else:
                            self.results[child] = None
                            await self.emit(child, status='success', output='Skipped: condition route not matched')
                            visited.add(child)

            if self.state.stopped:
                break

        if len(visited) != len(nodes):
            blocked = sorted(set(nodes.keys()) - visited)
            await self.emit('system', status='error', output=f'Unreachable nodes detected: {blocked}')

    def _graph(self, nodes: list[FlowNode], edges: list[FlowEdge]):
        parents = defaultdict(list)
        outgoing_edges: dict[str, list[FlowEdge]] = defaultdict(list)
        indegree = {n.id: 0 for n in nodes}

        for e in edges:
            parents[e.target].append(e.source)
            outgoing_edges[e.source].append(e)
            indegree[e.target] += 1

        return parents, outgoing_edges, indegree

    async def execute_node(self, node: FlowNode, parent_ids: list[str]) -> None:
        await self._await_if_paused()
        await self.emit(node.id, status='running')

        input_values = [self.results.get(pid) for pid in parent_ids]
        retries = max(0, int(getattr(node.data, 'retryCount', 0) or 0))

        for attempt in range(retries + 1):
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
                return
            except Exception:  # noqa: BLE001
                if attempt < retries:
                    await self.emit(node.id, chunk=f"Retry {attempt + 1}/{retries}...\n")
                    continue
                self.results[node.id] = None
                await self.emit(node.id, status='error', output=traceback.format_exc())
                return

    async def _run_ai_node(self, node: FlowNode, input_values: list[Any]) -> str:
        prompt = node.data.prompt or ''
        memory = await get_memory_context(prompt)
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
                    await self._await_if_paused()
                    if self.state.stopped:
                        raise asyncio.CancelledError('Run stopped')
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

        with tempfile.NamedTemporaryFile('w', suffix='.py', delete=False, encoding='utf-8') as f:
            temp_path = Path(f.name)
            f.write(wrapped)

        def runner() -> tuple[str, int]:
            kwargs: dict[str, Any] = {
                'capture_output': True,
                'text': True,
                'timeout': 8
            }

            if os.name != 'nt' and resource is not None:
                def limit_resources() -> None:
                    resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
                    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))

                kwargs['preexec_fn'] = limit_resources

            completed = subprocess.run([sys.executable, '-I', str(temp_path)], **kwargs)
            return (completed.stdout or '') + (completed.stderr or ''), completed.returncode

        try:
            output, return_code = await asyncio.to_thread(runner)
            cleaned = output.strip()
            visible = cleaned if cleaned else 'No output yet'
            await self.emit(node.id, chunk=visible)

            if return_code != 0:
                raise RuntimeError(visible)

            return visible
        finally:
            with contextlib.suppress(FileNotFoundError):
                temp_path.unlink()

    async def _run_condition(self, node: FlowNode, input_values: list[Any]) -> str:
        expr = node.data.condition or 'True'
        context = {'inputs': input_values, 'success': all(v is not None for v in input_values)}
        result = bool(eval(expr, {'__builtins__': {}}, context))
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
