import type { WorkflowFile } from '../types/workflow';

const API_BASE = 'http://127.0.0.1:8008';

export async function getOllamaModels(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/models`);
  if (!res.ok) return [];
  return res.json();
}

export async function listMemories(query = '') {
  const res = await fetch(`${API_BASE}/api/memories?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  return res.json() as Promise<Array<{ id: number; key: string; value: string; tags: string; created_at: string }>>;
}

export async function createMemory(payload: { key: string; value: string; tags?: string }) {
  await fetch(`${API_BASE}/api/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteMemory(id: number) {
  await fetch(`${API_BASE}/api/memories/${id}`, { method: 'DELETE' });
}


export async function listHistory(limit = 200) {
  const res = await fetch(`${API_BASE}/api/history?limit=${limit}`);
  if (!res.ok) return [];
  return res.json() as Promise<Array<{ run_id: string; node_id: string; status: string; output: string; created_at: string }>>;
}

export async function saveWorkflow(payload: WorkflowFile) {
  const res = await fetch(`${API_BASE}/api/workflows/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error('Failed to save workflow');
  return res.json() as Promise<{ path: string }>;
}

export function createExecutionSocket(runId: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:8008/ws/runs/${runId}`);
}

export async function runWorkflow(payload: WorkflowFile) {
  const res = await fetch(`${API_BASE}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error('Failed to run workflow');
  return res.json() as Promise<{ run_id: string }>;
}

export async function controlRun(runId: string, action: 'pause' | 'resume' | 'stop') {
  await fetch(`${API_BASE}/api/runs/${runId}/${action}`, { method: 'POST' });
}
