import type { Node, Edge } from '@xyflow/react';

export type NodeKind = 'ai' | 'python' | 'condition' | 'memory' | 'combine';
export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'paused';

export interface MemoraNodeData {
  label: string;
  type: NodeKind;
  prompt?: string;
  code?: string;
  model?: string;
  condition?: string;
  memoryKey?: string;
  memoryValue?: string;
  combineMode?: 'array' | 'text';
  output?: string;
  status: NodeStatus;
}

export type MemoraNode = Node<MemoraNodeData>;
export type MemoraEdge = Edge;

export interface WorkflowFile {
  name: string;
  mode: 'admin' | 'user';
  nodes: MemoraNode[];
  edges: MemoraEdge[];
}
