import { useEffect } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MemoraNode } from './nodes/MemoraNode';
import { useWorkflowStore } from './store/useWorkflowStore';
import { createExecutionSocket } from './utils/api';
import { Toolbar } from './components/Toolbar';

const nodeTypes = { memoraNode: MemoraNode };

function Canvas() {
  const { nodes, edges, mode, onNodesChange, onEdgesChange, onConnect, runId, updateNodeData } = useWorkflowStore();

  useEffect(() => {
    if (!runId) return;
    const socket = createExecutionSocket(runId);
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data) as { node_id: string; status?: string; chunk?: string; output?: string };
      if (msg.status) updateNodeData(msg.node_id, { status: msg.status as never });
      if (msg.chunk) {
        const node = nodes.find((n) => n.id === msg.node_id);
        updateNodeData(msg.node_id, { output: `${node?.data.output ?? ''}${msg.chunk}` });
      }
      if (msg.output) updateNodeData(msg.node_id, { output: msg.output });
    };

    return () => socket.close();
  }, [runId, updateNodeData, nodes]);

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
