from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class NodeData(BaseModel):
    label: str
    type: Literal['ai', 'python', 'condition', 'memory', 'combine']
    prompt: str | None = None
    code: str | None = None
    model: str | None = None
    condition: str | None = None
    memoryKey: str | None = None
    memoryValue: str | None = None
    combineMode: Literal['array', 'text'] | None = None
    output: str | None = None
    status: Literal['idle', 'running', 'success', 'error', 'paused'] = 'idle'


class FlowNode(BaseModel):
    id: str
    position: dict[str, float]
    data: NodeData


class FlowEdge(BaseModel):
    id: str
    source: str
    target: str


class WorkflowPayload(BaseModel):
    name: str
    mode: Literal['admin', 'user']
    nodes: list[FlowNode]
    edges: list[FlowEdge]


class EventMessage(BaseModel):
    node_id: str
    status: str | None = None
    chunk: str | None = None
    output: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
