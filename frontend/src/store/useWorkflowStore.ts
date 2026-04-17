import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange
} from '@xyflow/react';
import type { MemoraEdge, MemoraNode, NodeKind } from '../types/workflow';

export type ExecutionState = 'idle' | 'running' | 'paused';

interface WorkflowState {
  mode: 'admin' | 'user';
  nodes: MemoraNode[];
  edges: MemoraEdge[];
  runId?: string;
  models: string[];
  progress: number;
  executionState: ExecutionState;
  deleteTargetId?: string;
  onNodesChange: (changes: NodeChange<MemoraNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<MemoraEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  setMode: (mode: 'admin' | 'user') => void;
  setRunId: (runId?: string) => void;
  setModels: (models: string[]) => void;
  setProgress: (progress: number) => void;
  setExecutionState: (state: ExecutionState) => void;
  addNode: (kind: NodeKind) => void;
  updateNodeData: (id: string, patch: Partial<MemoraNode['data']>) => void;
  setGraph: (nodes: MemoraNode[], edges: MemoraEdge[]) => void;
  clearOutputs: () => void;
  requestDeleteNode: (id: string) => void;
  cancelDeleteNode: () => void;
  confirmDeleteNode: () => void;
}

let nodeCounter = 2;

const starterNodes: MemoraNode[] = [
  {
    id: 'memory-1',
    type: 'memoraNode',
    position: { x: 50, y: 120 },
    data: {
      label: 'Memory Node',
      type: 'memory',
      memoryKey: 'project',
      memoryValue: 'MemoryAI setup',
      status: 'idle'
    }
  },
  {
    id: 'ai-1',
    type: 'memoraNode',
    position: { x: 430, y: 120 },
    data: {
      label: 'AI Node',
      type: 'ai',
      model: 'llama3.2',
      prompt: 'Summarize {{memory.project}}',
      status: 'idle'
    }
  }
];

function defaultData(kind: NodeKind) {
  if (kind === 'ai') return { label: 'AI Node', type: 'ai', prompt: '', model: '', status: 'idle' as const };
  if (kind === 'python') return { label: 'Python Node', type: 'python', code: 'print("Hello")', status: 'idle' as const };
  if (kind === 'condition') return { label: 'Condition Node', type: 'condition', condition: 'success', status: 'idle' as const };
  if (kind === 'memory') return { label: 'Memory Node', type: 'memory', memoryKey: '', memoryValue: '', status: 'idle' as const };
  return { label: 'Combine Node', type: 'combine', combineMode: 'text' as const, status: 'idle' as const };
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  mode: 'admin',
  nodes: starterNodes,
  edges: [{ id: 'e1', source: 'memory-1', target: 'ai-1', animated: true, className: 'edge-flow' }],
  models: [],
  progress: 0,
  executionState: 'idle',
  deleteTargetId: undefined,
  onNodesChange: (changes) => set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),
  onConnect: (connection) => set((s) => ({ edges: addEdge({ ...connection, animated: true, className: 'edge-flow' }, s.edges) })),
  setMode: (mode) => set({ mode }),
  setRunId: (runId) => set({ runId }),
  setModels: (models) => set({ models }),
  setProgress: (progress) => set({ progress }),
  setExecutionState: (executionState) => set({ executionState }),
  addNode: (kind) =>
    set((s) => {
      nodeCounter += 1;
      return {
        nodes: [
          ...s.nodes,
          {
            id: `${kind}-${nodeCounter}`,
            type: 'memoraNode',
            position: { x: 120 + nodeCounter * 30, y: 180 + nodeCounter * 20 },
            data: defaultData(kind)
          }
        ]
      };
    }),
  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    })),
  setGraph: (nodes, edges) => set({ nodes, edges }),
  clearOutputs: () =>
    set((s) => ({
      progress: 0,
      nodes: s.nodes.map((n) => ({ ...n, data: { ...n.data, output: '', status: 'idle' } }))
    })),
  requestDeleteNode: (id) => set({ deleteTargetId: id }),
  cancelDeleteNode: () => set({ deleteTargetId: undefined }),
  confirmDeleteNode: () =>
    set((s) => {
      if (!s.deleteTargetId) return {};
      return {
        deleteTargetId: undefined,
        nodes: s.nodes.filter((n) => n.id !== s.deleteTargetId),
        edges: s.edges.filter((e) => e.source !== s.deleteTargetId && e.target !== s.deleteTargetId)
      };
    })
}));
