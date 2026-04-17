# MemoraFlow

MemoraFlow is a local-first desktop/web hybrid workflow builder for personal memory + AI automation. It includes a React Flow editor, FastAPI execution engine, Ollama streaming integration, Python node execution, memory persistence, and Tauri desktop packaging.

## Project structure

```text
MemoraFlow/
├─ frontend/
│  ├─ src/
│  │  ├─ components/Toolbar.tsx        # run controls + progress + import/export + add node
│  │  ├─ nodes/MemoraNode.tsx          # AI/Python/Condition/Memory/Combine node UIs
│  │  ├─ store/useWorkflowStore.ts     # mode, graph state, progress, node factories
│  │  ├─ types/workflow.ts
│  │  ├─ utils/api.ts                  # REST + WebSocket client
│  │  ├─ App.tsx                       # canvas + autosave + live stream listeners
│  │  ├─ main.tsx
│  │  └─ styles.css
│  ├─ package.json
│  └─ ...
├─ backend/
│  ├─ app/
│  │  ├─ main.py                       # REST + WebSocket server and run lifecycle APIs
│  │  ├─ engine.py                     # parallel/sequential execution engine
│  │  ├─ db.py                         # SQLite + .memflow save + memory + run logs
│  │  └─ schemas.py
│  └─ requirements.txt
├─ tauri/
│  └─ src-tauri/
│     ├─ src/main.rs
│     ├─ tauri.conf.json
│     └─ Cargo.toml
├─ package.json
└─ README.md
```

## Implemented requirements checklist

- ✅ React 19 + TypeScript + Vite + Tailwind + React Flow canvas
- ✅ FastAPI backend with REST + WebSocket
- ✅ Tauri desktop config for offline packaging
- ✅ Ollama model auto-discovery endpoint and per-node model selection dropdown
- ✅ Streaming token updates from Ollama to frontend in real time
- ✅ Parallel-by-level + dependency-sequential execution
- ✅ Python subprocess execution with isolated mode + CPU/memory/time bounds
- ✅ Memory node persistence + encrypted placeholder handling for sensitive memory keys
- ✅ Admin edit mode and User read-only mode
- ✅ Play/Pause/Resume/Stop controls with keyboard shortcuts (Space, Esc)
- ✅ Workflow save + autosave + import/export `.memflow`
- ✅ Real-time progress bar while workflow runs

## Installation

### 1) Requirements
- Node.js 20+
- Python 3.11+
- Rust + Cargo (for Tauri desktop)
- Ollama running locally at `http://127.0.0.1:11434`

### 2) Install frontend deps

```bash
cd frontend
npm install
```

### 3) Install backend deps

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run in development mode

### Terminal A: backend

```bash
cd backend
uvicorn app.main:app --reload --port 8008
```

### Terminal B: frontend

```bash
cd frontend
npm run dev
```

Open: `http://localhost:5173`

## Build desktop app (Tauri 2)

```bash
cd tauri/src-tauri
cargo tauri build
```

For desktop dev:

```bash
cd tauri/src-tauri
cargo tauri dev
```

## Execution model details

- The engine converts edges into a DAG (indegree + adjacency maps).
- Nodes with indegree `0` run first.
- Each level is executed in parallel using `asyncio.gather`.
- Children are queued only after all upstream dependencies complete.
- The server emits WebSocket events for state transitions and output chunks.
- Progress (`completed_nodes / total_nodes`) is emitted as metadata and shown in the UI bar.
- Stop cancels the backend run task; pause/resume gate node processing via an async event.

## Security notes

- Python code executes in a subprocess (`python -I`) with RLIMIT CPU + memory limits (Unix) and timeout.
- Memory keys containing `password` or `secret` are obfuscated before SQLite storage and rendered as `[ENCRYPTED_SECRET]` in prompt context.
- For strict production security, replace current secret handling with OS keychain or SQLCipher-backed encryption.
