import { useMemo } from 'react';
import { controlRun, runWorkflow, saveWorkflow } from '../utils/api';
import { useWorkflowStore } from '../store/useWorkflowStore';

export function Toolbar() {
  const { mode, setMode, runId, setRunId, nodes, edges } = useWorkflowStore();

  const payload = useMemo(() => ({ name: 'MemoraFlow Workflow', mode, nodes, edges }), [mode, nodes, edges]);

  async function play() {
    const { run_id } = await runWorkflow(payload);
    setRunId(run_id);
  }

  return (
    <header className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 p-3">
      <button className="rounded bg-sky-600 px-3 py-2" onClick={play}>Play ▶️</button>
      <button className="rounded bg-amber-600 px-3 py-2" onClick={() => runId && controlRun(runId, 'pause')}>Pause ⏸️</button>
      <button className="rounded bg-emerald-600 px-3 py-2" onClick={() => runId && controlRun(runId, 'resume')}>Resume ▶️</button>
      <button className="rounded bg-rose-600 px-3 py-2" onClick={() => runId && controlRun(runId, 'stop')}>Stop ⏹️</button>
      <button className="rounded bg-slate-700 px-3 py-2" onClick={() => saveWorkflow(payload)}>Save</button>

      <div className="ml-auto flex items-center gap-2">
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
