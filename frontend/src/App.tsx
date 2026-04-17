import { useEffect } from 'react';
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
    setProgress
  } = useWorkflowStore();

  useEffect(() => {
    getOllamaModels().then(setModels).catch(() => setModels([]));
  }, [setModels]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void saveWorkflow({ name: 'MemoraFlow Workflow', mode, nodes, edges });
    }, 1200);
    return () => clearTimeout(timer);
  }, [nodes, edges, mode]);

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

    return () => socket.close();
  }, [runId, updateNodeData, setProgress]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space') {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('button')?.click();
      }
      if (event.code === 'Escape') {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
        buttons.find((button) => button.textContent?.includes('Stop'))?.click();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
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
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar />
        <div className="flex-1">
          <Canvas />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
