import { Handle, Position } from '@xyflow/react';
import type { MemoraNodeData } from '../types/workflow';
import { useWorkflowStore } from '../store/useWorkflowStore';

const statusClasses = {
  idle: 'border-slate-700',
  running: 'border-sky-400 shadow-sky-400/30 animate-pulse',
  success: 'border-emerald-500',
  error: 'border-rose-500',
  paused: 'border-amber-500'
};

export function MemoraNode({ id, data }: { id: string; data: MemoraNodeData }) {
  const { models, updateNodeData, requestDeleteNode } = useWorkflowStore();
  const readOnly = false;

  return (
    <div
      className={`group relative w-80 border-2 bg-slate-900/90 p-3 shadow-xl ${statusClasses[data.status]}`}
      onContextMenu={(e) => {
        if (readOnly) return;
        e.preventDefault();
        requestDeleteNode(id);
      }}
    >
      {!readOnly && (
        <button
          className="absolute right-2 top-2 rounded bg-rose-600/90 px-2 py-0.5 text-xs opacity-0 transition group-hover:opacity-100"
          onClick={() => requestDeleteNode(id)}
          title="Delete node"
        >
          🗑
        </button>
      )}

      <Handle type="target" position={Position.Left} className="!bg-sky-400" />
      <div className="mb-2 flex items-center justify-between">
        <strong>{data.label}</strong>
        <span className="rounded bg-slate-800 px-2 py-1 text-xs uppercase">{data.status}</span>
      </div>

      {data.type === 'ai' && (
        <>
          <select
            className="mb-2 w-full rounded bg-slate-800 p-2 text-sm"
            value={data.model ?? ''}
            onChange={(e) => updateNodeData(id, { model: e.target.value })}
            disabled={readOnly}
          >
            <option value="">Select model...</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          <textarea
            className="h-24 w-full rounded bg-slate-800 p-2 text-sm"
            value={data.prompt ?? ''}
            disabled={readOnly}
            onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
            placeholder="Write AI prompt. Memory placeholders: {{memory.key}}"
          />
          <input className="mt-2 w-full rounded bg-slate-800 p-2 text-xs" type="number" min={0} value={data.retryCount ?? 0} onChange={(e)=>updateNodeData(id,{retryCount:Number(e.target.value)||0})} placeholder="Retry count" />
        </>
      )}

      {data.type === 'python' && (
        <>
        <textarea
          className="h-24 w-full rounded bg-slate-800 p-2 text-sm font-mono"
          value={data.code ?? ''}
          disabled={readOnly}
          onChange={(e) => updateNodeData(id, { code: e.target.value })}
          placeholder="print('Hello')"
        />
        <input className="mt-2 w-full rounded bg-slate-800 p-2 text-xs" type="number" min={0} value={data.retryCount ?? 0} onChange={(e)=>updateNodeData(id,{retryCount:Number(e.target.value)||0})} placeholder="Retry count" />
        </>
      )}

      {data.type === 'memory' && (
        <>
          <input
            className="mb-2 w-full rounded bg-slate-800 p-2 text-sm"
            value={data.memoryKey ?? ''}
            disabled={readOnly}
            onChange={(e) => updateNodeData(id, { memoryKey: e.target.value })}
            placeholder="Memory key"
          />
          <textarea
            className="h-16 w-full rounded bg-slate-800 p-2 text-sm"
            value={data.memoryValue ?? ''}
            disabled={readOnly}
            onChange={(e) => updateNodeData(id, { memoryValue: e.target.value })}
            placeholder="Stored value"
          />
        </>
      )}

      {data.type === 'condition' && (
        <>
          <div className="mb-1 flex justify-end gap-4 pr-3 text-[10px] uppercase text-slate-400"><span>true</span><span>false</span></div>
          <input
            className="w-full rounded bg-slate-800 p-2 text-sm"
            value={data.condition ?? ''}
            disabled={readOnly}
            onChange={(e) => updateNodeData(id, { condition: e.target.value })}
            placeholder="Python bool expression"
          />
        </>
      )}

      {data.type === 'combine' && (
        <select
          className="w-full rounded bg-slate-800 p-2 text-sm"
          value={data.combineMode ?? 'text'}
          disabled={readOnly}
          onChange={(e) => updateNodeData(id, { combineMode: e.target.value as 'array' | 'text' })}
        >
          <option value="text">Concatenate text</option>
          <option value="array">Array</option>
        </select>
      )}

      <div className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-xs text-slate-300">
        {data.output || 'No output yet'}
      </div>

      {data.type === 'condition' ? (
        <>
          <Handle id="true" type="source" position={Position.Right} style={{ top: '38%' }} className="!bg-emerald-400" />
          <Handle id="false" type="source" position={Position.Right} style={{ top: '68%' }} className="!bg-rose-400" />
        </>
      ) : (
        <Handle type="source" position={Position.Right} className="!bg-emerald-400" />
      )}
    </div>
  );
}
