import { useMemo, useRef } from 'react';
import { controlRun, runWorkflow, saveWorkflow } from '../utils/api';
import { useWorkflowStore } from '../store/useWorkflowStore';
import type { NodeKind, WorkflowFile } from '../types/workflow';

const nodeKinds: NodeKind[] = ['ai', 'python', 'condition', 'memory', 'combine'];

export function Toolbar() {
  const {
    mode,
    setMode,
    runId,
    setRunId,
    nodes,
    edges,
    addNode,
    clearOutputs,
    progress
  } = useWorkflowStore();
  const fileInput = useRef<HTMLInputElement>(null);

  const payload = useMemo<WorkflowFile>(() => ({ name: 'MemoraFlow Workflow', mode, nodes, edges }), [mode, nodes, edges]);

  async function play() {
    clearOutputs();
    const { run_id } = await runWorkflow(payload);
    setRunId(run_id);
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

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900 p-3">
      <button className="rounded bg-sky-600 px-3 py-2" onClick={play}>Play ▶️</button>
      <button className="rounded bg-amber-600 px-3 py-2" onClick={() => runId && controlRun(runId, 'pause')}>Pause ⏸️</button>
      <button className="rounded bg-emerald-600 px-3 py-2" onClick={() => runId && controlRun(runId, 'resume')}>Resume ▶️</button>
      <button className="rounded bg-rose-600 px-3 py-2" onClick={() => runId && controlRun(runId, 'stop')}>Stop ⏹️</button>
      <button className="rounded bg-slate-700 px-3 py-2" onClick={saveNow}>Save</button>
      <button className="rounded bg-slate-700 px-3 py-2" onClick={exportJson}>Export</button>
      <button className="rounded bg-slate-700 px-3 py-2" onClick={() => fileInput.current?.click()}>Import</button>
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

      {mode === 'admin' && (
        <select
          className="rounded bg-slate-800 px-2 py-2"
          onChange={(e) => {
            if (e.target.value) addNode(e.target.value as NodeKind);
            e.target.value = '';
          }}
          defaultValue=""
        >
          <option value="">Add node…</option>
          {nodeKinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      )}

      <div className="ml-auto flex min-w-56 items-center gap-3">
        <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <span className="text-xs text-slate-300">{Math.round(progress * 100)}%</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs uppercase text-slate-400">Mode</span>
        <select
          className="rounded bg-slate-800 px-2 py-2"
          value={mode}
          onChange={(e) => setMode(e.target.value as 'admin' | 'user')}
        >
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
      </div>
    </header>
  );
}
