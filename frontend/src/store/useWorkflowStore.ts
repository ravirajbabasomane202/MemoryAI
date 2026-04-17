import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge, type Connection, type EdgeChange, type NodeChange } from '@xyflow/react';
import type { MemoraEdge, MemoraNode } from '../types/workflow';

interface WorkflowState {
  mode: 'admin' | 'user';
  nodes: MemoraNode[];
  edges: MemoraEdge[];
  runId?: string;
  onNodesChange: (changes: NodeChange<MemoraNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<MemoraEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  setMode: (mode: 'admin' | 'user') => void;
  setRunId: (runId?: string) => void;
  updateNodeData: (id: string, patch: Partial<MemoraNode['data']>) => void;
  setGraph: (nodes: MemoraNode[], edges: MemoraEdge[]) => void;
}

const starterNodes: MemoraNode[] = [
  {
    id: 'memory-1',
    type: 'memoraNode',
    position: { x: 50, y: 100 },
    data: { label: 'Memory Node', type: 'memory', memoryKey: 'project', memoryValue: 'MemoryAI setup', status: 'idle' }
  },
  {
    id: 'ai-1',
    type: 'memoraNode',
    position: { x: 380, y: 100 },
    data: { label: 'AI Node', type: 'ai', model: 'llama3.2', prompt: 'Summarize {{memory.project}}', status: 'idle' }
  }
];

export const useWorkflowStore = create<WorkflowState>((set) => ({
  mode: 'admin',
  nodes: starterNodes,
  edges: [{ id: 'e1', source: 'memory-1', target: 'ai-1', animated: true, className: 'edge-flow' }],
  onNodesChange: (changes) => set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),
  onConnect: (connection) => set((s) => ({ edges: addEdge({ ...connection, animated: true, className: 'edge-flow' }, s.edges) })),
  setMode: (mode) => set({ mode }),
  setRunId: (runId) => set({ runId }),
  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    })),
  setGraph: (nodes, edges) => set({ nodes, edges })
}));
