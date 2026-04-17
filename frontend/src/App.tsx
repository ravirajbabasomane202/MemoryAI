import { useEffect, useRef } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MemoraNode } from './nodes/MemoraNode';
import { useWorkflowStore } from './store/useWorkflowStore';
import { createExecutionSocket, getOllamaModels, saveWorkflow } from './utils/api';
import { Toolbar } from './components/Toolbar';

const nodeTypes = { memoraNode: MemoraNode };

function Canvas() {
  const {
    nodes,
    edges,
    mode,
    onNodesChange,
    onEdgesChange,
    onConnect,
    runId,
    updateNodeData,
    setModels,
    setProgress,
    setRunId,
    setExecutionState,
    deleteTargetId,
    cancelDeleteNode,
    confirmDeleteNode
  } = useWorkflowStore();

  const lastAutosaveHash = useRef('');

  useEffect(() => {
    getOllamaModels().then(setModels).catch(() => setModels([]));
  }, [setModels]);

  useEffect(() => {
    if (mode !== 'admin' || runId) return;

    const payload = { name: 'MemoraFlow Workflow', mode, nodes, edges };
    const hash = JSON.stringify(payload);
    if (hash === lastAutosaveHash.current) return;

    const timer = setTimeout(() => {
      void saveWorkflow(payload);
      lastAutosaveHash.current = hash;
    }, 1500);

    return () => clearTimeout(timer);
  }, [nodes, edges, mode, runId]);

  useEffect(() => {
    if (!runId) return;

    const socket = createExecutionSocket(runId);
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data) as {
        node_id: string;
        status?: string;
        chunk?: string;
        output?: string;
        meta?: { progress?: number };
      };

      if (msg.node_id === 'system' && (msg.status === 'completed' || msg.status === 'stopped' || msg.status === 'error')) {
        setRunId(undefined);
        setExecutionState('idle');
      }

      if (msg.node_id !== 'system') {
        if (msg.status) updateNodeData(msg.node_id, { status: msg.status as never });
        if (msg.chunk) {
          const node = useWorkflowStore.getState().nodes.find((n) => n.id === msg.node_id);
          updateNodeData(msg.node_id, { output: `${node?.data.output ?? ''}${msg.chunk}` });
        }
        if (msg.output) updateNodeData(msg.node_id, { output: msg.output });
      }

      if (msg.meta?.progress !== undefined) setProgress(msg.meta.progress);
    };

    socket.onerror = () => {};

    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [runId, updateNodeData, setProgress, setRunId, setExecutionState]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space') {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('button')?.click();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={mode === 'admin' ? onNodesChange : undefined}
        onEdgesChange={mode === 'admin' ? onEdgesChange : undefined}
        onConnect={mode === 'admin' ? onConnect : undefined}
        nodesDraggable={mode === 'admin'}
        nodesConnectable={mode === 'admin'}
        elementsSelectable={mode === 'admin'}
        fitView
        className="bg-slate-950"
      >
        <MiniMap className="!bg-slate-800" />
        <Controls />
        <Background color="#334155" />
      </ReactFlow>

      {deleteTargetId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[420px] rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold">Delete node?</h3>
            <p className="mb-4 text-sm text-slate-300">This removes the node and all connected edges. This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button className="rounded bg-slate-700 px-3 py-2" onClick={cancelDeleteNode}>Cancel</button>
              <button className="rounded bg-rose-600 px-3 py-2" onClick={confirmDeleteNode}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="relative flex h-full flex-col">
        <Toolbar />
        <div className="flex-1">
          <Canvas />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
