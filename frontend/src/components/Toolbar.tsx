import { useMemo, useRef, useState } from 'react';
import { controlRun, createMemory, deleteMemory, listHistory, listMemories, runWorkflow, saveWorkflow } from '../utils/api';
import { useWorkflowStore } from '../store/useWorkflowStore';
import type { NodeKind, WorkflowFile } from '../types/workflow';

const nodeKinds: Array<{ kind: NodeKind; label: string }> = [
  { kind: 'ai', label: '🤖 AI Node' },
  { kind: 'python', label: '🐍 Python Node' },
  { kind: 'condition', label: '🔀 Condition Node' },
  { kind: 'memory', label: '🧠 Memory Node' },
  { kind: 'combine', label: '🧩 Combine Node' }
];

export function Toolbar() {
  const { runId, setRunId, nodes, edges, addNode, clearOutputs, progress, executionState, setExecutionState } = useWorkflowStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memories, setMemories] = useState<Array<{ id: number; key: string; value: string; tags: string }>>([]);
  const [historyItems, setHistoryItems] = useState<Array<{ run_id: string; node_id: string; status: string; output: string; created_at: string }>>([]);
  const [memoryKey, setMemoryKey] = useState('');
  const [memoryValue, setMemoryValue] = useState('');
  const [memorySearch, setMemorySearch] = useState('');

  const payload = useMemo<WorkflowFile>(() => ({ name: 'MemoraFlow Workflow', mode: 'admin', nodes, edges }), [nodes, edges]);

  async function refreshMemories() {
    const data = await listMemories(memorySearch);
    setMemories(data);
  }

  async function refreshHistory() {
    const data = await listHistory(300);
    setHistoryItems(data);
  }

  async function toggleExecution() {
    if (executionState === 'idle') {
      if (runId) await controlRun(runId, 'stop');
      clearOutputs();
      const { run_id } = await runWorkflow(payload);
      setRunId(run_id);
      setExecutionState('running');
      return;
    }

    if (!runId) return;

    if (executionState === 'running') {
      await controlRun(runId, 'pause');
      setExecutionState('paused');
      return;
    }

    await controlRun(runId, 'resume');
    setExecutionState('running');
  }

  async function stopExecution() {
    if (runId) await controlRun(runId, 'stop');
    setRunId(undefined);
    setExecutionState('idle');
  }

  async function saveNow() {
    await saveWorkflow(payload);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'workflow.memflow';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = JSON.parse(reader.result as string) as WorkflowFile;
      useWorkflowStore.getState().setGraph(parsed.nodes, parsed.edges);
    };
    reader.readAsText(file);
  }

  const toggleIcon = executionState === 'idle' ? '▶️' : executionState === 'running' ? '⏸️' : '⏯️';

  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900 p-3">
        <button className="rounded bg-sky-600 px-3 py-2" onClick={toggleExecution} title="Play / Pause / Resume">{toggleIcon}</button>
        <button className="rounded bg-rose-600 px-3 py-2" onClick={stopExecution} title="Stop">⏹️</button>
        <button className="rounded bg-slate-700 px-3 py-2" onClick={saveNow} title="Save">💾</button>
        <button className="rounded bg-slate-700 px-3 py-2" onClick={exportJson} title="Export">📤</button>
        <button className="rounded bg-slate-700 px-3 py-2" onClick={() => fileInput.current?.click()} title="Import">📥</button>
        <button className="rounded bg-indigo-700 px-3 py-2" onClick={async () => { setMemoryOpen(true); await refreshMemories(); }} title="Memory Manager">🧠</button>
        <button className="rounded bg-purple-700 px-3 py-2" onClick={async () => { setHistoryOpen(true); await refreshHistory(); }} title="Execution History">📜</button>

        <input
          ref={fileInput}
          type="file"
          accept=".json,.memflow"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importJson(file);
          }}
        />

        <select
          className="rounded bg-slate-800 px-2 py-2"
          onChange={(e) => {
            if (e.target.value) addNode(e.target.value as NodeKind);
            e.target.value = '';
          }}
          defaultValue=""
        >
          <option value="">➕ Add node…</option>
          {nodeKinds.map(({ kind, label }) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex min-w-56 items-center gap-3">
          <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
            <div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="text-xs text-slate-300">{Math.round(progress * 100)}%</span>
        </div>
      </header>

      {memoryOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="h-[80vh] w-[680px] overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Memory Manager</h3>
              <button className="rounded bg-slate-700 px-3 py-1" onClick={() => setMemoryOpen(false)}>Close</button>
            </div>
            <div className="mb-2">
              <input className="w-full rounded bg-slate-800 p-2" placeholder="Search memories..." value={memorySearch} onChange={(e)=>setMemorySearch(e.target.value)} onKeyUp={()=>{ void refreshMemories(); }} />
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <input className="rounded bg-slate-800 p-2" placeholder="Key" value={memoryKey} onChange={(e) => setMemoryKey(e.target.value)} />
              <input className="rounded bg-slate-800 p-2" placeholder="Value" value={memoryValue} onChange={(e) => setMemoryValue(e.target.value)} />
            </div>
            <button
              className="mb-4 rounded bg-emerald-700 px-3 py-2"
              onClick={async () => {
                await createMemory({ key: memoryKey, value: memoryValue });
                setMemoryKey('');
                setMemoryValue('');
                await refreshMemories();
              }}
            >
              Add Memory
            </button>
            <div className="space-y-2">
              {memories.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded border border-slate-700 p-2 text-sm">
                  <div>
                    <div className="font-semibold">{m.key}</div>
                    <div className="text-slate-400">{m.value}</div>
                  </div>
                  <button
                    className="rounded bg-rose-700 px-2 py-1"
                    onClick={async () => {
                      await deleteMemory(m.id);
                      await refreshMemories();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="h-[80vh] w-[760px] overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Execution History</h3>
              <button className="rounded bg-slate-700 px-3 py-1" onClick={() => setHistoryOpen(false)}>Close</button>
            </div>
            <div className="space-y-2 text-xs">
              {historyItems.map((h, i) => (
                <div key={`${h.run_id}-${i}`} className="rounded border border-slate-700 p-2">
                  <div className="font-semibold">{h.created_at} · {h.run_id}</div>
                  <div>{h.node_id} · {h.status}</div>
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-slate-300">{h.output}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </>
  );
}
